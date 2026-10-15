# SAVE — Yoga with Rekha (project handover)

Read this first when reopening the project. Last updated **15 October 2026** (demo/production upgrade).

## At a glance

| | |
|---|---|
| **Client** | Rekha — *Yoga with Rekha*, course brand **Rekha Radiance Method** (prerecorded face yoga) |
| **Agency** | V Media Production |
| **Status** | Demo works end to end. Production backend (Supabase RLS + Edge Functions, Razorpay, private video, Resend) is **built and tested locally but not yet deployed** — see SETUP-PRODUCTION.md |
| **Target launch** | ~15 December 2026 |
| **Live preview** | https://vinitdeep.github.io/yogawithrekha/ |
| **Repository** | https://github.com/vinitdeep/yogawithrekha (**public**) — branches `main` (source) and `gh-pages` (built preview) |
| **Local folder** | `C:\Users\vinit\Documents\Claude\Projects\yoga-with-rekha` |

## Run it locally

```bash
npm install
npm run dev          # http://localhost:5180
npm run build        # production build at /  -> dist/
npm run build:pages  # GitHub Pages build at /yogawithrekha/ -> dist/
```

## Logins (demo — simulated, saved only in the viewer's browser)

| Role | Where | Email | Password |
|---|---|---|---|
| Student | Header → *Student Login* (`/login`) | `student@example.com` | `practice123` |
| Admin | Footer → *Admin login* (`/admin/login`) — never linked from the header | `admin@example.com` | `admin12345` |

Reset all demo data: **Admin → Settings → Demo data → Reset demo data**.

## What's built

- **Public site:** Home, Courses, Course detail, About, FAQ (searchable), Contact, Privacy / Terms / Refund (drafts), 404.
- **Enrollment:** course → simulated checkout (create account or sign in, terms, success / failure / retry) → dashboard. Duplicate enrollments are blocked, and replaying a payment notification creates nothing new.
- **Student area:** sign in at *Student Login* (`/login`) → **My Courses** (`/dashboard`) lists every purchased course: dashboard (progress %, access dates, resume, expired state), lesson player with *Mark complete*, previous / next, and account (profile, password, purchases, access).
- **Admin:** overview, courses & lessons editor (modules, ordering, simulated video upload), students (grant / revoke / extend), payments (filters), settings (brand, about, contact, FAQ, policies, access rules, demo reset).
- **Access rule:** 6 calendar months from enrollment. If the day doesn't exist in the end month, access ends on that month's last day (31 Aug → 28/29 Feb). See `src/lib/dates.ts`.

## Design & motion

- **Style:** bold modern sans — Plus Jakarta Sans 800, gradient accent words (`h1/h2 em`), mesh-gradient heroes, glass chips, bento grid, forest / ivory / sage / rose palette.
- **Motion engine:** `src/lib/motion.ts` (GSAP 3.13 ScrollTrigger + SplitText, Lenis smooth scroll), driven by attributes:
  `data-split` · `data-reveal` · `data-reveal-group` · `data-rise-group` · `data-parallax` · `data-scrub-words` · `data-draw` · `data-clip` · `data-expand` · `data-rise` · `data-grow`.
- **Signature effects:** hero scroll-out plus mouse depth parallax; break-out arch portraits; velocity marquee; scroll-filled statement; stacking "How it works" cards; **pinned course showcase** (`CourseShowcase` in `src/pages/Home.tsx`); expanding dark sections; top progress bar; rising footer wordmark.
- **Reduced motion** is respected everywhere (content renders static, nothing hidden).
- **Sized by viewport height** as well as width, so it fits laptops (checked at 1280×620, 1366×657, 1536×730, 1920×960) and 375–390px phones.

## Images

- `Images/` — 6 original pose PNGs supplied by the agency.
- `public/images/rekha/` — `*.webp` full scenes plus `*-cutout.webp` background-removed figures (removed locally with `rembg`, model `isnet-general-use`).
- ⚠️ **All six are AI-generated** (OpenAI C2PA credentials embedded). The client brief says not to present AI-generated people as Rekha. They are used across the demo at the agency's request, but **must be replaced with real photographs, or clearly disclosed with Rekha's written approval, before launch.**
- A portrait uploaded in Admin → Settings overrides the hero and About images.

## Key files

| Path | Purpose |
|---|---|
| `src/lib/seed.ts` | **All sample content** (courses, lessons, prices, FAQ, policies, sample students). Bump `STATE_VERSION` when changing it so browsers reload the seed. |
| `src/lib/store.tsx` | React store over the selected backend (`src/lib/demo/` simulated, `src/lib/supabase/` production); `site` = published settings or the admin's draft preview |
| `src/lib/config.ts` | Demo vs production switch (`VITE_APP_MODE`), build-time constant so production strips demo code |
| `supabase/` | Migrations (schema, RLS, functions, storage), `seed.sql`, Edge Functions |
| `tests/` | `npm test` (69 tests incl. SQL security in PGlite) · `npm run test:e2e` (100 browser checks, needs dev server) · `tests/e2e/prod-failsafe.mjs` |
| `src/lib/motion.ts` | Scroll and animation engine. |
| `src/components/brand.tsx` | Portrait / pose images (`POSES`, `poseCutout`, `cutoutFor`), course art, prices, currency. |
| `src/styles.css` | Base styles, then appended layers: MODERN THEME → SCROLL EFFECTS → COURSE SHOWCASE → REKHA IMAGES (later layers override earlier ones). |
| `scripts/spa-fallback.mjs` | Pages build: copies `index.html` to the main routes and to `404.html`. |
| `DEMO-NOTES.md` | Demo vs production, assumptions, optional features. |

## Redeploy the GitHub Pages preview

```bash
npm run build:pages
# then copy dist/ into a separate checkout of the gh-pages branch, commit, and push:
#   git push origin gh-pages
```

The preview updates about 30–60 seconds after the push. Shared links such as `/yogawithrekha/courses` redirect once to the trailing-slash URL and return 200.

## Change log

- **15 Oct 2026** — Removed the admin link from the top header (desktop + mobile). The header button is now *Student Login*, or *My Courses* for a signed-in student; admins sign in only via the footer's *Admin login* (`src/components/Layout.tsx`). Re-verified student login → My Courses flow in a browser. Not yet redeployed to GitHub Pages.
- **Open question:** the student login page's "Demo accounts" box still shows the admin credentials — remove if admin should stay fully out of public view.

## Gotchas learned

- **Demo data is per browser.** E2E checks of what visitors see must use a second tab in the SAME browser context.
- **Bash heredocs with Python/CSS content failed in this harness** — write scripts to the scratchpad with the file tool.
- **Password labels have a visual `*`** — locate password inputs by `autocomplete`, not exact label.
- **STATE_VERSION is 5**; prices are in paise/cents.

- **Git Bash mangles `/yogawithrekha/` CLI arguments** into `C:/Program Files/Git/...`. Prefix with `MSYS_NO_PATHCONV=1`; npm scripts are not affected.
- **Use `opacity`, never `autoAlpha`,** for reveals: `visibility: hidden` removes not-yet-revealed content from screen readers.
- **Stacking cards:** dim them with the `.stack-shade` overlay. Fading the card itself makes it see-through.
- **Cut-out images** need `.portrait-pose .portrait-cutout` specificity, or the generic `.portrait img { object-fit: cover }` stretches them.
- **Course rail** starts offset (42vw) so there is always horizontal travel. Without it, wide screens had nothing to scroll.
- **Snapshots of earlier designs** are in `.snapshots/` (git-ignored, local only): `pre-redesign-*.tgz` (original) and `editorial-*.tgz` (serif editorial version).

## Still needed for production

See **DEMO-NOTES.md §3**. In short:
- a real backend and authentication;
- server-side authorisation and access expiry;
- a payment provider (confirm merchant eligibility for India + US/Canada first) with verified, idempotent webhooks;
- protected video hosting;
- transactional email.

Client content still to come:
- final course names, curricula and prices;
- real photos of Rekha;
- her story and verified full name/credentials (no longer stored in the code — enter them in Admin → Settings once confirmed);
- support email and WhatsApp;
- reviewed policies.

Launch checklist:
- remove `noindex`;
- build with `VITE_DEMO_MODE=false`;
- set up analytics, monitoring and backups.
