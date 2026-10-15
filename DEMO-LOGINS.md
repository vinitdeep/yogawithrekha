# Demo logins — Yoga with Rekha

These accounts work only in the **demo** (local `npm run dev` and the GitHub Pages preview).
Sign-in is simulated and everything is stored in your own browser. **Never use a real password here.**

| Role | Email | Password | Where to sign in |
|---|---|---|---|
| Student | `student@example.com` | `practice123` | Header → **Student Login** · http://localhost:5180/login · https://vinitdeep.github.io/yogawithrekha/login |
| Admin | `admin@example.com` | `admin12345` | Footer → **Admin login** · http://localhost:5180/admin/login · https://vinitdeep.github.io/yogawithrekha/admin/login |

**Shortcut:** click **Demo mode** (bottom-left on desktop, inside the ☰ menu on phones) → *View as demo student* or *View as demo admin*.

## What each account shows

- **Demo student:** one active course with some progress (*Face, Neck & Shoulder Release*) and one expired course (*Mindful Face Yoga Rituals*) with the locked/support state.
- **Demo admin:** the full admin panel — Courses & lessons, Students (sign-ups, access requests, grant access), Orders & payments, Website settings, Audit history.

## Good to know

- **Sample Student A–F** in the admin list are fictional records with no password, so nobody can sign in as them.
- **To test a brand-new student:** use *Create an account* (any made-up email such as `test1@example.com`). The account appears in Admin → Students as *New · no access yet*. Grant access there, or use *Request access* on a course page and approve it.
- **Start over:** Demo mode → **Reset demo data** restores the original courses, students and settings and signs you out.
- **Production has no built-in logins.** Students sign up with their own email and password, and nobody — including admins — can ever see a password. The first admin is created as described in `SETUP-PRODUCTION.md` → *First admin*. If a student is locked out, the admin sends a password-reset email from Students → Manage.
