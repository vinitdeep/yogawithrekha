import { describe, expect, it } from 'vitest';
import { computeExpiry, istDate } from '../src/lib/dates';

/** Helper: the IST calendar date (YYYY-MM-DD) and time of an ISO instant. */
const ist = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  return d.toISOString().slice(0, 23).replace('T', ' ');
};
// Start at 10:00 IST on the given date.
const start = (ymd: string) => new Date(`${ymd}T10:00:00+05:30`).toISOString();

describe('six calendar months, month-end clamped, ending 23:59:59.999 IST', () => {
  it.each([
    ['2026-12-15', 6, '2027-06-15'],
    ['2026-08-31', 6, '2027-02-28'], // shorter month → last day
    ['2027-08-31', 6, '2028-02-29'], // leap year
    ['2026-03-31', 6, '2026-09-30'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-02-28', 6, '2026-08-28'],
    ['2026-07-01', 6, '2027-01-01'], // crosses the year
    ['2026-11-30', 3, '2027-02-28'],
  ])('%s + %i months → %s', (from, months, to) => {
    expect(ist(computeExpiry(start(from), months))).toBe(`${to} 23:59:59.999`);
  });

  it('uses the IST calendar day even when the UTC date differs', () => {
    // 20:00 UTC on 30 Aug = 01:30 IST on 31 Aug → counts from 31 Aug.
    const s = '2026-08-30T20:00:00.000Z';
    expect(istDate(new Date(s))).toEqual({ y: 2026, m: 7, day: 31 });
    expect(ist(computeExpiry(s, 6))).toBe('2027-02-28 23:59:59.999');
  });

  it('stores the expiry as a UTC instant (18:29:59.999Z)', () => {
    expect(computeExpiry(start('2026-12-15'), 6)).toBe('2027-06-15T18:29:59.999Z');
  });

  it('extension from an existing end date keeps the end-of-day time', () => {
    const first = computeExpiry(start('2026-12-15'), 6);
    expect(ist(computeExpiry(first, 2))).toBe('2027-08-15 23:59:59.999');
  });
});
