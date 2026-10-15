/**
 * Access-period date rules.
 *
 * CONVENTION (identical in the browser demo and in the database — see
 * supabase/migrations/0001_schema.sql, function `compute_expiry`):
 *
 *  - Access is counted in calendar days in India Standard Time (IST, UTC+05:30, no daylight saving).
 *  - Access starts at the moment the enrollment is confirmed (or the configured launch date).
 *  - It ends at 23:59:59.999 IST on the same day-of-month, N calendar months later.
 *  - If that day does not exist in the final month, access ends on that month's LAST day:
 *      15 Dec 2026 + 6 months -> 15 Jun 2027, 23:59:59 IST
 *      31 Aug 2026 + 6 months -> 28 Feb 2027 (29 Feb 2028 when starting 31 Aug 2027)
 *  - Timestamps are stored as UTC ISO strings / timestamptz. Students see the date plus the
 *    exact IST end time and their own local equivalent.
 *  - Extensions add calendar months to the current end date (or to today if access has ended),
 *    using the same month-end rule.
 */
export const ACCESS_TZ_LABEL = 'India Standard Time (IST)';
const IST_OFFSET_MIN = 330;

/** Calendar date (year, month 0-11, day) of an instant, in IST. */
export function istDate(d: Date): { y: number; m: number; day: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** End of the IST day that is `months` calendar months after `start`'s IST date (month-end clamped). */
export function addCalendarMonths(start: Date, months: number): Date {
  const { y, m, day } = istDate(start);
  const target = m + months;
  const lastDayOfTarget = new Date(Date.UTC(y, target + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDayOfTarget);
  return new Date(Date.UTC(y, target, d, 23, 59, 59, 999) - IST_OFFSET_MIN * 60_000);
}

export function computeExpiry(startIso: string, months: number): string {
  return addCalendarMonths(new Date(startIso), months).toISOString();
}

const fmtDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtIst = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const fmtIstDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtLocal = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export const formatDate = (iso: string) => fmtDate.format(new Date(iso));
export const formatShortDate = (iso: string) => fmtShort.format(new Date(iso));
export const formatDateTime = (iso: string) => fmtDateTime.format(new Date(iso));
/** The access END date as a calendar date in IST (what the rule is defined in). */
export const formatAccessDate = (iso: string) => fmtIstDate.format(new Date(iso));
/** e.g. "15 June 2027, 11:59 pm IST" */
export const formatAccessEnd = (iso: string) => `${fmtIst.format(new Date(iso))} IST`;
/** The same instant in the viewer's own time zone, e.g. "15 Jun 2027, 2:29 pm EDT". */
export const formatLocalDateTime = (iso: string) => fmtLocal.format(new Date(iso));

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.ceil(ms / 86_400_000);
}

export function daysAgo(n: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

export function remainingLabel(expiresIso: string, now = new Date().toISOString()): string {
  const days = daysBetween(now, expiresIso);
  if (days <= 0) return 'Access ended';
  if (days === 1) return 'Less than a day left';
  if (days < 60) return `${days} days left`;
  const months = Math.floor(days / 30.44);
  return `About ${months} months left`;
}
