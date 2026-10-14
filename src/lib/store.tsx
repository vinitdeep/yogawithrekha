import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AccessStatus, Course, CourseProgress, Currency, DemoState, Enrollment, Lesson, Order, Settings, User,
} from './types';
import { STATE_VERSION, createSeedState, demoHash } from './seed';
import { computeExpiry } from './dates';

/**
 * Client-side demo store.
 *
 * Every action below stands in for a server endpoint. In production these must run on the
 * server with real authentication and authorization; the browser must never be trusted to
 * grant access, mark payments as paid, or decide whether a course has expired.
 */

const STORAGE_KEY = 'ywr-demo-state';

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* storage unavailable or corrupted: fall back to seed */
  }
  return createSeedState();
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

export function accessStatus(e: Enrollment | undefined, at = new Date()): AccessStatus {
  if (!e) return 'none';
  if (e.revoked) return 'revoked';
  if (new Date(e.startAt) > at) return 'scheduled';
  if (new Date(e.expiresAt) < at) return 'expired';
  return 'active';
}

/** Active now, or paid for and waiting for the configured start date. Used to block duplicate enrollments. */
export const isLive = (st: AccessStatus) => st === 'active' || st === 'scheduled';

export function courseLessons(c: Course, includeUnpublished = false): Lesson[] {
  return c.modules.flatMap((m) => m.lessons).filter((l) => includeUnpublished || l.published);
}

export function progressPercent(c: Course, p?: CourseProgress): number {
  const lessons = courseLessons(c);
  if (!lessons.length || !p) return 0;
  const done = lessons.filter((l) => p.completed.includes(l.id)).length;
  return Math.round((done / lessons.length) * 100);
}

export function courseMinutes(c: Course): number {
  return courseLessons(c).reduce((s, l) => s + l.durationMin, 0);
}

interface StoreApi {
  state: DemoState;
  user: User | null;
  // auth
  login(email: string, password: string): Result<User>;
  register(name: string, email: string, password: string): Result<User>;
  logout(): void;
  requestPasswordReset(email: string): Result<string | null>;
  resetPassword(token: string, password: string): Result;
  updateProfile(patch: Partial<Pick<User, 'name' | 'email' | 'country'>>): Result;
  changePassword(current: string, next: string): Result;
  // learning
  enrollmentFor(userId: string, courseId: string): Enrollment | undefined;
  progressFor(userId: string, courseId: string): CourseProgress | undefined;
  setLessonComplete(courseId: string, lessonId: string, done: boolean): Result;
  setLastLesson(courseId: string, lessonId: string): void;
  // checkout
  createOrder(courseId: string, currency: Currency): Result<Order>;
  completeOrder(orderId: string, outcome: 'paid' | 'failed'): Result<Order>;
  // admin
  saveCourse(c: Course): void;
  createCourse(): Course;
  deleteCourse(id: string): void;
  grantAccess(userId: string, courseId: string): Result;
  revokeAccess(enrollmentId: string): void;
  restoreAccess(enrollmentId: string): void;
  extendAccess(enrollmentId: string, months: number): void;
  updateSettings(patch: Partial<Settings>): void;
  addMessage(name: string, email: string, message: string): void;
  resetDemo(): void;
}

const StoreCtx = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(load);
  const stateRef = useRef(state);
  stateRef.current = state;


  // Keep tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setState(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Synchronous update so actions can return results computed from the new state. */
  const commit = useCallback((fn: (s: DemoState) => DemoState) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    // Persist synchronously so a reload straight after an action never loses it.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota exceeded (e.g. large images) — demo continues in memory */
    }
    setState(next);
    return next;
  }, []);

  const log = (s: DemoState, text: string): DemoState['activity'] =>
    [{ id: uid('a'), at: nowIso(), text, recordSource: 'demo' as const }, ...s.activity].slice(0, 200);

  const api = useMemo<StoreApi>(() => {
    const cur = () => stateRef.current;
    const me = () => cur().users.find((u) => u.id === cur().sessionUserId) ?? null;

    const enrollmentFor = (userId: string, courseId: string) =>
      cur().enrollments
        .filter((e) => e.userId === userId && e.courseId === courseId)
        .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];

    return {
      state,
      user: state.users.find((u) => u.id === state.sessionUserId) ?? null,

      login(email, password) {
        const u = cur().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
        if (!u || u.passwordHash !== demoHash(password)) return fail('That email and password combination was not recognised.');
        commit((s) => ({ ...s, sessionUserId: u.id }));
        return ok(u);
      },
      register(name, email, password) {
        const e = email.trim().toLowerCase();
        if (cur().users.some((x) => x.email.toLowerCase() === e)) return fail('An account with this email already exists. Try signing in instead.');
        const u: User = { id: uid('u'), name: name.trim(), email: e, passwordHash: demoHash(password), role: 'student', createdAt: nowIso(), source: 'demo' };
        commit((s) => ({ ...s, users: [...s.users, u], sessionUserId: u.id, activity: log(s, `${u.name} created an account`) }));
        return ok(u);
      },
      logout() {
        commit((s) => ({ ...s, sessionUserId: null }));
      },
      requestPasswordReset(email) {
        const u = cur().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
        // Same response either way in production, to avoid revealing which emails have accounts.
        if (!u) return ok(null);
        const token = Math.random().toString(36).slice(2, 10);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        commit((s) => ({ ...s, resetTokens: [...s.resetTokens.filter((t) => t.userId !== u.id), { token, userId: u.id, expiresAt }] }));
        return ok(token);
      },
      resetPassword(token, password) {
        const t = cur().resetTokens.find((x) => x.token === token);
        if (!t || new Date(t.expiresAt) < new Date()) return fail('This reset link is invalid or has expired. Please request a new one.');
        commit((s) => ({
          ...s,
          users: s.users.map((u) => (u.id === t.userId ? { ...u, passwordHash: demoHash(password) } : u)),
          resetTokens: s.resetTokens.filter((x) => x.token !== token),
        }));
        return ok(undefined);
      },
      updateProfile(patch) {
        const u = me();
        if (!u) return fail('Please sign in again.');
        if (patch.email && cur().users.some((x) => x.id !== u.id && x.email.toLowerCase() === patch.email!.toLowerCase())) {
          return fail('Another account already uses this email.');
        }
        commit((s) => ({ ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, ...patch } : x)) }));
        return ok(undefined);
      },
      changePassword(current, next) {
        const u = me();
        if (!u) return fail('Please sign in again.');
        if (u.passwordHash !== demoHash(current)) return fail('Your current password is incorrect.');
        commit((s) => ({ ...s, users: s.users.map((x) => (x.id === u.id ? { ...x, passwordHash: demoHash(next) } : x)) }));
        return ok(undefined);
      },

      enrollmentFor,
      progressFor: (userId, courseId) => cur().progress[`${userId}:${courseId}`],

      setLessonComplete(courseId, lessonId, done) {
        const u = me();
        if (!u) return fail('Please sign in to save progress.');
        // Production: server re-checks that the enrollment is active before saving.
        if (accessStatus(enrollmentFor(u.id, courseId)) !== 'active') return fail('Your access to this course is not active, so progress cannot be saved.');
        const key = `${u.id}:${courseId}`;
        commit((s) => {
          const p = s.progress[key] ?? { completed: [], updatedAt: nowIso() };
          const completed = done ? Array.from(new Set([...p.completed, lessonId])) : p.completed.filter((x) => x !== lessonId);
          return { ...s, progress: { ...s.progress, [key]: { ...p, completed, lastLessonId: lessonId, updatedAt: nowIso() } } };
        });
        return ok(undefined);
      },
      setLastLesson(courseId, lessonId) {
        const u = me();
        if (!u) return;
        const key = `${u.id}:${courseId}`;
        const p = cur().progress[key];
        if (p?.lastLessonId === lessonId) return;
        commit((s) => ({
          ...s,
          progress: { ...s.progress, [key]: { completed: p?.completed ?? [], lastLessonId: lessonId, updatedAt: nowIso() } },
        }));
      },

      createOrder(courseId, currency) {
        const u = me();
        const c = cur().courses.find((x) => x.id === courseId);
        if (!u) return fail('Please sign in or create an account first.');
        if (!c || c.status !== 'published') return fail('This course is not available for enrollment.');
        if (isLive(accessStatus(enrollmentFor(u.id, courseId)))) return fail('You are already enrolled in this course.');
        const at = nowIso();
        const order: Order = {
          id: uid('ord'), userId: u.id, courseId, courseTitle: c.title, customerName: u.name, customerEmail: u.email,
          amount: c.prices[currency], currency, status: 'pending', provider: 'simulated',
          reference: `SIM-${Date.now().toString(36).toUpperCase()}`, createdAt: at, updatedAt: at, recordSource: 'demo',
        };
        commit((s) => ({ ...s, orders: [order, ...s.orders] }));
        return ok(order);
      },
      completeOrder(orderId, outcome) {
        const o = cur().orders.find((x) => x.id === orderId);
        if (!o) return fail('Order not found.');
        // Idempotent: a repeated "payment notification" for an already-settled order changes nothing.
        if (o.status !== 'pending') return ok(o);
        const c = cur().courses.find((x) => x.id === o.courseId)!;
        const at = nowIso();
        const updated: Order = { ...o, status: outcome, updatedAt: at };
        commit((s) => {
          let enrollments = s.enrollments;
          const existing = enrollmentFor(o.userId, o.courseId);
          const alreadyActive = isLive(accessStatus(existing));
          if (outcome === 'paid' && !alreadyActive && !s.enrollments.some((e) => e.orderId === o.id)) {
            const start = s.settings.accessStartRule === 'launch-date' && new Date(s.settings.launchDate) > new Date(at)
              ? new Date(`${s.settings.launchDate}T00:00:00`).toISOString() : at;
            enrollments = [...enrollments, {
              id: uid('enr'), userId: o.userId, courseId: o.courseId, orderId: o.id, startAt: start,
              expiresAt: computeExpiry(start, c.accessMonths), revoked: false, source: 'purchase', recordSource: 'demo',
              history: [{ at, action: 'Enrolled after simulated payment' }],
            }];
          }
          return {
            ...s,
            orders: s.orders.map((x) => (x.id === o.id ? updated : x)),
            enrollments,
            activity: log(s, outcome === 'paid' ? `${o.customerName} enrolled in “${c.title}” (simulated payment)` : `Simulated payment failed for “${c.title}” (${o.customerName})`),
          };
        });
        return ok(updated);
      },

      saveCourse(c) {
        commit((s) => ({
          ...s,
          courses: s.courses.map((x) => (x.id === c.id ? { ...c, updatedAt: nowIso() } : x)),
          activity: log(s, `Course “${c.title}” updated`),
        }));
      },
      createCourse() {
        const c: Course = {
          id: uid('c'), slug: `new-course-${Date.now().toString(36)}`, title: 'Untitled course', titleProvisional: true,
          tagline: '', description: '', audience: [], topics: [], art: 'sage', prices: { INR: 0, USD: 0 }, pricesSample: true,
          status: 'draft', accessMonths: 6, curriculumSample: true, modules: [], updatedAt: nowIso(),
        };
        commit((s) => ({ ...s, courses: [...s.courses, c], activity: log(s, 'New draft course created') }));
        return c;
      },
      deleteCourse(id) {
        commit((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id), activity: log(s, 'A draft course was deleted') }));
      },
      grantAccess(userId, courseId) {
        const c = cur().courses.find((x) => x.id === courseId);
        if (!c) return fail('Course not found.');
        if (isLive(accessStatus(enrollmentFor(userId, courseId)))) return fail('This student already has active access to this course.');
        const at = nowIso();
        commit((s) => ({
          ...s,
          enrollments: [...s.enrollments, {
            id: uid('enr'), userId, courseId, startAt: at, expiresAt: computeExpiry(at, c.accessMonths), revoked: false,
            source: 'admin-grant', recordSource: 'demo', history: [{ at, action: 'Access granted by admin' }],
          }],
          activity: log(s, `Admin granted access to “${c.title}”`),
        }));
        return ok(undefined);
      },
      revokeAccess(id) {
        const at = nowIso();
        commit((s) => ({
          ...s,
          enrollments: s.enrollments.map((e) => (e.id === id ? { ...e, revoked: true, history: [...e.history, { at, action: 'Access revoked by admin' }] } : e)),
          activity: log(s, 'Admin revoked course access'),
        }));
      },
      restoreAccess(id) {
        const at = nowIso();
        commit((s) => ({
          ...s,
          enrollments: s.enrollments.map((e) => (e.id === id ? { ...e, revoked: false, history: [...e.history, { at, action: 'Access restored by admin' }] } : e)),
          activity: log(s, 'Admin restored course access'),
        }));
      },
      extendAccess(id, months) {
        const at = nowIso();
        commit((s) => ({
          ...s,
          enrollments: s.enrollments.map((e) => {
            if (e.id !== id) return e;
            // Extend from the current expiry, or from today if access has already ended.
            const base = new Date(e.expiresAt) > new Date() ? e.expiresAt : at;
            const expiresAt = computeExpiry(base, months);
            return { ...e, expiresAt, history: [...e.history, { at, action: `Access extended by ${months} month${months > 1 ? 's' : ''}` }] };
          }),
          activity: log(s, `Admin extended course access by ${months} month${months > 1 ? 's' : ''}`),
        }));
      },
      updateSettings(patch) {
        commit((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      addMessage(name, email, message) {
        commit((s) => ({
          ...s,
          messages: [{ id: uid('msg'), name, email, message, at: nowIso(), recordSource: 'demo' }, ...s.messages],
          activity: log(s, `Contact form message saved (demo — not delivered)`),
        }));
      },
      resetDemo() {
        const fresh = createSeedState();
        commit(() => fresh);
      },
    };
  }, [state, commit]);

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreApi {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

export function usePublishedCourses(): Course[] {
  const { state } = useStore();
  return state.courses.filter((c) => c.status === 'published');
}
