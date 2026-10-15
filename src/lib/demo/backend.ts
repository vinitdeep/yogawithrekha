import type { Backend, PaymentSession } from '../backend/types';
import type { AppState, LessonVideo } from '../types';
import { STATE_VERSION, createSeedState } from '../seed';
import { sessionUploads } from '../uploads';
import * as E from './engine';
import { ok, fail } from './engine';

/**
 * DEMO backend: the whole "database" lives in this browser's localStorage.
 * Sign-in, payments, uploads and admin access are SIMULATED — anyone can edit browser storage,
 * so none of this is security. It exists so Rekha can click through every flow before launch.
 */

const STORAGE_KEY = 'ywr-demo-state';

function read(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    /* storage unavailable or corrupted: fall back to seed */
  }
  return createSeedState();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createDemoBackend(): Backend {
  let state = read();
  const subs = new Set<(s: AppState, reason?: 'session-expired') => void>();
  const emit = (reason?: 'session-expired') => subs.forEach((cb) => cb(state, reason));

  const commit = (next: AppState) => {
    state = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* quota (large images) — continue in memory */ }
    emit();
  };
  function run<T>(step: E.Step<T>): E.Result<T> {
    if (step.state !== state) commit(step.state);
    return step.result;
  }

  // Other tabs
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY) return;
      try { state = e.newValue ? JSON.parse(e.newValue) : createSeedState(); emit(); } catch { /* ignore */ }
    });
    // Session expiry check
    window.setInterval(() => {
      if (state.session && new Date(state.session.expiresAt) <= new Date()) {
        state = { ...state, session: null };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
        emit('session-expired');
      }
    }, 30_000);
  }

  return {
    mode: 'demo',
    async load() {
      if (state.session && new Date(state.session.expiresAt) <= new Date()) commit({ ...state, session: null });
      return state;
    },
    subscribe(cb) { subs.add(cb); return () => { subs.delete(cb); }; },

    async login(email, password) { await wait(350); return run(E.login(state, email, password)); },
    async register(name, email, password) {
      await wait(400);
      const r = run(E.register(state, name, email, password));
      return r.ok ? ok({ needsConfirmation: false }) : r;
    },
    async logout() { commit(E.logout(state)); },
    async requestPasswordReset(email) { await wait(500); return run(E.requestPasswordReset(state, email)); },
    async resetPassword(token, password) { return run(E.resetPassword(state, token, password)); },
    async updateProfile(patch) {
      const r = run(E.updateProfile(state, patch));
      return r.ok ? ok({}) : r;
    },
    async changePassword(current, next) { return run(E.changePassword(state, current, next)); },

    async setLessonComplete(courseId, lessonId, done) { return run(E.setLessonComplete(state, courseId, lessonId, done)); },
    async setLastLesson(courseId, lessonId) {
      const next = E.setLastLesson(state, courseId, lessonId);
      if (next !== state) commit(next);
    },
    async playbackUrl(courseId, lessonId) {
      const can = E.canOpenLesson(state, courseId, lessonId);
      if (!can.ok) return can;
      const lesson = state.courses.find((c) => c.id === courseId)?.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId);
      const v = lesson?.video;
      if (!v) return ok(null);
      if (v.kind === 'url') return ok(v.src);
      if (v.kind === 'upload') return ok(sessionUploads.get(lessonId) ?? null);
      return ok(null);
    },

    async startCheckout(courseId, currency) {
      const r = run(E.createOrder(state, courseId, currency));
      if (!r.ok) return r;
      const session: PaymentSession = { order: r.data, provider: { name: 'simulated' } };
      return ok(session);
    },
    async simulatePayment(orderId, outcome) {
      await wait(1500);
      return run(E.settleOrder(state, orderId, outcome));
    },
    async refreshOrder(orderId) {
      const o = state.orders.find((x) => x.id === orderId);
      return o ? ok(o) : fail('Order not found.');
    },

    async createCourse() { return run(E.createCourse(state)); },
    async saveCourse(c) { await wait(250); return run(E.saveCourse(state, c)); },
    async deleteCourse(id) { return run(E.deleteCourse(state, id)); },
    async grantAccess(userId, courseId, reason) { return run(E.grantAccess(state, userId, courseId, reason)); },
    async revokeAccess(id, reason) { return run(E.revokeAccess(state, id, reason)); },
    async restoreAccess(id, reason) { return run(E.restoreAccess(state, id, reason)); },
    async extendAccess(id, months, reason) { return run(E.extendAccess(state, id, months, reason)); },

    async saveSettingsDraft(s) { await wait(250); return run(E.saveSettingsDraft(state, s)); },
    async publishSettings() { await wait(250); return run(E.publishSettings(state)); },
    async discardSettingsDraft() { return run(E.discardSettingsDraft(state)); },

    async uploadImage(file) {
      // Demo: images are stored inline in browser storage, so keep them small.
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return fail('Please choose a JPG, PNG or WebP image.');
      if (file.size > 1.5 * 1024 * 1024) return fail('Demo limit: images must be under 1.5 MB.');
      return new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(ok(String(r.result)));
        r.onerror = () => resolve(fail('The image could not be read. Please try another file.'));
        r.readAsDataURL(file);
      });
    },
    uploadVideo(lessonId, file, onProgress, signal) {
      // SIMULATED upload: progress is fake and the file only plays in this browser session.
      return new Promise((resolve) => {
        if (!file.type.startsWith('video/')) { resolve(fail(`“${file.name}” is not a video file. Please choose an MP4, MOV or WebM file.`)); return; }
        if (file.size > 4 * 1024 ** 3) { resolve(fail('This file is larger than 4 GB. Please export a smaller version.')); return; }
        let pct = 0;
        const t = window.setInterval(() => {
          pct = Math.min(100, pct + 4 + Math.random() * 10);
          onProgress(pct);
          if (pct >= 100) {
            window.clearInterval(t);
            sessionUploads.set(lessonId, URL.createObjectURL(file));
            const v: LessonVideo = { kind: 'upload', src: 'session', fileName: file.name, attachedAt: new Date().toISOString() };
            resolve(ok(v));
          }
        }, 180);
        signal.addEventListener('abort', () => { window.clearInterval(t); resolve(fail('Upload cancelled.')); });
      });
    },

    async sendContact(name, email, message) {
      await wait(500);
      commit(E.addMessage(state, name, email, message));
      return ok({ delivered: false });
    },
    async resetDemo() { commit(E.resetDemo()); },
  };
}
