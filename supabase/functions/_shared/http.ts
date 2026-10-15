// Shared helpers for the Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const env = (k: string, required = true): string => {
  const v = Deno.env.get(k) ?? '';
  if (required && !v) throw new ConfigError(k);
  return v;
};

export class ConfigError extends Error {
  constructor(public variable: string) { super(`Missing configuration: ${variable}`); }
}

/** CORS for the site's own origin only (SITE_URL). */
export function cors(req: Request): Record<string, string> {
  const allowed = (Deno.env.get('SITE_URL') ?? '').replace(/\/$/, '');
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': allowed && origin === allowed ? origin : allowed || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });

/** Service-role client: bypasses RLS. Server-only — never send this key to a browser. */
export const admin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** The signed-in user making this request, verified with Supabase Auth (not trusted from the body). */
export async function requireUser(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/** Log without personal data or secrets. */
export function log(event: string, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  console.log(JSON.stringify({ event, ...fields }));
}
