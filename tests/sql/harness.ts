import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads the real Supabase migrations into an in-process Postgres (PGlite) with a minimal stand-in
 * for Supabase's `auth` schema and API roles, so row-level security and the SQL functions can be
 * tested without a Supabase project. `as(user)` runs queries as the `authenticated` role with that
 * user's id in the JWT claims — exactly how PostgREST runs browser requests.
 */
export const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const sql = readFileSync(join(__dirname, '../../supabase/migrations/0001_schema.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(`grant all on all tables in schema public to service_role;`);
  return db;
}

export type Db = Awaited<ReturnType<typeof freshDb>>;

export async function addUser(db: Db, id: string, email: string, name = 'Test') {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, JSON.stringify({ name, role: 'admin' })]);
}

/** Run `fn` as a browser request: role anon (no user) or authenticated (with user id). */
export async function as<T>(db: Db, userId: string | null, fn: (q: Db['query']) => Promise<T>): Promise<T> {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? '']);
  try {
    return await fn(db.query.bind(db) as Db['query']);
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export async function asService<T>(db: Db, fn: (q: Db['query']) => Promise<T>): Promise<T> {
  await db.exec(`set role service_role`);
  try { return await fn(db.query.bind(db) as Db['query']); } finally { await db.exec('reset role'); }
}
