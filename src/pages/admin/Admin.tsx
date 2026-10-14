import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { accessStatus, courseLessons, progressPercent, useStore } from '../../lib/store';
import type { Currency, Enrollment, OrderStatus, RecordSource, User } from '../../lib/types';
import { Icon, type IconName } from '../../components/Icon';
import { Logo, formatMoney } from '../../components/brand';
import { ConfirmDialog, Dialog, Field, Notice, PasswordField, ProgressBar, emailOk, usePageTitle, useToast } from '../../components/ui';
import { DEMO_ACCOUNTS } from '../../lib/seed';
import { DEMO_MODE } from '../../components/Layout';
import { formatDate, formatDateTime, formatShortDate } from '../../lib/dates';
import { AccessBadge, StatusBadge } from '../Student';

const nav: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', icon: 'grid', end: true },
  { to: '/admin/courses', label: 'Courses & lessons', icon: 'book' },
  { to: '/admin/students', label: 'Students', icon: 'users' },
  { to: '/admin/payments', label: 'Payments', icon: 'card' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export function AdminLayout() {
  const { user, logout } = useStore();
  const go = useNavigate();
  return (
    <div className="admin-shell">
      <aside className="admin-side" aria-label="Admin navigation">
        <Link to="/" className="brand"><Logo /><span><span className="brand-name">Yoga with Rekha</span><span className="brand-sub">Admin</span></span></Link>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav"><Icon name={n.icon} size={18} />{n.label}</NavLink>
        ))}
        <Link to="/" className="nav"><Icon name="home" size={18} />View website</Link>
        <div className="side-foot">
          <span>Signed in as {user?.name}</span>
          <button type="button" className="link-btn" style={{ color: '#fff', textAlign: 'left' }} onClick={() => { logout(); go('/admin/login'); }}>Sign out</button>
        </div>
      </aside>
      <main id="main" className="admin-main">
        {DEMO_MODE && (
          <div style={{ marginBottom: 20 }}>
            <Notice kind="demo">Admin preview with simulated access. Edits are saved in this browser and update the demo website immediately. Records marked <span className="badge badge-outline">Sample</span> are fictional.</Notice>
          </div>
        )}
        <Suspense fallback={<div className="locked" role="status"><span className="spinner" aria-hidden="true" /></div>}><Outlet /></Suspense>
      </main>
    </div>
  );
}

/* ------------------------------ Admin sign-in ------------------------------ */

export function AdminLogin() {
  const { user, login, logout } = useStore();
  const [params] = useSearchParams();
  const go = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  usePageTitle('Admin sign in');

  const next = params.get('next');
  const dest = next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin';
  if (user?.role === 'admin') return <Navigate to={dest} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: typeof errors = {};
    if (!emailOk(email)) er.email = 'Enter your admin email address.';
    if (!password) er.password = 'Enter your password.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTimeout(() => {
      const r = login(email, password);
      setBusy(false);
      if (!r.ok) { setErrors({ form: r.error }); return; }
      if (r.data.role !== 'admin') {
        logout();
        setErrors({ form: 'This account doesn’t have admin access. Students can sign in from Student Login.' });
        return;
      }
      toast('Welcome to the admin panel');
      go(dest, { replace: true });
    }, 450);
  };

  return (
    <main id="main" className="admin-login">
      <div className="card auth-card">
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <Logo />
          <span><span className="brand-name">Yoga with Rekha</span><span className="brand-sub">Admin panel</span></span>
        </div>
        <h1 style={{ fontSize: '1.7rem' }}>Admin sign in</h1>
        <p className="muted">Manage courses, lessons, students, payments and site settings.</p>
        <form className="form" onSubmit={submit} noValidate>
          {errors.form && <Notice kind="err">{errors.form}</Notice>}
          <Field label="Email address" type="email" autoComplete="username" required value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label="Password" autoComplete="current-password" required value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : 'Sign in to admin'}
          </button>
          {DEMO_MODE && (
            <div className="demo-creds">
              <strong>Demo admin</strong> (simulated sign-in): <code>{DEMO_ACCOUNTS.admin.email}</code> / <code>{DEMO_ACCOUNTS.admin.password}</code>
            </div>
          )}
        </form>
        <p className="center small" style={{ marginTop: 20, marginBottom: 0 }}><Link to="/">← Back to the website</Link></p>
      </div>
    </main>
  );
}

function SourceBadge({ source }: { source: RecordSource }) {
  return source === 'sample' ? <span className="badge badge-outline">Sample</span> : <span className="badge badge-info">Demo</span>;
}

/* ------------------------------ Overview ------------------------------ */

export function AdminOverview() {
  const { state } = useStore();
  usePageTitle('Admin overview');
  const students = state.users.filter((u) => u.role === 'student');
  const active = state.enrollments.filter((e) => accessStatus(e) === 'active');
  const paid = state.orders.filter((o) => o.status === 'paid');
  const totals = (cur: Currency) => paid.filter((o) => o.currency === cur).reduce((s, o) => s + o.amount, 0);
  const perCourse = state.courses.map((c) => ({ c, n: active.filter((e) => e.courseId === c.id).length }));
  const max = Math.max(1, ...perCourse.map((x) => x.n));

  return (
    <>
      <div className="admin-top">
        <div><h1>Overview</h1><p className="muted" style={{ margin: 0 }}>A snapshot of courses, students and payments.</p></div>
        <Link to="/admin/courses" className="btn btn-primary btn-sm"><Icon name="plus" size={16} /> Manage courses</Link>
      </div>
      <p className="small muted"><span className="badge badge-outline">Sample statistics</span> Figures below include fictional sample records created for this demo.</p>
      <div className="grid grid-4" style={{ gap: 16, marginBottom: 24 }}>
        <div className="stat"><div className="k">Students</div><div className="v">{students.length}</div><div className="s">{students.filter((u) => u.source === 'sample').length} sample · {students.filter((u) => u.source !== 'sample').length} demo</div></div>
        <div className="stat"><div className="k">Active enrollments</div><div className="v">{active.length}</div><div className="s">{state.enrollments.length - active.length} expired or revoked</div></div>
        <div className="stat"><div className="k">Courses</div><div className="v">{state.courses.length}</div><div className="s">{state.courses.filter((c) => c.status === 'published').length} published · {state.courses.filter((c) => c.status === 'draft').length} draft</div></div>
        <div className="stat"><div className="k">Payments received</div><div className="v" style={{ fontSize: '1.4rem', paddingTop: 6 }}>{formatMoney(totals('INR'), 'INR')}<br />{formatMoney(totals('USD'), 'USD')}</div><div className="s">{paid.length} successful · {state.orders.filter((o) => o.status !== 'paid').length} failed/pending</div></div>
      </div>
      <div className="grid grid-2" style={{ gap: 16 }}>
        <div className="card card-sm">
          <h2 style={{ fontSize: '1.2rem' }}>Active enrollments by course</h2>
          <div className="bar-chart">
            {perCourse.map(({ c, n }) => (
              <div className="b" key={c.id}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}>{c.title}</span>
                <div className="track" role="img" aria-label={`${n} active enrollments`}><span style={{ width: `${(n / max) * 100}%` }} /></div>
                <strong className="num">{n}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-sm">
          <h2 style={{ fontSize: '1.2rem' }}>Recent activity</h2>
          {state.activity.length ? (
            <ul className="activity">
              {state.activity.slice(0, 7).map((a) => (
                <li key={a.id}><SourceBadge source={a.recordSource} /><span>{a.text}</span><time dateTime={a.at}>{formatShortDate(a.at)}</time></li>
              ))}
            </ul>
          ) : <p className="muted">No activity yet.</p>}
        </div>
      </div>
      {state.messages.length > 0 && (
        <div className="card card-sm" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>Contact messages <span className="badge badge-info">Demo — not delivered</span></h2>
          <ul className="activity">
            {state.messages.slice(0, 5).map((m) => (
              <li key={m.id}><span><strong>{m.name}</strong> ({m.email}): {m.message}</span><time dateTime={m.at}>{formatShortDate(m.at)}</time></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/* ------------------------------ Students ------------------------------ */

type StudentFilter = 'all' | 'active' | 'expired' | 'none';

export function AdminStudents() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StudentFilter>('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  usePageTitle('Students');

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.users
      .filter((u) => u.role === 'student')
      .map((u) => {
        const ens = state.enrollments.filter((e) => e.userId === u.id);
        return { u, ens };
      })
      .filter(({ u, ens }) => {
        if (term && !`${u.name} ${u.email} ${u.country ?? ''}`.toLowerCase().includes(term)) return false;
        if (courseFilter !== 'all' && !ens.some((e) => e.courseId === courseFilter)) return false;
        const scoped = courseFilter === 'all' ? ens : ens.filter((e) => e.courseId === courseFilter);
        const sts = scoped.map((e) => accessStatus(e));
        if (filter === 'active') return sts.includes('active');
        if (filter === 'expired') return sts.length > 0 && !sts.includes('active');
        if (filter === 'none') return ens.length === 0;
        return true;
      });
  }, [state.users, state.enrollments, q, filter, courseFilter]);

  const open = state.users.find((u) => u.id === openId) ?? null;

  return (
    <>
      <div className="admin-top"><div><h1>Students</h1><p className="muted" style={{ margin: 0 }}>Search students, review progress and manage access.</p></div></div>
      <div className="toolbar" role="search">
        <label htmlFor="s-q" className="sr-only">Search students</label>
        <input id="s-q" className="input input-sm" type="search" placeholder="Search name, email or country…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="s-f" className="sr-only">Access status</label>
        <select id="s-f" className="select input-sm" value={filter} onChange={(e) => setFilter(e.target.value as StudentFilter)}>
          <option value="all">All students</option>
          <option value="active">With active access</option>
          <option value="expired">Access ended / revoked</option>
          <option value="none">No enrollments</option>
        </select>
        <label htmlFor="s-c" className="sr-only">Course</label>
        <select id="s-c" className="select input-sm" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
          <option value="all">All courses</option>
          {state.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <span className="muted small" aria-live="polite">{rows.length} result{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty"><Icon name="search" size={36} /><h2 style={{ fontSize: '1.2rem' }}>No students match</h2><p className="muted">Try clearing the search or filters.</p><button type="button" className="btn btn-secondary btn-sm" onClick={() => { setQ(''); setFilter('all'); setCourseFilter('all'); }}>Clear filters</button></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Student</th><th scope="col">Country</th><th scope="col">Enrollments</th><th scope="col">Next expiry</th><th scope="col">Record</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map(({ u, ens }) => {
                const act = ens.filter((e) => accessStatus(e) === 'active').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
                return (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong><br /><span className="muted small">{u.email}</span></td>
                    <td>{u.country ?? '—'}</td>
                    <td>{act.length} active{ens.length - act.length > 0 && <span className="muted"> · {ens.length - act.length} ended</span>}</td>
                    <td>{act[0] ? formatShortDate(act[0].expiresAt) : '—'}</td>
                    <td><SourceBadge source={u.source} /></td>
                    <td className="num"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(u.id)}>Manage<span className="sr-only"> {u.name}</span></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <StudentDialog student={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

type Pending = { kind: 'revoke' | 'restore' | 'extend' | 'grant'; enrollment?: Enrollment; courseId?: string; months?: number } | null;

function StudentDialog({ student, onClose }: { student: User; onClose: () => void }) {
  const { state, progressFor, grantAccess, revokeAccess, restoreAccess, extendAccess } = useStore();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [grantCourse, setGrantCourse] = useState('');
  const [extendMonths, setExtendMonths] = useState<Record<string, number>>({});
  const ens = state.enrollments.filter((e) => e.userId === student.id).sort((a, b) => b.startAt.localeCompare(a.startAt));
  const course = (id?: string) => state.courses.find((c) => c.id === id);

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'revoke' && pending.enrollment) { revokeAccess(pending.enrollment.id); toast('Access revoked'); }
    if (pending.kind === 'restore' && pending.enrollment) { restoreAccess(pending.enrollment.id); toast('Access restored'); }
    if (pending.kind === 'extend' && pending.enrollment) { extendAccess(pending.enrollment.id, pending.months ?? 1); toast(`Access extended by ${pending.months} month(s)`); }
    if (pending.kind === 'grant' && pending.courseId) {
      const r = grantAccess(student.id, pending.courseId);
      toast(r.ok ? 'Access granted' : r.error, r.ok ? 'ok' : 'err');
      if (r.ok) setGrantCourse('');
    }
    setPending(null);
  };

  const pc = course(pending?.courseId ?? pending?.enrollment?.courseId);
  const msg = pending && ({
    revoke: <>Remove {student.name}’s access to <strong>{pc?.title}</strong>? They will no longer be able to open lessons. Their progress is kept and access can be restored.</>,
    restore: <>Restore {student.name}’s access to <strong>{pc?.title}</strong> until its current end date?</>,
    extend: <>Extend {student.name}’s access to <strong>{pc?.title}</strong> by {pending.months} month(s)? If access has already ended, the extension starts today.</>,
    grant: <>Give {student.name} {pc?.accessMonths}-month access to <strong>{pc?.title}</strong> starting today, without a payment?</>,
  })[pending.kind];

  return (
    <Dialog open onClose={onClose} title={student.name} description={`${student.email}${student.country ? ` · ${student.country}` : ''} · joined ${formatShortDate(student.createdAt)}`} size="lg">
      {student.source === 'sample' && <Notice kind="demo">Fictional sample student.</Notice>}
      <h3 style={{ marginTop: 18 }}>Enrollments</h3>
      {ens.length === 0 && <p className="muted">No enrollments yet.</p>}
      <div className="stack">
        {ens.map((e) => {
          const c = course(e.courseId);
          if (!c) return null;
          const st = accessStatus(e);
          const p = progressFor(student.id, c.id);
          const lessons = courseLessons(c);
          return (
            <div key={e.id} className="card card-sm card-flat">
              <div className="row-between"><strong>{c.title}</strong><AccessBadge status={st} /></div>
              <div style={{ margin: '12px 0' }}><ProgressBar value={progressPercent(c, p)} label={`${lessons.filter((l) => p?.completed.includes(l.id)).length} of ${lessons.length} lessons complete`} /></div>
              <dl className="kv" style={{ margin: '0 0 12px' }}>
                <div><dt>Started</dt><dd>{formatDate(e.startAt)}</dd></div>
                <div><dt>Access until</dt><dd>{formatDate(e.expiresAt)}</dd></div>
                <div><dt>Source</dt><dd>{e.source === 'purchase' ? 'Purchase' : 'Admin grant'}</dd></div>
              </dl>
              <div className="row">
                <label htmlFor={`ext-${e.id}`} className="sr-only">Extension length</label>
                <select id={`ext-${e.id}`} className="select input-sm" style={{ width: 'auto' }} value={extendMonths[e.id] ?? 1} onChange={(ev) => setExtendMonths({ ...extendMonths, [e.id]: Number(ev.target.value) })}>
                  {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ kind: 'extend', enrollment: e, months: extendMonths[e.id] ?? 1 })}>Extend access</button>
                {e.revoked
                  ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ kind: 'restore', enrollment: e })}>Restore access</button>
                  : <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--err)' }} onClick={() => setPending({ kind: 'revoke', enrollment: e })}>Revoke access</button>}
              </div>
              <details className="small muted" style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>History</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{e.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} — {h.action}</li>)}</ul>
              </details>
            </div>
          );
        })}
      </div>
      <h3 style={{ marginTop: 24 }}>Grant access</h3>
      <div className="row">
        <label htmlFor="grant" className="sr-only">Course to grant</label>
        <select id="grant" className="select input-sm" style={{ width: 'auto', minWidth: 220 }} value={grantCourse} onChange={(e) => setGrantCourse(e.target.value)}>
          <option value="">Choose a course…</option>
          {state.courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status === 'draft' ? ' (draft)' : ''}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!grantCourse} onClick={() => setPending({ kind: 'grant', courseId: grantCourse })}>Grant access</button>
      </div>
      <ConfirmDialog
        open={!!pending} onCancel={() => setPending(null)} onConfirm={confirm}
        title={pending?.kind === 'revoke' ? 'Revoke access?' : pending?.kind === 'restore' ? 'Restore access?' : pending?.kind === 'extend' ? 'Extend access?' : 'Grant access?'}
        confirmLabel={pending?.kind === 'revoke' ? 'Revoke access' : 'Confirm'} danger={pending?.kind === 'revoke'}
        message={msg}
      />
    </Dialog>
  );
}

/* ------------------------------ Payments ------------------------------ */

export function AdminPayments() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [source, setSource] = useState<'all' | RecordSource>('all');
  const [currency, setCurrency] = useState<'all' | Currency>('all');
  usePageTitle('Payments');

  const rows = state.orders
    .filter((o) => {
      const term = q.trim().toLowerCase();
      if (term && !`${o.reference} ${o.customerName} ${o.customerEmail} ${o.courseTitle}`.toLowerCase().includes(term)) return false;
      if (status !== 'all' && o.status !== status) return false;
      if (source !== 'all' && o.recordSource !== source) return false;
      if (currency !== 'all' && o.currency !== currency) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const count = (s: OrderStatus) => state.orders.filter((o) => o.status === s).length;

  return (
    <>
      <div className="admin-top"><div><h1>Payments</h1><p className="muted" style={{ margin: 0 }}>Orders and transactions.</p></div></div>
      <Notice kind="warn">No payment provider is connected. Every record here is either a fictional <strong>Sample</strong> or a <strong>Demo</strong> record created by the simulated checkout. There are no real transactions.</Notice>
      <div className="grid grid-3" style={{ gap: 16, margin: '20px 0' }}>
        <div className="stat"><div className="k">Successful</div><div className="v">{count('paid')}</div></div>
        <div className="stat"><div className="k">Pending</div><div className="v">{count('pending')}</div></div>
        <div className="stat"><div className="k">Failed</div><div className="v">{count('failed')}</div></div>
      </div>
      <div className="toolbar" role="search">
        <label htmlFor="p-q" className="sr-only">Search payments</label>
        <input id="p-q" className="input input-sm" type="search" placeholder="Search reference, name, email or course…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="p-s" className="sr-only">Status</label>
        <select id="p-s" className="select input-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option><option value="paid">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option>
        </select>
        <label htmlFor="p-c" className="sr-only">Currency</label>
        <select id="p-c" className="select input-sm" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
          <option value="all">All currencies</option><option value="INR">INR</option><option value="USD">USD</option>
        </select>
        <label htmlFor="p-r" className="sr-only">Record type</label>
        <select id="p-r" className="select input-sm" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="all">Sample + demo</option><option value="sample">Sample only</option><option value="demo">Demo checkout only</option>
        </select>
      </div>
      {rows.length === 0 ? (
        <div className="empty"><Icon name="card" size={36} /><h2 style={{ fontSize: '1.2rem' }}>No payments match</h2><p className="muted">Try different filters.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Customer</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Record</th><th scope="col" className="num">Amount</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatShortDate(o.createdAt)}</td>
                  <td><code>{o.reference}</code></td>
                  <td>{o.customerName}<br /><span className="muted small">{o.customerEmail}</span></td>
                  <td>{o.courseTitle}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td><SourceBadge source={o.recordSource} /></td>
                  <td className="num">{formatMoney(o.amount, o.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
