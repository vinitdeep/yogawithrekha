export type Role = 'student' | 'admin';
/** Currencies the site can display. Which ones are offered is a setting (`displayCurrencies`). */
export const CURRENCIES = ['INR', 'USD', 'CAD'] as const;
export type Currency = (typeof CURRENCIES)[number];
/** 'sample' = fictional seed record; 'demo' = created by someone using the demo; 'live' = real production record. */
export type RecordSource = 'sample' | 'demo' | 'live';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Demo only: a non-cryptographic hash. Production never sees passwords — the auth provider owns them. */
  passwordHash?: string;
  role: Role;
  country?: string;
  createdAt: string;
  source: RecordSource;
}

export interface LessonVideo {
  /**
   * 'url'     — a hosted video link (demo, or a public host while testing)
   * 'upload'  — demo only: a file kept in memory for the browser session it was chosen in
   * 'storage' — production: an object in the private `lesson-videos` bucket; playback needs a
   *             short-lived signed URL from the `lesson-playback` function
   * 'youtube' — an UNLISTED YouTube video; `src` is the 11-character video ID
   * 'gdrive'  — a Google Drive file shared "anyone with the link"; `src` is the file ID
   */
  kind: 'url' | 'upload' | 'storage' | 'youtube' | 'gdrive';
  src: string;
  fileName?: string;
  attachedAt: string;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  preview: boolean;
  published: boolean;
  video?: LessonVideo;
  /** Optional WebVTT captions link. */
  captionsUrl?: string;
  /** Optional plain-text transcript shown under the player. */
  transcript?: string;
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export type ArtTone = 'sage' | 'rose' | 'sand';
/** Archived = hidden and closed to new enrollments, but existing students keep their access and history. */
export type CourseStatus = 'draft' | 'published' | 'archived';

/** Prices are integers in the currency's minor unit (paise, cents). */
export type Prices = Partial<Record<Currency, number>>;

export interface Course {
  id: string;
  slug: string;
  title: string;
  /** True until Rekha confirms the course name. */
  titleProvisional: boolean;
  /** Short description used on cards and the course hero. */
  tagline: string;
  /** Longer overview on the course page. */
  description: string;
  audience: string[];
  topics: string[];
  art: ArtTone;
  image?: string;
  imageAlt: string;
  prices: Prices;
  /** True while prices are placeholders awaiting client confirmation. */
  pricesSample: boolean;
  status: CourseStatus;
  /** Access length for FUTURE enrollments. Existing enrollments keep their own dates. */
  accessMonths: number;
  curriculumSample: boolean;
  /** Show the "Preview a lesson" video on the public course page (default true). */
  showPreview?: boolean;
  modules: Module[];
  updatedAt: string;
}

export interface EnrollmentEvent {
  at: string;
  action: string;
  /** Who made the change (admin email, "system", or "student"). */
  by?: string;
  reason?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  /** Set for purchases. Complimentary access has no order — it is recorded with a reason instead. */
  orderId?: string;
  startAt: string;
  expiresAt: string;
  revoked: boolean;
  source: 'purchase' | 'admin-grant';
  /** Required for admin grants. */
  grantReason?: string;
  recordSource: RecordSource;
  history: EnrollmentEvent[];
}

export interface CourseProgress {
  /** Lesson id → completion time. One record per lesson, so duplicates are impossible. */
  completed: Record<string, string>;
  lastLessonId?: string;
  updatedAt: string;
}

export type OrderStatus = 'paid' | 'failed' | 'pending';

export interface Order {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  customerName: string;
  customerEmail: string;
  /** Minor units, calculated from the course price when the order was created. */
  amount: number;
  currency: Currency;
  status: OrderStatus;
  provider: 'simulated' | 'razorpay' | 'stripe';
  reference: string;
  providerPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  recordSource: RecordSource;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorEmail: string;
  action: string;
  entity: 'course' | 'lesson' | 'enrollment' | 'settings' | 'order' | 'user' | 'demo';
  entityId?: string;
  summary: string;
  reason?: string;
  recordSource: RecordSource;
}

export interface Activity {
  id: string;
  at: string;
  text: string;
  recordSource: RecordSource;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  message: string;
  at: string;
  recordSource: RecordSource;
}

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  /** Shown on the website. Unpublished questions stay in the admin only. */
  published: boolean;
  /** Depends on an unconfirmed policy — shows a "Draft" label. */
  draft: boolean;
}

export interface PolicyDoc {
  title: string;
  body: string;
  draft: boolean;
}

export type PageKey = 'home' | 'courses' | 'about' | 'faq' | 'contact';
export interface SeoEntry { title: string; description: string }

export interface Settings {
  brandName: string;
  courseBrand: string;
  displayName: string;
  /** Stored but not published until confirmed by the client. */
  fullName: string;
  fullNameConfirmed: boolean;
  credentials: string;
  credentialsConfirmed: boolean;

  logo?: string;
  logoAlt: string;
  portrait?: string;
  portraitAlt: string;

  heroEyebrow: string;
  heroHeadline: string;
  /** Word(s) in the headline drawn with the gradient accent. Must appear in the headline. */
  heroAccent: string;
  heroText: string;
  heroPrimaryCta: string;
  heroSecondaryCta: string;

  aboutIntro: string;
  personalStory: string;

  supportEmail: string;
  instagramUrl: string;
  instagramHandle: string;
  whatsappNumber: string;
  whatsappVerified: boolean;

  footerTagline: string;
  footerNote: string;

  defaultCurrency: Currency;
  displayCurrencies: Currency[];
  defaultAccessMonths: number;
  accessStartRule: 'enrollment' | 'launch-date';
  /**
   * How students get access:
   *  'checkout' — online payment only
   *  'request'  — students pay Rekha directly (e.g. UPI / bank transfer) and press "Request access";
   *               an admin approves each request
   *  'both'     — both buttons are offered
   */
  enrollmentMode: 'checkout' | 'request' | 'both';
  /** Shown to students in the "Request access" window, e.g. how to pay. */
  requestInstructions: string;
  launchDate: string;

  seo: Record<PageKey, SeoEntry>;
  faqs: FaqItem[];
  policies: Record<'privacy' | 'terms' | 'refund', PolicyDoc>;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

/** A student asking for access to a course (manual / offline payment flow). */
export interface AccessRequest {
  id: string;
  userId: string;
  courseId: string;
  /** Optional note from the student, e.g. a UPI reference. */
  message: string;
  status: AccessRequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  /** Admin's reason (required when declining). */
  decisionReason?: string;
  enrollmentId?: string;
  recordSource: RecordSource;
}

export interface ResetToken {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface Session {
  userId: string;
  expiresAt: string;
}

export interface AppState {
  version: number;
  users: User[];
  courses: Course[];
  enrollments: Enrollment[];
  /** Keyed by `${userId}:${courseId}` */
  progress: Record<string, CourseProgress>;
  orders: Order[];
  activity: Activity[];
  audit: AuditEntry[];
  messages: ContactMessage[];
  /** What the public website shows. */
  settings: Settings;
  /** Saved-but-unpublished settings edits (admin preview). Null when nothing is pending. */
  settingsDraft: Settings | null;
  settingsPublishedAt?: string;
  session: Session | null;
  resetTokens: ResetToken[];
  /** Demo login throttle: email → failed attempt timestamps. */
  loginFailures: Record<string, number[]>;
  accessRequests: AccessRequest[];
}

/** @deprecated kept for readability in older notes — use AppState. */
export type DemoState = AppState;

export type AccessStatus = 'none' | 'active' | 'expired' | 'revoked' | 'scheduled';
