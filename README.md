# Yoga with Rekha — website + LMS (Rekha Radiance Method)

Website, student learning area and admin panel for **Yoga with Rekha**, by V Media Production.
Two modes, chosen at build time (`VITE_APP_MODE`, see `.env.example`):

| | **Demo** (default) | **Production** |
|---|---|---|
| Data | This browser only (localStorage) | Supabase Postgres |
| Sign-in | Simulated, demo accounts | Supabase Auth (hashed passwords, email confirm, reset) |
| Security | **None** — anyone can edit browser storage | Row-level security + trusted SQL/Edge Functions |
| Payments | Simulated success/failure | Razorpay (off until configured) |
| Video upload | Simulated progress, session-only | Private storage + short-lived signed playback |
| Demo shortcuts | “Demo mode” control: preview as student/admin, reset | Compiled out of the bundle |

Live demo preview: https://vinitdeep.github.io/yogawithrekha/ · Production setup: **[SETUP-PRODUCTION.md](SETUP-PRODUCTION.md)**

## Run it

```bash
npm install
npm run dev            # demo at http://localhost:5180
npm test               # 69 unit + database-security tests (no network needed)
npm run test:e2e       # 100 browser checks against the running dev server (needs Chrome)
npm run check:prod-bundle   # proves the production build contains no demo code
npm run build:pages    # GitHub Pages demo build (/yogawithrekha/)
npm run build:prod     # production build (needs the VITE_SUPABASE_* values)
```

Demo accounts (simulated — never use a real password): student `student@example.com` / `practice123`,
admin `admin@example.com` / `admin12345` (admin sign-in is at `/admin/login`). Or use the
**Demo mode** button (bottom-left; inside the menu on phones) → *View as demo student / admin*.

## Walkthrough for Rekha (about 8 minutes)

1. **Home → Explore the courses → Daily Face Yoga Practice.** Expand the curriculum, play the free preview.
2. **Enroll now.** Create an account, choose *Payment fails*, pay → failure screen, no access. **Try again** with *Payment succeeds* → enrolled. Open *Demo: replay the payment notification* → still one enrollment.
3. **Start the first lesson.** Progress stays 0% until **Mark complete** (→ 10%). Go to the next lesson, then **My Courses**: *Continue learning* resumes where you left off, with the exact access end date and time.
4. **Demo mode → View as demo student**: one active course with progress, one **expired** course with the locked/support state.
5. **Demo mode → View as demo admin**:
   - **Courses & lessons**: change a title or price, add a lesson, attach a video (simulated upload with cancel/retry), set Draft/Published/Archived, **Save course**, *Preview page*.
   - **Students**: search, filter by course and Active/Expired/Revoked; **Manage** → extend, revoke or grant complimentary access — each needs a written reason; see lesson-by-lesson progress.
   - **Orders & payments**: filter by status, course, currency, dates; totals kept per currency; complimentary access listed separately.
   - **Website settings**: edit the headline → **Save draft** → **Preview** (only you see it) → **Publish**.
   - **Audit history**: every change above, with who, when and why.
6. **Demo mode → Reset demo data** to start again.

## Permissions

| | Guest | Student | Admin |
|---|---|---|---|
| Public pages, course details, preview lessons | ✓ | ✓ | ✓ |
| Register, sign in, request password reset, begin checkout | ✓ | ✓ | — |
| Own profile (name, country; email change needs confirmation) | | ✓ | ✓ |
| Own orders, enrollments, access dates, progress | | ✓ | ✓ (all students) |
| Paid lessons and videos | | only with **active** access (checked at that moment) | ✓ (preview) |
| Mark complete / revisit completed lessons | | ✓ while access is active | |
| Courses, lessons, videos, prices | | | ✓ |
| Request access to a course (after paying directly) | | ✓ | |
| Approve / decline access requests; grant / extend / revoke / restore access (reason required) | | | ✓ |
| Send a student a password-reset email | | | ✓ |
| Orders and complimentary-access records (read-only) | | | ✓ |
| Website settings, FAQ, policies (draft → publish) | | | ✓ |
| Audit history | | | ✓ |
| Change roles | | | database owner only (`bootstrap_admin`) |
| See or set passwords | | own only, via the auth provider | never |

In production every row above is enforced by the database (RLS) or an Edge Function — the route
guards in the app are only for navigation. In the demo nothing is enforced.

## Admin-editable settings

Brand name · offering name · founder’s public name · full name and qualifications (hidden until marked confirmed) ·
portrait and logo with alt text · hero eyebrow, headline, accent words, supporting text, button and link labels ·
about introduction and personal story · support email · Instagram link and handle · WhatsApp (shown only when verified) ·
FAQ questions, answers, categories, order, show/hide, draft label · footer text and note ·
privacy, terms and refund pages with draft flag · offered currencies (INR/USD/CAD) and default currency ·
default access months for new courses · access start rule (on enrollment / on launch date) and launch date ·
page titles and SEO descriptions for Home, Courses, About, FAQ, Contact.

Per course: title (+ provisional flag), slug, short description, overview, audience, topics, image + alt,
prices per currency (stored in paise/cents), sample-price flag, access months for new enrollments,
Draft/Published/Archived, modules and lessons (order, duration, published, free preview, video from
**YouTube (unlisted), Google Drive, file upload or another link**, captions link, transcript).

## Where things live

| Path | What |
|---|---|
| `src/lib/config.ts` | The demo/production boundary and config validation |
| `src/lib/backend/types.ts` | The interface every screen uses |
| `src/lib/demo/` | Demo backend + engine (simulated rules, unit-tested) |
| `src/lib/supabase/backend.ts` | Production adapter (Supabase) |
| `src/lib/access.ts`, `src/lib/dates.ts`, `src/lib/money.ts` | Access/progress rules, IST month-end expiry, minor-unit money |
| `src/lib/seed.ts` | Demo sample content (fictional; prices are samples) |
| `supabase/migrations/` | Schema, RLS, trusted functions, storage policies |
| `supabase/functions/` | `create-order`, `payment-webhook`, `lesson-playback` (+ email) |
| `tests/` | Unit, SQL-security (PGlite), payment and browser tests |

See **DEMO-NOTES.md** for assumptions and open client decisions.
