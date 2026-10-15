import { CURRENCIES, type Currency } from './types';

/** All supported currencies use 2-decimal minor units (paise / cents). */
export const MINOR_PER_MAJOR: Record<Currency, number> = { INR: 100, USD: 100, CAD: 100 };

export const CURRENCY_LABEL: Record<Currency, string> = { INR: '₹ INR', USD: '$ USD', CAD: 'CA$ CAD' };
export const CURRENCY_NAME: Record<Currency, string> = { INR: 'Indian rupee', USD: 'US dollar', CAD: 'Canadian dollar' };

export const isCurrency = (v: unknown): v is Currency => typeof v === 'string' && (CURRENCIES as readonly string[]).includes(v);

/** Format an amount held in MINOR units. */
export function formatMoney(minor: number, currency: Currency): string {
  const major = minor / MINOR_PER_MAJOR[currency];
  const whole = Number.isInteger(major);
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : currency === 'CAD' ? 'en-CA' : 'en-US', {
    style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
  }).format(major);
}

/** "3499" / "59.99" → minor units. Returns null for anything that is not a valid non-negative amount. */
export function parseMajor(input: string, currency: Currency): number | null {
  const v = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [w, f = ''] = v.split('.');
  return Number(w) * MINOR_PER_MAJOR[currency] + Number((f + '00').slice(0, 2));
}

export function toMajorString(minor: number | undefined, currency: Currency): string {
  if (minor === undefined) return '';
  const per = MINOR_PER_MAJOR[currency];
  const w = Math.floor(minor / per);
  const f = minor % per;
  return f ? `${w}.${String(f).padStart(2, '0')}` : String(w);
}
