/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, PaymentSession, Result } from '../backend/types';
import type {
  AppState, AuditEntry, Course, CourseProgress, Currency, Enrollment, Lesson, LessonVideo, Order, Settings, User,
} from '../types';
import type { ProductionConfig } from '../config';
import { STATE_VERSION, defaultSettings } from '../seed';
import { ok, fail } from '../demo/engine';

/**
 * PRODUCTION backend (Supabase).
 *
 * The browser only holds the anon key and the user's own session. Everything it reads is filtered
 * by row-level security; everything it changes goes through SECURITY DEFINER functions or Edge
 * Functions that re-check the caller on the server (see supabase/migrations and supabase/functions).
 * Nothing here can grant access, set a price, mark an order paid or change a role.
 */

const friendly = (e: { message?: string; code?: string; status?: number } | null | undefined, fallback = 'Something went wrong. Please try again.'): string => {
  if (!e) return fallback;
  if (e.code === '42501') return 'You don’t have permission to do that.';
  if (e.code === '28000' || e.status === 401) return 'Your session has ended. Please sign in again.';
  if (e.status === 429) return 'Too many attempts. Please wait a few minutes and try again.';
  const m = (e.message ?? '').trim();
  if (!m || /fetch|network/i.test(m)) return 'We couldn’t reach the server. Check your connection and try again.';
  return m.charAt(0).toUpperCase() + m.slice(1).replace(/\.?$/, '.');
};

function mapCourse(row: any, media: Map<string, any>): Course {
  const prices: Partial<Record<Currency, number>> = {};
  for (const p of row.course_prices ?? []) prices[p.currency as Currency] = p.amount_minor;
  const modules = [...(row.modules ?? [])].sort((a, b) => a.position - b.position).map((m: any) => ({
    id: m.id,
    title: m.title,
    lessons: [...(row.lessons ?? [])].filter((l: any) => l.module_id === m.id).sort((a: any, b: any) => a.position - b.position).map((l: any): Lesson => {
      const md = media.get(l.id);
      const video: LessonVideo | undefined = md?.video_kind
        ? { kind: md.video_kind, src: md.video_ref ?? '', fileName: md.video_file ?? undefined, attachedAt: md.attached_at ?? '' }
        : undefined;
      return {
        id: l.id, title: l.title, description: l.description, durationMin: l.duration_min, preview: l.preview, published: l.published,
        video, captionsUrl: md?.captions_url ?? undefined, transcript: md?.transcript ?? undefined,
      };
    }),
  }));
  return {
    id: row.id, slug: row.slug, title: row.title, titleProvisional: row.title_provisional, tagline: row.tagline,
    description: row.description, audience: row.audience ?? [], topics: row.topics ?? [], art: row.art,
    image: row.image_url ?? undefined, imageAlt: row.image_alt ?? '', prices, pricesSample: row.prices_sample,
    status: row.status, accessMonths: row.access_months, curriculumSample: row.curriculum_sample, modules, updatedAt: row.updated_at,
  };
}

const mapOrder = (o: any): Order => ({
  id: o.id, userId: o.user_id, courseId: o.course_id, courseTitle: o.course_title, customerName: o.customer_name,
  customerEmail: o.customer_email, amount: o.amount_minor, currency: o.currency, status: o.status, provider: o.provider,
  reference: o.reference, providerPaymentId: o.provider_payment_id ?? undefined, createdAt: o.created_at, updatedAt: o.updated_at, recordSource: 'live',
});

export function createSupabaseBackend(cfg: ProductionConfig): Backend {
  const sb: SupabaseClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  const subs = new Set<(s: AppState, reason?: 'session-expired') => void>();
  let last: AppState | null = null;
  let explicitSignOut = false;

  async function load(): Promise<AppState> {
    const { data: { session } } = await sb.auth.getSession();
    const uid = session?.user.id ?? null;

    const settingsQ = await sb.from('site_settings').select('id, data, updated_at');
    if (settingsQ.error) throw new Error(friendly(settingsQ.error, 'The website settings could not be loaded.'));
    const published = settingsQ.data.find((r: any) => r.id === 'published');
    const draftRow = settingsQ.data.find((r: any) => r.id === 'draft');
    // Missing settings row = the database was never initialised. Fail visibly instead of guessing.
    if (!published) throw new Error('The website has not been set up yet (no published settings). See SETUP-PRODUCTION.md, step 4.');
    const defaults = defaultSettings();
    const settings: Settings = { ...defaults, ...published.data };

    let me: User | null = null;
    let users: User[] = [];
    if (uid) {
      const profQ = await sb.from('profiles').select('*');
      if (profQ.error) throw new Error(friendly(profQ.error));
      users = profQ.data.map((p: any): User => ({ id: p.id, name: p.name, email: p.email, country: p.country ?? undefined, role: p.role, createdAt: p.created_at, source: 'live' }));
      me = users.find((u) => u.id === uid) ?? null;
    }
    const admin = me?.role === 'admin';

    const coursesQ = await sb.from('courses').select('*, course_prices(*), modules(*), lessons(*)').order('created_at');
    if (coursesQ.error) throw new Error(friendly(coursesQ.error, 'Courses could not be loaded.'));
    const mediaQ = uid ? await sb.from('lesson_media').select('*') : { data: [], error: null };
    const media = new Map<string, any>((mediaQ.data ?? []).map((m: any) => [m.lesson_id, m]));
    const courses = coursesQ.data.map((c: any) => mapCourse(c, media));

    let enrollments: Enrollment[] = [];
    let orders: Order[] = [];
    const progress: Record<string, CourseProgress> = {};
    let audit: AuditEntry[] = [];
    let messages: AppState['messages'] = [];
    if (uid) {
      const [enrQ, evQ, ordQ, compQ, resQ] = await Promise.all([
        sb.from('enrollments').select('*'),
        admin ? sb.from('enrollment_events').select('*').order('at') : Promise.resolve({ data: [], error: null }),
        sb.from('orders').select('*').order('created_at', { ascending: false }),
        sb.from('lesson_completions').select('*'),
        sb.from('course_resume').select('*'),
      ]);
      for (const q of [enrQ, evQ, ordQ, compQ, resQ]) if (q.error) throw new Error(friendly(q.error));
      const events = new Map<string, any[]>();
      for (const ev of evQ.data ?? []) events.set(ev.enrollment_id, [...(events.get(ev.enrollment_id) ?? []), ev]);
      enrollments = (enrQ.data ?? []).map((e: any): Enrollment => ({
        id: e.id, userId: e.user_id, courseId: e.course_id, orderId: e.order_id ?? undefined, startAt: e.start_at, expiresAt: e.expires_at,
        revoked: e.revoked, source: e.source, grantReason: e.grant_reason ?? undefined, recordSource: 'live',
        history: (events.get(e.id) ?? []).map((h) => ({ at: h.at, action: h.action, by: h.actor_email ?? undefined, reason: h.reason ?? undefined })),
      }));
      orders = (ordQ.data ?? []).map(mapOrder);
      for (const c of compQ.data ?? []) {
        const k = `${c.user_id}:${c.course_id}`;
        progress[k] ??= { completed: {}, updatedAt: c.completed_at };
        progress[k].completed[c.lesson_id] = c.completed_at;
      }
      for (const r of resQ.data ?? []) {
        const k = `${r.user_id}:${r.course_id}`;
        progress[k] = { ...(progress[k] ?? { completed: {} }), lastLessonId: r.last_lesson_id ?? undefined, updatedAt: r.updated_at };
      }
      if (admin) {
        const [aQ, mQ] = await Promise.all([
          sb.from('audit_log').select('*').order('at', { ascending: false }).limit(500),
          sb.from('contact_messages').select('*').order('at', { ascending: false }).limit(100),
        ]);
        audit = (aQ.data ?? []).map((a: any): AuditEntry => ({ id: String(a.id), at: a.at, actorId: a.actor_id ?? '', actorEmail: a.actor_email ?? 'system', action: a.action, entity: a.entity, entityId: a.entity_id ?? undefined, summary: a.summary, reason: a.reason ?? undefined, recordSource: 'live' }));
        messages = (mQ.data ?? []).map((m: any) => ({ id: String(m.id), name: m.name, email: m.email, message: m.message, at: m.at, recordSource: 'live' as const }));
      }
    }

    let settingsDraft: Settings | null = null;
    let adminSettings = settings;
    if (admin && draftRow) {
      const draft: Settings = { ...defaults, ...draftRow.data };
      // Private fields (unconfirmed name/credentials) live only in the draft row.
      adminSettings = { ...settings, fullName: draft.fullName, credentials: draft.credentials, whatsappNumber: draft.whatsappNumber };
      const strip = (x: Settings) => JSON.stringify({ ...x, fullName: '', credentials: '', whatsappNumber: '' });
      if (strip(draft) !== strip(settings) || draft.fullName !== settings.fullName && draft.fullNameConfirmed) settingsDraft = draft;
    }

    const state: AppState = {
      version: STATE_VERSION, users, courses, enrollments, progress, orders, activity: [], audit, messages,
      settings: adminSettings, settingsDraft, settingsPublishedAt: published.updated_at,
      session: uid && session ? { userId: uid, expiresAt: new Date((session.expires_at ?? 0) * 1000).toISOString() } : null,
      resetTokens: [], loginFailures: {},
    };
    last = state;
    return state;
  }

  const refresh = async (reason?: 'session-expired') => {
    try {
      const s = await load();
      subs.forEach((cb) => cb(s, reason));
    } catch { /* keep the previous snapshot; the next action reports the error */ }
  };

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      const expired = !explicitSignOut && !!last?.session;
      explicitSignOut = false;
      void refresh(expired ? 'session-expired' : undefined);
    } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY' || event === 'TOKEN_REFRESHED') {
      void refresh();
    }
  });

  async function rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
    const { error } = await sb.rpc(fn, args);
    if (error) return fail(friendly(error));
    await refresh();
    return ok(undefined);
  }

  async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<Result<T>> {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      let msg = friendly(error);
      try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* ignore */ }
      return fail(msg);
    }
    return ok(data as T);
  }

  const currentUser = () => last?.users.find((u) => u.id === last?.session?.userId) ?? null;

  return {
    mode: 'production',
    load,
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb); }; },

    async login(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.status === 429) return fail('Too many attempts. Please wait a few minutes and try again.');
        if (/confirm/i.test(error.message)) return fail('Please confirm your email address first — check your inbox for the link.');
        return fail('That email and password combination was not recognised.');
      }
      await refresh();
      const u = last?.users.find((x) => x.id === data.user.id);
      return u ? ok(u) : fail('Your account profile could not be loaded. Please contact support.');
    },
    async register(name, email, password) {
      const { data, error } = await sb.auth.signUp({
        email: email.trim(), password,
        options: { data: { name: name.trim() }, emailRedirectTo: `${cfg.siteUrl || window.location.origin}${import.meta.env.BASE_URL}dashboard` },
      });
      if (error) return fail(error.status === 429 ? 'Too many attempts. Please try again later.' : friendly(error));
      // Email confirmation on (recommended): no session until the link is clicked.
      if (!data.session) return ok({ needsConfirmation: true });
      await refresh();
      return ok({ needsConfirmation: false });
    },
    async logout() { explicitSignOut = true; await sb.auth.signOut(); await refresh(); },
    async requestPasswordReset(email) {
      // Same response whether or not the account exists. Errors (e.g. rate limit) are not shown
      // in a way that reveals anything about the address.
      await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${cfg.siteUrl || window.location.origin}${import.meta.env.BASE_URL}reset-password/recovery` });
      return ok(null);
    },
    async resetPassword(_token, password) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return fail('This reset link is invalid or has expired. Please request a new one.');
      const { error } = await sb.auth.updateUser({ password });
      if (error) return fail(friendly(error));
      explicitSignOut = true;
      await sb.auth.signOut();
      return ok(undefined);
    },
    async updateProfile(patch) {
      const me = currentUser();
      if (!me) return fail('Your session has ended. Please sign in again.');
      // Only name and country are writable (column privileges + RLS). Role is never sent.
      const { error } = await sb.from('profiles').update({ name: patch.name?.trim() ?? me.name, country: patch.country?.trim() || null }).eq('id', me.id);
      if (error) return fail(friendly(error));
      let emailPending = false;
      if (patch.email && patch.email.trim().toLowerCase() !== me.email) {
        const r = await sb.auth.updateUser({ email: patch.email.trim().toLowerCase() });
        if (r.error) return fail(friendly(r.error));
        emailPending = true;
      }
      await refresh();
      return ok({ emailPending });
    },
    async changePassword(current, next) {
      const me = currentUser();
      if (!me) return fail('Your session has ended. Please sign in again.');
      const check = await sb.auth.signInWithPassword({ email: me.email, password: current });
      if (check.error) return fail('Your current password is incorrect.');
      const { error } = await sb.auth.updateUser({ password: next });
      return error ? fail(friendly(error)) : ok(undefined);
    },

    setLessonComplete: (_courseId, lessonId, done) => rpc('set_lesson_complete', { p_lesson: lessonId, p_done: done }),
    async setLastLesson(_courseId, lessonId) {
      await sb.rpc('set_last_lesson', { p_lesson: lessonId });
      await refresh();
    },
    async playbackUrl(courseId, lessonId) {
      const r = await invoke<{ url: string | null }>('lesson-playback', { courseId, lessonId });
      return r.ok ? ok(r.data.url) : r;
    },

    async startCheckout(courseId, currency) {
      if (!cfg.paymentProvider) return fail('Online payments are not available yet. Please contact support to enroll.');
      const r = await invoke<{ order: any; keyId: string; providerOrderId: string }>('create-order', { courseId, currency });
      if (!r.ok) return r;
      const session: PaymentSession = { order: mapOrder(r.data.order), provider: { name: 'razorpay', keyId: r.data.keyId, providerOrderId: r.data.providerOrderId } };
      return ok(session);
    },
    async refreshOrder(orderId) {
      const { data, error } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle();
      if (error) return fail(friendly(error));
      if (!data) return fail('Order not found.');
      if (data.status !== 'pending') await refresh();
      return ok(mapOrder(data));
    },

    async createCourse() {
      const { data, error } = await sb.rpc('admin_create_course');
      if (error) return fail(friendly(error));
      await refresh();
      const c = last?.courses.find((x) => x.id === data);
      return c ? ok(c) : fail('The course was created but could not be loaded.');
    },
    async saveCourse(c) {
      const r = await rpc('admin_save_course', { p_course: c });
      if (!r.ok) return r;
      const saved = last?.courses.find((x) => x.id === c.id);
      return saved ? ok(saved) : fail('Saved, but the course could not be reloaded.');
    },
    deleteCourse: (id) => rpc('admin_delete_course', { p_course: id }),
    async grantAccess(userId, courseId, reason) {
      const { data, error } = await sb.rpc('admin_grant_access', { p_user: userId, p_course: courseId, p_reason: reason });
      if (error) return fail(friendly(error));
      await refresh();
      const e = last?.enrollments.find((x) => x.id === data);
      return e ? ok(e) : fail('Access was granted but could not be reloaded.');
    },
    revokeAccess: (id, reason) => rpc('admin_change_access', { p_enrollment: id, p_kind: 'revoke', p_months: null, p_reason: reason }),
    restoreAccess: (id, reason) => rpc('admin_change_access', { p_enrollment: id, p_kind: 'restore', p_months: null, p_reason: reason }),
    extendAccess: (id, months, reason) => rpc('admin_change_access', { p_enrollment: id, p_kind: 'extend', p_months: months, p_reason: reason }),

    saveSettingsDraft: (s) => rpc('save_settings_draft', { p_data: s }),
    publishSettings: () => rpc('publish_settings', {}),
    discardSettingsDraft: () => rpc('discard_settings_draft', {}),

    async uploadImage(file, purpose) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail('Please choose a JPG, PNG or WebP image.');
      if (file.size > 5 * 1024 * 1024) return fail('Images must be under 5 MB.');
      const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
      const path = `${purpose}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('site-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) return fail(friendly(error));
      return ok(sb.storage.from('site-images').getPublicUrl(path).data.publicUrl);
    },
    async uploadVideo(lessonId, file, onProgress, signal) {
      if (!cfg.videoHostingEnabled) return fail('Video hosting is not configured yet. Attach a link instead, or see SETUP-PRODUCTION.md (video).');
      if (!file.type.startsWith('video/')) return fail(`“${file.name}” is not a video file.`);
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return fail('Your session has ended. Please sign in again.');
      const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${lessonId}/${crypto.randomUUID()}.${ext}`;
      // XHR rather than fetch so the admin sees real upload progress.
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${cfg.supabaseUrl}/storage/v1/object/lesson-videos/${path}`);
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
        xhr.setRequestHeader('apikey', cfg.supabaseAnonKey);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress((e.loaded / e.total) * 100); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(ok({ kind: 'storage', src: path, fileName: file.name, attachedAt: new Date().toISOString() }));
          else if (xhr.status === 413) resolve(fail('This file is larger than your storage plan allows. See SETUP-PRODUCTION.md (video).'));
          else resolve(fail(`Upload failed (${xhr.status}). Please try again.`));
        };
        xhr.onerror = () => resolve(fail('The upload was interrupted. Check your connection and try again.'));
        xhr.onabort = () => resolve(fail('Upload cancelled.'));
        signal.addEventListener('abort', () => xhr.abort());
        xhr.send(file);
      });
    },

    async sendContact(name, email, message) {
      const { error } = await sb.rpc('submit_contact', { p_name: name, p_email: email, p_message: message });
      return error ? fail(friendly(error)) : ok({ delivered: true });
    },
  };
}
