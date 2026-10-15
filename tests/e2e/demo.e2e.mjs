// End-to-end checks of the DEMO build in real Chrome.
//   1. npm run dev            (http://localhost:5180)
//   2. npm run test:e2e       (or: node tests/e2e/demo.e2e.mjs)
// Set CHROME_PATH if Chrome is not in the default Windows location. Screenshots go to tests/e2e/shots/.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE ?? 'http://localhost:5180';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = new URL('./shots/', import.meta.url);
mkdirSync(SHOTS, { recursive: true });

// Deterministic seed lesson ids (see src/lib/seed.ts)
const L = { dailyPreview: 'l-1', dailyPaid: 'l-2', releasePaid: 'l-i', mindfulPaid: 's'.padStart(1) && 'l-s' };

const results = [];
let current = '';
const check = (cond, msg) => { results.push({ test: current, ok: !!cond, msg }); if (!cond) console.log(`   ✗ ${msg}`); };
async function test(name, fn) {
  current = name;
  process.stdout.write(`• ${name}\n`);
  try { await fn(); } catch (e) { results.push({ test: name, ok: false, msg: `threw: ${e.message.split('\n')[0]}` }); console.log(`   ✗ threw: ${e.message.split('\n')[0]}`); }
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: 'reduce', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => results.push({ test: current, ok: false, msg: `page error: ${e.message}` }));
  return page;
};
const go = (page, path) => page.goto(BASE + path, { waitUntil: 'networkidle' });
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ywr-demo-state') || 'null'));
async function login(page, email, password, path = '/login') {
  await go(page, path);
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
}
const text = (page) => page.locator('main').innerText();
// Static hosts (GitHub Pages) may add a trailing slash to deep links.
const HOME = (url) => url.href.replace(/\/$/, '') === BASE.replace(/\/$/, '');

/* ------------------------------------------------------------------ */

await test('1. Public navigation and course details', async () => {
  const p = await newPage();
  await go(p, '/');
  check((await p.locator('.hero h1').innerText()).includes('Make time for yourself.'), 'home headline is the shorter one');
  check(await p.locator('.hero .btn').count() === 1, 'hero has exactly one button-style action');
  check(await p.locator('.demo-pill').isVisible(), 'demo mode control is visible');
  await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Courses' }).click();
  await p.waitForURL('**/courses');
  check(await p.locator('.course-card').count() === 6, 'six published courses listed');
  await p.getByRole('link', { name: 'View course: Daily Face Yoga Practice' }).click();
  await p.waitForURL('**/courses/daily-face-yoga-practice');
  const t = await text(p);
  check(t.includes('Course curriculum') && t.includes('Free preview'), 'course detail shows curriculum and preview');
  check(!t.includes('Bonus: a travel-friendly session'), 'unpublished lesson is not listed publicly');
  check(t.includes('11:59 pm India time'), 'access explanation states the exact end time');
  await p.context().close();
});

await test('2. Student sign-in, invalid credentials, sign-out', async () => {
  const p = await newPage();
  await login(p, 'student@example.com', 'wrong-password');
  await p.getByText('was not recognised').waitFor();
  check(true, 'invalid password shows a generic error');
  await p.locator('input[autocomplete="current-password"]').fill('practice123');
  await p.getByRole('button', { name: /^Sign in/ }).click();
  await p.waitForURL('**/dashboard');
  check((await text(p)).includes('Welcome, Demo'), 'dashboard welcome');
  check(await p.locator('.site-footer').count() === 0 && await p.locator('.learner-footer').count() === 1, 'dashboard uses the compact learner footer');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await p.waitForURL(HOME);
  await go(p, '/dashboard');
  await p.waitForURL(/\/login\?next=%2Fdashboard(%2F)?$/);
  check(true, 'signed out: dashboard redirects to login');
  await p.context().close();
});

await test('3–4. Guards: guests and students vs protected pages', async () => {
  const p = await newPage();
  await go(p, '/admin/students');
  await p.waitForURL('**/admin/login?next=%2Fadmin%2Fstudents');
  check(true, 'guest → admin redirects to admin sign-in');
  await go(p, `/learn/daily-face-yoga-practice/${L.dailyPaid}`);
  check((await text(p)).includes('This lesson is part of'), 'guest sees a locked paid lesson');
  await go(p, `/learn/daily-face-yoga-practice/${L.dailyPreview}`);
  check((await text(p)).includes('free preview'), 'guest can open the preview lesson');
  // Student credentials on the admin sign-in page
  await login(p, 'student@example.com', 'practice123', '/admin/login');
  await p.getByText('doesn’t have admin access').waitFor();
  check(true, 'student refused at admin sign-in');
  // Student signed in, then opens /admin
  await login(p, 'student@example.com', 'practice123');
  await p.waitForURL('**/dashboard');
  await go(p, '/admin');
  check((await p.locator('main').innerText()).includes('Admins only'), 'student sees "Admins only" at /admin');
  // ...and login?next=/admin cannot bounce a student into admin
  await go(p, '/login?next=%2Fadmin');
  check(p.url().includes('/login'), 'login page still reachable');
  await p.context().close();
});

let newEmail = `e2e.${Date.now()}@example.com`;
let shared; // the checkout test's browser context (demo data lives in that browser's storage)
await test('8–10. Checkout: failure grants nothing, success creates one enrollment, no duplicates', async () => {
  const p = await newPage();
  await go(p, '/courses/daily-face-yoga-practice');
  await p.locator('.detail-aside').getByRole('link', { name: 'Enroll now' }).click();
  await p.waitForURL('**/checkout/daily-face-yoga-practice');
  check((await text(p)).includes('Simulated checkout'), 'checkout is labelled as simulated');
  check(await p.locator('input[autocomplete="cc-number"], input[name*="card" i]').count() === 0, 'no card fields requested');
  await p.getByLabel('Full name').fill('E2E Student');
  await p.getByLabel('Email address').fill(newEmail);
  await p.getByLabel('Create a password').fill('testpass123');
  await p.getByLabel('Confirm password').fill('testpass123');
  await p.getByRole('button', { name: 'Create account' }).click();
  await p.getByText('E2E Student').first().waitFor();

  await p.getByLabel(/Payment fails/).check();
  await p.locator('#terms').check();
  await p.getByRole('button', { name: /^Pay / }).click();
  await p.getByRole('heading', { name: 'Payment unsuccessful' }).waitFor({ timeout: 10000 });
  let s = await state(p);
  const uid = s.users.find((u) => u.email === newEmail).id;
  check(s.enrollments.filter((e) => e.userId === uid).length === 0, 'failed payment created no enrollment');
  check(s.orders.filter((o) => o.userId === uid && o.status === 'failed').length === 1, 'failed order recorded');

  await p.getByRole('link', { name: 'Try again' }).click();
  await p.locator('#terms').check();
  const pay = p.getByRole('button', { name: /^Pay / });
  await pay.dblclick(); // double click must not double-charge
  await p.getByRole('heading', { name: 'You’re enrolled!' }).waitFor({ timeout: 10000 });
  s = await state(p);
  check(s.enrollments.filter((e) => e.userId === uid).length === 1, 'exactly one enrollment after success (double click)');
  check(s.orders.filter((o) => o.userId === uid && o.status === 'paid').length === 1, 'exactly one paid order');
  const paid = s.orders.find((o) => o.userId === uid && o.status === 'paid');
  check(paid.amount === s.courses.find((c) => c.id === 'c-daily').prices[paid.currency], 'order amount taken from the course price');

  await p.getByText('Demo: replay the payment notification').click();
  await p.getByRole('button', { name: 'Replay notification' }).click();
  await p.getByText('no new enrollment was created').waitFor({ timeout: 8000 });
  s = await state(p);
  check(s.enrollments.filter((e) => e.userId === uid).length === 1, 'replayed notification created nothing');

  await go(p, '/checkout/daily-face-yoga-practice');
  check((await text(p)).includes('You’re already enrolled'), 'repeat checkout is blocked');
  await p.getByRole('button', { name: 'Not you? Sign out' }).click();
  shared = p;
});

await test('11–13. Lessons: opening ≠ complete, Mark complete persists, Resume', async () => {
  const p = shared ?? await newPage();
  await login(p, newEmail, 'testpass123');
  await p.waitForURL('**/dashboard');
  check((await text(p)).includes('0 of 10 lessons complete'), 'progress starts at 0 of 10');
  await go(p, `/learn/daily-face-yoga-practice/${L.dailyPreview}`);
  await p.locator('.lesson-side-head').getByText('0 of 10 complete').waitFor();
  check(true, 'opening a lesson does not complete it');
  check(await p.locator('.site-footer').count() === 0, 'lesson page has no promotional footer');
  await p.getByRole('button', { name: 'Mark complete' }).click();
  await p.locator('.lesson-side-head').getByText('1 of 10 complete').waitFor();
  check(true, 'Mark complete updates progress');
  await p.reload({ waitUntil: 'networkidle' });
  check(await p.locator('.lesson-side-head').getByText('1 of 10 complete').count() === 1, 'progress survives reload');
  await p.getByRole('button', { name: /Next lesson/ }).click();
  await p.waitForURL(`**/learn/daily-face-yoga-practice/${L.dailyPaid}`);
  const lessonTitle = await p.locator('main h1').innerText();
  // Sign out and back in
  await go(p, '/dashboard');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await login(p, newEmail, 'testpass123');
  await p.waitForURL('**/dashboard');
  check((await text(p)).includes('1 of 10 lessons complete'), 'progress survives sign-out/in');
  check((await p.locator('.resume-card h2').innerText()) === lessonTitle, 'Continue learning shows the last lesson opened');
  await p.locator('.resume-card').getByRole('link').click();
  await p.waitForURL(`**/${L.dailyPaid}`);
  check(true, 'Resume opens the correct lesson');
  await p.context().close();
});

await test('14. Expired and revoked access block paid content', async () => {
  const p = await newPage();
  await login(p, 'student@example.com', 'practice123');
  await p.waitForURL('**/dashboard');
  check((await text(p)).includes('Your access period has ended'), 'dashboard shows the expired course state with support');
  await go(p, `/learn/mindful-face-yoga-rituals/${L.mindfulPaid}`);
  check((await text(p)).includes('Your access to this course has ended'), 'expired paid lesson is locked');
  check(await p.getByRole('link', { name: 'Contact support' }).count() > 0, 'support action offered');
  await p.context().close();

  // Admin revokes the demo student's active course (reason required) → student blocked.
  const a = await newPage();
  await login(a, 'admin@example.com', 'admin12345', '/admin/login');
  await a.waitForURL('**/admin');
  await go(a, '/admin/students');
  await a.getByLabel('Search').fill('student@example.com');
  await a.getByRole('button', { name: 'Manage Demo Student' }).click();
  const dlg = a.getByRole('dialog', { name: 'Demo Student' });
  await dlg.locator('.card', { hasText: 'Face, Neck & Shoulder Release' }).getByRole('button', { name: 'Revoke access' }).click();
  const confirm = a.getByRole('dialog', { name: 'Revoke access?' });
  await confirm.getByRole('button', { name: 'Revoke access' }).click();
  await confirm.getByText('Please give a short reason').waitFor();
  check(true, 'revoking without a reason is refused');
  await confirm.getByLabel('Reason').fill('E2E test: refund agreed');
  await confirm.getByRole('button', { name: 'Revoke access' }).click();
  await confirm.waitFor({ state: 'detached' });
  const s = await state(a);
  const enr = s.enrollments.find((e) => e.userId === 'u-demo' && e.courseId === 'c-release' && e.revoked);
  check(enr && enr.history.at(-1).reason === 'E2E test: refund agreed' && enr.history.at(-1).by === 'admin@example.com', 'revocation recorded with admin and reason');
  check(s.audit[0].action === 'access.revoke', 'audit entry written');
  await a.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(async () => { await a.screenshot({ path: new URL('debug-revoke.png', SHOTS).pathname.slice(1) }); throw new Error('student dialog did not close on Escape'); });
  await a.getByRole('button', { name: 'Sign out' }).click();
  await login(a, 'student@example.com', 'practice123');
  await a.waitForURL('**/dashboard');
  await go(a, `/learn/face-neck-and-shoulder-release/${L.releasePaid}`);
  check((await text(a)).includes('Your access has been removed'), 'revoked paid lesson is locked');
  await a.context().close();
});

await test('16–18. Admin edits reach the right screens; drafts stay unpublished; filters', async () => {
  const p = await newPage();
  await login(p, 'admin@example.com', 'admin12345', '/admin/login');
  await p.waitForURL('**/admin');
  // Course title edit
  await go(p, '/admin/courses/c-mindful');
  await p.getByLabel('Course title').fill('Mindful Rituals (edited)');
  await p.getByRole('button', { name: 'Save course' }).click();
  await p.getByText('All changes saved.').waitFor();
  await go(p, '/courses');
  check((await text(p)).includes('Mindful Rituals (edited)'), 'edited title appears on the public catalogue');
  // Draft hides a course
  await go(p, '/admin/courses/c-mindful');
  await p.locator('#ce-status').selectOption('draft');
  await p.getByRole('button', { name: 'Save course' }).click();
  await p.getByText('All changes saved.').waitFor();
  // A second tab in the SAME browser shares the demo data (and is not in draft-preview mode).
  const guest = await p.context().newPage();
  await go(guest, '/courses');
  check(!(await text(guest)).includes('Mindful Rituals (edited)'), 'draft course hidden from the catalogue');
  check(await guest.locator('.course-card').count() === 5, 'five published courses remain');
  await go(guest, '/courses/mindful-face-yoga-rituals');
  check((await text(guest)).includes('admin preview'), 'a draft course page is only an admin preview');
  await guest.close();
  // Unsaved changes warning
  await go(p, '/admin/courses/c-daily');
  await p.getByLabel('Course title').fill('Unsaved title');
  await p.getByRole('link', { name: 'Students' }).click();
  await p.getByRole('dialog', { name: 'Leave without saving?' }).waitFor();
  check(true, 'leaving with unsaved course changes asks first');
  await p.getByRole('button', { name: 'Cancel' }).click();
  await p.getByRole('button', { name: 'Discard changes' }).click();

  // Settings: draft → preview → publish
  await go(p, '/admin/settings');
  await p.getByRole('tab', { name: 'Homepage' }).click();
  await p.getByLabel(/^Headline/).fill('Practise with calm.');
  await p.getByLabel('Accent words').fill('calm');
  await p.getByRole('button', { name: 'Save draft' }).click();
  await p.getByText('Draft saved · not published').waitFor();
  const visitor = await p.context().newPage(); // same browser data, preview off in this tab
  await go(visitor, '/');
  check(!(await visitor.locator('.hero h1').innerText()).includes('Practise with calm'), 'visitors do not see the unpublished draft');
  await p.getByRole('button', { name: 'Preview', exact: true }).click();
  await p.waitForURL(HOME);
  check((await p.locator('.hero h1').innerText()).includes('Practise with calm.'), 'admin preview shows the draft');
  check(await p.locator('.preview-bar').isVisible(), 'preview bar shown');
  await p.getByRole('link', { name: 'Back to settings' }).click();
  await p.getByRole('button', { name: 'Publish…' }).click();
  await p.getByRole('dialog', { name: 'Publish these settings?' }).getByRole('button', { name: 'Publish now' }).click();
  await p.getByText('Everything is published').waitFor();
  await go(visitor, '/');
  check((await visitor.locator('.hero h1').innerText()).includes('Practise with calm.'), 'published headline visible to visitors');
  await visitor.close();

  // Students search + filters
  await go(p, '/admin/students');
  await p.getByLabel('Search').fill('Sample Student B');
  check((await p.locator('tbody tr').count()) === 1, 'search by name');
  await p.getByLabel('Search').fill('');
  await p.getByLabel('Access').selectOption('expired');
  const expiredRows = await p.locator('tbody tr').count();
  check(expiredRows >= 1, `expired filter returns rows (${expiredRows})`);
  // Orders filters + per-currency totals
  await go(p, '/admin/payments');
  check(await p.locator('.totals-row .badge').count() >= 2, 'separate totals per currency');
  await p.getByLabel('Status').selectOption('failed');
  const failedRows = await p.locator('tbody tr').count();
  check(failedRows >= 1 && (await p.locator('tbody').innerText()).includes('Failed'), 'status filter');
  await go(p, '/admin/audit');
  check((await text(p)).includes('Published settings') || (await text(p)).includes('settings'), 'audit history lists the publish');
  // Overview chart labels are complete (no truncation)
  await go(p, '/admin');
  const label = await p.locator('.bar-chart .b-label').first().evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  check(label.sw <= label.cw + 1, 'chart course labels are not truncated');
  await p.context().close();
});

await test('18. Reset demo data (with confirmation) and dialog keyboard handling', async () => {
  const p = await newPage();
  await go(p, '/');
  await p.locator('.demo-pill').click();
  const dlg = p.getByRole('dialog', { name: 'This is a demo' });
  await dlg.waitFor();
  check(await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'focus moves into the dialog');
  await p.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  check(await p.evaluate(() => document.activeElement?.classList.contains('demo-pill')), 'focus returns to the trigger on close');
  await p.locator('.demo-pill').click();
  await p.getByRole('button', { name: 'Reset demo data' }).click();
  await p.getByRole('dialog', { name: 'Reset demo data?' }).getByRole('button', { name: 'Reset everything' }).click();
  await p.getByText('Demo data has been reset').waitFor();
  const s = await state(p);
  check(s.courses.find((c) => c.id === 'c-mindful').title === 'Mindful Face Yoga Rituals' && s.settings.heroHeadline === 'Make time for yourself.', 'seed content restored');
  await p.context().close();
});

await test('Video: YouTube (unlisted) and Google Drive lessons play in the protected player', async () => {
  const p = await newPage();
  await login(p, 'admin@example.com', 'admin12345', '/admin/login');
  await p.waitForURL('**/admin');
  await go(p, '/admin/courses/c-release');
  await p.getByRole('button', { name: 'Edit Jaw and face softening' }).click();
  const dlg = p.getByRole('dialog', { name: 'Edit lesson' });
  await dlg.getByLabel('YouTube link').fill('https://example.com/watch?v=aqz-KE-bpKQ');
  await dlg.getByRole('button', { name: 'Attach video' }).click();
  check(await dlg.getByText('doesn’t look like a YouTube').count() === 1, 'rejects a non-YouTube link');
  await dlg.getByLabel('YouTube link').fill('https://youtu.be/aqz-KE-bpKQ');
  await dlg.getByRole('button', { name: 'Attach video' }).click();
  await dlg.getByText('YouTube video attached').waitFor();
  check((await dlg.locator('.video-preview iframe').getAttribute('src')).includes('youtube-nocookie.com/embed/aqz-KE-bpKQ'), 'admin sees a live preview');
  await dlg.getByRole('button', { name: 'Apply changes' }).click();
  // Drive on another lesson
  await p.getByRole('button', { name: 'Edit Screen-break practice' }).click();
  const d2 = p.getByRole('dialog', { name: 'Edit lesson' });
  await d2.getByRole('tab', { name: 'Google Drive' }).click();
  await d2.getByLabel('Google Drive link').fill('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing');
  await d2.getByRole('button', { name: 'Attach video' }).click();
  await d2.getByText('Google Drive video attached').waitFor();
  await d2.getByRole('button', { name: 'Apply changes' }).click();
  await p.getByRole('button', { name: 'Save course' }).click();
  await p.getByText('All changes saved.').waitFor();
  await p.getByRole('button', { name: 'Sign out' }).click();

  await login(p, 'student@example.com', 'practice123');
  await p.waitForURL('**/dashboard');
  await go(p, '/learn/face-neck-and-shoulder-release/l-j');
  const frame = p.locator('.player-protected iframe');
  await frame.waitFor();
  check((await frame.getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'), 'student gets the YouTube embed');
  check(await frame.getAttribute('allowfullscreen') === null, 'embed fullscreen disabled (site fullscreen keeps the watermark)');
  check((await p.locator('.player-watermark').innerText()).includes('student@example.com'), 'watermark shows the student email');
  check(await p.locator('.player-shield').count() === 4, 'covers over YouTube title, logo, Watch-on-YouTube and copy-link before playback');
  const box = await p.locator('.player-protected').boundingBox();
  const hit = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [box.x + box.width - 60, box.y + box.height - 40]);
  check(String(hit).includes('player-shield'), '"Watch on YouTube" corner is covered');
  check(await p.locator('.player-protected').evaluate((el) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; }), 'right-click blocked');
  check(await p.getByRole('button', { name: 'Full screen' }).count() === 1, 'site fullscreen button');
  check(await p.locator('.lesson-side-head').getByText('3 of 7 complete').count() === 1, 'opening the video lesson did not complete it');
  await go(p, '/learn/face-neck-and-shoulder-release/l-k');
  check((await p.locator('.player-protected iframe').getAttribute('src')) === 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/preview', 'student gets the Drive preview embed');

  // A guest in the same browser (signed out) gets no video for the paid lesson
  await go(p, '/dashboard');
  await p.getByRole('button', { name: 'Sign out' }).first().click();
  await go(p, '/learn/face-neck-and-shoulder-release/l-j');
  check(await p.locator('iframe').count() === 0 && (await text(p)).includes('This lesson is part of'), 'signed-out visitor gets no video');
  await p.context().close();
});

await test('19. Layout: no horizontal overflow at phone and desktop widths', async () => {
  const pages = ['/', '/courses', '/courses/daily-face-yoga-practice', '/about', '/faq', '/contact', '/login', '/checkout/daily-face-yoga-practice', '/policies/terms'];
  const student = ['/dashboard', '/account', `/learn/face-neck-and-shoulder-release/l-f`];
  const adminPages = ['/admin', '/admin/courses', '/admin/courses/c-daily', '/admin/students', '/admin/payments', '/admin/settings', '/admin/audit'];
  for (const vp of [{ width: 375, height: 812, name: 'phone' }, { width: 1280, height: 620, name: 'laptop' }]) {
    const p = await newPage({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'no-preference' });
    const overflow = async (path) => {
      await go(p, path);
      await p.waitForTimeout(250);
      const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
      check(r.sw <= r.w + 1, `${vp.name} ${path}: no horizontal overflow (${r.sw} ≤ ${r.w})`);
    };
    for (const path of pages) await overflow(path);
    if (vp.name === 'phone') {
      await go(p, '/courses/daily-face-yoga-practice');
      await p.screenshot({ path: new URL(`course-${vp.name}.png`, SHOTS).pathname.slice(1), fullPage: false });
      const bar = await p.locator('.mobile-enroll').boundingBox();
      check(bar && bar.height < 110, 'mobile enroll bar is compact');
    }
    await login(p, 'student@example.com', 'practice123');
    await p.waitForURL('**/dashboard');
    for (const path of student) await overflow(path);
    await p.screenshot({ path: new URL(`lesson-${vp.name}.png`, SHOTS).pathname.slice(1) });
    await go(p, '/dashboard');
    await p.getByRole('button', { name: 'Sign out' }).first().click();
    await login(p, 'admin@example.com', 'admin12345', '/admin/login');
    await p.waitForURL('**/admin');
    for (const path of adminPages) await overflow(path);
    await go(p, '/admin');
    await p.screenshot({ path: new URL(`admin-${vp.name}.png`, SHOTS).pathname.slice(1), fullPage: true });
    await go(p, '/');
    await p.screenshot({ path: new URL(`home-${vp.name}.png`, SHOTS).pathname.slice(1) });
    if (vp.name === 'phone') {
      await p.getByRole('button', { name: 'Open menu' }).click();
      check(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Close menu'), 'mobile menu moves focus to Close');
      await p.keyboard.press('Escape');
      check(await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Open menu'), 'mobile menu returns focus on close');
    }
    await p.context().close();
  }
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { for (const f of failed) console.log(`FAIL [${f.test}] ${f.msg}`); process.exit(1); }
