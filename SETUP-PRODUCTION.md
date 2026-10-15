# Production setup — Yoga with Rekha

This turns the demo into a real site. **Until every step marked _required_ is done and tested
against a real Supabase project, the site is not production-ready.** The database rules and
payment logic are written and tested locally (see *What has been verified* at the end), but
they have **not yet been run against a live Supabase project or a live payment provider**.

> **Why a backend is mandatory.** The GitHub Pages / static build can't protect anything: anyone
> can read and edit browser storage. Paid lessons, enrollments, orders and admin rights are only
> secure when the **server** checks them. Here that's Supabase (Postgres row-level security +
> trusted SQL functions + Edge Functions).

---

## 0. What you need

| Item | Who decides | Status |
|---|---|---|
| Supabase project (Pro plan recommended for backups and larger video uploads) | Agency | to create |
| Payment provider — **confirm merchant eligibility first** for an Indian business selling to India, the US and Canada (Razorpay with international cards is integrated; Stripe India / PayPal would need a new adapter) | Rekha + accountant | **decision needed** |
| Sending domain + email provider (Resend integrated; Postmark/SES possible) | Agency | to set up |
| Real support email, reviewed policies, real photos | Rekha | **content needed** |

## 1. Create the database _(required)_

```bash
npm i -g supabase           # or use npx supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push            # runs supabase/migrations/0001_schema.sql and 0002_storage.sql
psql "<connection string>" -f supabase/seed.sql   # or paste seed.sql into the SQL editor
```

`0001_schema.sql` creates every table with **row-level security enabled and no access by default**,
then grants exactly what each role may do:

- **Guests** read published courses, prices, published lesson titles, preview-lesson media and published settings.
- **Students** additionally read *their own* profile, orders, enrollments, completions and resume point. They can update only their `name` and `country`. Progress changes go through `set_lesson_complete()` / `set_last_lesson()`, which check the lesson is published and access is **active right now**.
- **Admins** (profile `role = 'admin'`) use the `admin_*` functions, `save_settings_draft()` and `publish_settings()`. Each re-checks the caller and writes the audit log.
- **Server only** (service role, from Edge Functions): `fulfil_order()`, `fail_order()`. **Nobody** can call `bootstrap_admin()` except the database owner.

New sign-ups always become **students** (a trigger ignores any role in sign-up metadata) and a
second trigger blocks role changes from anything except the database owner / service role.

> If you add migrations later: Supabase grants browser roles access to new functions by default.
> End every new migration with `revoke all on function ... from public, anon, authenticated;`
> and grant only what is needed — the same pattern used at the end of `0001_schema.sql`.

## 2. Authentication _(required)_

Supabase Dashboard → **Authentication**:

1. **Providers → Email**: enable; turn **Confirm email ON**; minimum password length **8**+; enable leaked-password protection (Pro).
2. **URL configuration**: Site URL = `https://<your-domain>`; add redirect URLs `https://<your-domain>/dashboard` and `https://<your-domain>/reset-password/recovery`.
3. **Rate limits**: keep the defaults or lower them (sign-in, sign-up, password reset, email sends). Optionally enable **CAPTCHA** (hCaptcha or Cloudflare Turnstile) under *Attack protection* — note the sign-in form does not render a CAPTCHA widget yet; add one before turning it on.
4. **Email templates**: brand the confirmation and reset emails. Use a custom SMTP sender (step 7) — the built-in sender is heavily rate-limited.
5. **Sessions**: JWT expiry 3600 s (default) is fine; the app refreshes tokens and shows *“Your session expired”* if refresh fails.

Passwords are stored and verified only by Supabase Auth. Admins can never see or set a student’s
password; students reset their own. Reset requests always show the same message, whether or not
the address has an account.

**CSRF:** the app sends the session as a bearer token in the `Authorization` header (not a cookie),
so classic cross-site request forgery doesn’t apply. Edge Functions only answer CORS requests from `SITE_URL`.

## 3. First admin _(required)_

1. Sign up on the live site with the owner’s real email and confirm it.
2. In the Supabase SQL editor (runs as the database owner):
   ```sql
   select public.bootstrap_admin('owner@yourdomain.com');
   ```
   This is recorded in the audit log. Repeat for any additional admin. To remove an admin:
   `update public.profiles set role = 'student' where email = '…';` (owner only).
3. **MFA for admins (recommended):** Authentication → *Multi-Factor* → enable **TOTP**. The current
   admin sign-in screen does not yet include TOTP enrolment/verification. To *enforce* MFA, add the
   enrolment UI first, then require AAL2 in `public.is_admin()`:
   ```sql
   -- add to is_admin():  and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
   ```

## 4. Website settings _(required)_

`supabase/seed.sql` creates the published settings row. Without it the site shows a clear error
instead of guessing. Then sign in as admin → **Website settings**, update content, **Save draft →
Preview → Publish**. Unconfirmed full name / qualifications / WhatsApp number are **stripped from
the public settings** by `publish_settings()` until their confirmation boxes are ticked.

## 5. Build and deploy the site _(required)_

```bash
cp .env.example .env.local     # fill in the VITE_ values (public only)
VITE_APP_MODE=production npm run build    # → dist/
```

Upload `dist/` to any static host (Hostinger: `public/.htaccess` provides the SPA fallback). The
production bundle contains no demo sign-in, sample data, reset or simulated checkout — verified by
`npm run check:prod-bundle`. If `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing or a
service-role key is used, the site shows a configuration error and **does not start**.

Remove `<meta name="robots" content="noindex">` from `index.html` at launch.

## 6. Payments (Razorpay) _(required to sell)_

Leave `VITE_PAYMENT_PROVIDER` empty until this is done — checkout then says enrollment isn’t open.

1. Confirm with Razorpay that the business can accept **international cards** in USD/CAD, and what
   settlement, GST and invoicing rules apply (accountant). Choosing a display currency on the site
   does not guarantee a payment method is available — the site says so at checkout.
2. Deploy the functions and set secrets:
   ```bash
   supabase secrets set SITE_URL=https://<your-domain> RAZORPAY_KEY_ID=rzp_live_… RAZORPAY_KEY_SECRET=… RAZORPAY_WEBHOOK_SECRET=…
   supabase functions deploy create-order
   supabase functions deploy lesson-playback
   supabase functions deploy payment-webhook --no-verify-jwt
   ```
3. Razorpay Dashboard → Webhooks → URL `https://<project-ref>.functions.supabase.co/payment-webhook`,
   secret = `RAZORPAY_WEBHOOK_SECRET`, events **payment.captured**, **payment.failed**, **order.paid**.
4. Build with `VITE_PAYMENT_PROVIDER=razorpay` and `VITE_PAYMENT_PUBLIC_KEY=rzp_…` (key id only).

How it stays safe:

- `create-order` reads the price **from the database** for the chosen currency; the browser never sends an amount. It reuses a recent pending order to absorb double clicks.
- Access is granted only by `payment-webhook` after verifying the **HMAC-SHA256 signature** of the raw body. Each Razorpay event id is stored once (`payment_events`), so retries are no-ops.
- `fulfil_order()` checks the paid **amount and currency** against the order, creates **at most one** enrollment per order, and never double-enrolls (it flags `paid-already-enrolled` for a manual refund instead). A `payment.failed` arriving after success is ignored.
- If fulfilment fails, the webhook returns 500 so Razorpay retries; nothing is half-granted.
- **Refunds** are done in the Razorpay dashboard according to the confirmed refund policy, then an admin revokes access with a reason. Nothing is refunded automatically.

**Test before going live** (Razorpay test mode): successful payment → one enrollment; replay the
same webhook from the dashboard → no change; tampered body → 401; wrong amount → `amount-mismatch`
in `payment_events`, no access; payment failure → order `failed`, no access.

## 7. Email _(required)_

- **Auth emails** (confirm, reset): Supabase → Authentication → SMTP settings → your provider (e.g. Resend SMTP). Set SPF, DKIM and DMARC on the sending domain.
- **Purchase confirmation**: `supabase secrets set RESEND_API_KEY=… EMAIL_FROM="Yoga with Rekha <hello@yourdomain>"`. Without them, purchases still work; the email is skipped and logged.
- **Contact form** messages are stored in `contact_messages` (admins see them on the Overview). Forwarding them by email is not implemented yet.

## 8. Video _(required for paid lessons)_

**Simplest option — YouTube (unlisted) or Google Drive:** paste the link in the lesson editor; no setup needed. The video ID is only sent to students with active access (RLS + `lesson-playback`), and the player adds a watermark and hides the outbound links. But anyone who obtains the ID can watch it outside the site, so prefer private storage for paid content.

The integrated option is **Supabase Storage**: a private `lesson-videos` bucket (created by
`0002_storage.sql`). Admin uploads show real progress; students get a **signed URL valid for 2 hours**
from `lesson-playback`, issued only after it checks — at that moment — that the lesson is a preview
or the student’s access is active. There is no permanent public URL for paid videos.

- Free plan: 50 MB per file. On Pro, raise the upload limit (Storage → Settings) above your largest lesson.
- Then build with `VITE_VIDEO_HOSTING=enabled`.
- Supabase Storage serves plain MP4 (no adaptive streaming). For smoother playback on slow
  connections consider **Bunny Stream** or **Mux** with signed playback tokens; only
  `supabase/functions/lesson-playback` and the admin upload call would change.
- No platform can fully prevent screen recording. Signed, expiring links prevent casual link sharing only.
- Captions: upload `.vtt` files (e.g. to `site-images` or a CDN) and paste the https link into the lesson.

## 9. Before launch checklist

- [ ] Real support email; WhatsApp only if verified
- [ ] Real photographs of Rekha (the six pose images are AI-generated placeholders — see DEMO-NOTES.md)
- [ ] Policies reviewed and approved, then untick “Draft” and publish
- [ ] Final course names, curricula, prices; untick the “sample” labels
- [ ] Payment provider tested end to end in test mode, then live with a small real purchase + refund
- [ ] Admin MFA, backups (Pro: daily + PITR), error monitoring, uptime check
- [ ] Remove `noindex`; add analytics only with a consent notice

## What has been verified (and what hasn’t)

| Verified locally | Not yet verified |
|---|---|
| SQL schema, RLS policies and functions run in Postgres (PGlite) with Supabase-style `anon`/`authenticated`/service roles — 29 automated tests (`npm test`) | Running the migrations on a real Supabase project (Storage policies in `0002_storage.sql` need Supabase’s `storage` schema and were not executed) |
| Webhook signature verification and event decisions (unit tests) | Edge Functions on Supabase’s Deno runtime; Razorpay test-mode payments; Resend delivery |
| Production bundle contains no demo code; missing config shows an error | The Supabase browser adapter (`src/lib/supabase/backend.ts`) against a live project |
