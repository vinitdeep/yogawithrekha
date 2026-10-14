/**
 * Access-period date rules.
 *
 * Six calendar months, with a month-end rule: if the start day does not exist
 * in the target month, access ends on the LAST day of that month.
 *   15 Dec 2026 + 6 months -> 15 Jun 2027
 *   31 Aug 2026 + 6 months -> 28 Feb 2027 (29 Feb in a leap year)
 * Access runs until the end of that day in the student's local time zone
 * (production: store and enforce in UTC on the server).
 */
export function addCalendarMonths(start: Date, months: number): Date {
  const y = start.getFullYear();
  const m = start.getMonth() + months;
  const lastDayOfTarget = new Date(y, m + 1, 0).getDate();
  const day = Math.min(start.getDate(), lastDayOfTarget);
  const d = new Date(y, m, day, 23, 59, 59, 999);
  return d;
}

export function computeExpiry(startIso: string, months: number): string {
  return addCalendarMonths(new Date(startIso), months).toISOString();
}

const fmtDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export const formatDate = (iso: string) => fmtDate.format(new Date(iso));
export const formatShortDate = (iso: string) => fmtShort.format(new Date(iso));
export const formatDateTime = (iso: string) => fmtDateTime.format(new Date(iso));

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
  if (days === 1) return '1 day left';
  if (days < 60) return `${days} days left`;
  const months = Math.floor(days / 30.44);
  return `About ${months} months left`;
}
