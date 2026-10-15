import { Suspense, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { accessStatus, courseLessons, currentEnrollment, progressStats, useStore } from '../../lib/store';
import { CURRENCIES, type AccessStatus, type Currency, type Enrollment, type OrderStatus, type RecordSource, type User } from '../../lib/types';
import { Icon, type IconName } from '../../components/Icon';
import { Logo, formatMoney } from '../../components/brand';
import { ConfirmDialog, Dialog, Field, Notice, PasswordField, ProgressBar, ReasonDialog, emailOk, usePageTitle, useToast } from '../../components/ui';
import { DEMO_ACCOUNTS } from '../../lib/seed';
import { IS_DEMO } from '../../lib/config';
import { DemoControls } from '../../components/Layout';
import { formatAccessDate, formatAccessEnd, formatDateTime, formatShortDate } from '../../lib/dates';
import { AccessBadge, StatusBadge } from '../Student';

const nav: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Overview', icon: 'grid', end: true },
  { to: '/admin/courses', label: 'Courses & lessons', icon: 'book' },
  { to: '/admin/students', label: 'Students', icon: 'users' },
  { to: '/admin/payments', label: 'Orders & payments', icon: 'card' },
  { to: '/admin/settings', label: 'Website settings', icon: 'settings' },
  { to: '/admin/audit', label: 'Audit history', icon: 'clock' },
];

export function AdminLayout() {
  const { user, logout, site, state } = useStore();
  const pendingRequests = state.accessRequests.filter((r) => r.status === 'pending').length;
  const go = useNavigate();
  return (
    <div className="admin-shell">
      <aside className="admin-side" aria-label="Admin navigation">
        <Link to="/" className="brand"><Logo /><span><span className="brand-name">{site.brandName}</span><span className="brand-sub">Admin</span></span></Link>
        <nav aria-label="Admin sections">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav"><Icon name={n.icon} size={18} />{n.label}
              {n.to === '/admin/students' && pendingRequests > 0 && <span className="nav-count" aria-label={`${pendingRequests} access requests waiting`}>{pendingRequests}</span>}
            </NavLink>
          ))}
          <Link to="/" className="nav"><Icon name="home" size={18} />View website</Link>
        </nav>
        <div className="side-foot">
          <span>Signed in as {user?.name}</span>
          <button type="button" className="link-btn" style={{ color: '#fff', textAlign: 'left' }} onClick={async () => { await logout(); go('/admin/login', { replace: true }); }}>Sign out</button>
        </div>
      </aside>
      <main id="main" className="admin-main">
        {IS_DEMO && (
          <div style={{ marginBottom: 20 }}>
            <Notice kind="demo">Admin preview with <strong>simulated</strong> access — this is not real security. Edits are saved in this browser only. Records marked <span className="badge badge-outline">Sample</span> are fictional; <span className="badge badge-info">Demo</span> records were created by using the demo.</Notice>
          </div>
        )}
        <Suspense fallback={<div className="locked" role="status"><span className="spinner" aria-hidden="true" /><span className="sr-only">Loading…</span></div>}><Outlet /></Suspense>
      </main>
      <DemoControls floating={false} />
    </div>
  );
}

/* ------------------------------ Admin sign-in ------------------------------ */

export function AdminLogin() {
  const { user, login, logout, site } = useStore();
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: typeof errors = {};
    if (!emailOk(email)) er.email = 'Enter your admin email address.';
    if (!password) er.password = 'Enter your password.';
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const r = await login(email, password);
    if (!r.ok) { setBusy(false); setErrors({ form: r.error }); setPassword(''); return; }
    if (r.data.role !== 'admin') {
      await logout();
      setBusy(false);
      setErrors({ form: 'This account doesn’t have admin access. Students can sign in from Student Login.' });
      return;
    }
    setBusy(false);
    toast('Welcome to the admin panel');
    go(dest, { replace: true });
  };

  return (
    <main id="main" className="admin-login">
      <div className="card auth-card">
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <Logo />
          <span><span className="brand-name">{site.brandName}</span><span className="brand-sub">Admin panel</span></span>
        </div>
        <h1 style={{ fontSize: '1.7rem' }}>Admin sign in</h1>
        <p className="muted">Manage courses, lessons, students, orders and website settings.</p>
        <form className="form" onSubmit={submit} noValidate>
          {errors.form && <Notice kind="err">{errors.form}</Notice>}
          <Field label="Email address" type="email" autoComplete="username" required value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label="Password" autoComplete="current-password" required value={password} error={errors.password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Signing in…</> : 'Sign in to admin'}
          </button>
          {IS_DEMO && (
            <div className="demo-creds">
              <strong>Demo admin</strong> (simulated — not real security): <code>{DEMO_ACCOUNTS.admin.email}</code> / <code>{DEMO_ACCOUNTS.admin.password}</code>{' '}
              <button type="button" className="link-btn small" onClick={() => { setEmail(DEMO_ACCOUNTS.admin.email); setPassword(DEMO_ACCOUNTS.admin.password); }}>Fill in</button>
            </div>
          )}
          {!IS_DEMO && <p className="muted small" style={{ margin: 0 }}>Admin accounts are provisioned by the site owner. If multi-factor authentication is enabled for your account, you’ll be asked for a code.</p>}
        </form>
        <p className="center small" style={{ marginTop: 20, marginBottom: 0 }}><Link to="/">← Back to the website</Link></p>
      </div>
    </main>
  );
}

export function SourceBadge({ source }: { source: RecordSource }) {
  if (source === 'live') return null;
  return source === 'sample' ? <span className="badge badge-outline">Sample</span> : <span className="badge badge-info">Demo</span>;
}

const totalsByCurrency = (rows: { amount: number; currency: Currency }[]) =>
  CURRENCIES.map((c) => ({ c, sum: rows.filter((r) => r.currency === c).reduce((s, r) => s + r.amount, 0), n: rows.filter((r) => r.currency === c).length })).filter((x) => x.n > 0);

/* ------------------------------ Overview ------------------------------ */

export function AdminOverview() {
  const { state } = useStore();
  usePageTitle('Admin overview');
  const students = state.users.filter((u) => u.role === 'student');
  const active = state.enrollments.filter((e) => accessStatus(e) === 'active');
  const paid = state.orders.filter((o) => o.status === 'paid');
  const totals = totalsByCurrency(paid);
  const perCourse = state.courses.filter((c) => c.status !== 'draft' || active.some((e) => e.courseId === c.id))
    .map((c) => ({ c, n: active.filter((e) => e.courseId === c.id).length }));
  const max = Math.max(1, ...perCourse.map((x) => x.n));
  const hasSample = state.users.some((u) => u.source === 'sample');

  return (
    <>
      <div className="admin-top">
        <div><h1>Overview</h1><p className="muted" style={{ margin: 0 }}>A snapshot of courses, students and orders.</p></div>
        <Link to="/admin/courses" className="btn btn-primary btn-sm"><Icon name="book" size={16} /> Manage courses</Link>
      </div>
      {state.accessRequests.some((r) => r.status === 'pending') && (
        <Notice kind="warn" title={`${state.accessRequests.filter((r) => r.status === 'pending').length} access request(s) waiting`}>
          Students have asked for access after paying directly. <Link to="/admin/students">Review requests</Link>
        </Notice>
      )}
      {hasSample && <p className="small muted"><span className="badge badge-outline">Sample statistics</span> Figures include fictional sample records created for this demo.</p>}
      <div className="grid grid-4 stat-grid">
        <div className="stat"><div className="k">Students</div><div className="v">{students.length}</div>{hasSample && <div className="s">{students.filter((u) => u.source === 'sample').length} sample · {students.filter((u) => u.source !== 'sample').length} other</div>}</div>
        <div className="stat"><div className="k">Active enrollments</div><div className="v">{active.length}</div><div className="s">{state.enrollments.length - active.length} expired, revoked or scheduled</div></div>
        <div className="stat"><div className="k">Courses</div><div className="v">{state.courses.length}</div><div className="s">{state.courses.filter((c) => c.status === 'published').length} published · {state.courses.filter((c) => c.status === 'draft').length} draft · {state.courses.filter((c) => c.status === 'archived').length} archived</div></div>
        <div className="stat"><div className="k">Successful payments</div>
          <div className="v v-money">{totals.length ? totals.map((t) => <span key={t.c}>{formatMoney(t.sum, t.c)}</span>) : '—'}</div>
          <div className="s">Totals are kept separate per currency · {paid.length} successful</div>
        </div>
      </div>
      <div className="overview-grid">
        <section className="card card-sm" aria-labelledby="chart-h">
          <h2 id="chart-h" style={{ fontSize: '1.2rem' }}>Active enrollments by course</h2>
          <ul className="bar-chart" aria-describedby="chart-h">
            {perCourse.map(({ c, n }) => (
              <li className="b" key={c.id}>
                <span className="b-label">{c.title}{c.status !== 'published' && <span className="muted small"> ({c.status})</span>}</span>
                <span className="track" aria-hidden="true"><span style={{ width: `${(n / max) * 100}%` }} /></span>
                <strong className="num">{n}<span className="sr-only"> active enrollment{n === 1 ? '' : 's'}</span></strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-sm" aria-labelledby="act-h">
          <div className="row-between"><h2 id="act-h" style={{ fontSize: '1.2rem', margin: 0 }}>Recent admin changes</h2><Link to="/admin/audit" className="small">Full audit history</Link></div>
          {state.audit.length ? (
            <ul className="activity">
              {state.audit.slice(0, 6).map((a) => (
                <li key={a.id}><span><strong>{a.actorEmail}</strong> — {a.summary}</span><time dateTime={a.at}>{formatShortDate(a.at)}</time></li>
              ))}
            </ul>
          ) : <p className="muted small">No admin changes recorded yet.</p>}
          {state.activity.length > 0 && (
            <>
              <h3 style={{ fontSize: '1rem', marginTop: 18 }}>Recent activity</h3>
              <ul className="activity">
                {state.activity.slice(0, 5).map((a) => (
                  <li key={a.id}><SourceBadge source={a.recordSource} /><span>{a.text}</span><time dateTime={a.at}>{formatShortDate(a.at)}</time></li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      {state.messages.length > 0 && (
        <section className="card card-sm" style={{ marginTop: 16 }} aria-labelledby="msg-h">
          <h2 id="msg-h" style={{ fontSize: '1.2rem' }}>Contact messages {IS_DEMO && <span className="badge badge-info">Demo — not delivered</span>}</h2>
          <ul className="activity">
            {state.messages.slice(0, 8).map((m) => (
              <li key={m.id}><span><strong>{m.name}</strong> ({m.email}): {m.message}</span><time dateTime={m.at}>{formatShortDate(m.at)}</time></li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ------------------------------ Students ------------------------------ */

type StudentFilter = 'all' | 'waiting' | 'active' | 'expired' | 'revoked' | 'none';

/** Where a student stands, for the Status column. */
function studentStatus(hasPendingRequest: boolean, ens: Enrollment[]) {
  const sts = ens.map((e) => accessStatus(e));
  if (hasPendingRequest) return { cls: 'badge-warn', label: 'Requested access', waiting: true };
  if (sts.includes('active') || sts.includes('scheduled')) return { cls: 'badge-ok', label: 'Has access', waiting: false };
  if (!ens.length) return { cls: 'badge-info', label: 'New · no access yet', waiting: true };
  return { cls: 'badge-muted', label: 'Access ended', waiting: false };
}

export function AdminStudents() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StudentFilter>('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [grantFor, setGrantFor] = useState<User | null>(null);
  usePageTitle('Students');

  const pendingByUser = useMemo(() => new Set(state.accessRequests.filter((r) => r.status === 'pending').map((r) => r.userId)), [state.accessRequests]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.users
      .filter((u) => u.role === 'student')
      .map((u) => {
        const courseIds = [...new Set(state.enrollments.filter((e) => e.userId === u.id).map((e) => e.courseId))];
        // One effective enrollment per course
        const ens = courseIds.map((cid) => currentEnrollment(state.enrollments, u.id, cid)!).filter(Boolean);
        return { u, ens, status: studentStatus(pendingByUser.has(u.id), ens) };
      })
      .filter(({ u, ens, status }) => {
        if (term && !`${u.name} ${u.email}`.toLowerCase().includes(term)) return false;
        if (filter === 'waiting') return status.waiting;
        const scoped = courseFilter === 'all' ? ens : ens.filter((e) => e.courseId === courseFilter);
        if (courseFilter !== 'all' && !scoped.length && filter !== 'none') return false;
        const sts = scoped.map((e) => accessStatus(e));
        if (filter === 'active') return sts.includes('active');
        if (filter === 'expired') return sts.includes('expired');
        if (filter === 'revoked') return sts.includes('revoked');
        if (filter === 'none') return scoped.length === 0;
        return true;
      })
      // Newest sign-ups first, so new students are easy to spot.
      .sort((a, b) => Number(b.status.waiting) - Number(a.status.waiting) || b.u.createdAt.localeCompare(a.u.createdAt));
  }, [state.users, state.enrollments, pendingByUser, q, filter, courseFilter]);

  const open = state.users.find((u) => u.id === openId) ?? null;
  const clear = () => { setQ(''); setFilter('all'); setCourseFilter('all'); };
  const waitingCount = state.users.filter((u) => u.role === 'student' && studentStatus(pendingByUser.has(u.id), state.enrollments.filter((e) => e.userId === u.id)).waiting).length;

  return (
    <>
      <div className="admin-top">
        <div><h1>Students</h1><p className="muted" style={{ margin: 0 }}>Everyone who signs up appears here automatically. Approve requests, grant access and review progress.</p></div>
      </div>
      <AccessRequestQueue />
      <div className="toolbar" role="search" aria-label="Filter students">
        <div className="field-inline">
          <label htmlFor="s-q">Search</label>
          <input id="s-q" className="input input-sm" type="search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field-inline">
          <label htmlFor="s-c">Course</label>
          <select id="s-c" className="select input-sm" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="all">All courses</option>
            {state.courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status !== 'published' ? ` (${c.status})` : ''}</option>)}
          </select>
        </div>
        <div className="field-inline">
          <label htmlFor="s-f">Access</label>
          <select id="s-f" className="select input-sm" value={filter} onChange={(e) => setFilter(e.target.value as StudentFilter)}>
            <option value="all">Any</option>
            <option value="waiting">Waiting for access ({waitingCount})</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="none">No enrollment</option>
          </select>
        </div>
        <span className="muted small" aria-live="polite">{rows.length} result{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty"><Icon name="search" size={36} /><h2 style={{ fontSize: '1.2rem' }}>No students match</h2><p className="muted">Try clearing the search or filters.</p><button type="button" className="btn btn-secondary btn-sm" onClick={clear}>Clear filters</button></div>
      ) : (
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th scope="col">Student (login email)</th><th scope="col">Status</th><th scope="col">Signed up</th><th scope="col">Courses</th><th scope="col">Next access end</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map(({ u, ens, status }) => {
                const act = ens.filter((e) => accessStatus(e) === 'active').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
                const ended = ens.length - act.length;
                return (
                  <tr key={u.id}>
                    <td data-label="Student"><strong>{u.name}</strong> <SourceBadge source={u.source} /><br /><span className="muted small">{u.email}{u.country ? ` · ${u.country}` : ''}</span></td>
                    <td data-label="Status"><span className={`badge ${status.cls}`}>{status.label}</span></td>
                    <td data-label="Signed up" style={{ whiteSpace: 'nowrap' }}>{formatShortDate(u.createdAt)}</td>
                    <td data-label="Courses">{act.length} active{ended > 0 && <span className="muted"> · {ended} ended/revoked</span>}</td>
                    <td data-label="Next access end">{act[0] ? formatAccessDate(act[0].expiresAt) : '—'}</td>
                    <td className="num">
                      <span className="row" style={{ gap: 8, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        <button type="button" className={`btn ${status.waiting ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setGrantFor(u)}>Grant access<span className="sr-only"> to {u.name}</span></button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(u.id)}>Manage<span className="sr-only"> {u.name}</span></button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ marginTop: 14 }}>Passwords are never shown to anyone — not even admins. If a student can’t sign in, open <em>Manage</em> and send them a password reset email.</p>
      {open && <StudentDialog student={open} onClose={() => setOpenId(null)} />}
      {grantFor && <QuickGrantDialog student={grantFor} onClose={() => setGrantFor(null)} />}
    </>
  );
}

/** Pending "Request access" submissions, newest first, with Approve / Decline. */
function AccessRequestQueue() {
  const { state, decideAccessRequest } = useStore();
  const toast = useToast();
  const [deciding, setDeciding] = useState<{ id: string; approve: boolean } | null>(null);
  const pending = state.accessRequests.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const req = deciding ? state.accessRequests.find((r) => r.id === deciding.id) : undefined;
  const who = (id: string) => state.users.find((u) => u.id === id);
  const course = (id: string) => state.courses.find((c) => c.id === id);

  return (
    <section className={`card card-sm request-queue ${pending.length ? 'has-items' : ''}`} aria-labelledby="rq-h">
      <div className="row-between">
        <h2 id="rq-h" style={{ fontSize: '1.15rem', margin: 0 }}>Access requests {pending.length > 0 && <span className="badge badge-warn">{pending.length} waiting</span>}</h2>
        <span className="muted small">Students who paid directly and pressed “Request access”.</span>
      </div>
      {pending.length === 0 ? <p className="muted small" style={{ margin: '8px 0 0' }}>No requests waiting.</p> : (
        <ul className="request-list">
          {pending.map((r) => {
            const u = who(r.userId);
            const c = course(r.courseId);
            return (
              <li key={r.id}>
                <div className="rq-main">
                  <strong>{u?.name ?? 'Unknown student'}</strong> <span className="muted small">{u?.email}</span> <SourceBadge source={r.recordSource} />
                  <div className="small">wants <strong>{c?.title ?? 'a course'}</strong> · {formatDateTime(r.createdAt)}</div>
                  {r.message && <div className="rq-message small">“{r.message}”</div>}
                </div>
                <span className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setDeciding({ id: r.id, approve: true })}>Approve<span className="sr-only"> {u?.name}</span></button>
                  <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setDeciding({ id: r.id, approve: false })}>Decline<span className="sr-only"> {u?.name}</span></button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {/* Mounted per decision so the pre-filled reason is there from the first frame. */}
      {deciding && <ReasonDialog
        key={`${deciding.id}-${deciding.approve}`}
        open onCancel={() => setDeciding(null)}
        title={deciding?.approve ? 'Approve and grant access?' : 'Decline this request?'}
        confirmLabel={deciding?.approve ? 'Approve & grant access' : 'Decline request'} danger={!deciding?.approve}
        defaultReason={deciding?.approve ? 'Payment received — request approved' : ''}
        message={req && <>{who(req.userId)?.name} ({who(req.userId)?.email}) — <strong>{course(req.courseId)?.title}</strong>.{' '}
          {deciding?.approve ? <>They get {course(req.courseId)?.accessMonths}-month access starting now. No online order is created.</> : <>The student will see your reason on their dashboard.</>}</>}
        onConfirm={async (reason) => {
          if (!deciding) return null;
          const r = await decideAccessRequest(deciding.id, deciding.approve, reason);
          if (!r.ok) return r.error;
          toast(deciding.approve ? 'Approved — the student can start learning now' : 'Request declined', deciding.approve ? 'ok' : 'info');
          setDeciding(null);
          return null;
        }}
      />}
    </section>
  );
}

/** One-click grant from the student list: choose a course, confirm (reason pre-filled, editable). */
function QuickGrantDialog({ student, onClose }: { student: User; onClose: () => void }) {
  const { state, grantAccess } = useStore();
  const toast = useToast();
  const options = state.courses.filter((c) => c.status !== 'archived' && !['active', 'scheduled'].includes(accessStatus(currentEnrollment(state.enrollments, student.id, c.id))));
  const requested = state.accessRequests.find((r) => r.userId === student.id && r.status === 'pending');
  const [courseId, setCourseId] = useState(requested?.courseId ?? options[0]?.id ?? '');
  const c = state.courses.find((x) => x.id === courseId);
  return (
    <ReasonDialog open onCancel={onClose} title={`Grant access to ${student.name}`} confirmLabel="Grant access"
      defaultReason="Access granted by admin"
      message={options.length ? <>Login email: <strong>{student.email}</strong>. They get {c?.accessMonths ?? 6}-month access starting now. No payment or order is created.</> : <>{student.name} already has access to every available course.</>}
      onConfirm={async (reason) => {
        if (!courseId) return 'Choose a course.';
        const r = await grantAccess(student.id, courseId, reason);
        if (!r.ok) return r.error;
        toast(`Access to “${c?.title}” granted to ${student.name}`);
        onClose();
        return null;
      }}>
      {options.length > 0 && (
        <div className="field" style={{ marginBottom: 14 }}>
          <label htmlFor="qg-course">Course</label>
          <select id="qg-course" className="select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.title}{o.status === 'draft' ? ' (draft)' : ''}{requested?.courseId === o.id ? ' — requested' : ''}</option>)}
          </select>
        </div>
      )}
    </ReasonDialog>
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
  const grantable = state.courses.filter((c) => c.status !== 'archived' && accessStatus(currentEnrollment(state.enrollments, student.id, c.id)) !== 'active');

  const confirm = async (reason: string): Promise<string | null> => {
    if (!pending) return null;
    const r = pending.kind === 'revoke' ? await revokeAccess(pending.enrollment!.id, reason)
      : pending.kind === 'restore' ? await restoreAccess(pending.enrollment!.id, reason)
        : pending.kind === 'extend' ? await extendAccess(pending.enrollment!.id, pending.months ?? 1, reason)
          : await grantAccess(student.id, pending.courseId!, reason);
    if (!r.ok) return r.error;
    toast({ revoke: 'Access revoked', restore: 'Access restored', extend: `Access extended by ${pending.months} month(s)`, grant: 'Complimentary access granted' }[pending.kind]);
    if (pending.kind === 'grant') setGrantCourse('');
    setPending(null);
    return null;
  };

  const pc = course(pending?.courseId ?? pending?.enrollment?.courseId);
  const msg = pending && ({
    revoke: <>Remove {student.name}’s access to <strong>{pc?.title}</strong>? They will no longer be able to open its lessons. Progress is kept and access can be restored.</>,
    restore: <>Restore {student.name}’s access to <strong>{pc?.title}</strong> until its current end date ({pending.enrollment && formatAccessEnd(pending.enrollment.expiresAt)})?</>,
    extend: <>Extend {student.name}’s access to <strong>{pc?.title}</strong> by {pending.months} month(s)? The extension is added to the current end date, or starts today if access has already ended.</>,
    grant: <>Give {student.name} complimentary {pc?.accessMonths}-month access to <strong>{pc?.title}</strong> starting now. This is recorded as an admin grant — no payment or order is created.</>,
  })[pending.kind];

  return (
    <Dialog open onClose={onClose} title={student.name} description={`${student.email}${student.country ? ` · ${student.country}` : ''} · joined ${formatShortDate(student.createdAt)}`} size="lg">
      {student.source === 'sample' && <Notice kind="demo">Fictional sample student.</Notice>}
      <PasswordResetBox student={student} />
      <h3 style={{ marginTop: 18 }}>Enrollments</h3>
      {ens.length === 0 && <p className="muted">No enrollments yet.</p>}
      <div className="stack">
        {ens.map((e) => {
          const c = course(e.courseId);
          if (!c) return null;
          const st = accessStatus(e);
          const p = progressFor(student.id, c.id);
          const stats = progressStats(c, p);
          const order = e.orderId ? state.orders.find((o) => o.id === e.orderId) : undefined;
          return (
            <div key={e.id} className="card card-sm card-flat">
              <div className="row-between"><strong>{c.title}</strong><AccessBadge status={st} /></div>
              <div style={{ margin: '12px 0' }}><ProgressBar value={stats.pct} label={`${stats.done} of ${stats.total} published lessons complete`} /></div>
              <dl className="kv" style={{ margin: '0 0 12px' }}>
                <div><dt>Started</dt><dd>{formatDateTime(e.startAt)}</dd></div>
                <div><dt>Access until</dt><dd>{formatAccessEnd(e.expiresAt)}</dd></div>
                <div><dt>Source</dt><dd>{e.source === 'purchase' ? <>Purchase{order && <> · <code>{order.reference}</code></>}</> : <>Complimentary{e.grantReason && <> — “{e.grantReason}”</>}</>}</dd></div>
              </dl>
              <details className="small">
                <summary style={{ cursor: 'pointer' }}>Lesson progress</summary>
                <ul className="lesson-progress">
                  {courseLessons(c).map((l) => (
                    <li key={l.id}>
                      <span className={`st ${p?.completed[l.id] ? 'done' : ''}`} aria-hidden="true">{p?.completed[l.id] ? <Icon name="check" size={12} /> : null}</span>
                      <span>{l.title}</span>
                      <span className="muted">{p?.completed[l.id] ? `Completed ${formatShortDate(p.completed[l.id])}` : 'Not completed'}{p?.lastLessonId === l.id ? ' · last opened' : ''}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="row admin-actions">
                <div className="row" style={{ gap: 8 }}>
                  <label htmlFor={`ext-${e.id}`} className="sr-only">Extension length</label>
                  <select id={`ext-${e.id}`} className="select input-sm" style={{ width: 'auto' }} value={extendMonths[e.id] ?? 1} onChange={(ev) => setExtendMonths({ ...extendMonths, [e.id]: Number(ev.target.value) })}>
                    {[1, 2, 3, 6].map((m) => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ kind: 'extend', enrollment: e, months: extendMonths[e.id] ?? 1 })}>Extend access</button>
                </div>
                {e.revoked
                  ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPending({ kind: 'restore', enrollment: e })}>Restore access</button>
                  : <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setPending({ kind: 'revoke', enrollment: e })}>Revoke access</button>}
              </div>
              <details className="small muted" style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>Access history ({e.history.length})</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{e.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} — {h.action}{h.by && <> · by {h.by}</>}{h.reason && <> · “{h.reason}”</>}</li>)}</ul>
              </details>
            </div>
          );
        })}
      </div>
      <h3 style={{ marginTop: 24 }}>Grant complimentary access</h3>
      <div className="row">
        <label htmlFor="grant" className="sr-only">Course to grant</label>
        <select id="grant" className="select input-sm" style={{ width: 'auto', minWidth: 220 }} value={grantCourse} onChange={(e) => setGrantCourse(e.target.value)}>
          <option value="">Choose a course…</option>
          {grantable.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status === 'draft' ? ' (draft)' : ''}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={!grantCourse} onClick={() => setPending({ kind: 'grant', courseId: grantCourse })}>Grant access…</button>
      </div>
      <ReasonDialog
        open={!!pending} onCancel={() => setPending(null)} onConfirm={confirm}
        title={pending?.kind === 'revoke' ? 'Revoke access?' : pending?.kind === 'restore' ? 'Restore access?' : pending?.kind === 'extend' ? 'Extend access?' : 'Grant complimentary access?'}
        confirmLabel={pending?.kind === 'revoke' ? 'Revoke access' : pending?.kind === 'grant' ? 'Grant access' : pending?.kind === 'extend' ? 'Extend access' : 'Restore access'}
        danger={pending?.kind === 'revoke'}
        message={msg}
      />
    </Dialog>
  );
}

/** Send a reset email instead of ever showing a password. */
function PasswordResetBox({ student }: { student: User }) {
  const { sendPasswordReset } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="card card-sm card-flat pw-box">
      <div className="row-between">
        <div>
          <strong>Sign-in</strong>
          <div className="small">Login email: <strong>{student.email}</strong></div>
          <div className="muted small">Passwords are stored scrambled and are never visible — not even to admins.</div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setConfirm(true)}>{busy ? 'Sending…' : 'Send password reset email'}</button>
      </div>
      {demoLink && IS_DEMO && (
        <Notice kind="demo" title="Demo: no email is sent">In production {student.email} receives this link by email: <Link to={`/reset-password/${demoLink}`}>reset link</Link> (valid for one hour).</Notice>
      )}
      <ConfirmDialog open={confirm} title="Send a password reset email?" confirmLabel="Send email"
        message={<>{student.email} will receive a link to choose a new password. Their current password keeps working until they change it.</>}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setBusy(true);
          const r = await sendPasswordReset(student.id);
          setBusy(false);
          if (!r.ok) { toast(r.error, 'err'); return; }
          setDemoLink(r.data);
          toast(`Password reset email sent to ${student.email}`);
        }} />
    </div>
  );
}

/* ------------------------------ Orders & payments ------------------------------ */

export function AdminPayments() {
  const { state } = useStore();
  const [tab, setTab] = useState<'orders' | 'grants'>('orders');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | OrderStatus>('all');
  const [course, setCourse] = useState('all');
  const [currency, setCurrency] = useState<'all' | Currency>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [source, setSource] = useState<'all' | RecordSource>('all');
  usePageTitle('Orders & payments');
  const hasSimulated = state.orders.some((o) => o.provider === 'simulated');

  const rows = state.orders
    .filter((o) => {
      const term = q.trim().toLowerCase();
      if (term && !`${o.reference} ${o.providerPaymentId ?? ''} ${o.customerName} ${o.customerEmail}`.toLowerCase().includes(term)) return false;
      if (status !== 'all' && o.status !== status) return false;
      if (course !== 'all' && o.courseId !== course) return false;
      if (currency !== 'all' && o.currency !== currency) return false;
      if (source !== 'all' && o.recordSource !== source) return false;
      if (from && o.createdAt.slice(0, 10) < from) return false;
      if (to && o.createdAt.slice(0, 10) > to) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const paidTotals = totalsByCurrency(rows.filter((o) => o.status === 'paid'));
  const grants = state.enrollments.filter((e) => e.source === 'admin-grant').sort((a, b) => b.startAt.localeCompare(a.startAt));
  const userById = (id: string) => state.users.find((u) => u.id === id);

  return (
    <>
      <div className="admin-top"><div><h1>Orders &amp; payments</h1><p className="muted" style={{ margin: 0 }}>Orders are created at checkout; their status comes only from the payment provider’s verified notifications.</p></div></div>
      {hasSimulated && <Notice kind="warn">No payment provider is connected. Every order here is either a fictional <strong>Sample</strong> or a <strong>Demo</strong> order from the simulated checkout — none are real transactions.</Notice>}
      <div className="tabs" role="tablist" aria-label="Payment records" style={{ marginTop: 16 }}>
        <button type="button" role="tab" id="pt-o" aria-selected={tab === 'orders'} aria-controls="pt-panel" onClick={() => setTab('orders')}>Orders ({state.orders.length})</button>
        <button type="button" role="tab" id="pt-g" aria-selected={tab === 'grants'} aria-controls="pt-panel" onClick={() => setTab('grants')}>Complimentary access ({grants.length})</button>
      </div>
      <div id="pt-panel" role="tabpanel" aria-labelledby={tab === 'orders' ? 'pt-o' : 'pt-g'}>
        {tab === 'orders' ? (
          <>
            <div className="toolbar" role="search" aria-label="Filter orders">
              <div className="field-inline"><label htmlFor="p-q">Search</label><input id="p-q" className="input input-sm" type="search" placeholder="Reference, name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div className="field-inline"><label htmlFor="p-s">Status</label>
                <select id="p-s" className="select input-sm" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  <option value="all">All</option><option value="paid">Successful</option><option value="pending">Pending</option><option value="failed">Failed</option>
                </select></div>
              <div className="field-inline"><label htmlFor="p-co">Course</label>
                <select id="p-co" className="select input-sm" value={course} onChange={(e) => setCourse(e.target.value)}>
                  <option value="all">All courses</option>{state.courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select></div>
              <div className="field-inline"><label htmlFor="p-c">Currency</label>
                <select id="p-c" className="select input-sm" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
                  <option value="all">All</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div className="field-inline"><label htmlFor="p-from">From</label><input id="p-from" className="input input-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="field-inline"><label htmlFor="p-to">To</label><input id="p-to" className="input input-sm" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
              {hasSimulated && (
                <div className="field-inline"><label htmlFor="p-r">Records</label>
                  <select id="p-r" className="select input-sm" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                    <option value="all">Sample + demo</option><option value="sample">Sample only</option><option value="demo">Demo checkout only</option>
                  </select></div>
              )}
            </div>
            <div className="totals-row" aria-live="polite">
              <span className="muted small">{rows.length} order{rows.length === 1 ? '' : 's'} · successful totals:</span>
              {paidTotals.length ? paidTotals.map((t) => <span key={t.c} className="badge badge-ok">{formatMoney(t.sum, t.c)} <span className="muted">({t.n})</span></span>) : <span className="muted small">none</span>}
            </div>
            {rows.length === 0 ? (
              <div className="empty"><Icon name="card" size={36} /><h2 style={{ fontSize: '1.2rem' }}>No orders match</h2><p className="muted">Try different filters.</p></div>
            ) : (
              <div className="table-wrap">
                <table className="table table-responsive">
                  <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Customer</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Enrollment</th><th scope="col" className="num">Amount</th></tr></thead>
                  <tbody>
                    {rows.map((o) => {
                      const enr = state.enrollments.find((e) => e.orderId === o.id);
                      return (
                        <tr key={o.id}>
                          <td data-label="Date" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.createdAt)}</td>
                          <td data-label="Reference"><code>{o.reference}</code><br /><span className="muted small">{o.provider === 'simulated' ? 'Simulated' : o.provider}{o.providerPaymentId ? ` · ${o.providerPaymentId}` : ''}</span> <SourceBadge source={o.recordSource} /></td>
                          <td data-label="Customer">{o.customerName}<br /><span className="muted small">{o.customerEmail}</span></td>
                          <td data-label="Course">{o.courseTitle}</td>
                          <td data-label="Status"><StatusBadge status={o.status} /></td>
                          <td data-label="Enrollment">{enr ? <><AccessBadge status={accessStatus(enr)} /><br /><span className="muted small">until {formatAccessDate(enr.expiresAt)}</span></> : o.status === 'paid' ? <span className="badge badge-warn" title="Paid while access was already active — review">Needs review</span> : <span className="muted small">None</span>}</td>
                          <td data-label="Amount" className="num">{formatMoney(o.amount, o.currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 16 }}>Status can’t be edited here: an order is marked successful only when the payment provider’s signed notification is verified by the server. Refunds are handled in the payment provider’s dashboard according to the confirmed refund policy — none is applied automatically.</p>
          </>
        ) : (
          <>
            <p className="muted small" style={{ marginTop: 16 }}>Complimentary access is granted from Students → Manage. It never creates an order or a payment, and each grant records who gave it and why.</p>
            {grants.length === 0 ? <div className="empty"><p className="muted" style={{ margin: 0 }}>No complimentary access has been granted.</p></div> : (
              <div className="table-wrap">
                <table className="table table-responsive">
                  <thead><tr><th scope="col">Granted</th><th scope="col">Student</th><th scope="col">Course</th><th scope="col">Reason</th><th scope="col">By</th><th scope="col">Access</th></tr></thead>
                  <tbody>
                    {grants.map((e) => (
                      <tr key={e.id}>
                        <td data-label="Granted">{formatDateTime(e.startAt)}</td>
                        <td data-label="Student">{userById(e.userId)?.name ?? 'Unknown'}<br /><span className="muted small">{userById(e.userId)?.email}</span></td>
                        <td data-label="Course">{state.courses.find((c) => c.id === e.courseId)?.title}</td>
                        <td data-label="Reason">{e.grantReason ?? '—'}</td>
                        <td data-label="By">{e.history[0]?.by ?? '—'}</td>
                        <td data-label="Access"><AccessBadge status={accessStatus(e)} /><br /><span className="muted small">until {formatAccessDate(e.expiresAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ Audit history ------------------------------ */

const AUDIT_GROUPS: Record<string, string> = { course: 'Courses', enrollment: 'Access', settings: 'Settings & policies', order: 'Payments', user: 'Accounts', lesson: 'Lessons', demo: 'Demo' };

export function AdminAudit() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [entity, setEntity] = useState('all');
  usePageTitle('Audit history');
  const rows = state.audit.filter((a) => (entity === 'all' || a.entity === entity)
    && (!q.trim() || `${a.summary} ${a.actorEmail} ${a.reason ?? ''} ${a.action}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <>
      <div className="admin-top"><div><h1>Audit history</h1><p className="muted" style={{ margin: 0 }}>Who changed what, when and why. Records can’t be edited or deleted from the admin panel.</p></div></div>
      {IS_DEMO && <Notice kind="demo">In the demo this history lives in your browser. In production it is written by trusted server functions, never by the browser.</Notice>}
      <div className="toolbar" role="search" aria-label="Filter audit history">
        <div className="field-inline"><label htmlFor="a-q">Search</label><input id="a-q" className="input input-sm" type="search" placeholder="Text, admin or reason" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="field-inline"><label htmlFor="a-e">Area</label>
          <select id="a-e" className="select input-sm" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="all">All</option>{Object.entries(AUDIT_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <span className="muted small" aria-live="polite">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? <div className="empty"><Icon name="clock" size={36} /><p className="muted">No changes recorded yet. Course saves, access changes and published settings appear here.</p></div> : (
        <div className="table-wrap">
          <table className="table table-responsive">
            <thead><tr><th scope="col">When</th><th scope="col">Admin</th><th scope="col">Change</th><th scope="col">Reason</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td data-label="When" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(a.at)}</td>
                  <td data-label="Admin">{a.actorEmail}</td>
                  <td data-label="Change"><span className="badge badge-muted">{AUDIT_GROUPS[a.entity] ?? a.entity}</span> {a.summary}</td>
                  <td data-label="Reason">{a.reason ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export type { AccessStatus };
