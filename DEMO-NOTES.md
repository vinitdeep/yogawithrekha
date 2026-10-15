# Demo notes: what works, what's simulated, what's still needed

## 1. Works in the demo (simulated, this browser only)

- **Public site:** Home (editable hero, one primary action), Courses, Course details (curriculum, free preview, access rules, FAQ, compact mobile enroll bar), About, searchable FAQ, Contact, Privacy/Terms/Refund drafts, 404.
- **Accounts:** register, sign in/out, generic errors, throttling after 5 failed attempts, session expiry (12 h), password reset (link shown on screen because no email is sent), return to the intended page after sign-in.
- **Checkout:** clearly labelled simulated payment; success, failure and retry; double clicks and replayed notifications never create a second order or enrollment; no card details requested.
- **Learning:** dashboard (continue learning, progress, exact access end in IST, remaining time, expired/revoked states with support), lesson player with module navigation, previous/next, Mark complete/undo, transcript and captions when provided, compact learner footer.
- **Admin:** overview (per-currency totals, readable chart), courses & lessons editor (validation, minor-unit prices per currency, archive instead of delete, warnings before damaging changes, simulated video upload with progress/cancel/retry), students (search, course and Active/Expired/Revoked filters, lesson-level progress, grant/extend/revoke/restore with a required reason), orders & payments (filters, enrollment link, complimentary access tab), website settings (draft → preview → publish, unsaved-changes guard), audit history.

## 2. Production integrations (built, not yet run against live services)

See **SETUP-PRODUCTION.md** for exact steps and what has been verified.

| Area | Built | Needs |
|---|---|---|
| Database + authorization | Supabase schema with RLS and audited SQL functions (tested in local Postgres) | A Supabase project; run migrations + seed |
| Authentication | Supabase Auth adapter: confirm email, reset, profile/email change, session refresh/expiry | Auth settings, SMTP, first admin via `bootstrap_admin` |
| Payments | `create-order` (server price) + signed, idempotent `payment-webhook` for Razorpay | **Client decision**: provider after merchant-eligibility check; keys |
| Video | Private bucket, admin upload with real progress, 2-hour signed playback after access check | Storage plan limit; optionally Bunny/Mux |
| Email | Purchase confirmation via Resend | API key + verified domain |
| Admin MFA | Supported by Supabase | Enrolment UI + enforcement not built yet |
| Contact form → email | Messages stored for admins | Forwarding not built |

## 3. Assumptions

| Topic | Assumption |
|---|---|
| Courses | Three planned; names, curricula and lesson counts are **samples** (10 / 7 / 5 lessons of 15–20 min). The brief’s “20–25 videos” is not applied to every course. |
| Prices | **Samples**: ₹3,499 / $59, ₹2,999 / $49, ₹2,499 / $39, labelled “Sample price · not final”. Stored as integers in paise/cents. CAD can be enabled in settings. |
| Access | 6 calendar months from confirmed enrollment, ending **23:59:59 IST** on the same day-of-month; month-end clamped (31 Aug → 28/29 Feb). Optional “starts on launch date” rule. Changing a course’s duration affects new enrollments only. |
| Progress | Completed published lessons ÷ published lessons. New lessons lower the percentage; unpublished lessons stop counting but completions are kept. Lessons with student completions can’t be deleted — unpublish them. |
| Expiry / revoke | Lessons lock; progress is kept; support action shown. |
| Extensions | Added to the current end date, or from today if already ended. |
| Refunds | No policy confirmed, so none is automated. Refund in the provider dashboard, then revoke access with a reason. |
| Identity | Public name “Rekha”. The full name and credentials are **not** stored in the code; an admin can enter them in Settings, and they stay hidden until marked confirmed (production also strips them from public data). |
| Support | `support@example.com` placeholder. WhatsApp hidden until a verified number is entered. |
| Launch | ~15 December 2026, tentative. |
| Imagery | **The six images of Rekha are AI-generated** (OpenAI content credentials embedded), used as placeholders at the agency’s request. The brief says not to present AI-generated people as Rekha: **replace with real photographs, or disclose clearly with Rekha’s written approval, before launch.** Image alt text says “Placeholder image … (AI-generated, to be replaced)”. |

## 4. Decisions needed from Rekha

1. Final course names, curricula, lesson lists and prices (per currency, incl. whether to offer CAD).
2. Payment provider after confirming eligibility for India + US/Canada cards; GST/invoicing with an accountant.
3. Refund and renewal policy; reviewed Privacy and Terms.
4. Real photographs, logo (if any), personal story; confirm full name and qualifications in writing.
5. Support email; whether to show WhatsApp.
6. Whether access should start at enrollment or at launch for early buyers.
7. Whether to keep the IST end-of-day convention for students abroad (alternative: end of day in the student’s own time zone).

## 5. Out of scope (not built)

Subscriptions, live classes, certificates, quizzes, forums, AI assistants and lesson Q&A.
