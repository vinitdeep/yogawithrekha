export type Role = 'student' | 'admin';
export type Currency = 'INR' | 'USD';
export type RecordSource = 'sample' | 'demo';

export interface User {
  id: string;
  name: string;
  email: string;
  /** Demo-only hash. Production uses a real auth provider (never store passwords client-side). */
  passwordHash: string;
  role: Role;
  country?: string;
  createdAt: string;
  source: RecordSource;
}

export interface LessonVideo {
  kind: 'url' | 'upload';
  /** For 'url': a hosted video URL. For 'upload': a demo marker; the file only plays in the session it was chosen. */
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
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export type ArtTone = 'sage' | 'rose' | 'sand';

export interface Course {
  id: string;
  slug: string;
  title: string;
  /** True until Rekha confirms the course name. */
  titleProvisional: boolean;
  tagline: string;
  description: string;
  audience: string[];
  topics: string[];
  art: ArtTone;
  /** Optional uploaded cover image (data URL in the demo). */
  image?: string;
  prices: Record<Currency, number>;
  /** True while prices are placeholders awaiting client confirmation. */
  pricesSample: boolean;
  status: 'draft' | 'published';
  accessMonths: number;
  /** True while the curriculum is illustrative rather than Rekha's final outline. */
  curriculumSample: boolean;
  modules: Module[];
  updatedAt: string;
}

export interface EnrollmentEvent {
  at: string;
  action: string;
  note?: string;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId: string;
  orderId?: string;
  startAt: string;
  expiresAt: string;
  revoked: boolean;
  source: 'purchase' | 'admin-grant';
  recordSource: RecordSource;
  history: EnrollmentEvent[];
}

export interface CourseProgress {
  completed: string[];
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
  amount: number;
  currency: Currency;
  status: OrderStatus;
  provider: 'simulated';
  reference: string;
  createdAt: string;
  updatedAt: string;
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
  /** Draft = depends on an unconfirmed policy. */
  draft: boolean;
}

export interface PolicyDoc {
  title: string;
  body: string;
  draft: boolean;
}

export interface Settings {
  brandName: string;
  courseBrand: string;
  displayName: string;
  /** Stored but not published until confirmed by the client. */
  fullName: string;
  fullNameConfirmed: boolean;
  credentials: string;
  credentialsConfirmed: boolean;
  aboutIntro: string;
  personalStory: string;
  portrait?: string;
  supportEmail: string;
  instagramUrl: string;
  instagramHandle: string;
  whatsappNumber: string;
  whatsappVerified: boolean;
  accessStartRule: 'enrollment' | 'launch-date';
  launchDate: string;
  faqs: FaqItem[];
  policies: Record<'privacy' | 'terms' | 'refund', PolicyDoc>;
}

export interface ResetToken {
  token: string;
  userId: string;
  expiresAt: string;
}

export interface DemoState {
  version: number;
  users: User[];
  courses: Course[];
  enrollments: Enrollment[];
  /** Keyed by `${userId}:${courseId}` */
  progress: Record<string, CourseProgress>;
  orders: Order[];
  activity: Activity[];
  messages: ContactMessage[];
  settings: Settings;
  sessionUserId: string | null;
  resetTokens: ResetToken[];
}

export type AccessStatus = 'none' | 'active' | 'expired' | 'revoked' | 'scheduled';
