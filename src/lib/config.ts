/**
 * The single configuration boundary between DEMO and PRODUCTION.
 *
 *   VITE_APP_MODE=demo        (default) — local browser storage, simulated sign-in, payments and uploads.
 *   VITE_APP_MODE=production  — Supabase auth + database; every demo shortcut is compiled out.
 *
 * Only PUBLIC values belong here (anything prefixed VITE_ ends up in the browser bundle).
 * Secrets — the Supabase service-role key, payment provider secrets, webhook secrets, email API
 * keys — live in Supabase function secrets and must never be added as VITE_ variables.
 */

const env = import.meta.env;

export type AppMode = 'demo' | 'production';
// Written so Vite can evaluate it at BUILD time: in a production build IS_DEMO is the literal
// `false`, and every demo-only branch (credentials, simulated checkout, reset) is removed from
// the bundle. Backwards compatibility: VITE_DEMO_MODE=false also means production.
export const IS_PRODUCTION = import.meta.env.VITE_APP_MODE === 'production' || import.meta.env.VITE_DEMO_MODE === 'false';
export const IS_DEMO = !IS_PRODUCTION;
export const APP_MODE: AppMode = IS_PRODUCTION ? 'production' : 'demo';

export interface ProductionConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /**
   * Payment provider used by the checkout. Only "razorpay" has a server integration so far
   * (supabase/functions). Empty = payments disabled: checkout explains that enrolment isn't open yet.
   */
  paymentProvider: '' | 'razorpay';
  /** Public (publishable) payment key, if the provider's checkout widget needs one. */
  paymentPublicKey: string;
  /** True once protected video storage + the playback function are deployed. */
  videoHostingEnabled: boolean;
  siteUrl: string;
}

export interface ConfigProblem { variable: string; message: string }

function readProduction(): { config: ProductionConfig; problems: ConfigProblem[] } {
  const problems: ConfigProblem[] = [];
  const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  const provider = (env.VITE_PAYMENT_PROVIDER ?? '').trim().toLowerCase();

  if (!supabaseUrl) problems.push({ variable: 'VITE_SUPABASE_URL', message: 'Missing. Set it to your Supabase project URL.' });
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(supabaseUrl)) {
    problems.push({ variable: 'VITE_SUPABASE_URL', message: 'Not a valid Supabase project URL.' });
  }
  if (!supabaseAnonKey) problems.push({ variable: 'VITE_SUPABASE_ANON_KEY', message: 'Missing. Use the project’s anon (public) key.' });
  // A service-role key in the browser would bypass every security rule. Refuse to start.
  if (/service_role/.test(decodeJwtRole(supabaseAnonKey)) || supabaseAnonKey.startsWith('sb_secret_')) {
    problems.push({ variable: 'VITE_SUPABASE_ANON_KEY', message: 'This is the SERVICE-ROLE key. It must never be shipped to the browser. Use the anon key.' });
  }
  if (provider && provider !== 'razorpay') {
    problems.push({ variable: 'VITE_PAYMENT_PROVIDER', message: 'Only "razorpay" is integrated. Leave it empty to keep payments disabled until a provider is chosen.' });
  }
  if (provider === 'razorpay' && !/^rzp_(test|live)_[A-Za-z0-9]+$/.test((env.VITE_PAYMENT_PUBLIC_KEY ?? '').trim())) {
    problems.push({ variable: 'VITE_PAYMENT_PUBLIC_KEY', message: 'Set the Razorpay KEY ID (rzp_test_… or rzp_live_…). Never the key secret.' });
  }
  return {
    problems,
    config: {
      supabaseUrl, supabaseAnonKey,
      paymentProvider: provider === 'razorpay' ? provider : '',
      paymentPublicKey: (env.VITE_PAYMENT_PUBLIC_KEY ?? '').trim(),
      videoHostingEnabled: env.VITE_VIDEO_HOSTING === 'enabled',
      siteUrl: (env.VITE_SITE_URL ?? '').trim(),
    },
  };
}

function decodeJwtRole(jwt: string): string {
  try {
    const part = jwt.split('.')[1];
    if (!part) return '';
    return String(JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).role ?? '');
  } catch {
    return '';
  }
}

const prod = IS_PRODUCTION ? readProduction() : null;
export const PRODUCTION_CONFIG: ProductionConfig | null = prod?.config ?? null;
/** Non-empty in production when required configuration is missing or unsafe. The app refuses to start. */
export const CONFIG_PROBLEMS: ConfigProblem[] = prod?.problems ?? [];

/** Payments can be taken only in production with a configured provider. */
export const PAYMENTS_ENABLED = IS_PRODUCTION && !!PRODUCTION_CONFIG?.paymentProvider;
