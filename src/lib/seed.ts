import type { Course, DemoState, FaqItem, Lesson, Module, Settings, User } from './types';
import { computeExpiry, daysAgo } from './dates';

/**
 * Seed data for the client demo.
 *
 * EVERYTHING here is editable sample content:
 *  - Course titles, curricula and prices are PROVISIONAL placeholders. Rekha has not
 *    confirmed course names, lesson lists or pricing.
 *  - Student, order and activity records are fictional SAMPLE records (recordSource: 'sample').
 *    No real personal information is used. Emails use the reserved example.com domain.
 *  - The full name and credential text are stored UNPUBLISHED until the client confirms them.
 */

export const STATE_VERSION = 4;

/** Demo-only, non-cryptographic hash so plain passwords are not sitting in storage.
 *  Production must use a real auth provider; passwords never belong in the browser. */
export function demoHash(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0;
  return `demo$${h.toString(16)}`;
}

export const DEMO_ACCOUNTS = {
  student: { email: 'student@example.com', password: 'practice123', name: 'Demo Student' },
  admin: { email: 'admin@example.com', password: 'admin12345', name: 'Demo Admin' },
} as const;

let n = 0;
const lid = (prefix: string) => `${prefix}-${(++n).toString(36)}`;

function lesson(title: string, durationMin: number, description: string, preview = false): Lesson {
  return { id: lid('l'), title, description, durationMin, preview, published: true };
}

function mod(title: string, lessons: Lesson[]): Module {
  return { id: lid('m'), title, lessons };
}

function buildCourses(): Course[] {
  const now = daysAgo(3);
  return [
    {
      id: 'c-daily',
      slug: 'daily-face-yoga-practice',
      title: 'Daily Face Yoga Practice',
      titleProvisional: true,
      tagline: 'A steady, guided routine you can return to each day.',
      description:
        'Follow Rekha through calm, unhurried face yoga sessions designed to fit into a regular day. Each lesson is prerecorded, so you can practise when it suits you and repeat any session as often as you like during your access period.',
      audience: [
        'You would like a gentle, guided routine rather than piecing together exercises on your own',
        'You prefer learning at your own pace, at home',
        'You are new to face yoga or returning after a break',
      ],
      topics: [
        'Setting up a comfortable practice space',
        'Posture, breath and relaxed awareness',
        'Guided facial exercise sequences',
        'Neck and shoulder release to support your practice',
        'Building a routine you can keep',
      ],
      art: 'sage',
      image: '/images/rekha/warrior-ii.webp',
      prices: { INR: 3499, USD: 59 },
      pricesSample: true,
      status: 'published',
      accessMonths: 6,
      curriculumSample: true,
      updatedAt: now,
      modules: [
        mod('Welcome & preparation', [
          lesson('Welcome from Rekha', 15, 'Meet Rekha, learn how the course is organised, and set an intention for your practice.', true),
          lesson('Your practice space and posture', 16, 'Prepare a comfortable spot, find a supported seated posture and learn the cues used throughout the course.'),
          lesson('Breath and relaxed awareness', 18, 'A guided breathing practice to settle in before each session.'),
        ]),
        mod('Foundations of the practice', [
          lesson('Forehead and brow sequence', 17, 'A slow, guided sequence focusing on the forehead and brow area.'),
          lesson('Eyes and temples sequence', 18, 'Gentle movements and pauses for the area around the eyes and temples.'),
          lesson('Cheeks and mouth sequence', 19, 'A guided sequence for the cheeks and mouth with time to rest between movements.'),
          lesson('Jaw and neck release', 20, 'Relaxing practice for the jaw, neck and shoulders.'),
        ]),
        mod('Putting it together', [
          lesson('A complete 15-minute session', 15, 'A full guided session combining what you have practised so far.'),
          lesson('A complete 20-minute session', 20, 'A slightly longer full session for days when you have more time.'),
          lesson('Making the practice your own', 16, 'How to choose sessions for your week and keep your routine sustainable.'),
        ]),
      ],
    },
    {
      id: 'c-release',
      slug: 'face-neck-and-shoulder-release',
      title: 'Face, Neck & Shoulder Release',
      titleProvisional: true,
      tagline: 'Slow, mindful sessions for letting go of everyday tension.',
      description:
        'A calm set of guided lessons that pairs face yoga with gentle neck and shoulder movement. Designed for moments when you want to slow down, breathe and give your body some attention after screen time or a busy day.',
      audience: [
        'You spend long hours at a desk or on screens and want a mindful break',
        'You enjoy slower, restorative sessions',
        'You want short practices you can repeat in the evening',
      ],
      topics: [
        'Mindful breathing to begin and end each session',
        'Gentle neck and shoulder movement',
        'Relaxing face yoga sequences',
        'Short evening wind-down practices',
      ],
      art: 'rose',
      image: '/images/rekha/seated-twist.webp',
      prices: { INR: 2999, USD: 49 },
      pricesSample: true,
      status: 'published',
      accessMonths: 6,
      curriculumSample: true,
      updatedAt: now,
      modules: [
        mod('Arriving and settling', [
          lesson('Introduction to the series', 15, 'What to expect from these slower, restorative sessions.', true),
          lesson('Grounding breath', 16, 'A guided breath practice for settling body and mind.'),
        ]),
        mod('Release sessions', [
          lesson('Neck and shoulder wind-down', 18, 'Gentle movement to release the neck and upper shoulders.'),
          lesson('Jaw and face softening', 17, 'A slow, mindful face yoga session with long pauses.'),
          lesson('Screen-break practice', 15, 'A short session to step away from your screen and reset.'),
        ]),
        mod('Evening practice', [
          lesson('Evening relaxation sequence', 20, 'A complete wind-down practice for the end of the day.'),
          lesson('Your weekly release plan', 15, 'Choosing sessions for your week.'),
        ]),
      ],
    },
    {
      id: 'c-mindful',
      slug: 'mindful-face-yoga-rituals',
      title: 'Mindful Face Yoga Rituals',
      titleProvisional: true,
      tagline: 'Short rituals that pair face yoga with breath and stillness.',
      description:
        'A collection of guided rituals that bring face yoga, breathwork and quiet awareness together. Each session is designed to be a small, restful pause you can make time for, wherever you are.',
      audience: [
        'You want brief practices that fit around work and family',
        'You enjoy combining breath, stillness and gentle movement',
        'You like having a library of sessions to choose from',
      ],
      topics: [
        'Morning and evening rituals',
        'Breath-led face yoga',
        'Self-massage techniques guided step by step',
        'Moments of stillness and reflection',
      ],
      art: 'sand',
      image: '/images/rekha/triangle-pose.webp',
      prices: { INR: 2499, USD: 39 },
      pricesSample: true,
      status: 'published',
      accessMonths: 6,
      curriculumSample: true,
      updatedAt: now,
      modules: [
        mod('Rituals to begin', [
          lesson('About these rituals', 15, 'How the rituals are structured and how to use them.', true),
          lesson('A morning ritual', 17, 'A gentle way to begin the day with breath and face yoga.'),
        ]),
        mod('Rituals through the day', [
          lesson('A midday pause', 15, 'A short pause to reset during the day.'),
          lesson('Guided self-massage ritual', 19, 'Step-by-step guided self-massage with breath.'),
          lesson('An evening ritual', 18, 'A calming sequence to close the day.'),
        ]),
      ],
    },
  ];
}

function buildSettings(): Settings {
  const faqs: FaqItem[] = [
    { id: 'f1', category: 'Enrollment', question: 'How do I enroll in a course?', answer: 'Open the course you are interested in, select Enroll, and complete checkout. Once your payment is confirmed, the course appears in your student dashboard straight away.', draft: false },
    { id: 'f2', category: 'Enrollment', question: 'Do I need an account?', answer: 'Yes. You will create an account (or sign in) during checkout so your course access and progress are saved to you.', draft: false },
    { id: 'f3', category: 'Login and lesson access', question: 'How do I access my lessons after enrolling?', answer: 'Sign in with Student Login, open your dashboard and select Continue Learning. Your lessons are organised into modules so you can follow them in order or revisit any lesson.', draft: false },
    { id: 'f4', category: 'Login and lesson access', question: 'I forgot my password. What should I do?', answer: 'Use “Forgot password?” on the login page. We will send a reset link to your email address.', draft: false },
    { id: 'f5', category: 'Prerecorded format', question: 'Are the lessons live or prerecorded?', answer: 'The Rekha Radiance Method courses are prerecorded video lessons. You can watch them whenever it suits you, pause, and repeat them as often as you like during your access period.', draft: false },
    { id: 'f6', category: 'Prerecorded format', question: 'How long is each lesson?', answer: 'Lessons are typically around 15–20 minutes. Exact durations are shown beside each lesson on the course page.', draft: false },
    { id: 'f7', category: 'Six-month access', question: 'How long can I access a course?', answer: 'Each course includes six months of access, starting from the date your enrollment is confirmed. Your exact access end date is shown on your dashboard.', draft: false },
    { id: 'f8', category: 'Six-month access', question: 'Can I extend or renew my access?', answer: 'DRAFT — renewal options have not been confirmed yet. Please contact support if your access is ending and we will let you know what is available.', draft: true },
    { id: 'f9', category: 'Progress tracking', question: 'How is my progress tracked?', answer: 'Select “Mark complete” at the end of a lesson. Your progress percentage is based on the lessons you have marked complete, and it is saved to your account so you can pick up where you left off.', draft: false },
    { id: 'f10', category: 'Device compatibility', question: 'Which devices can I use?', answer: 'You can learn on a phone, tablet, laptop or desktop with an up-to-date web browser and a stable internet connection. There is no app to install.', draft: false },
    { id: 'f11', category: 'Payment questions', question: 'Which payment methods and currencies are accepted?', answer: 'DRAFT — payment methods are being finalised. Prices may be shown in Indian rupees and US dollars; available payment options can depend on your country and card issuer and will be confirmed at checkout.', draft: true },
    { id: 'f12', category: 'Payment questions', question: 'What is your refund policy?', answer: 'DRAFT — the refund policy is awaiting review. Please see the Refund Policy page for the current draft.', draft: true },
    { id: 'f13', category: 'Technical support', question: 'Who do I contact if a video will not play?', answer: 'Try refreshing the page and checking your connection first. If it still does not play, contact support with the course and lesson name, and the device and browser you are using.', draft: false },
  ];

  return {
    brandName: 'Yoga with Rekha',
    courseBrand: 'Rekha Radiance Method',
    displayName: 'Rekha',
    fullName: 'Rekha Sakthivadivel',
    fullNameConfirmed: false,
    credentials: 'Internationally certified yoga instructor · ERYT 500hrs',
    credentialsConfirmed: false,
    aboutIntro:
      'Rekha is the founder of Yoga with Rekha. She conducts online yoga classes and workshops and is preparing to bring her teaching into prerecorded learning through the Rekha Radiance Method.',
    personalStory: '',
    supportEmail: 'support@example.com',
    instagramUrl: 'https://www.instagram.com/yoga_with_rekha/',
    instagramHandle: '@yoga_with_rekha',
    whatsappNumber: '',
    whatsappVerified: false,
    accessStartRule: 'enrollment',
    launchDate: '2026-12-15',
    faqs,
    policies: {
      privacy: {
        title: 'Privacy Policy',
        draft: true,
        body:
          'DRAFT — awaiting legal review.\n\nWhat we collect\nWhen you create an account or enroll, we collect your name, email address, and the details needed to process your order. We record which lessons you mark complete so we can show your progress.\n\nHow we use it\nWe use your information to provide course access, send purchase and account emails, respond to support requests, and keep the platform secure.\n\nPayments\nPayments are handled by our payment provider. We do not store full card details on this website.\n\nYour choices\nYou can update your profile at any time and contact us to ask about the information we hold about you.\n\nContact\nQuestions about privacy can be sent to our support email.',
      },
      terms: {
        title: 'Terms of Use',
        draft: true,
        body:
          'DRAFT — awaiting legal review.\n\nCourse access\nEach course includes access for the period stated on the course page (currently six months), starting from the date your enrollment is confirmed.\n\nPersonal use\nCourse videos and materials are for your personal use. Please do not share your login or redistribute course content.\n\nYour wellbeing\nThe courses offer general guided practice and are not medical advice. Practise gently, stop if anything feels uncomfortable, and consult a qualified health professional if you have any health concerns.\n\nChanges\nWe may update course content and these terms. Material changes will be communicated to enrolled students.',
      },
      refund: {
        title: 'Refund Policy',
        draft: true,
        body:
          'DRAFT — the refund policy has not been confirmed by Yoga with Rekha.\n\nThis page will explain whether refunds are available, any time limit for requesting one, and how to contact support. Until it is confirmed, please contact support with any payment questions before purchasing.',
      },
    },
  };
}

function buildUsers(): User[] {
  const s = (id: string, name: string, email: string, country: string, d: number): User => ({
    id, name, email, country, role: 'student', passwordHash: demoHash('sample-not-loginable'),
    createdAt: daysAgo(d), source: 'sample',
  });
  return [
    { id: 'u-admin', name: DEMO_ACCOUNTS.admin.name, email: DEMO_ACCOUNTS.admin.email, passwordHash: demoHash(DEMO_ACCOUNTS.admin.password), role: 'admin', createdAt: daysAgo(90), source: 'demo' },
    { id: 'u-demo', name: DEMO_ACCOUNTS.student.name, email: DEMO_ACCOUNTS.student.email, passwordHash: demoHash(DEMO_ACCOUNTS.student.password), role: 'student', country: 'India', createdAt: daysAgo(210), source: 'demo' },
    s('u-s1', 'Sample Student A', 'sample.a@example.com', 'India', 45),
    s('u-s2', 'Sample Student B', 'sample.b@example.com', 'United States', 38),
    s('u-s3', 'Sample Student C', 'sample.c@example.com', 'Canada', 30),
    s('u-s4', 'Sample Student D', 'sample.d@example.com', 'India', 21),
    s('u-s5', 'Sample Student E', 'sample.e@example.com', 'India', 12),
    s('u-s6', 'Sample Student F', 'sample.f@example.com', 'United States', 6),
  ];
}

export function createSeedState(): DemoState {
  n = 0;
  const courses = buildCourses();
  const users = buildUsers();
  const settings = buildSettings();
  const enrollments: DemoState['enrollments'] = [];
  const orders: DemoState['orders'] = [];
  const progress: DemoState['progress'] = {};
  const activity: DemoState['activity'] = [];
  const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
  const allLessons = (cid: string) => byId[cid].modules.flatMap((m) => m.lessons);

  let ref = 1040;
  const addPurchase = (
    userId: string, courseId: string, d: number, currency: 'INR' | 'USD',
    status: 'paid' | 'failed' | 'pending', completedCount: number, recordSource: 'sample' | 'demo' = 'sample',
  ) => {
    const u = users.find((x) => x.id === userId)!;
    const c = byId[courseId];
    const at = daysAgo(d);
    const orderId = `ord-${++ref}`;
    orders.push({
      id: orderId, userId, courseId, courseTitle: c.title, customerName: u.name, customerEmail: u.email,
      amount: c.prices[currency], currency, status, provider: 'simulated', reference: `SIM-${ref}-${(ref * 7919).toString(36).toUpperCase()}`,
      createdAt: at, updatedAt: at, recordSource,
    });
    if (status !== 'paid') {
      activity.push({ id: `a-${ref}`, at, text: `Payment ${status} for “${c.title}” (${u.name})`, recordSource });
      return;
    }
    const eid = `enr-${ref}`;
    enrollments.push({
      id: eid, userId, courseId, orderId, startAt: at, expiresAt: computeExpiry(at, c.accessMonths), revoked: false,
      source: 'purchase', recordSource, history: [{ at, action: 'Enrolled after payment' }],
    });
    const lessons = allLessons(courseId);
    const completed = lessons.slice(0, completedCount).map((l) => l.id);
    progress[`${userId}:${courseId}`] = {
      completed, lastLessonId: lessons[Math.min(completedCount, lessons.length - 1)]?.id, updatedAt: daysAgo(Math.max(0, d - 5)),
    };
    activity.push({ id: `a-${ref}`, at, text: `${u.name} enrolled in “${c.title}”`, recordSource });
  };

  // Fictional sample records for the admin dashboard
  addPurchase('u-s1', 'c-daily', 44, 'INR', 'paid', 7);
  addPurchase('u-s2', 'c-daily', 37, 'USD', 'paid', 3);
  addPurchase('u-s2', 'c-release', 36, 'USD', 'paid', 1);
  addPurchase('u-s3', 'c-mindful', 29, 'USD', 'failed', 0);
  addPurchase('u-s3', 'c-mindful', 29, 'USD', 'paid', 5);
  addPurchase('u-s4', 'c-release', 20, 'INR', 'paid', 2);
  addPurchase('u-s5', 'c-daily', 11, 'INR', 'pending', 0);
  addPurchase('u-s6', 'c-mindful', 5, 'USD', 'paid', 0);

  // Demo student: one active course with some progress, one expired course.
  // Course "Daily Face Yoga Practice" is left un-enrolled for the enrollment walkthrough.
  addPurchase('u-demo', 'c-release', 40, 'INR', 'paid', 3, 'demo');
  addPurchase('u-demo', 'c-mindful', 200, 'INR', 'paid', 2, 'demo');

  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    version: STATE_VERSION,
    users, courses, enrollments, progress, orders, activity,
    messages: [],
    settings,
    sessionUserId: null,
    resetTokens: [],
  };
}
