// Builds the site in PRODUCTION mode into a temporary folder and fails if any demo-only code or
// data made it into the bundle (demo credentials, simulated checkout, demo storage, reset).
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = mkdtempSync(join(tmpdir(), 'ywr-prod-'));
try {
  execSync(`npx vite build --outDir "${out}" --emptyOutDir`, { stdio: 'inherit', env: { ...process.env, VITE_APP_MODE: 'production' } });
  const forbidden = ['practice123', 'admin12345', 'student@example.com', 'admin@example.com', 'ywr-demo-state', 'Simulated checkout', 'Reset demo data', 'sample.a@example.com'];
  const files = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(join(out, 'assets', f), 'utf8');
    for (const s of forbidden) if (src.includes(s)) hits.push(`${f}: "${s}"`);
  }
  if (hits.length) { console.error('\n✗ Demo-only content found in the production bundle:\n  ' + hits.join('\n  ')); process.exit(1); }
  console.log(`\n✓ Production bundle (${files.length} JS files) contains no demo credentials, sample data or simulated flows.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
