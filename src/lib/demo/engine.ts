import type {
  AppState, AuditEntry, Course, CourseProgress, Currency, Enrollment, Lesson, Order, Settings, User,
} from '../types';
import { accessStatus, courseLessons, currentEnrollment, isLive, SLUG_RE } from '../access';
import { computeExpiry } from '../dates';
import { createSeedState, demoHash } from '../seed';
import { formatMoney } from '../money';

/**
 * DEMO ENGINE — the simulated "server" for the browser demo.
 *
 * Every function takes the whole demo state and returns the next state plus a result, so the
 * rules can be unit-tested (see tests/engine.test.ts). The role checks here are a SIMULATION:
 * anyone can edit their own browser storage. Production enforces the equivalent rules in the
 * database with row-level security and SECURITY DEFINER functions (supabase/migrations).
 */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (error: string): Result<never> => ({ ok: false, error });

export interface Step<T = undefined> { state: AppState; result: Result<T> }
const same = <T,>(state: AppState, result: Result<T>): Step<T> => ({ state, result });

export const SESSION_HOURS = 12;
const LOGIN_WINDOW_MS = 10 * 60_000;
const LOGIN_MAX_FAILURES = 5;

let counter = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const iso = (d: Date) => d.toISOString();

/* ------------------------------ helpers ------------------------------ */

export function sessionUser(s: AppState, now = new Date()): User | null {
  if (!s.session || new Date(s.session.expiresAt) <= now) return null;
  return s.users.find((u) => u.id === s.session!.userId) ?? null;
}

function requireUser(s: AppState, now: Date): Result<User> {
  const u = sessionUser(s, now);
  return u ? ok(u) : fail('Your session has ended. Please sign in again.');
}

function requireAdmin(s: AppState, now: Date): Result<User> {
  const u = sessionUser(s, now);
  if (!u) return fail('Your session has ended. Please sign in again.');
  if (u.role !== 'admin') return fail('Only administrators can do that.');
  return ok(u);
}

function audit(s: AppState, actor: User, now: Date, e: Omit<AuditEntry, 'id' | 'at' | 'actorId' | 'actorEmail' | 'recordSource'>): AuditEntry[] {
  return [{ id: uid('aud'), at: iso(now), actorId: actor.id, actorEmail: actor.email, recordSource: 'demo' as const, ...e }, ...s.audit].slice(0, 500);
}

function activity(s: AppState, now: Date, text: string): AppState['activity'] {
  return [{ id: uid('a'), at: iso(now), text, recordSource: 'demo' as const }, ...s.activity].slice(0, 200);
}

const normEmail = (e: string) => e.trim().toLowerCase();
const reasonOk = (r: string | undefined) => !!r && r.trim().length >= 4;

/* ------------------------------ auth ------------------------------ */

export function login(s: AppState, email: string, password: string, now = new Date()): Step<User> {
  const key = normEmail(email);
  const recent = (s.loginFailures[key] ?? []).filter((t) => now.getTime() - t < LOGIN_WINDOW_MS);
  if (recent.length >= LOGIN_MAX_FAILURES) {
    return same(s, fail('Too many unsuccessful attempts. Please wait a few minutes, or reset your password.'));
  }
  const u = s.users.find((x) => x.email.toLowerCase() === key);
  if (!u || !u.passwordHash || u.passwordHash !== demoHash(password)) {
    return same({ ...s, loginFailures: { ...s.loginFailures, [key]: [...recent, now.getTime()] } },
      fail('That email and password combination was not recognised.'));
  }
  const { [key]: _cleared, ...rest } = s.loginFailures;
  return {
    state: { ...s, loginFailures: rest, session: { userId: u.id, expiresAt: iso(new Date(now.getTime() + SESSION_HOURS * 3_600_000)) } },
    result: ok(u),
  };
}

export function register(s: AppState, name: string, email: string, password: string, now = new Date()): Step<User> {
  const e = normEmail(email);
  if (name.trim().length < 2) return same(s, fail('Please enter your full name.'));
  if (password.length < 8) return same(s, fail('Use at least 8 characters.'));
  if (s.users.some((x) => x.email.toLowerCase() === e)) return same(s, fail('An account with this email already exists. Try signing in instead.'));
  // Self-registration can only ever create a student.
  const u: User = { id: uid('u'), name: name.trim(), email: e, passwordHash: demoHash(password), role: 'student', createdAt: iso(now), source: 'demo' };
  return {
    state: {
      ...s, users: [...s.users, u],
      session: { userId: u.id, expiresAt: iso(new Date(now.getTime() + SESSION_HOURS * 3_600_000)) },
      activity: activity(s, now, `${u.name} created an account`),
    },
    result: ok(u),
  };
}

export const logout = (s: AppState): AppState => ({ ...s, session: null });

/** Always reports success to the UI, whether or not the email exists. The token is only revealed in demo mode. */
export function requestPasswordReset(s: AppState, email: string, now = new Date()): Step<string | null> {
  const u = s.users.find((x) => x.email.toLowerCase() === normEmail(email) && x.passwordHash);
  if (!u) return same(s, ok(null));
  const token = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = iso(new Date(now.getTime() + 3_600_000));
  return { state: { ...s, resetTokens: [...s.resetTokens.filter((t) => t.userId !== u.id), { token, userId: u.id, expiresAt }] }, result: ok(token) };
}

export function resetPassword(s: AppState, token: string, password: string, now = new Date()): Step {
  const t = s.resetTokens.find((x) => x.token === token);
  if (!t || new Date(t.expiresAt) < now) return same(s, fail('This reset link is invalid or has expired. Please request a new one.'));
  return {
    state: {
      ...s,
      users: s.users.map((u) => (u.id === t.userId ? { ...u, passwordHash: demoHash(password) } : u)),
      resetTokens: s.resetTokens.filter((x) => x.token !== token),
      // Resetting a password signs out any existing session for that user.
      session: s.session?.userId === t.userId ? null : s.session,
    },
    result: ok(undefined),
  };
}

/** Only name, email and country can change. Role, id and source are ignored even if supplied. */
export function updateProfile(s: AppState, patch: Record<string, unknown>, now = new Date()): Step {
  const me = requireUser(s, now);
  if (!me.ok) return same(s, me);
  const name = typeof patch.name === 'string' ? patch.name.trim() : me.data.name;
  const email = typeof patch.email === 'string' ? normEmail(patch.email) : me.data.email;
  const country = typeof patch.country === 'string' ? patch.country.trim() || undefined : me.data.country;
  if (name.length < 2) return same(s, fail('Please enter your name.'));
  if (s.users.some((x) => x.id !== me.data.id && x.email.toLowerCase() === email)) return same(s, fail('Another account already uses this email.'));
  return { state: { ...s, users: s.users.map((x) => (x.id === me.data.id ? { ...x, name, email, country } : x)) }, result: ok(undefined) };
}

export function changePassword(s: AppState, current: string, next: string, now = new Date()): Step {
  const me = requireUser(s, now);
  if (!me.ok) return same(s, me);
  if (me.data.passwordHash !== demoHash(current)) return same(s, fail('Your current password is incorrect.'));
  return { state: { ...s, users: s.users.map((x) => (x.id === me.data.id ? { ...x, passwordHash: demoHash(next) } : x)) }, result: ok(undefined) };
}

/* ------------------------------ learning ------------------------------ */

const pkey = (u: string, c: string) => `${u}:${c}`;

function lessonInCourse(c: Course | undefined, lessonId: string): Lesson | undefined {
  return c?.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
}

/** Can this viewer open this lesson's content? (Previews are public; everything else needs active access.) */
export function canOpenLesson(s: AppState, courseId: string, lessonId: string, now = new Date()): Result<'preview' | 'enrolled' | 'admin'> {
  const c = s.courses.find((x) => x.id === courseId);
  const l = lessonInCourse(c, lessonId);
  const u = sessionUser(s, now);
  if (!c || !l) return fail('Lesson not found.');
  if (u?.role === 'admin') return ok('admin');
  if (!l.published || c.status === 'draft') return fail('Lesson not found.');
  const st = u ? accessStatus(currentEnrollment(s.enrollments, u.id, c.id, now), now) : 'none';
  if (st === 'active') return ok('enrolled');
  if (l.preview && c.status === 'published') return ok('preview');
  return fail(st === 'expired' ? 'Your access to this course has ended.' : st === 'revoked' ? 'Your access to this course has been removed.' : 'Enroll in this course to open this lesson.');
}

export function setLessonComplete(s: AppState, courseId: string, lessonId: string, done: boolean, now = new Date()): Step {
  const me = requireUser(s, now);
  if (!me.ok) return same(s, fail('Please sign in to save progress.'));
  const c = s.courses.find((x) => x.id === courseId);
  const l = lessonInCourse(c, lessonId);
  if (!c || !l || !l.published) return same(s, fail('Lesson not found.'));
  if (accessStatus(currentEnrollment(s.enrollments, me.data.id, courseId, now), now) !== 'active') {
    return same(s, fail('Your access to this course is not active, so progress cannot be saved.'));
  }
  const key = pkey(me.data.id, courseId);
  const p: CourseProgress = s.progress[key] ?? { completed: {}, updatedAt: iso(now) };
  const completed = { ...p.completed };
  if (done) completed[lessonId] = completed[lessonId] ?? iso(now); else delete completed[lessonId];
  return { state: { ...s, progress: { ...s.progress, [key]: { ...p, completed, lastLessonId: lessonId, updatedAt: iso(now) } } }, result: ok(undefined) };
}

/** Remember the last lesson opened. Never marks anything complete. */
export function setLastLesson(s: AppState, courseId: string, lessonId: string, now = new Date()): AppState {
  const u = sessionUser(s, now);
  if (!u || u.role !== 'student') return s;
  if (!canOpenLesson(s, courseId, lessonId, now).ok) return s;
  const key = pkey(u.id, courseId);
  const p = s.progress[key];
  if (p?.lastLessonId === lessonId) return s;
  return { ...s, progress: { ...s.progress, [key]: { completed: p?.completed ?? {}, lastLessonId: lessonId, updatedAt: iso(now) } } };
}

/* ------------------------------ checkout ------------------------------ */

/** The price comes from the course record — never from the page. */
export function createOrder(s: AppState, courseId: string, currency: Currency, now = new Date()): Step<Order> {
  const me = requireUser(s, now);
  if (!me.ok) return same(s, fail('Please sign in or create an account first.'));
  if (me.data.role !== 'student') return same(s, fail('Admin accounts can’t enroll. Use a student account.'));
  const c = s.courses.find((x) => x.id === courseId);
  if (!c || c.status !== 'published') return same(s, fail('This course is not available for enrollment.'));
  if (!s.settings.displayCurrencies.includes(currency)) return same(s, fail('That currency is not offered.'));
  const amount = c.prices[currency];
  if (amount === undefined || amount <= 0) return same(s, fail(`This course does not have a ${currency} price yet.`));
  if (isLive(accessStatus(currentEnrollment(s.enrollments, me.data.id, courseId, now), now))) return same(s, fail('You are already enrolled in this course.'));
  // Reuse an open order for the same course + currency instead of creating duplicates.
  const open = s.orders.find((o) => o.userId === me.data.id && o.courseId === courseId && o.currency === currency && o.status === 'pending' && o.recordSource === 'demo');
  if (open) return same(s, ok(open));
  const order: Order = {
    id: uid('ord'), userId: me.data.id, courseId, courseTitle: c.title, customerName: me.data.name, customerEmail: me.data.email,
    amount, currency, status: 'pending', provider: 'simulated',
    reference: `SIM-${now.getTime().toString(36).toUpperCase()}`, createdAt: iso(now), updatedAt: iso(now), recordSource: 'demo',
  };
  return { state: { ...s, orders: [order, ...s.orders] }, result: ok(order) };
}

/**
 * Simulated payment notification. Idempotent: replaying it, or receiving it for an order that is
 * already settled, changes nothing — and a successful payment creates at most one enrollment.
 */
export function settleOrder(s: AppState, orderId: string, outcome: 'paid' | 'failed', now = new Date()): Step<Order> {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o) return same(s, fail('Order not found.'));
  if (o.status !== 'pending') return same(s, ok(o));
  const c = s.courses.find((x) => x.id === o.courseId);
  if (!c) return same(s, fail('Course not found.'));
  const updated: Order = { ...o, status: outcome, updatedAt: iso(now), providerPaymentId: `sim_pay_${o.id}` };
  let enrollments = s.enrollments;
  if (outcome === 'paid') {
    const alreadyLive = isLive(accessStatus(currentEnrollment(s.enrollments, o.userId, o.courseId, now), now));
    if (!alreadyLive && !s.enrollments.some((e) => e.orderId === o.id)) {
      const startAt = s.settings.accessStartRule === 'launch-date' && new Date(`${s.settings.launchDate}T00:00:00+05:30`) > now
        ? new Date(`${s.settings.launchDate}T00:00:00+05:30`).toISOString() : iso(now);
      enrollments = [...enrollments, {
        id: uid('enr'), userId: o.userId, courseId: o.courseId, orderId: o.id, startAt,
        expiresAt: computeExpiry(startAt, c.accessMonths), revoked: false, source: 'purchase', recordSource: 'demo',
        history: [{ at: iso(now), action: `Enrolled after simulated payment (${c.accessMonths} months)`, by: 'system' }],
      }];
    }
  }
  return {
    state: {
      ...s, orders: s.orders.map((x) => (x.id === o.id ? updated : x)), enrollments,
      activity: activity(s, now, outcome === 'paid' ? `${o.customerName} enrolled in “${c.title}” (simulated payment)` : `Simulated payment failed for “${c.title}” (${o.customerName})`),
    },
    result: ok(updated),
  };
}

/* ------------------------------ admin: courses ------------------------------ */

export function validateCourse(s: AppState, c: Course): Record<string, string> {
  const er: Record<string, string> = {};
  if (!c.title.trim()) er.title = 'A course title is required.';
  if (!SLUG_RE.test(c.slug)) er.slug = 'Use lowercase letters, numbers and single hyphens only.';
  else if (s.courses.some((x) => x.id !== c.id && x.slug === c.slug)) er.slug = 'Another course already uses this web address.';
  for (const [cur, v] of Object.entries(c.prices)) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) er[`price_${cur}`] = 'Enter a price of 0 or more.';
  }
  if (!(Number.isInteger(c.accessMonths) && c.accessMonths >= 1 && c.accessMonths <= 36)) er.months = 'Choose a whole number of months between 1 and 36.';
  if (c.image && !c.imageAlt.trim()) er.imageAlt = 'Describe the image for screen-reader users.';
  if (c.status === 'published') {
    if (!courseLessons(c).length) er.status = 'A published course needs at least one published lesson.';
    const missing = s.settings.displayCurrencies.filter((cur) => !(c.prices[cur]! > 0));
    if (missing.length) er.status = `Set a price in ${missing.join(' and ')} before publishing.`;
  }
  const ids = c.modules.flatMap((m) => [m.id, ...m.lessons.map((l) => l.id)]);
  if (new Set(ids).size !== ids.length) er.modules = 'Duplicate module or lesson ids.';
  for (const l of c.modules.flatMap((m) => m.lessons)) {
    if (!l.title.trim()) { er.modules = 'Every lesson needs a title.'; break; }
    if (!(l.durationMin >= 1 && l.durationMin <= 180)) { er.modules = `“${l.title}” needs a duration between 1 and 180 minutes.`; break; }
  }
  return er;
}

function describeCourseChanges(before: Course, after: Course): { action: string; summary: string }[] {
  const out: { action: string; summary: string }[] = [];
  if (before.status !== after.status) out.push({ action: `course.${after.status === 'published' ? 'publish' : after.status === 'archived' ? 'archive' : 'unpublish'}`, summary: `Status ${before.status} → ${after.status}` });
  const curs = new Set([...Object.keys(before.prices), ...Object.keys(after.prices)]) as Set<Currency>;
  const priceChanges = [...curs].filter((k) => before.prices[k] !== after.prices[k])
    .map((k) => `${k} ${before.prices[k] !== undefined ? formatMoney(before.prices[k]!, k) : '—'} → ${after.prices[k] !== undefined ? formatMoney(after.prices[k]!, k) : '—'}`);
  if (priceChanges.length) out.push({ action: 'course.price', summary: `Price changed: ${priceChanges.join(', ')} (existing orders unchanged)` });
  if (before.accessMonths !== after.accessMonths) out.push({ action: 'course.access_duration', summary: `Access for new enrollments ${before.accessMonths} → ${after.accessMonths} months (existing access unchanged)` });
  const contentKeys: (keyof Course)[] = ['title', 'slug', 'tagline', 'description', 'audience', 'topics', 'image', 'imageAlt', 'modules', 'titleProvisional', 'curriculumSample', 'pricesSample', 'art', 'showPreview'];
  const changed = contentKeys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (changed.length) out.push({ action: 'course.update', summary: `Updated ${changed.join(', ')}` });
  return out;
}

export function saveCourse(s: AppState, c: Course, now = new Date()): Step<Course> {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  const before = s.courses.find((x) => x.id === c.id);
  if (!before) return same(s, fail('Course not found.'));
  const er = validateCourse(s, c);
  if (Object.keys(er).length) return same(s, fail(Object.values(er)[0]));
  // Lessons that students have completed can't be deleted outright — unpublish them instead.
  const enrolled = s.enrollments.some((e) => e.courseId === c.id);
  if (enrolled) {
    const keep = new Set(c.modules.flatMap((m) => m.lessons.map((l) => l.id)));
    const removedWithProgress = courseLessons(before, true).filter((l) => !keep.has(l.id) && Object.entries(s.progress).some(([k, p]) => k.endsWith(`:${c.id}`) && p.completed[l.id]));
    if (removedWithProgress.length) {
      return same(s, fail(`“${removedWithProgress[0].title}” has student progress, so it can’t be deleted. Unpublish it instead.`));
    }
  }
  const saved = { ...c, updatedAt: iso(now) };
  let log = s.audit;
  for (const ch of describeCourseChanges(before, saved)) log = audit({ ...s, audit: log }, admin.data, now, { ...ch, entity: 'course', entityId: c.id, summary: `“${saved.title}”: ${ch.summary}` });
  return {
    state: { ...s, courses: s.courses.map((x) => (x.id === c.id ? saved : x)), audit: log, activity: activity(s, now, `Course “${saved.title}” updated`) },
    result: ok(saved),
  };
}

export function createCourse(s: AppState, now = new Date()): Step<Course> {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  const c: Course = {
    id: uid('c'), slug: `new-course-${now.getTime().toString(36)}`, title: 'Untitled course', titleProvisional: true,
    tagline: '', description: '', audience: [], topics: [], art: 'sage', imageAlt: '', prices: {}, pricesSample: true,
    status: 'draft', accessMonths: s.settings.defaultAccessMonths, curriculumSample: true, modules: [], updatedAt: iso(now),
  };
  return {
    state: { ...s, courses: [...s.courses, c], audit: audit(s, admin.data, now, { action: 'course.create', entity: 'course', entityId: c.id, summary: 'Created a draft course' }) },
    result: ok(c),
  };
}

/** Only possible when nothing references the course. Otherwise archive it. */
export function deleteCourse(s: AppState, id: string, now = new Date()): Step {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  const c = s.courses.find((x) => x.id === id);
  if (!c) return same(s, fail('Course not found.'));
  if (s.enrollments.some((e) => e.courseId === id) || s.orders.some((o) => o.courseId === id)) {
    return same(s, fail('This course has orders or enrollments, so it can’t be deleted. Archive it instead.'));
  }
  return {
    state: { ...s, courses: s.courses.filter((x) => x.id !== id), audit: audit(s, admin.data, now, { action: 'course.delete', entity: 'course', entityId: id, summary: `Deleted unused course “${c.title}”` }) },
    result: ok(undefined),
  };
}

/* ------------------------------ admin: access ------------------------------ */

function updateEnrollment(s: AppState, id: string, fn: (e: Enrollment) => Enrollment): AppState {
  return { ...s, enrollments: s.enrollments.map((e) => (e.id === id ? fn(e) : e)) };
}

export function grantAccess(s: AppState, userId: string, courseId: string, reason: string, now = new Date()): Step<Enrollment> {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  if (!reasonOk(reason)) return same(s, fail('Please give a reason (at least 4 characters).'));
  const c = s.courses.find((x) => x.id === courseId);
  const student = s.users.find((u) => u.id === userId);
  if (!c) return same(s, fail('Course not found.'));
  if (!student || student.role !== 'student') return same(s, fail('Student not found.'));
  if (isLive(accessStatus(currentEnrollment(s.enrollments, userId, courseId, now), now))) return same(s, fail('This student already has active access to this course.'));
  const e: Enrollment = {
    id: uid('enr'), userId, courseId, startAt: iso(now), expiresAt: computeExpiry(iso(now), c.accessMonths), revoked: false,
    source: 'admin-grant', grantReason: reason.trim(), recordSource: 'demo',
    history: [{ at: iso(now), action: `Complimentary access granted (${c.accessMonths} months)`, by: admin.data.email, reason: reason.trim() }],
  };
  return {
    state: {
      ...s, enrollments: [...s.enrollments, e],
      audit: audit(s, admin.data, now, { action: 'access.grant', entity: 'enrollment', entityId: e.id, summary: `Granted ${student.email} access to “${c.title}” until ${e.expiresAt.slice(0, 10)}`, reason: reason.trim() }),
      activity: activity(s, now, `Admin granted access to “${c.title}”`),
    },
    result: ok(e),
  };
}

function enrollmentAction(s: AppState, id: string, reason: string, now: Date, kind: 'revoke' | 'restore' | 'extend', months = 0): Step {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  if (!reasonOk(reason)) return same(s, fail('Please give a reason (at least 4 characters).'));
  const e = s.enrollments.find((x) => x.id === id);
  if (!e) return same(s, fail('Enrollment not found.'));
  const c = s.courses.find((x) => x.id === e.courseId);
  const student = s.users.find((u) => u.id === e.userId);
  const label = `${student?.email ?? 'student'} · “${c?.title ?? 'course'}”`;
  const r = reason.trim();
  if (kind === 'revoke') {
    if (e.revoked) return same(s, fail('Access is already revoked.'));
    return {
      state: {
        ...updateEnrollment(s, id, (x) => ({ ...x, revoked: true, history: [...x.history, { at: iso(now), action: 'Access revoked', by: admin.data.email, reason: r }] })),
        audit: audit(s, admin.data, now, { action: 'access.revoke', entity: 'enrollment', entityId: id, summary: `Revoked ${label}`, reason: r }),
      },
      result: ok(undefined),
    };
  }
  if (kind === 'restore') {
    if (!e.revoked) return same(s, fail('Access is not revoked.'));
    const other = currentEnrollment(s.enrollments.filter((x) => x.id !== id), e.userId, e.courseId, now);
    if (isLive(accessStatus(other, now))) return same(s, fail('The student already has another active enrollment for this course.'));
    return {
      state: {
        ...updateEnrollment(s, id, (x) => ({ ...x, revoked: false, history: [...x.history, { at: iso(now), action: 'Access restored', by: admin.data.email, reason: r }] })),
        audit: audit(s, admin.data, now, { action: 'access.restore', entity: 'enrollment', entityId: id, summary: `Restored ${label}`, reason: r }),
      },
      result: ok(undefined),
    };
  }
  if (!(Number.isInteger(months) && months >= 1 && months <= 24)) return same(s, fail('Choose between 1 and 24 months.'));
  // Extend from the current end date, or from now if access has already ended.
  const base = new Date(e.expiresAt) > now ? e.expiresAt : iso(now);
  const expiresAt = computeExpiry(base, months);
  return {
    state: {
      ...updateEnrollment(s, id, (x) => ({ ...x, expiresAt, history: [...x.history, { at: iso(now), action: `Access extended by ${months} month${months > 1 ? 's' : ''} (was ${x.expiresAt.slice(0, 10)})`, by: admin.data.email, reason: r }] })),
      audit: audit(s, admin.data, now, { action: 'access.extend', entity: 'enrollment', entityId: id, summary: `Extended ${label} by ${months} month(s) to ${expiresAt.slice(0, 10)}`, reason: r }),
    },
    result: ok(undefined),
  };
}

export const revokeAccess = (s: AppState, id: string, reason: string, now = new Date()) => enrollmentAction(s, id, reason, now, 'revoke');
export const restoreAccess = (s: AppState, id: string, reason: string, now = new Date()) => enrollmentAction(s, id, reason, now, 'restore');
export const extendAccess = (s: AppState, id: string, months: number, reason: string, now = new Date()) => enrollmentAction(s, id, reason, now, 'extend', months);

/* ------------------------------ admin: settings ------------------------------ */

export function validateSettings(st: Settings): Record<string, string> {
  const er: Record<string, string> = {};
  if (!st.brandName.trim()) er.brandName = 'Brand name is required.';
  if (!st.courseBrand.trim()) er.courseBrand = 'Offering name is required.';
  if (!st.displayName.trim()) er.displayName = 'Public name is required.';
  if (!st.heroHeadline.trim()) er.heroHeadline = 'A headline is required.';
  if (st.heroHeadline.length > 70) er.heroHeadline = 'Keep the headline under 70 characters so it fits on phones.';
  if (st.heroAccent && !st.heroHeadline.includes(st.heroAccent)) er.heroAccent = 'The accent words must appear in the headline exactly.';
  if (!st.heroPrimaryCta.trim()) er.heroPrimaryCta = 'Button label is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(st.supportEmail.trim())) er.supportEmail = 'Enter a valid support email address.';
  if (!/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(st.instagramUrl)) er.instagramUrl = 'Enter the full profile link, e.g. https://www.instagram.com/yoga_with_rekha/';
  if (st.whatsappVerified && !/^\+\d[\d\s-]{7,}$/.test(st.whatsappNumber.trim())) er.whatsappNumber = 'Enter the number with country code, e.g. +91 98xxx xxxxx.';
  if (st.portrait && !st.portraitAlt.trim()) er.portraitAlt = 'Describe the portrait for screen-reader users.';
  if (st.logo && !st.logoAlt.trim()) er.logoAlt = 'Describe the logo.';
  if (!st.displayCurrencies.length) er.displayCurrencies = 'Offer at least one currency.';
  if (!st.displayCurrencies.includes(st.defaultCurrency)) er.defaultCurrency = 'The default currency must be one of the offered currencies.';
  if (!(Number.isInteger(st.defaultAccessMonths) && st.defaultAccessMonths >= 1 && st.defaultAccessMonths <= 36)) er.defaultAccessMonths = 'Choose between 1 and 36 months.';
  if (st.accessStartRule === 'launch-date' && !/^\d{4}-\d{2}-\d{2}$/.test(st.launchDate)) er.launchDate = 'Choose a launch date.';
  if (st.faqs.some((f) => !f.question.trim() || !f.answer.trim())) er.faq = 'Every FAQ needs a question and an answer.';
  for (const [k, v] of Object.entries(st.seo)) if (v.description.length > 170) er[`seo_${k}`] = 'Keep descriptions under 170 characters.';
  return er;
}

export function saveSettingsDraft(s: AppState, draft: Settings, now = new Date()): Step {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  const er = validateSettings(draft);
  if (Object.keys(er).length) return same(s, fail(Object.values(er)[0]));
  return { state: { ...s, settingsDraft: draft }, result: ok(undefined) };
}

export function discardSettingsDraft(s: AppState, now = new Date()): Step {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  return { state: { ...s, settingsDraft: null }, result: ok(undefined) };
}

export function publishSettings(s: AppState, now = new Date()): Step {
  const admin = requireAdmin(s, now);
  if (!admin.ok) return same(s, admin);
  if (!s.settingsDraft) return same(s, fail('There are no unpublished changes.'));
  const er = validateSettings(s.settingsDraft);
  if (Object.keys(er).length) return same(s, fail(Object.values(er)[0]));
  const before = s.settings, after = s.settingsDraft;
  const changed = (Object.keys(after) as (keyof Settings)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const policyChanges = (['privacy', 'terms', 'refund'] as const).filter((k) => JSON.stringify(before.policies[k]) !== JSON.stringify(after.policies[k]));
  let log = audit(s, admin.data, now, { action: 'settings.publish', entity: 'settings', summary: changed.length ? `Published settings: ${changed.join(', ')}` : 'Published settings (no changes)' });
  for (const k of policyChanges) {
    log = audit({ ...s, audit: log }, admin.data, now, { action: 'policy.publish', entity: 'settings', entityId: k, summary: `Published ${after.policies[k].title}${after.policies[k].draft ? ' (still marked draft)' : ' (marked final)'}` });
  }
  return { state: { ...s, settings: after, settingsDraft: null, settingsPublishedAt: iso(now), audit: log }, result: ok(undefined) };
}

/* ------------------------------ misc ------------------------------ */

export function addMessage(s: AppState, name: string, email: string, message: string, now = new Date()): AppState {
  return {
    ...s,
    messages: [{ id: uid('msg'), name, email, message, at: iso(now), recordSource: 'demo' as const }, ...s.messages].slice(0, 100),
    activity: activity(s, now, 'Contact form message saved (demo — not delivered)'),
  };
}

export function resetDemo(): AppState {
  return createSeedState();
}

/** Read-only view of what an admin needs about one lesson's existing use (for delete/replace warnings). */
export function lessonUsage(s: AppState, courseId: string, lessonId: string) {
  const completions = Object.entries(s.progress).filter(([k, p]) => k.endsWith(`:${courseId}`) && p.completed[lessonId]).length;
  const activeStudents = s.enrollments.filter((e) => e.courseId === courseId && accessStatus(e) === 'active').length;
  return { completions, activeStudents };
}
