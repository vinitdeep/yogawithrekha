# Demo notes: what's real, what's simulated, what's next

## 1. Working in the demo

**Public website**
- Home, Courses, Course Details, About, FAQ (searchable, grouped), Contact, Privacy / Terms / Refund pages, 404
- Header with Instagram link and Student Login; mobile menu; footer with policies and contact
- "Practice with Rekha on Instagram" profile-link card. No posts are invented or scraped.
- Course details: overview, audience, sample topics, expandable modules and lessons with durations, preview lesson, instructor card, access explanation with the month-end example, relevant FAQ, sticky mobile enrollment bar
- INR / USD price display toggle, with a note that the currency shown does not guarantee a payment method is available

**Enrollment**
- Course → checkout (create account or sign in) → simulated payment → result → dashboard
- Terms acceptance is required. Processing, success, failure + retry, and pending states are all shown.
- No card details are requested, and the checkout is labelled as simulated throughout.
- Duplicate protection: an active (or scheduled) enrollment blocks a second purchase, the pay button locks while processing, and a replayed "payment notification" never creates a second enrollment (try *Demo: replay the payment notification* on the success page).

**Student area**
- Register, log in / out, forgot password → reset link (shown on screen because no email service is connected), validation messages
- Dashboard: welcome, Continue Learning (resumes the last lesson viewed), each course with progress %, completed / remaining counts, enrolled and expiry dates, time remaining, an empty state, and an expired / revoked state with a support action
- Lesson page: responsive player, module/lesson sidebar, title / description / duration, Mark complete (and undo), Previous / Next, progress bar. Locked, preview-only, scheduled and expired states are all handled.
- Progress is saved per student per course and calculated from completed published lessons only. Opening a lesson never counts as completion.
- Account: profile, password change, purchase history, course access dates, support link

**Admin** (role-guarded in the demo)
- Overview: students, active enrollments, courses, payments by currency, enrollments per course, recent activity, demo contact messages. All labelled as sample statistics.
- Courses: create, edit and delete (only when no enrollments exist); title, slug, tagline, description, audience, topics, image upload, INR/USD prices, draft/published, access months, provisional/sample flags. Modules and lessons can be added, renamed, reordered and deleted. Lessons have a preview flag and a publish flag. Validation and an unsaved-changes guard are included.
- Videos: attach a hosted link, or "upload" a file with simulated progress, cancel and error handling (wrong type, too large). Videos can be replaced or removed.
- Students: search, filter by access status and course, view progress and history, and grant / revoke / restore / extend access. Every action asks for confirmation.
- Payments: search; filter by status, currency and sample-vs-demo records; references shown
- Settings: brand names, portrait upload, About content, unpublished full name and credentials (each with a "confirmed" switch), support email, Instagram, WhatsApp (only shown when marked verified), FAQ editor, draft policies, access-start rule and launch date

**Quality**
- Keyboard navigation, visible focus, skip link, labelled fields with inline errors, dialogs with focus trapping, `aria-current` / `aria-expanded` / progressbar semantics, reduced-motion support, 44px touch targets
- Tested at 375px with no horizontal scrolling. Page titles and descriptions are set per route.

## 2. Assumptions made (please confirm)

| Topic | Assumption in the demo |
|---|---|
| Course names, curricula, lesson counts | **Placeholders.** Three sample courses with 10 / 7 / 5 sample lessons of 15–20 min. They are not presented as a beginner → advanced sequence. The brief's "20–25 videos" is not assumed to apply to each course. |
| Prices | **Samples**: ₹3,499 / $59, ₹2,999 / $49, ₹2,499 / $39. Labelled "Sample price · not final". |
| Access start | Starts when enrollment is confirmed. The admin can switch to "starts on launch date" for pre-launch buyers. |
| Access length | 6 calendar months, ending at the end of the same day-of-month. If that day doesn't exist (e.g. 31 Aug), access ends on the month's last day (28/29 Feb). Configurable per course. |
| Extensions | An extension adds months from the current expiry, or from today if access has already ended |
| Revoked access | Lessons lock, but progress is kept and access can be restored |
| Removed lessons | Progress % counts published lessons only |
| Full name / credentials | "Rekha Sakthivadivel" and "Internationally certified yoga instructor · ERYT 500hrs" are stored **unpublished** until confirmed |
| Support email | `support@example.com` placeholder |
| WhatsApp | Hidden until a verified number is entered |
| Policies, refund / renewal rules | Draft text, clearly labelled |
| Colours | Ivory / sage / rose is a proposed direction, not taken from Instagram |
| Imagery | **The six images of Rekha (`Images/` → `public/images/rekha/`) are AI-generated** — each file carries OpenAI C2PA content credentials. They were supplied by the agency and approved for this demo. The client brief says not to present AI-generated people as Rekha, so before launch they must be **replaced with real photographs** or **clearly disclosed** with Rekha's written approval. Backgrounds were removed locally with `rembg` (isnet-general-use). Uploading a portrait in Admin → Settings overrides the hero/about images. |

## 3. Needed for production

1. **Backend and database.** For example Supabase/Postgres, or a Node API with a database. Move every action in `src/lib/store.tsx` server-side: users, courses, enrollments, progress, orders, settings.
2. **Authentication.** A managed auth provider with hashed passwords, email verification, real reset-password emails, rate limiting and secure sessions. The demo's `demoHash` and localStorage session must go.
3. **Server-side authorisation.** Role checks on every admin endpoint. Lesson video URLs are only issued to students with active access, and access expiry is checked on the server at every request. A scheduled job can mark expired enrollments and send reminders.
4. **Payments.** Choose a provider *after* confirming merchant eligibility for an Indian business that sells to India, the US and Canada (e.g. Razorpay with international cards, Stripe India, or PayPal; to be verified). Requirements:
   - Create the order server-side; redirect to or embed the provider checkout
   - Grant access only after **server-verified** payment (signed webhook / signature check)
   - Make webhooks idempotent (keyed on the provider's payment ID), because notifications can repeat
   - Store orders, transactions, provider references and status changes; handle pending and failed payments, refunds
   - Handle GST / tax and invoices as advised by Rekha's accountant
5. **Video hosting.** Choose a host with protected playback (e.g. Bunny Stream, Mux, Vimeo, or Cloudflare Stream): direct uploads from the admin, real upload progress, signed/expiring playback URLs, and domain restriction. No platform can fully prevent screen recording, so don't promise that.
6. **Transactional email.** Purchase receipt, access confirmation, password reset, contact form delivery, and optionally expiry reminders. Use a provider such as Resend, Postmark or SES, with SPF/DKIM on the sending domain.
7. **Content.** Replace the AI-generated pose images with real photographs of Rekha (or disclose them, with her approval). Final course names, curricula, lesson descriptions, prices, edited videos, Rekha's portrait and story, verified credentials, support email, WhatsApp number (optional), reviewed Privacy / Terms / Refund policies.
8. **Launch checklist.** Remove `noindex`; set `VITE_DEMO_MODE=false`; add Open Graph image, sitemap and analytics with a consent notice; set up error monitoring (e.g. Sentry), uptime checks and database backups; complete an accessibility pass with real content; run a performance check with real images (compressed, responsive sizes); agree a maintenance plan.

## 4. Optional features (not in scope; suggestions only)

These were **not** requested and are not part of the confirmed requirements. Mention them only if useful:
- Certificates of completion
- Expiry reminder emails (e.g. 14 days before access ends)
- Coupon / launch-discount codes
- Bundle pricing for multiple courses
- Downloadable practice notes per lesson
- Live classes, subscriptions, quizzes, community or lesson Q&A (explicitly out of scope for this launch)
