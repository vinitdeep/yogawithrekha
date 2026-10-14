# Yoga with Rekha: Rekha Radiance Method (client demo)

This is an interactive demo of the website and learning platform for **Yoga with Rekha**, prepared by V Media Production.
It covers the public website, enrollment with a simulated checkout, the student learning area and the admin dashboard.

> This is a demo. Sign-in, payments, video uploads and admin access are all **simulated**.
> Data is stored only in the viewer's browser (localStorage). See [DEMO-NOTES.md](DEMO-NOTES.md) for the full list of what still needs a real integration.

## Run it

Requires Node 18 or newer.

```bash
npm install
npm run dev        # http://localhost:5180
```

Production build (static files in `dist/`):

```bash
npm run build
npm run preview    # serve the build locally
```

`dist/` can be uploaded to any static host. `public/.htaccess` adds the single-page-app fallback that Apache/Hostinger needs.
The page sets `noindex` while it is a demo. Remove that from `index.html` at launch.

## Demo accounts

| Role    | Email                  | Password      |
|---------|------------------------|---------------|
| Student | `student@example.com`  | `practice123` |
| Admin   | `admin@example.com`    | `admin12345`  |

- **Admin panel:** go to `/admin/login` (also linked as *Admin login* in the footer). Visiting any `/admin` page while signed out redirects there. Student accounts are refused.
- **Students:** use *Student Login* in the header.
- **Reset demo data:** Admin → Settings → *Demo data*.

## Suggested walkthrough (about 5 minutes)

1. **Home → Explore the Courses → Daily Face Yoga Practice.** Expand the modules and play the preview placeholder.
2. **Enroll now.** Create a new account in checkout, choose *Payment fails* and pay. You'll see the failure screen. Select **Try again**, choose *Payment succeeds* and pay again.
3. **Start the first lesson → Mark complete.** The progress bar updates (0% → 10%). Use **Next lesson**. Opening a lesson does *not* mark it complete.
4. Reload the page and open **My Courses**. Progress is still there, and *Continue learning* resumes the last lesson.
5. Sign in as the demo student (`student@example.com`) to see: one active course with progress, and one **expired** course showing the locked/support state.
6. Sign in at `/admin/login` as the demo admin:
   - **Courses & lessons**: edit a title, price or lesson; attach a video link or "upload" a file (simulated progress); reorder; publish/unpublish; then **Save course**. The public site updates immediately.
   - **Students**: search and filter; open a student to extend, revoke or grant access (each asks for confirmation).
   - **Payments**: filter by status, currency and sample/demo records.
   - **Settings**: portrait, Instagram, support email, WhatsApp (shown only when verified), FAQ, draft policies, access start rule.

## Where things live

| Path | What it is |
|------|------------|
| `src/lib/seed.ts` | **All editable sample content**: courses, lessons, prices, FAQ, policies, sample students and orders |
| `src/lib/store.tsx` | Demo "backend". Each action marks where a server endpoint goes in production |
| `src/lib/dates.ts` | Six-calendar-month access calculation and the month-end rule |
| `src/lib/types.ts` | Data model (users, courses, modules, lessons, enrollments, progress, orders, settings) |
| `src/pages/` | Public, checkout, student and `admin/` pages |
| `src/components/` | Layout, UI primitives (dialogs, toasts, fields), brand pieces, video player |
| `src/styles.css` | Design tokens and all styles |
| `public/images/rekha/` | Pose images: full scenes (`*.webp`) and background-removed cut-outs (`*-cutout.webp`). **AI-generated — replace before launch** (see DEMO-NOTES) |
| `src/lib/motion.ts` | Scroll/animation engine (GSAP + Lenis), driven by `data-*` attributes |

Content can also be edited in the running demo through **Admin → Settings** and **Admin → Courses**. Those edits are saved in that browser only. **Admin → Settings → Demo data** restores `seed.ts`.

Building with `VITE_DEMO_MODE=false` hides the demo credentials and "simulated" notices. A real launch still needs the backend described in DEMO-NOTES.md, because the demo's client-side login and admin guard are not security.
