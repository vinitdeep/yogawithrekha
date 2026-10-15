import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Course, CourseProgress, Enrollment, Settings, User } from './types';
import type { Backend } from './backend/types';
import { currentEnrollment } from './access';
import { sessionUser } from './demo/engine';

export type { Result } from './demo/engine';
export { accessStatus, courseLessons, courseMinutes, currentEnrollment, isLive, progressPercent, progressStats, resumeLesson } from './access';

/**
 * App store: a snapshot of what the current viewer may see, plus the backend's actions.
 * In DEMO mode the backend is simulated in this browser; in PRODUCTION it is Supabase and the
 * snapshot is whatever row-level security returns for this user.
 */

type Actions = Omit<Backend, 'mode' | 'load' | 'subscribe'>;

interface StoreApi extends Actions {
  mode: Backend['mode'];
  state: AppState;
  user: User | null;
  /** Published settings, or the admin's unpublished draft while "preview draft" is on. */
  site: Settings;
  previewingDraft: boolean;
  setPreviewDraft(on: boolean): void;
  enrollmentFor(userId: string, courseId: string): Enrollment | undefined;
  progressFor(userId: string, courseId: string): CourseProgress | undefined;
  reload(): Promise<void>;
}

const StoreCtx = createContext<StoreApi | null>(null);
const PREVIEW_KEY = 'ywr-preview-draft';

export function StoreProvider({ backend, children, onSessionExpired }: { backend: Backend; children: ReactNode; onSessionExpired?: () => void }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(() => { try { return sessionStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; } });
  const expiredCb = useRef(onSessionExpired);
  expiredCb.current = onSessionExpired;

  const reload = useCallback(async () => {
    setError(null);
    try { setState(await backend.load()); } catch (e) { setError(e instanceof Error ? e.message : 'The site could not be loaded.'); }
  }, [backend]);

  useEffect(() => {
    void reload();
    return backend.subscribe((s, reason) => {
      setState(s);
      if (reason === 'session-expired') expiredCb.current?.();
    });
  }, [backend, reload]);

  const setPreviewDraft = useCallback((on: boolean) => {
    setPreview(on);
    try { if (on) sessionStorage.setItem(PREVIEW_KEY, '1'); else sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
  }, []);

  const api = useMemo<StoreApi | null>(() => {
    if (!state) return null;
    const user = sessionUser(state);
    const previewingDraft = preview && user?.role === 'admin' && !!state.settingsDraft;
    const { mode, load: _l, subscribe: _s, ...actions } = backend;
    return {
      ...actions,
      // Bind so methods keep working when destructured in components.
      ...Object.fromEntries(Object.entries(actions).map(([k, v]) => [k, typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(backend) : v])),
      mode,
      state,
      user,
      site: previewingDraft ? state.settingsDraft! : state.settings,
      previewingDraft,
      setPreviewDraft,
      enrollmentFor: (userId, courseId) => currentEnrollment(state.enrollments, userId, courseId),
      progressFor: (userId, courseId) => state.progress[`${userId}:${courseId}`],
      reload,
    } as StoreApi;
  }, [state, preview, backend, setPreviewDraft, reload]);

  if (error && !state) return <LoadError message={error} onRetry={reload} />;
  if (!api) {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> <span>Loading…</span>
      </div>
    );
  }
  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="boot boot-error" role="alert">
      <h1>We couldn’t load the site</h1>
      <p>{message}</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>
    </main>
  );
}

export function useStore(): StoreApi {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Courses visible in the public catalogue (archived and draft courses are hidden). */
export function usePublishedCourses(): Course[] {
  const { state } = useStore();
  return state.courses.filter((c) => c.status === 'published');
}
