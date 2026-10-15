import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, asService, freshDb, type Db } from './harness';

/**
 * Production security rules, tested against the real migration (supabase/migrations/0001_schema.sql)
 * running in PGlite. Queries run as the `anon` / `authenticated` roles with a user id in the JWT
 * claims, the way Supabase runs browser requests — so row-level security and grants apply.
 */

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const S1 = '00000000-0000-4000-8000-0000000000b1';
const S2 = '00000000-0000-4000-8000-0000000000b2';
const COURSE = '10000000-0000-4000-8000-000000000001';
const MOD = '20000000-0000-4000-8000-000000000001';
const L_PREVIEW = '30000000-0000-4000-8000-000000000001';
const L_PAID = '30000000-0000-4000-8000-000000000002';
const L_DRAFT = '30000000-0000-4000-8000-000000000003';

let db: Db;

const course = (over: Record<string, unknown> = {}) => ({
  id: COURSE, slug: 'daily-practice', title: 'Daily Practice', titleProvisional: true, tagline: 't', description: 'd',
  audience: [], topics: [], art: 'sage', image: null, imageAlt: '', prices: { INR: 349900, USD: 5900 }, pricesSample: true,
  status: 'published', accessMonths: 6, curriculumSample: true,
  modules: [{ id: MOD, title: 'Module 1', lessons: [
    { id: L_PREVIEW, title: 'Welcome', description: '', durationMin: 15, preview: true, published: true, video: { kind: 'storage', src: 'L1/welcome.mp4', fileName: 'welcome.mp4', attachedAt: '2026-10-01T00:00:00Z' } },
    { id: L_PAID, title: 'Paid lesson', description: '', durationMin: 18, preview: false, published: true, video: { kind: 'storage', src: 'L2/paid.mp4', fileName: 'paid.mp4', attachedAt: '2026-10-01T00:00:00Z' }, transcript: 'secret transcript' },
    { id: L_DRAFT, title: 'Unreleased', description: '', durationMin: 15, preview: false, published: false },
  ] }],
  ...over,
});

const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as Error).message; } };

async function createOrder(userId: string, amount = 349900, currency = 'INR') {
  // What the create-order Edge Function does with the service-role key.
  const r = await asService(db, (q) => q<{ id: string }>(
    `insert into public.orders (user_id, course_id, course_title, customer_name, customer_email, amount_minor, currency, provider, reference, provider_order_id)
     values ($1, $2, 'Daily Practice', 'S', 's@example.com', $3, $4, 'razorpay', 'YWR-' || substr(md5(random()::text), 1, 8), 'order_' || substr(md5(random()::text), 1, 10)) returning id`,
    [userId, COURSE, amount, currency]));
  return r.rows[0].id;
}

beforeAll(async () => {
  db = await freshDb();
  await addUser(db, ADMIN, 'owner@example.com', 'Owner');
  await addUser(db, S1, 's1@example.com', 'Student One');
  await addUser(db, S2, 's2@example.com', 'Student Two');
  // Settings row + the one-time admin provisioning, as the database owner.
  await db.query(`insert into public.site_settings (id, data) values ('published', $1)`, [JSON.stringify({ brandName: 'Yoga with Rekha', displayCurrencies: ['INR', 'USD'], defaultAccessMonths: 6, accessStartRule: 'enrollment' })]);
  await db.query(`select public.bootstrap_admin('owner@example.com')`);
  // A course row with a known id (admin_create_course would generate one), then the admin
  // fills in and publishes it through the trusted function.
  await db.query(`insert into public.courses (id, slug, title) values ($1, 'daily-practice', 'Daily Practice')`, [COURSE]);
  await as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(course())]));
});

describe('sign-up and roles', () => {
  it('new users are always students, whatever metadata they send', async () => {
    const r = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [S1]);
    expect(r.rows[0].role).toBe('student'); // addUser sends role: admin in metadata
  });

  it('a student cannot make themselves admin by updating their profile', async () => {
    const e = await err(as(db, S1, (q) => q(`update public.profiles set role = 'admin' where id = $1`, [S1])));
    expect(e).toMatch(/permission denied/);
    const ok = await as(db, S1, (q) => q(`update public.profiles set name = 'Renamed' where id = $1`, [S1]));
    expect(ok.affectedRows).toBe(1);
    const admin = await as(db, S1, (q) => q<{ a: boolean }>(`select public.is_admin() as a`));
    expect(admin.rows[0].a).toBe(false);
  });

  it('a student cannot edit someone else’s profile', async () => {
    const r = await as(db, S1, (q) => q(`update public.profiles set name = 'Hacked' where id = $1`, [S2]));
    expect(r.affectedRows).toBe(0);
  });

  it('bootstrap_admin cannot be called from the browser', async () => {
    expect(await err(as(db, S1, (q) => q(`select public.bootstrap_admin('s1@example.com')`)))).toMatch(/permission denied/);
  });
});

describe('guests', () => {
  it('see published courses, prices and published lessons only', async () => {
    const c = await as(db, null, (q) => q(`select id from public.courses`));
    expect(c.rows).toHaveLength(1);
    const l = await as(db, null, (q) => q<{ id: string }>(`select id from public.lessons order by position`));
    expect(l.rows.map((r) => r.id)).toEqual([L_PREVIEW, L_PAID]); // draft lesson hidden
    const p = await as(db, null, (q) => q(`select * from public.course_prices`));
    expect(p.rows).toHaveLength(2);
  });

  it('can read preview media but not paid media', async () => {
    const m = await as(db, null, (q) => q<{ lesson_id: string }>(`select lesson_id from public.lesson_media`));
    expect(m.rows.map((r) => r.lesson_id)).toEqual([L_PREVIEW]);
  });

  it('cannot read profiles, orders, enrollments, progress, audit or draft settings', async () => {
    for (const t of ['profiles', 'orders', 'enrollments', 'lesson_completions', 'audit_log']) {
      expect(await err(as(db, null, (q) => q(`select * from public.${t}`)))).toMatch(/permission denied/);
    }
    const s = await as(db, null, (q) => q<{ id: string }>(`select id from public.site_settings`));
    expect(s.rows.map((r) => r.id)).toEqual(['published']);
  });

  it('cannot call protected functions', async () => {
    expect(await err(as(db, null, (q) => q(`select public.set_lesson_complete($1, true)`, [L_PAID])))).toMatch(/permission denied|not signed in/);
    expect(await err(as(db, null, (q) => q(`select public.admin_create_course()`)))).toMatch(/permission denied|not signed in/);
  });
});

describe('purchases (server-side fulfilment)', () => {
  it('browsers cannot create orders, enrollments or completions directly', async () => {
    expect(await err(as(db, S1, (q) => q(`insert into public.enrollments (user_id, course_id, start_at, expires_at, source, grant_reason) values ($1, $2, now(), now() + interval '1 year', 'admin-grant', 'free stuff')`, [S1, COURSE])))).toMatch(/permission denied/);
    expect(await err(as(db, S1, (q) => q(`insert into public.orders (user_id, course_id, course_title, customer_name, customer_email, amount_minor, currency, provider, reference) values ($1, $2, 'x', 'x', 'x', 1, 'INR', 'razorpay', 'x')`, [S1, COURSE])))).toMatch(/permission denied/);
    expect(await err(as(db, S1, (q) => q(`insert into public.lesson_completions (user_id, course_id, lesson_id) values ($1, $2, $3)`, [S1, COURSE, L_PAID])))).toMatch(/permission denied/);
    expect(await err(as(db, S1, (q) => q(`update public.orders set status = 'paid'`)))).toMatch(/permission denied/);
  });

  it('a student cannot fulfil their own order', async () => {
    const id = await createOrder(S1);
    expect(await err(as(db, S1, (q) => q(`select public.fulfil_order($1, 'pay_x', 349900, 'INR')`, [id])))).toMatch(/permission denied/);
  });

  it('amount or currency mismatch grants nothing', async () => {
    const id = await createOrder(S2);
    const r = await asService(db, (q) => q<{ r: string }>(`select public.fulfil_order($1, 'pay_mismatch', 100, 'INR') as r`, [id]));
    expect(r.rows[0].r).toBe('amount-mismatch');
    const r2 = await asService(db, (q) => q<{ r: string }>(`select public.fulfil_order($1, 'pay_mismatch2', 349900, 'USD') as r`, [id]));
    expect(r2.rows[0].r).toBe('amount-mismatch');
    const e = await db.query(`select * from public.enrollments where user_id = $1`, [S2]);
    expect(e.rows).toHaveLength(0);
  });

  it('verified payment creates exactly one enrollment, even with repeated or late notifications', async () => {
    const id = await createOrder(S1);
    const results: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await asService(db, (q) => q<{ r: string }>(`select public.fulfil_order($1, 'pay_ok', 349900, 'INR') as r`, [id]));
      results.push(r.rows[0].r);
    }
    expect(results).toEqual(['fulfilled', 'already-fulfilled', 'already-fulfilled']);
    const late = await asService(db, (q) => q<{ r: string }>(`select public.fail_order($1) as r`, [id]));
    expect(late.rows[0].r).toBe('ignored'); // a failure arriving after success changes nothing
    const enr = await db.query<{ expires_at: Date; start_at: Date }>(`select * from public.enrollments where user_id = $1`, [S1]);
    expect(enr.rows).toHaveLength(1);
    const o = await db.query<{ status: string }>(`select status from public.orders where id = $1`, [id]);
    expect(o.rows[0].status).toBe('paid');
  });

  it('a second paid order while already enrolled is flagged, not double-enrolled', async () => {
    const id = await createOrder(S1);
    const r = await asService(db, (q) => q<{ r: string }>(`select public.fulfil_order($1, 'pay_dup', 349900, 'INR') as r`, [id]));
    expect(r.rows[0].r).toBe('paid-already-enrolled');
    expect((await db.query(`select * from public.enrollments where user_id = $1`, [S1])).rows).toHaveLength(1);
  });
});

describe('students see only their own data', () => {
  it('orders, enrollments and profiles of other students are invisible', async () => {
    const o = await as(db, S2, (q) => q<{ user_id: string }>(`select user_id from public.orders`));
    expect(o.rows.every((r) => r.user_id === S2)).toBe(true);
    const e = await as(db, S2, (q) => q(`select * from public.enrollments`));
    expect(e.rows).toHaveLength(0);
    const p = await as(db, S2, (q) => q<{ id: string }>(`select id from public.profiles`));
    expect(p.rows.map((r) => r.id)).toEqual([S2]);
  });

  it('student cannot call admin functions directly', async () => {
    const enr = (await db.query<{ id: string }>(`select id from public.enrollments where user_id = $1`, [S1])).rows[0].id;
    for (const sql of [
      [`select public.admin_grant_access($1, $2, 'please')`, [S2, COURSE]],
      [`select public.admin_change_access($1, 'extend', 12, 'please')`, [enr]],
      [`select public.admin_save_course($1)`, [JSON.stringify(course({ title: 'Hacked' }))]],
      [`select public.save_settings_draft('{"brandName":"Hacked"}'::jsonb)`, []],
      [`select public.publish_settings()`, []],
      [`select public.admin_delete_course($1)`, [COURSE]],
    ] as [string, unknown[]][]) {
      expect(await err(as(db, S1, (q) => q(sql[0], sql[1])))).toMatch(/administrators only|permission denied/);
    }
  });
});

describe('progress and access', () => {
  it('opening a lesson (set_last_lesson) does not complete it; completion is single and only with active access', async () => {
    await as(db, S1, (q) => q(`select public.set_last_lesson($1)`, [L_PAID]));
    expect((await db.query(`select * from public.lesson_completions where user_id = $1`, [S1])).rows).toHaveLength(0);
    await as(db, S1, (q) => q(`select public.set_lesson_complete($1, true)`, [L_PAID]));
    await as(db, S1, (q) => q(`select public.set_lesson_complete($1, true)`, [L_PAID]));
    expect((await db.query(`select * from public.lesson_completions where user_id = $1`, [S1])).rows).toHaveLength(1);
    const resume = await as(db, S1, (q) => q<{ last_lesson_id: string }>(`select last_lesson_id from public.course_resume`));
    expect(resume.rows[0].last_lesson_id).toBe(L_PAID);
    // Not enrolled → refused. Unpublished lesson → refused.
    expect(await err(as(db, S2, (q) => q(`select public.set_lesson_complete($1, true)`, [L_PAID])))).toMatch(/not active/);
    expect(await err(as(db, S1, (q) => q(`select public.set_lesson_complete($1, true)`, [L_DRAFT])))).toMatch(/not found/);
  });

  it('paid media is readable only with active access, checked against the current time', async () => {
    const m = await as(db, S1, (q) => q<{ lesson_id: string; transcript: string | null }>(`select lesson_id, transcript from public.lesson_media order by lesson_id`));
    expect(m.rows.map((r) => r.lesson_id)).toEqual([L_PREVIEW, L_PAID]);
    const other = await as(db, S2, (q) => q<{ lesson_id: string }>(`select lesson_id from public.lesson_media`));
    expect(other.rows.map((r) => r.lesson_id)).toEqual([L_PREVIEW]);

    // Expire the enrollment (as the owner, simulating time passing).
    await db.query(`update public.enrollments set start_at = now() - interval '7 months', expires_at = now() - interval '1 day' where user_id = $1`, [S1]);
    const after = await as(db, S1, (q) => q<{ lesson_id: string }>(`select lesson_id from public.lesson_media`));
    expect(after.rows.map((r) => r.lesson_id)).toEqual([L_PREVIEW]);
    expect(await err(as(db, S1, (q) => q(`select public.set_lesson_complete($1, false)`, [L_PAID])))).toMatch(/not active/);
    // Progress survives expiry.
    expect((await as(db, S1, (q) => q(`select * from public.lesson_completions`))).rows).toHaveLength(1);
  });

  it('admin extension (reason required) restores access; revoke blocks it again; all audited', async () => {
    const enr = (await db.query<{ id: string }>(`select id from public.enrollments where user_id = $1`, [S1])).rows[0].id;
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_change_access($1, 'extend', 2, '')`, [enr])))).toMatch(/reason/);
    await as(db, ADMIN, (q) => q(`select public.admin_change_access($1, 'extend', 2, 'Travelling, agreed by email')`, [enr]));
    expect((await as(db, S1, (q) => q(`select * from public.lesson_media`))).rows).toHaveLength(2);
    await as(db, ADMIN, (q) => q(`select public.admin_change_access($1, 'revoke', null, 'Refund issued')`, [enr]));
    expect((await as(db, S1, (q) => q(`select * from public.lesson_media`))).rows).toHaveLength(1);
    const audit = await as(db, ADMIN, (q) => q<{ action: string; actor_email: string; reason: string }>(`select action, actor_email, reason from public.audit_log where entity = 'enrollment' order by id`));
    expect(audit.rows.map((a) => a.action)).toEqual(['access.extend', 'access.revoke']);
    expect(audit.rows.every((a) => a.actor_email === 'owner@example.com' && a.reason)).toBe(true);
    // Students can't read the audit log
    expect((await as(db, S1, (q) => q(`select * from public.audit_log`))).rows).toHaveLength(0);
  });

  it('complimentary grants need a reason and cannot duplicate active access', async () => {
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_grant_access($1, $2, 'ok')`, [S2, COURSE])))).toMatch(/reason/);
    await as(db, ADMIN, (q) => q(`select public.admin_grant_access($1, $2, 'Workshop participant')`, [S2, COURSE]));
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_grant_access($1, $2, 'Workshop participant')`, [S2, COURSE])))).toMatch(/already has access/);
    const e = await db.query<{ order_id: string | null; source: string }>(`select order_id, source from public.enrollments where user_id = $1`, [S2]);
    expect(e.rows).toEqual([{ order_id: null, source: 'admin-grant' }]);
  });
});

describe('admin content rules', () => {
  it('removing a lesson that students completed is refused; deleting a course with orders is refused', async () => {
    const without = course();
    (without.modules[0].lessons as unknown[]).splice(1, 1);
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(without)])))).toMatch(/progress/);
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_delete_course($1)`, [COURSE])))).toMatch(/archive/);
  });

  it('price changes never change existing orders, and are audited', async () => {
    const before = (await db.query<{ amount_minor: number }>(`select amount_minor from public.orders order by created_at`)).rows;
    await as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(course({ prices: { INR: 499900, USD: 7900 } }))]));
    const after = (await db.query<{ amount_minor: number }>(`select amount_minor from public.orders order by created_at`)).rows;
    expect(after).toEqual(before);
    const a = await db.query<{ summary: string; actor_email: string }>(`select summary, actor_email from public.audit_log where action = 'course.price' order by id desc limit 1`);
    expect(a.rows[0].summary).toMatch(/499900/);
    expect(a.rows[0].actor_email).toBe('owner@example.com');
  });

  it('cannot publish without a price in every offered currency', async () => {
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(course({ prices: { INR: 349900 } }))])))).toMatch(/price/);
  });

  it('draft courses are hidden from students and guests', async () => {
    await as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(course({ status: 'draft' }))]));
    expect((await as(db, null, (q) => q(`select * from public.courses`))).rows).toHaveLength(0);
    expect((await as(db, S2, (q) => q(`select * from public.lessons`))).rows).toHaveLength(0);
    expect((await as(db, ADMIN, (q) => q(`select * from public.courses`))).rows).toHaveLength(1);
    await as(db, ADMIN, (q) => q(`select public.admin_save_course($1)`, [JSON.stringify(course())]));
  });

  it('publishing settings strips unconfirmed personal details', async () => {
    await as(db, ADMIN, (q) => q(`select public.save_settings_draft($1)`, [JSON.stringify({ brandName: 'Yoga with Rekha', fullName: 'Unconfirmed Name', fullNameConfirmed: false, credentials: 'Unverified', credentialsConfirmed: false, displayCurrencies: ['INR', 'USD'] })]));
    // Students and guests can't see the draft
    expect((await as(db, S1, (q) => q<{ id: string }>(`select id from public.site_settings`))).rows.map((r) => r.id)).toEqual(['published']);
    await as(db, ADMIN, (q) => q(`select public.publish_settings()`));
    const pub = await as(db, null, (q) => q<{ data: Record<string, string> }>(`select data from public.site_settings where id = 'published'`));
    expect(pub.rows[0].data.fullName).toBe('');
    expect(pub.rows[0].data.credentials).toBe('');
  });
});

describe('compute_expiry matches the browser rule', () => {
  it.each([
    ['2026-12-15 10:00+05:30', 6, '2027-06-15 23:59:59.999'],
    ['2026-08-31 10:00+05:30', 6, '2027-02-28 23:59:59.999'],
    ['2027-08-31 10:00+05:30', 6, '2028-02-29 23:59:59.999'],
    ['2026-08-30 20:00+00', 6, '2027-02-28 23:59:59.999'], // 01:30 IST on 31 Aug
  ])('%s + %i months', async (start, months, expected) => {
    const r = await db.query<{ e: string }>(`select to_char(public.compute_expiry($1::timestamptz, $2) at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI:SS.MS') as e`, [start, months]);
    expect(r.rows[0].e).toBe(expected);
  });
});
