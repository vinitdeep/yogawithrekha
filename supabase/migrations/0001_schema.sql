-- =============================================================================
-- Yoga with Rekha — production schema (Supabase / Postgres 15+)
--
-- Security model
--   * Row-level security is ON for every table. With no matching policy, access is DENIED.
--   * Browsers use the anon key + the signed-in user's JWT. They can only READ what the
--     policies below allow. Every important WRITE goes through a SECURITY DEFINER function
--     that re-checks the caller (auth.uid()) and the rules, then writes an audit record.
--   * Prices, roles, completion records and enrollments are never accepted from the browser.
--   * Orders and enrollments from payments are created only by Edge Functions using the
--     service-role key (server-only), after verifying the provider's signed notification.
--   * Access expiry is evaluated with now() on the server on every protected read.
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Access ends at 23:59:59.999 IST on the same day-of-month N calendar months later.
-- Postgres `date + interval 'N months'` clamps to the last day of shorter months
-- (2026-08-31 + 6 months = 2027-02-28), which is exactly the documented rule.
create or replace function public.compute_expiry(p_start timestamptz, p_months int)
returns timestamptz language sql immutable as $$
  select ((((p_start at time zone 'Asia/Kolkata')::date + make_interval(months => p_months))::date
           + time '23:59:59.999') at time zone 'Asia/Kolkata');
$$;

-- ---------------------------------------------------------------------------
-- Profiles & roles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 120),
  email       text not null,
  country     text check (country is null or char_length(country) <= 80),
  role        text not null default 'student' check (role in ('student', 'admin')),
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- New auth users always become STUDENTS. Whatever metadata the sign-up sends, role is ignored.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120), lower(new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step with the confirmed auth email.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Belt and braces: nobody but the database owner / service role can change a role column,
-- even if a future policy accidentally allows updates.
create or replace function public.guard_profile_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'role changes are not permitted' using errcode = '42501';
  end if;
  if (new.id is distinct from old.id or new.email is distinct from old.email)
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'id and email are managed by authentication' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_profile_role before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.courses (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null check (char_length(title) between 1 and 160),
  title_provisional  boolean not null default true,
  tagline            text not null default '',
  description        text not null default '',
  audience           text[] not null default '{}',
  topics             text[] not null default '{}',
  art                text not null default 'sage' check (art in ('sage', 'rose', 'sand')),
  image_url          text,
  image_alt          text not null default '',
  prices_sample      boolean not null default true,
  curriculum_sample  boolean not null default true,
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  access_months      int not null default 6 check (access_months between 1 and 36),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.course_prices (
  course_id     uuid not null references public.courses (id) on delete cascade,
  currency      text not null check (currency in ('INR', 'USD', 'CAD')),
  amount_minor  int not null check (amount_minor >= 0),
  primary key (course_id, currency)
);

create table public.modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 160),
  position   int not null
);

create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  module_id     uuid not null references public.modules (id) on delete restrict,
  title         text not null check (char_length(title) between 1 and 160),
  description   text not null default '',
  duration_min  int not null check (duration_min between 1 and 180),
  position      int not null,
  preview       boolean not null default false,
  published     boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index on public.lessons (course_id);

-- Video references, captions and transcripts are PAID content: kept apart from the public
-- curriculum so the course page can list lessons without exposing them.
create table public.lesson_media (
  lesson_id      uuid primary key references public.lessons (id) on delete cascade,
  video_kind     text check (video_kind in ('url', 'storage')),
  video_ref      text,             -- storage object path in the private `lesson-videos` bucket, or a URL
  video_file     text,
  captions_url   text,
  transcript     text,
  attached_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- Orders, enrollments, progress
-- ---------------------------------------------------------------------------

create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id) on delete restrict,
  course_id            uuid not null references public.courses (id) on delete restrict,
  course_title         text not null,
  customer_name        text not null,
  customer_email       text not null,
  amount_minor         int not null check (amount_minor > 0),
  currency             text not null check (currency in ('INR', 'USD', 'CAD')),
  status               text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider             text not null check (provider in ('razorpay', 'stripe')),
  reference            text not null unique,
  provider_order_id    text unique,
  provider_payment_id  text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.orders (user_id);

create table public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete restrict,
  course_id     uuid not null references public.courses (id) on delete restrict,
  order_id      uuid unique references public.orders (id) on delete restrict,
  start_at      timestamptz not null,
  expires_at    timestamptz not null,
  revoked       boolean not null default false,
  source        text not null check (source in ('purchase', 'admin-grant')),
  grant_reason  text,
  created_at    timestamptz not null default now(),
  check (expires_at > start_at),
  check (source <> 'purchase' or order_id is not null),
  check (source <> 'admin-grant' or (order_id is null and char_length(coalesce(grant_reason, '')) >= 4))
);
create index on public.enrollments (user_id, course_id);

create table public.enrollment_events (
  id             bigint generated always as identity primary key,
  enrollment_id  uuid not null references public.enrollments (id) on delete cascade,
  at             timestamptz not null default now(),
  action         text not null,
  actor_id       uuid,
  actor_email    text,
  reason         text
);

-- One row per completed lesson per student: duplicates are impossible by construction.
create table public.lesson_completions (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete restrict,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table public.course_resume (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  last_lesson_id  uuid references public.lessons (id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- Payment provider notifications, stored once per provider event id (idempotency + audit).
create table public.payment_events (
  id             bigint generated always as identity primary key,
  provider       text not null,
  event_id       text not null,
  event_type     text not null,
  order_id       uuid references public.orders (id),
  outcome        text not null,
  received_at    timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------------------------------------------------------------------------
-- Settings, audit, contact
-- ---------------------------------------------------------------------------

-- 'published' is public. 'draft' is the admins' working copy (may contain unconfirmed
-- details such as the full name — publish_settings() strips those unless confirmed).
create table public.site_settings (
  id          text primary key check (id in ('published', 'draft')),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  summary      text not null,
  reason       text
);

create table public.contact_messages (
  id       bigint generated always as identity primary key,
  name     text not null check (char_length(name) between 1 and 120),
  email    text not null check (char_length(email) between 3 and 254),
  message  text not null check (char_length(message) between 10 and 5000),
  at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.course_prices      enable row level security;
alter table public.modules            enable row level security;
alter table public.lessons            enable row level security;
alter table public.lesson_media       enable row level security;
alter table public.orders             enable row level security;
alter table public.enrollments        enable row level security;
alter table public.enrollment_events  enable row level security;
alter table public.lesson_completions enable row level security;
alter table public.course_resume      enable row level security;
alter table public.payment_events     enable row level security;
alter table public.site_settings      enable row level security;
alter table public.audit_log          enable row level security;
alter table public.contact_messages   enable row level security;

-- Start from nothing: no table privileges for browser roles except what is granted below.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

create or replace function public.has_active_access(p_user uuid, p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.user_id = p_user and e.course_id = p_course
      and not e.revoked and e.start_at <= now() and e.expires_at > now()
  );
$$;

-- "Do *I* have active access?" — safe for policies evaluated as anon (returns false).
create or replace function public.my_active_access(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.has_active_access(auth.uid(), p_course);
$$;

create or replace function public.i_was_enrolled(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.enrollments e where e.course_id = p_course and e.user_id = auth.uid());
$$;

-- Profiles: read your own (admins read all). Update only name + country of your own row.
grant select on public.profiles to authenticated;
grant update (name, country) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Catalogue: published (and archived, for students who own them) courses are readable;
-- drafts only by admins. Writes only through admin functions.
grant select on public.courses, public.course_prices, public.modules, public.lessons to anon, authenticated;
create policy courses_read on public.courses for select to anon, authenticated
  using (status = 'published'
         or public.is_admin()
         or (status = 'archived' and public.i_was_enrolled(id)));
create policy prices_read on public.course_prices for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id));
create policy modules_read on public.modules for select to anon, authenticated
  using (exists (select 1 from public.courses c where c.id = course_id));
create policy lessons_read on public.lessons for select to anon, authenticated
  using (public.is_admin() or (published and exists (select 1 from public.courses c where c.id = course_id)));

-- Paid media: preview lessons for anyone; otherwise ACTIVE enrollment (checked against now()).
grant select on public.lesson_media to anon, authenticated;
create policy media_read on public.lesson_media for select to anon, authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.lessons l join public.courses c on c.id = l.course_id
      where l.id = lesson_id and l.published and c.status <> 'draft'
        and ((l.preview and c.status = 'published') or public.my_active_access(l.course_id))
    )
  );

-- Own orders / enrollments / progress only (admins: all). No browser writes at all.
grant select on public.orders, public.enrollments, public.enrollment_events, public.lesson_completions, public.course_resume to authenticated;
create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy enrollments_read on public.enrollments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy enrollment_events_read on public.enrollment_events for select to authenticated using (public.is_admin());
create policy completions_read on public.lesson_completions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy resume_read on public.course_resume for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Settings: published for everyone, draft for admins.
grant select on public.site_settings to anon, authenticated;
create policy settings_read on public.site_settings for select to anon, authenticated
  using (id = 'published' or public.is_admin());

-- Audit + contact + payment events: admins read; nobody writes directly.
grant select on public.audit_log, public.contact_messages, public.payment_events to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());
create policy contact_read on public.contact_messages for select to authenticated using (public.is_admin());
create policy payment_events_read on public.payment_events for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Trusted functions (callable by signed-in users; each re-checks permissions)
-- ---------------------------------------------------------------------------

create or replace function public._audit(p_action text, p_entity text, p_entity_id text, p_summary text, p_reason text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, summary, reason)
  values (auth.uid(), (select email from public.profiles where id = auth.uid()), p_action, p_entity, p_entity_id, p_summary, p_reason);
$$;

create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
end $$;

-- Mark / unmark a lesson complete. Requires a published lesson and ACTIVE access right now.
create or replace function public.set_lesson_complete(p_lesson uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select l.course_id into v_course from public.lessons l where l.id = p_lesson and l.published;
  if v_course is null then raise exception 'lesson not found' using errcode = 'P0002'; end if;
  if not public.has_active_access(auth.uid(), v_course) then
    raise exception 'access to this course is not active' using errcode = '42501';
  end if;
  if p_done then
    insert into public.lesson_completions (user_id, course_id, lesson_id) values (auth.uid(), v_course, p_lesson)
    on conflict (user_id, lesson_id) do nothing;
  else
    delete from public.lesson_completions where user_id = auth.uid() and lesson_id = p_lesson;
  end if;
  insert into public.course_resume (user_id, course_id, last_lesson_id) values (auth.uid(), v_course, p_lesson)
  on conflict (user_id, course_id) do update set last_lesson_id = excluded.last_lesson_id, updated_at = now();
end $$;

-- Remember the last lesson opened (resume). Never completes anything.
create or replace function public.set_last_lesson(p_lesson uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_course uuid;
begin
  if auth.uid() is null then return; end if;
  select l.course_id into v_course from public.lessons l where l.id = p_lesson and l.published;
  if v_course is null or not public.has_active_access(auth.uid(), v_course) then return; end if;
  insert into public.course_resume (user_id, course_id, last_lesson_id) values (auth.uid(), v_course, p_lesson)
  on conflict (user_id, course_id) do update set last_lesson_id = excluded.last_lesson_id, updated_at = now();
end $$;

-- Contact form: validated insert with a simple per-email throttle (5 per hour).
create or replace function public.submit_contact(p_name text, p_email text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if (select count(*) from public.contact_messages where lower(email) = lower(p_email) and at > now() - interval '1 hour') >= 5 then
    raise exception 'too many messages, please try again later' using errcode = '54000';
  end if;
  insert into public.contact_messages (name, email, message) values (trim(p_name), lower(trim(p_email)), trim(p_message));
end $$;

-- ---- Admin: access management (reason required, audited) ----

create or replace function public.admin_grant_access(p_user uuid, p_course uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_months int; v_id uuid; v_email text; v_title text;
begin
  perform public._require_admin();
  if char_length(trim(coalesce(p_reason, ''))) < 4 then raise exception 'a reason is required' using errcode = '22023'; end if;
  select email into v_email from public.profiles where id = p_user and role = 'student';
  if v_email is null then raise exception 'student not found' using errcode = 'P0002'; end if;
  select access_months, title into v_months, v_title from public.courses where id = p_course;
  if v_months is null then raise exception 'course not found' using errcode = 'P0002'; end if;
  -- Serialise per student+course so two clicks can't create two enrollments.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_course::text, 0));
  if exists (select 1 from public.enrollments where user_id = p_user and course_id = p_course and not revoked and expires_at > now()) then
    raise exception 'the student already has access to this course' using errcode = '23505';
  end if;
  insert into public.enrollments (user_id, course_id, start_at, expires_at, source, grant_reason)
  values (p_user, p_course, now(), public.compute_expiry(now(), v_months), 'admin-grant', trim(p_reason))
  returning id into v_id;
  insert into public.enrollment_events (enrollment_id, action, actor_id, actor_email, reason)
  values (v_id, format('Complimentary access granted (%s months)', v_months), auth.uid(), (select email from public.profiles where id = auth.uid()), trim(p_reason));
  perform public._audit('access.grant', 'enrollment', v_id::text, format('Granted %s access to “%s”', v_email, v_title), trim(p_reason));
  return v_id;
end $$;

create or replace function public.admin_change_access(p_enrollment uuid, p_kind text, p_months int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.enrollments; v_label text; v_new timestamptz;
begin
  perform public._require_admin();
  if char_length(trim(coalesce(p_reason, ''))) < 4 then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into e from public.enrollments where id = p_enrollment for update;
  if e.id is null then raise exception 'enrollment not found' using errcode = 'P0002'; end if;
  select format('%s · “%s”', p.email, c.title) into v_label
    from public.profiles p, public.courses c where p.id = e.user_id and c.id = e.course_id;
  if p_kind = 'revoke' then
    if e.revoked then raise exception 'already revoked' using errcode = '22023'; end if;
    update public.enrollments set revoked = true where id = e.id;
    v_label := 'Revoked ' || v_label;
  elsif p_kind = 'restore' then
    if not e.revoked then raise exception 'not revoked' using errcode = '22023'; end if;
    if exists (select 1 from public.enrollments where user_id = e.user_id and course_id = e.course_id and id <> e.id and not revoked and expires_at > now()) then
      raise exception 'the student already has another active enrollment' using errcode = '23505';
    end if;
    update public.enrollments set revoked = false where id = e.id;
    v_label := 'Restored ' || v_label;
  elsif p_kind = 'extend' then
    if p_months is null or p_months not between 1 and 24 then raise exception 'choose 1 to 24 months' using errcode = '22023'; end if;
    v_new := public.compute_expiry(greatest(e.expires_at, now()), p_months);
    update public.enrollments set expires_at = v_new where id = e.id;
    v_label := format('Extended %s by %s month(s) to %s', v_label, p_months, to_char(v_new at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
  else
    raise exception 'unknown action' using errcode = '22023';
  end if;
  insert into public.enrollment_events (enrollment_id, action, actor_id, actor_email, reason)
  values (e.id, v_label, auth.uid(), (select email from public.profiles where id = auth.uid()), trim(p_reason));
  perform public._audit('access.' || p_kind, 'enrollment', e.id::text, v_label, trim(p_reason));
end $$;

-- ---- Admin: courses (whole course saved atomically from the editor) ----

create or replace function public.admin_create_course()
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_months int;
begin
  perform public._require_admin();
  select coalesce((data ->> 'defaultAccessMonths')::int, 6) into v_months from public.site_settings where id = 'published';
  insert into public.courses (slug, title, access_months)
  values ('new-course-' || substr(md5(random()::text), 1, 8), 'Untitled course', coalesce(v_months, 6))
  returning id into v_id;
  perform public._audit('course.create', 'course', v_id::text, 'Created a draft course');
  return v_id;
end $$;

-- p_course mirrors the app's Course type (camelCase). Prices are integer minor units.
create or replace function public.admin_save_course(p_course jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := (p_course ->> 'id')::uuid;
  old public.courses;
  m jsonb; l jsonb; mpos int := 0; lpos int;
  v_status text := p_course ->> 'status';
  v_changes text[] := '{}';
  v_old_prices jsonb; v_new_prices jsonb;
  v_keep uuid[];
begin
  perform public._require_admin();
  select * into old from public.courses where id = v_id for update;
  if old.id is null then raise exception 'course not found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_object_agg(currency, amount_minor), '{}') into v_old_prices from public.course_prices where course_id = v_id;
  v_new_prices := coalesce(p_course -> 'prices', '{}');

  update public.courses set
    slug = p_course ->> 'slug', title = trim(p_course ->> 'title'),
    title_provisional = (p_course ->> 'titleProvisional')::boolean,
    tagline = coalesce(p_course ->> 'tagline', ''), description = coalesce(p_course ->> 'description', ''),
    audience = coalesce(array(select jsonb_array_elements_text(p_course -> 'audience')), '{}'),
    topics = coalesce(array(select jsonb_array_elements_text(p_course -> 'topics')), '{}'),
    art = coalesce(p_course ->> 'art', 'sage'), image_url = p_course ->> 'image', image_alt = coalesce(p_course ->> 'imageAlt', ''),
    prices_sample = (p_course ->> 'pricesSample')::boolean, curriculum_sample = (p_course ->> 'curriculumSample')::boolean,
    status = v_status, access_months = (p_course ->> 'accessMonths')::int, updated_at = now()
  where id = v_id;

  -- Prices: replace (orders keep their own amount, so existing purchases never change).
  delete from public.course_prices where course_id = v_id;
  insert into public.course_prices (course_id, currency, amount_minor)
  select v_id, key, (value #>> '{}')::int from jsonb_each(v_new_prices) where value is not null and jsonb_typeof(value) = 'number';

  -- Curriculum. Lessons that students completed cannot be deleted (FK RESTRICT) — unpublish instead.
  if exists (select 1 from public.modules where course_id <> v_id and id in (select (mm ->> 'id')::uuid from jsonb_array_elements(p_course -> 'modules') mm))
     or exists (select 1 from public.lessons where course_id <> v_id and id in (select (x ->> 'id')::uuid from jsonb_array_elements(p_course -> 'modules') mm, jsonb_array_elements(mm -> 'lessons') x)) then
    raise exception 'module or lesson belongs to another course' using errcode = '22023';
  end if;
  v_keep := array(select (x ->> 'id')::uuid from jsonb_array_elements(p_course -> 'modules') mm, jsonb_array_elements(mm -> 'lessons') x);
  if exists (select 1 from public.lesson_completions lc where lc.course_id = v_id and lc.lesson_id <> all (v_keep)) then
    raise exception 'a removed lesson has student progress — unpublish it instead of deleting it' using errcode = '23503';
  end if;
  delete from public.lessons where course_id = v_id and id <> all (v_keep);
  delete from public.modules where course_id = v_id and id <> all (array(select (mm ->> 'id')::uuid from jsonb_array_elements(p_course -> 'modules') mm));

  for m in select * from jsonb_array_elements(p_course -> 'modules') loop
    mpos := mpos + 1;
    insert into public.modules (id, course_id, title, position) values ((m ->> 'id')::uuid, v_id, trim(m ->> 'title'), mpos)
    on conflict (id) do update set title = excluded.title, position = excluded.position
      where modules.course_id = v_id;
    lpos := 0;
    for l in select * from jsonb_array_elements(m -> 'lessons') loop
      lpos := lpos + 1;
      insert into public.lessons (id, course_id, module_id, title, description, duration_min, position, preview, published, updated_at)
      values ((l ->> 'id')::uuid, v_id, (m ->> 'id')::uuid, trim(l ->> 'title'), coalesce(l ->> 'description', ''),
              (l ->> 'durationMin')::int, lpos, (l ->> 'preview')::boolean, (l ->> 'published')::boolean, now())
      on conflict (id) do update set module_id = excluded.module_id, title = excluded.title, description = excluded.description,
        duration_min = excluded.duration_min, position = excluded.position, preview = excluded.preview,
        published = excluded.published, updated_at = now()
        where lessons.course_id = v_id;
      insert into public.lesson_media (lesson_id, video_kind, video_ref, video_file, captions_url, transcript, attached_at)
      values ((l ->> 'id')::uuid, l #>> '{video,kind}', l #>> '{video,src}', l #>> '{video,fileName}',
              nullif(l ->> 'captionsUrl', ''), nullif(l ->> 'transcript', ''), (l #>> '{video,attachedAt}')::timestamptz)
      on conflict (lesson_id) do update set video_kind = excluded.video_kind, video_ref = excluded.video_ref,
        video_file = excluded.video_file, captions_url = excluded.captions_url, transcript = excluded.transcript,
        attached_at = excluded.attached_at;
    end loop;
  end loop;

  -- Publishing rules, checked after the curriculum is written.
  if v_status = 'published' then
    if not exists (select 1 from public.lessons where course_id = v_id and published) then
      raise exception 'a published course needs at least one published lesson' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(coalesce((select data -> 'displayCurrencies' from public.site_settings where id = 'published'), '["INR"]')) cur
      where not exists (select 1 from public.course_prices p where p.course_id = v_id and p.currency = cur and p.amount_minor > 0)
    ) then
      raise exception 'set a price in every offered currency before publishing' using errcode = '22023';
    end if;
  end if;

  if old.status is distinct from v_status then
    perform public._audit('course.' || case v_status when 'published' then 'publish' when 'archived' then 'archive' else 'unpublish' end,
      'course', v_id::text, format('“%s”: status %s → %s', p_course ->> 'title', old.status, v_status));
  end if;
  if v_old_prices is distinct from v_new_prices then
    perform public._audit('course.price', 'course', v_id::text, format('“%s”: prices %s → %s (existing orders unchanged)', p_course ->> 'title', v_old_prices, v_new_prices));
  end if;
  if old.access_months is distinct from (p_course ->> 'accessMonths')::int then
    perform public._audit('course.access_duration', 'course', v_id::text,
      format('“%s”: access for new enrollments %s → %s months (existing access unchanged)', p_course ->> 'title', old.access_months, p_course ->> 'accessMonths'));
  end if;
  perform public._audit('course.update', 'course', v_id::text, format('Saved “%s”', p_course ->> 'title'));
end $$;

create or replace function public.admin_delete_course(p_course uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  perform public._require_admin();
  if exists (select 1 from public.orders where course_id = p_course) or exists (select 1 from public.enrollments where course_id = p_course) then
    raise exception 'this course has orders or enrollments — archive it instead' using errcode = '23503';
  end if;
  delete from public.lessons where course_id = p_course;
  delete from public.courses where id = p_course returning title into v_title;
  perform public._audit('course.delete', 'course', p_course::text, format('Deleted unused course “%s”', v_title));
end $$;

-- ---- Admin: settings (draft → explicit publish) ----

create or replace function public.save_settings_draft(p_data jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  if jsonb_typeof(p_data) <> 'object' or coalesce(p_data ->> 'brandName', '') = '' then
    raise exception 'invalid settings' using errcode = '22023';
  end if;
  insert into public.site_settings (id, data, updated_by) values ('draft', p_data, auth.uid())
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
end $$;

create or replace function public.publish_settings()
returns void language plpgsql security definer set search_path = public as $$
declare d jsonb; pub jsonb;
begin
  perform public._require_admin();
  select data into d from public.site_settings where id = 'draft';
  if d is null then raise exception 'there are no unpublished changes' using errcode = 'P0002'; end if;
  -- Unconfirmed personal details never reach the public row.
  pub := d;
  if not coalesce((d ->> 'fullNameConfirmed')::boolean, false) then pub := jsonb_set(pub, '{fullName}', '""'); end if;
  if not coalesce((d ->> 'credentialsConfirmed')::boolean, false) then pub := jsonb_set(pub, '{credentials}', '""'); end if;
  if not coalesce((d ->> 'whatsappVerified')::boolean, false) then pub := jsonb_set(pub, '{whatsappNumber}', '""'); end if;
  insert into public.site_settings (id, data, updated_by) values ('published', pub, auth.uid())
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  perform public._audit('settings.publish', 'settings', 'published', 'Published website settings and policies');
end $$;

create or replace function public.discard_settings_draft()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_admin();
  update public.site_settings set data = (select data from public.site_settings where id = 'published'), updated_at = now(), updated_by = auth.uid()
  where id = 'draft';
end $$;

-- ---------------------------------------------------------------------------
-- Server-only functions (service role: Edge Functions). Never callable from a browser.
-- ---------------------------------------------------------------------------

-- Grants access for a verified payment. Idempotent: a repeated or late notification for the
-- same order never creates a second enrollment.
create or replace function public.fulfil_order(p_order uuid, p_payment_id text, p_amount_minor int, p_currency text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; v_months int; v_start timestamptz; v_rule text; v_launch date; v_enr uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then return 'unknown-order'; end if;
  if o.amount_minor <> p_amount_minor or o.currency <> p_currency then return 'amount-mismatch'; end if;
  if exists (select 1 from public.enrollments where order_id = o.id) then return 'already-fulfilled'; end if;
  update public.orders set status = 'paid', provider_payment_id = coalesce(provider_payment_id, p_payment_id), updated_at = now() where id = o.id;
  perform pg_advisory_xact_lock(hashtextextended(o.user_id::text || o.course_id::text, 0));
  if exists (select 1 from public.enrollments where user_id = o.user_id and course_id = o.course_id and not revoked and expires_at > now()) then
    return 'paid-already-enrolled';   -- money taken while access already active: flag for a manual review/refund
  end if;
  select access_months into v_months from public.courses where id = o.course_id;
  select data ->> 'accessStartRule', (data ->> 'launchDate')::date into v_rule, v_launch from public.site_settings where id = 'published';
  v_start := now();
  if v_rule = 'launch-date' and v_launch is not null and (v_launch::timestamp at time zone 'Asia/Kolkata') > now() then
    v_start := v_launch::timestamp at time zone 'Asia/Kolkata';
  end if;
  insert into public.enrollments (user_id, course_id, order_id, start_at, expires_at, source)
  values (o.user_id, o.course_id, o.id, v_start, public.compute_expiry(v_start, v_months), 'purchase')
  returning id into v_enr;
  insert into public.enrollment_events (enrollment_id, action, actor_email)
  values (v_enr, format('Enrolled after verified payment (%s months)', v_months), 'system');
  insert into public.audit_log (actor_email, action, entity, entity_id, summary)
  values ('system', 'order.paid', 'order', o.id::text, format('Payment %s verified for “%s”', o.reference, o.course_title));
  return 'fulfilled';
end $$;

-- A failed notification never overrides a successful one that arrived first (out-of-order safe).
create or replace function public.fail_order(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'failed', updated_at = now() where id = p_order and status = 'pending';
  return case when found then 'failed' else 'ignored' end;
end $$;

-- One-time admin provisioning. Run from the SQL editor (as postgres) after the person has
-- signed up normally:  select public.bootstrap_admin('owner@example.com');
create or replace function public.bootstrap_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set role = 'admin' where email = lower(p_email);
  if not found then raise exception 'no account with that email — sign up first'; end if;
  insert into public.audit_log (actor_email, action, entity, entity_id, summary)
  values ('database-owner', 'user.role', 'user', (select id::text from public.profiles where email = lower(p_email)), format('%s promoted to admin', lower(p_email)));
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges: deny by default, then allow exactly what the browser may call.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_active_access(uuid) to anon, authenticated;
grant execute on function public.i_was_enrolled(uuid) to anon, authenticated;
grant execute on function public.compute_expiry(timestamptz, int) to anon, authenticated;
grant execute on function public.set_lesson_complete(uuid, boolean) to authenticated;
grant execute on function public.set_last_lesson(uuid) to authenticated;
grant execute on function public.submit_contact(text, text, text) to anon, authenticated;
grant execute on function public.admin_grant_access(uuid, uuid, text) to authenticated;
grant execute on function public.admin_change_access(uuid, text, int, text) to authenticated;
grant execute on function public.admin_create_course() to authenticated;
grant execute on function public.admin_save_course(jsonb) to authenticated;
grant execute on function public.admin_delete_course(uuid) to authenticated;
grant execute on function public.save_settings_draft(jsonb) to authenticated;
grant execute on function public.publish_settings() to authenticated;
grant execute on function public.discard_settings_draft() to authenticated;
-- fulfil_order, fail_order, bootstrap_admin, _audit, _require_admin: service role / owner only.
grant execute on function public.fulfil_order(uuid, text, int, text) to service_role;
grant execute on function public.fail_order(uuid) to service_role;
grant execute on function public.has_active_access(uuid, uuid) to service_role;
