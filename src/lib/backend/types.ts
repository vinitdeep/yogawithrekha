import type { AppMode } from '../config';
import type { AccessRequest, AppState, Course, Currency, Enrollment, LessonVideo, Order, Settings, User } from '../types';
import type { Result } from '../demo/engine';

export type { Result };

/** What a checkout needs to hand over to the payment provider (production only). */
export interface PaymentSession {
  order: Order;
  /** Provider-specific parameters for the checkout widget (e.g. Razorpay order id + public key). */
  provider: { name: 'razorpay'; keyId: string; providerOrderId: string } | { name: 'simulated' };
}

/**
 * The boundary every screen talks to. Two implementations:
 *  - demo/backend.ts      → browser storage + the demo engine (simulated)
 *  - supabase/backend.ts  → Supabase auth, database (row-level security) and Edge Functions
 *
 * After any successful mutation the backend emits a fresh snapshot through `subscribe`.
 * The snapshot only ever contains what the current viewer is allowed to read.
 */
export interface Backend {
  readonly mode: AppMode;
  load(): Promise<AppState>;
  subscribe(cb: (s: AppState, reason?: 'session-expired') => void): () => void;

  login(email: string, password: string): Promise<Result<User>>;
  /** needsConfirmation = the provider emailed a confirmation link; there is no session yet. */
  register(name: string, email: string, password: string): Promise<Result<{ needsConfirmation: boolean }>>;
  logout(): Promise<void>;
  /** Resolves ok for any email so the UI never reveals whether an account exists. Demo returns the reset token. */
  requestPasswordReset(email: string): Promise<Result<string | null>>;
  resetPassword(token: string, password: string): Promise<Result>;
  updateProfile(patch: { name?: string; email?: string; country?: string }): Promise<Result<{ emailPending?: boolean }>>;
  changePassword(current: string, next: string): Promise<Result>;

  setLessonComplete(courseId: string, lessonId: string, done: boolean): Promise<Result>;
  setLastLesson(courseId: string, lessonId: string): Promise<void>;
  /** A playable URL for the lesson, issued only after the server verifies access. null = no video yet. */
  playbackUrl(courseId: string, lessonId: string): Promise<Result<string | null>>;

  startCheckout(courseId: string, currency: Currency): Promise<Result<PaymentSession>>;
  /** Demo only: decide what the simulated payment provider reports. */
  simulatePayment?(orderId: string, outcome: 'paid' | 'failed'): Promise<Result<Order>>;
  /** Re-read one order (e.g. while waiting for the provider's webhook). */
  refreshOrder(orderId: string): Promise<Result<Order>>;

  createCourse(): Promise<Result<Course>>;
  saveCourse(c: Course): Promise<Result<Course>>;
  deleteCourse(id: string): Promise<Result>;
  grantAccess(userId: string, courseId: string, reason: string): Promise<Result<Enrollment>>;
  revokeAccess(enrollmentId: string, reason: string): Promise<Result>;
  restoreAccess(enrollmentId: string, reason: string): Promise<Result>;
  extendAccess(enrollmentId: string, months: number, reason: string): Promise<Result>;

  /** Student: ask for access after paying directly. Admin approves or declines in Students. */
  requestAccess(courseId: string, message: string): Promise<Result<AccessRequest>>;
  cancelAccessRequest(requestId: string): Promise<Result>;
  decideAccessRequest(requestId: string, approve: boolean, reason: string): Promise<Result>;
  /** Admin: email the student a password-reset link. Demo returns the link token (no email is sent). */
  sendPasswordReset(userId: string): Promise<Result<string | null>>;

  saveSettingsDraft(s: Settings): Promise<Result>;
  publishSettings(): Promise<Result>;
  discardSettingsDraft(): Promise<Result>;

  uploadImage(file: File, purpose: 'portrait' | 'logo' | 'course'): Promise<Result<string>>;
  uploadVideo(lessonId: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<Result<LessonVideo>>;

  sendContact(name: string, email: string, message: string): Promise<Result<{ delivered: boolean }>>;
  resetDemo?(): Promise<void>;
}
