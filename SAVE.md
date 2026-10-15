# SAVE — Yoga with Rekha (project handover)

Read this first when reopening the project. Last updated **15 October 2026** (demo/production upgrade, commit `0dc7770`).

## At a glance

| | |
|---|---|
| **Client** | Rekha — *Yoga with Rekha*, course brand **Rekha Radiance Method** (prerecorded face yoga) |
| **Agency** | V Media Production |
| **Status** | **Demo** works end to end and is live. **Production** backend (Supabase RLS + Edge Functions, Razorpay, private video, Resend email) is written and tested locally, but **not deployed to any live Supabase project** and not tested with real payments. Not production-ready yet. |
| **Target launch** | ~15 December 2026 (tentative) |
| **Live demo preview** | https://vinitdeep.github.io/yogawithrekha/ (redeployed 15 Oct 2026) |
| **Repository** | https://github.com/vinitdeep/yogawithrekha (**public**) — `main` (source), `gh-pages` (built demo) |
| **Local folder** | `C:\Users\vinit\Documents\Claude\Projects\yoga-with-rekha` |

## Run it locally

```bash
npm install
npm run dev                 # demo at http://localhost:5180
npm test                    # 69 unit + database-security tests (PGlite, no network)
npm run test:e2e            # 100 browser checks — needs the dev server running + Chrome
npm run check:prod-bundle   # proves the production build has no demo code
npm run build:pages         # GitHub Pages demo build (/yogawithrekha/) -> dist/
npm run build:prod          # production build (needs VITE_SUPABASE_* — see .env.example)
```

## Two modes (`VITE_APP_MODE`, see `.env.example`)

- **demo** (default): data in the viewer's browser (localStorage), simulated sign-in / payments / uploads / admin. **No real security.**
- **production**: Supabase. Demo logins, sample data, reset and simulated checkout are **compiled out**. Missing config, an unreachable backend or a service-role key in the browser → a safe error screen, never a fallback to demo.

Full production steps: **SETUP-PRODUCTION.md**. Assumptions and client decisions: **DEMO-NOTES.md**.

## Demo logins (simulated — never a real password)

| Role | Where | Email | Password |
|---|---|---|---|
| Student | Header → *Student Login* (`/login`) | `student@example.com` | `practice123` |
| Admin | Footer → *Admin login* (`/admin/login`) — never linked from the header | `admin@example.com` | `admin12345` |

Quicker: **Demo mode** button (bottom-left on desktop; inside the ☰ menu on phones; Admin → Website settings → Demo data in admin) → *View as demo student / admin* or **Reset demo data** (asks for confirmation).

## What's built

- **Public site:** Home (editable hero, one primary action), Courses, Course detail (curriculum, free preview, access rules, compact mobile enroll bar), About, searchable FAQ, Contact, Privacy / Terms / Refund (drafts), 404.
- **Accounts:** register, sign in/out, generic errors, throttling, session expiry, password reset, return to the intended page.
- **Checkout:** simulated success / failure / retry; double clicks and replayed notifications never duplicate orders or enrollments. Production: server-priced order + Razorpay + signed webhook.
- **Student:** My Courses (progress, exact access end in IST, remaining time, resume, expired/revoked states with support), lesson page (module nav, prev/next, Mark complete, transcript/captions), account (profile, password, purchases, access), compact learner footer.
- **Admin:** Overview · Courses & lessons (per-currency prices in paise/cents, Draft/Published/Archived, lessons, video upload with progress/cancel/retry, damage warnings) · Students (search, filters, lesson-level progress, grant/extend/revoke/restore **with required reason**) · Orders & payments (filters, per-currency totals, complimentary-access tab) · Website settings (**draft → preview → publish**) · Audit history.
- **Access rule:** N calendar months from enrollment, ending **23:59:59 IST** on the same day-of-month; month-end clamped (31 Aug → 28/29 Feb). Same rule in `src/lib/dates.ts` and SQL `compute_expiry`.
- **Out of scope:** subscriptions, live classes, certificates, quizzes, forums, AI, lesson Q&A.

## Design & motion

- **Style:** bold modern sans — Plus Jakarta Sans 800, gradient accent words (`h1/h2 em`), mesh-gradient heroes, glass chips, bento grid, forest / ivory / sage / rose palette.
- **Motion engine:** `src/lib/motion.ts` (GSAP 3.13 ScrollTrigger + SplitText, Lenis), driven by `data-split` · `data-reveal` · `data-reveal-group` · `data-rise-group` · `data-parallax` · `data-scrub-words` · `data-draw` · `data-clip` · `data-expand` · `data-rise` · `data-grow`.
- **Signature effects:** hero scroll-out + mouse depth parallax; arch portraits; velocity marquee; scroll-filled statement; stacking "How it works" cards; pinned course showcase (`CourseShowcase` in `src/pages/Home.tsx`); expanding dark sections; progress bar; rising footer wordmark.
- **Reduced motion** respected everywhere. Sized by viewport height too (laptops 1280×620 and up, phones 375–390px). No horizontal overflow (checked by the e2e tests).

## Images

- `Images/` — 6 original pose PNGs; `public/images/rekha/` — `*.webp` scenes + `*-cutout.webp` (rembg, `isnet-general-use`).
- ⚠️ **All six are AI-generated** (OpenAI C2PA credentials). The brief says not to present AI-generated people as Rekha — **replace with real photos, or disclose with Rekha's written approval, before launch.** Alt text already labels them as placeholders.
- A portrait/logo uploaded in Admin → Website settings overrides them.

## Key files

| Path | Purpose |
|---|---|
| `src/lib/config.ts` | Demo vs production switch — a **build-time constant** so production strips demo code |
| `src/lib/backend/types.ts` | The backend interface all screens use |
| `src/lib/demo/engine.ts`, `src/lib/demo/backend.ts` | Simulated "server" rules (unit-tested) + localStorage backend |
| `src/lib/supabase/backend.ts` | Production adapter (untested against a live project) |
| `src/lib/store.tsx` | React store over the backend; `site` = published settings, or the admin's draft while previewing |
| `src/lib/access.ts`, `dates.ts`, `money.ts` | Access/progress rules, IST expiry, minor-unit money |
| `src/lib/seed.ts` | Demo sample content. **`STATE_VERSION` = 5** — bump when changing it. Prices in paise/cents. |
| `supabase/migrations/0001_schema.sql` | Tables, RLS (deny by default), trusted functions, audit |
| `supabase/migrations/0002_storage.sql` | Buckets + storage policies (not executed locally — needs Supabase) |
| `supabase/seed.sql` | Initial settings for a new production DB |
| `supabase/functions/` | `create-order`, `payment-webhook`, `lesson-playback`, `_shared/` (Razorpay, email, http) |
| `tests/` | `engine`, `dates`, `payments`, `sql/` (PGlite security), `e2e/demo.e2e.mjs`, `e2e/prod-failsafe.mjs` |
| `src/styles.css` | Layers: base → MODERN THEME → SCROLL EFFECTS → COURSE SHOWCASE → REKHA IMAGES → UPGRADE LAYER (later wins) |
| `scripts/spa-fallback.mjs`, `scripts/check-prod-bundle.mjs` | Pages deep-link fallback; production-bundle demo-leak check |

## Redeploy the GitHub Pages demo

```bash
npm run build:pages
git fetch origin gh-pages
git worktree add "$TEMP/ywr-ghpages" origin/gh-pages --detach
cd "$TEMP/ywr-ghpages" && git rm -rq . && cp -r <project>/dist/. . && git add -A && git commit -m "Deploy demo" && git push origin HEAD:gh-pages
cd - && git worktree remove --force "$TEMP/ywr-ghpages"
```

Live about 30–60 s after the push. Deep links (e.g. `/yogawithrekha/courses`) redirect once to the trailing-slash URL and return 200.

## Change log

- **15 Oct 2026 — demo/production upgrade** (`0dc7770`, demo redeployed): mode boundary; Supabase schema/RLS/functions + Edge Functions; minor-unit multi-currency prices; archive; IST expiry rule; required reasons + audit history; settings draft/preview/publish; order filters + per-currency totals; captions/transcripts; real-progress video upload path; learner footer; shorter hero with one primary action; readable admin chart; responsive admin tables; dialog/menu focus handling; fixed dialog focus-jump bug and form-row stretching; demo control moved into the phone menu so it never covers content. Unconfirmed full name / credentials removed from code and docs (they remain in older git history of this public repo).
- **15 Oct 2026 (earlier)** — Removed the admin link from the top header; admins sign in via the footer's *Admin login*. Student sign-in page no longer shows admin credentials (admin creds appear only on `/admin/login` in demo mode).

## Gotchas learned

- **Demo data is per browser.** E2E checks of what visitors see must use a second tab in the SAME browser context, or they test a fresh seed and prove nothing.
- **Bash heredocs with Python/CSS content fail in this harness** — write scripts to the scratchpad with the file tool.
- **Password labels have a visual `*`** — locate password inputs by `autocomplete`, not exact label text.
- **Port 5180** may already be held by an older `vite` of this project — reuse it (it serves current code).
- **Git Bash mangles `/yogawithrekha/` CLI arguments** into `C:/Program Files/Git/...`. Prefix with `MSYS_NO_PATHCONV=1`; npm scripts are fine.
- **Use `opacity`, never `autoAlpha`,** for reveals (`visibility: hidden` hides content from screen readers).
- **Stacking cards:** dim with the `.stack-shade` overlay, never by fading the card.
- **Cut-out images** need `.portrait-pose .portrait-cutout` specificity.
- **Course rail** starts offset (42vw) so wide screens still have horizontal travel.
- **New SQL functions** get default execute grants on Supabase — revoke from `public, anon, authenticated` in every migration.
- **Snapshots** in `.snapshots/` (git-ignored): `pre-redesign-*`, `editorial-*`, `pre-upgrade-20261015.tgz`.

## Still needed

**To go live (see SETUP-PRODUCTION.md):** create the Supabase project, run migrations + seed, configure Auth/SMTP, provision the first admin (`bootstrap_admin`), deploy the Edge Functions, set server secrets, test Razorpay in test mode, build with `VITE_APP_MODE=production`, remove `noindex`, add backups/monitoring. Not built yet: admin MFA enrolment UI, CAPTCHA widget, contact-form email forwarding.

**Decisions / content from Rekha:** payment provider (after merchant-eligibility check for India + US/Canada cards; GST/invoicing), final course names, curricula and prices (incl. CAD?), refund/renewal policy, reviewed Privacy & Terms, real photos, personal story, confirmed full name & qualifications, support email, WhatsApp (optional), access start rule for pre-launch buyers, IST end-of-day convention for students abroad.
