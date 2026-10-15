import { beforeAll, describe, expect, it } from 'vitest';
import { addUser, as, freshDb, type Db } from './harness';

/** Access requests + admin password-reset audit, against the real migration (PGlite). */

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const S1 = '00000000-0000-4000-8000-0000000000c1';
const S2 = '00000000-0000-4000-8000-0000000000c2';
const COURSE = '10000000-0000-4000-8000-0000000000aa';
let db: Db;
const err = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return (e as Error).message; } };

beforeAll(async () => {
  db = await freshDb();
  await addUser(db, ADMIN, 'owner@example.com');
  await addUser(db, S1, 'one@example.com');
  await addUser(db, S2, 'two@example.com');
  await db.query(`insert into public.site_settings (id, data) values ('published', '{"brandName":"Y","displayCurrencies":["INR"],"enrollmentMode":"both"}')`);
  await db.query(`select public.bootstrap_admin('owner@example.com')`);
  await db.query(`insert into public.courses (id, slug, title, status) values ($1, 'c', 'Course', 'published')`, [COURSE]);
});

describe('access requests', () => {
  let id = '';
  it('a student can request once; guests cannot', async () => {
    expect(await err(as(db, null, (q) => q(`select public.request_access($1, 'x')`, [COURSE])))).toMatch(/permission denied|not signed in/);
    const r = await as(db, S1, (q) => q<{ id: string }>(`select public.request_access($1, 'UPI ref 1') as id`, [COURSE]));
    id = r.rows[0].id;
    expect(await err(as(db, S1, (q) => q(`select public.request_access($1, 'again')`, [COURSE])))).toMatch(/already requested/);
  });

  it('students see only their own requests and cannot insert or approve', async () => {
    expect((await as(db, S2, (q) => q(`select * from public.access_requests`))).rows).toHaveLength(0);
    expect((await as(db, S1, (q) => q(`select * from public.access_requests`))).rows).toHaveLength(1);
    expect(await err(as(db, S1, (q) => q(`insert into public.access_requests (user_id, course_id) values ($1, $2)`, [S1, COURSE])))).toMatch(/permission denied/);
    expect(await err(as(db, S1, (q) => q(`update public.access_requests set status = 'approved'`)))).toMatch(/permission denied/);
    expect(await err(as(db, S1, (q) => q(`select public.admin_decide_request($1, true, 'please please')`, [id])))).toMatch(/administrators only/);
  });

  it('admin approval (reason required) grants access and closes the request', async () => {
    expect(await err(as(db, ADMIN, (q) => q(`select public.admin_decide_request($1, true, '')`, [id])))).toMatch(/reason/);
    await as(db, ADMIN, (q) => q(`select public.admin_decide_request($1, true, 'Payment received')`, [id]));
    const r = await db.query<{ status: string; enrollment_id: string | null; decided_by_email: string }>(`select status, enrollment_id, decided_by_email from public.access_requests where id = $1`, [id]);
    expect(r.rows[0].status).toBe('approved');
    expect(r.rows[0].enrollment_id).not.toBeNull();
    expect(r.rows[0].decided_by_email).toBe('owner@example.com');
    const ok = await db.query<{ a: boolean }>(`select public.has_active_access($1, $2) as a`, [S1, COURSE]);
    expect(ok.rows[0].a).toBe(true);
    expect(await err(as(db, S1, (q) => q(`select public.request_access($1, 'more')`, [COURSE])))).toMatch(/already have access/);
  });

  it('decline grants nothing; a direct grant closes a pending request', async () => {
    const a = await as(db, S2, (q) => q<{ id: string }>(`select public.request_access($1, '') as id`, [COURSE]));
    await as(db, ADMIN, (q) => q(`select public.admin_decide_request($1, false, 'Payment not found')`, [a.rows[0].id]));
    expect((await db.query<{ a: boolean }>(`select public.has_active_access($1, $2) as a`, [S2, COURSE])).rows[0].a).toBe(false);
    const b = await as(db, S2, (q) => q<{ id: string }>(`select public.request_access($1, 'paid now') as id`, [COURSE]));
    await as(db, ADMIN, (q) => q(`select public.admin_grant_access($1, $2, 'Granted from list')`, [S2, COURSE]));
    const st = await db.query<{ status: string }>(`select status from public.access_requests where id = $1`, [b.rows[0].id]);
    expect(st.rows[0].status).toBe('approved');
  });

  it('checkout-only mode refuses requests', async () => {
    await db.query(`update public.site_settings set data = data || '{"enrollmentMode":"checkout"}' where id = 'published'`);
    const S3 = '00000000-0000-4000-8000-0000000000c3';
    await addUser(db, S3, 'three@example.com');
    expect(await err(as(db, S3, (q) => q(`select public.request_access($1, '')`, [COURSE])))).toMatch(/not open/);
  });

  it('password reset audit is admin-only', async () => {
    expect(await err(as(db, S1, (q) => q(`select public.admin_note_password_reset($1)`, [S2])))).toMatch(/administrators only/);
    await as(db, ADMIN, (q) => q(`select public.admin_note_password_reset($1)`, [S2]));
    const a = await db.query<{ summary: string }>(`select summary from public.audit_log where action = 'user.password_reset_sent'`);
    expect(a.rows[0].summary).toContain('two@example.com');
  });
});
