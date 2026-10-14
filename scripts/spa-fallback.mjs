// GitHub Pages has no server rewrites.
// 1. Copy index.html to the known public routes so shared links return 200 (clean link previews).
// 2. Serve index.html as 404.html so any other deep link (lessons, checkout…) still loads the app.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const seed = readFileSync('src/lib/seed.ts', 'utf8');
const courseSlugs = [...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const routes = [
  'courses', 'about', 'faq', 'contact', 'login', 'register', 'forgot-password', 'dashboard', 'account',
  'admin', 'admin/login', 'policies/privacy', 'policies/terms', 'policies/refund',
  ...courseSlugs.map((s) => `courses/${s}`),
];
for (const r of routes) {
  mkdirSync(`dist/${r}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${r}/index.html`);
}
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`SPA fallback: ${routes.length} route pages + dist/404.html written`);
