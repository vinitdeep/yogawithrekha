// GitHub Pages has no server rewrites.
// 1. Write index.html as `<route>.html` for the known routes. GitHub Pages serves `/dashboard` from
//    `dashboard.html` with a 200 and NO redirect. (A `dashboard/index.html` folder would 301 to
//    `/dashboard/`, adding a trailing slash to every shared link and to `?next=` sign-in returns.)
// 2. Serve index.html as 404.html so any other deep link (lessons, checkout…) still loads the app.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const seed = readFileSync('src/lib/seed.ts', 'utf8');
const courseSlugs = [...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const routes = [
  'courses', 'about', 'faq', 'contact', 'login', 'register', 'forgot-password', 'dashboard', 'account',
  'admin', 'admin/login', 'admin/courses', 'admin/students', 'admin/payments', 'admin/settings', 'admin/audit',
  'policies/privacy', 'policies/terms', 'policies/refund',
  ...courseSlugs.map((s) => `courses/${s}`),
];
for (const r of routes) {
  mkdirSync(dirname(`dist/${r}.html`), { recursive: true });
  copyFileSync('dist/index.html', `dist/${r}.html`);
}
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`SPA fallback: ${routes.length} route pages + dist/404.html written`);
