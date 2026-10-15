// Checks that PRODUCTION builds fail safely. Usage:
//   node tests/e2e/prod-failsafe.mjs <dist-no-config> <dist-service-role-key> <dist-unreachable-backend>
// Each folder is a `VITE_APP_MODE=production` build with the env described.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const serve = (dir) => new Promise((resolve) => {
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(dir, path);
    let body;
    try { body = await readFile(file); } catch { file = join(dir, 'index.html'); body = await readFile(file); }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  }).listen(0, () => resolve(srv));
});

const [noConfig, serviceKey, unreachable] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
const check = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) failed++; };

for (const [dir, label, expect] of [
  [noConfig, 'missing Supabase config', /isn’t configured yet[\s\S]*VITE_SUPABASE_URL[\s\S]*VITE_SUPABASE_ANON_KEY/],
  [serviceKey, 'service-role key in the browser', /SERVICE-ROLE key/],
  [unreachable, 'backend unreachable', /couldn’t load the site/],
]) {
  const srv = await serve(dir);
  const base = `http://localhost:${srv.address().port}`;
  const page = await (await browser.newContext()).newPage();
  for (const path of ['/', '/login', '/admin', '/dashboard']) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(path === '/' && dir === unreachable ? 4000 : 300);
    const text = await page.locator('body').innerText();
    check(expect.test(text), `${label} ${path}: safe error screen`);
    check(!/Demo mode|student@example\.com|Sign in to admin|Simulated/.test(text), `${label} ${path}: no demo sign-in or admin form`);
  }
  await page.context().close();
  srv.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
