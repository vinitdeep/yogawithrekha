-- Initial website settings for a NEW production database. Run once after the migrations.
-- The app fills any missing keys with its built-in defaults (src/lib/seed.ts → defaultSettings),
-- so only values the database itself relies on are set here. Everything else is edited in
-- Admin → Website settings and published from there.
--
-- No courses, students or orders are seeded: production starts empty. Create the three
-- courses in Admin → Courses (they start as drafts).

insert into public.site_settings (id, data) values
  ('published', '{
    "brandName": "Yoga with Rekha",
    "courseBrand": "Rekha Radiance Method",
    "displayName": "Rekha",
    "fullName": "", "fullNameConfirmed": false,
    "credentials": "", "credentialsConfirmed": false,
    "supportEmail": "support@example.com",
    "instagramUrl": "https://www.instagram.com/yoga_with_rekha/",
    "instagramHandle": "@yoga_with_rekha",
    "whatsappNumber": "", "whatsappVerified": false,
    "defaultCurrency": "INR",
    "displayCurrencies": ["INR", "USD"],
    "defaultAccessMonths": 6,
    "accessStartRule": "enrollment",
    "launchDate": "2026-12-15"
  }'::jsonb)
on conflict (id) do nothing;

insert into public.site_settings (id, data)
select 'draft', data from public.site_settings where id = 'published'
on conflict (id) do nothing;
