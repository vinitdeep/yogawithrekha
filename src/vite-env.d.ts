/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "demo" (default) or "production". See src/lib/config.ts and .env.example. */
  readonly VITE_APP_MODE?: string;
  /** Legacy: "false" meant a production-style build. Prefer VITE_APP_MODE. */
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** The PUBLIC anon key only — never the service-role key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PAYMENT_PROVIDER?: string;
  readonly VITE_PAYMENT_PUBLIC_KEY?: string;
  readonly VITE_VIDEO_HOSTING?: string;
  readonly VITE_SITE_URL?: string;
}
