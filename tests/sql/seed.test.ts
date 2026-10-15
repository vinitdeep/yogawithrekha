import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { as, freshDb } from './harness';

it('supabase/seed.sql loads and publishes readable settings without private details', async () => {
  const db = await freshDb();
  await db.exec(readFileSync(join(__dirname, '../../supabase/seed.sql'), 'utf8'));
  const pub = await as(db, null, (q) => q<{ id: string; data: Record<string, unknown> }>(`select id, data from public.site_settings`));
  expect(pub.rows.map((r) => r.id)).toEqual(['published']); // the draft row is admin-only
  expect(pub.rows[0].data.displayCurrencies).toEqual(['INR', 'USD']);
  expect(pub.rows[0].data.fullName).toBe('');
});
