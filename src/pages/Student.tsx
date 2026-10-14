import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, progressPercent, useStore } from '../lib/store';
import type { Course, Enrollment } from '../lib/types';
import { Icon } from '../components/Icon';
import { CourseArt, ProvisionalBadge, formatMoney } from '../components/brand';
import { Field, Notice, PasswordField, ProgressBar, emailOk, usePageTitle, useToast } from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import { formatDate, formatShortDate, remainingLabel } from '../lib/dates';
import NotFound from './NotFound';

/* ------------------------------ Dashboard ------------------------------ */

export function Dashboard() {
  const { state, user, progressFor } = useStore();
  usePageTitle('My Courses');
  if (!user) return null;

  // Latest enrollment per course
  const latest = new Map<string, Enrollment>();
  state.enrollments
    .filter((e) => e.userId === user.id)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .forEach((e) => latest.set(e.courseId, e));
  const rows = [...latest.values()]
    .map((e) => ({ e, c: state.courses.find((c) => c.id === e.courseId) }))
    .filter((r): r is { e: Enrollment; c: Course } => !!r.c)
    .sort((a, b) => {
      const order = { active: 0, scheduled: 1, expired: 2, revoked: 3, none: 4 };
      return order[accessStatus(a.e)] - order[accessStatus(b.e)];
    });

  const active = rows.filter((r) => accessStatus(r.e) === 'active');
  const resume = active
    .map((r) => ({ ...r, p: progressFor(user.id, r.c.id) }))
    .sort((a, b) => (b.p?.updatedAt ?? '').localeCompare(a.p?.updatedAt ?? ''))[0];
  const resumeLesson = resume && (courseLessons(resume.c).find((l) => l.id === resume.p?.lastLessonId) ?? courseLessons(resume.c)[0]);
  const firstName = user.name.split(' ')[0];

  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <div className="dash-head row-between">
        <div>
          <span className="eyebrow">Student dashboard</span>
          <h1 style={{ fontSize: 'clamp(1.8rem, 1.4rem + 1.5vw, 2.5rem)' }}>Welcome, {firstName}</h1>
          <p className="muted" style={{ margin: 0 }}>Make a little time for yourself today.</p>
        </div>
        <div className="row">
          <Link to="/account" className="btn btn-secondary btn-sm"><Icon name="settings" size={16} /> Account</Link>
          <SignOutButton />
        </div>
      </div>

      {resume && resumeLesson && (
        <div className="card" style={{ margin: '24px 0 36px', background: 'var(--sage-soft)', borderColor: '#cddbc9' }}>
          <div className="row-between">
            <div>
              <span className="eyebrow" style={{ marginBottom: 4 }}>Continue learning</span>
              <h2 style={{ fontSize: '1.35rem', margin: '0 0 4px' }}>{resumeLesson.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{resume.c.title} · {resumeLesson.durationMin} min</p>
            </div>
            <Link to={`/learn/${resume.c.slug}/${resumeLesson.id}`} className="btn btn-primary"><Icon name="play" size={16} /> Resume lesson</Link>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.5rem', marginTop: 32 }}>Your courses</h2>
      {rows.length === 0 ? (
        <div className="empty">
          <Icon name="book" size={44} />
          <h3>You haven’t enrolled in a course yet</h3>
          <p className="muted">When you enroll, your courses and progress will appear here.</p>
          <Link to="/courses" className="btn btn-primary">Explore the Courses</Link>
        </div>
      ) : rows.map(({ e, c }) => <EnrolledCourse key={e.id} e={e} c={c} />)}

      {rows.length > 0 && (
        <p className="center" style={{ marginTop: 36 }}><Link to="/courses">Browse other courses</Link></p>
      )}
    </div>
  );
}

function EnrolledCourse({ e, c }: { e: Enrollment; c: Course }) {
  const { user, progressFor, state } = useStore();
  const status = accessStatus(e);
  const lessons = courseLessons(c);
  const p = user ? progressFor(user.id, c.id) : undefined;
  const pct = progressPercent(c, p);
  const done = lessons.filter((l) => p?.completed.includes(l.id)).length;
  const next = lessons.find((l) => l.id === p?.lastLessonId) ?? lessons.find((l) => !p?.completed.includes(l.id)) ?? lessons[0];
  const badge = {
    active: <span className="badge badge-ok">Active</span>,
    scheduled: <span className="badge badge-info">Starts {formatShortDate(e.startAt)}</span>,
    expired: <span className="badge badge-err">Access ended</span>,
    revoked: <span className="badge badge-err">Access removed</span>,
    none: null,
  }[status];

  return (
    <article className="enroll-card-row">
      <CourseArt course={c} label={false} />
      <div className="enroll-card-body">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="badge-row" style={{ marginBottom: 6 }}>{badge}<ProvisionalBadge show={c.titleProvisional} children="Sample title" /></div>
            <h3 style={{ margin: 0 }}>{c.title}</h3>
          </div>
          {status === 'active' && next && <Link to={`/learn/${c.slug}/${next.id}`} className="btn btn-primary btn-sm">{pct === 0 ? 'Start course' : pct === 100 ? 'Review lessons' : 'Continue learning'}</Link>}
        </div>
        <ProgressBar value={pct} label={`${done} of ${lessons.length} lessons complete · ${lessons.length - done} remaining`} />
        <dl className="kv" style={{ margin: 0 }}>
          <div><dt>Enrolled</dt><dd>{formatDate(e.startAt)}</dd></div>
          <div><dt>{status === 'expired' ? 'Access ended' : 'Access until'}</dt><dd>{formatDate(e.expiresAt)}</dd></div>
          <div><dt>Remaining</dt><dd>{status === 'active' ? remainingLabel(e.expiresAt) : status === 'scheduled' ? 'Not started' : '—'}</dd></div>
        </dl>
        {(status === 'expired' || status === 'revoked') && (
          <Notice kind="warn" title={status === 'expired' ? 'Your six months of access has ended' : 'Your access to this course has been removed'}>
            <p>Lessons are locked, but your progress is kept. If you have questions, our support team can help.</p>
            <div className="row">
              <a href={`mailto:${state.settings.supportEmail}?subject=${encodeURIComponent(`Course access: ${c.title}`)}`} className="btn btn-secondary btn-sm"><Icon name="support" size={16} /> Contact support</a>
              {status === 'expired' && <Link to={`/courses/${c.slug}`} className="btn btn-ghost btn-sm">View course</Link>}
            </div>
          </Notice>
        )}
        {status === 'scheduled' && <Notice kind="info">Your access opens on {formatDate(e.startAt)}. We’ll email you when lessons are available.</Notice>}
      </div>
    </article>
  );
}

/* ------------------------------ Lesson ------------------------------ */

export function LessonPage() {
  const { slug, lessonId } = useParams();
  const { state, user, enrollmentFor, progressFor, setLessonComplete, setLastLesson } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const course = state.courses.find((c) => c.slug === slug);
  const lessons = useMemo(() => (course ? courseLessons(course) : []), [course]);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[idx];
  const enr = user && course ? enrollmentFor(user.id, course.id) : undefined;
  const status = user?.role === 'admin' ? 'active' : accessStatus(enr);
  const canView = status === 'active' || (lesson?.preview ?? false);
  usePageTitle(lesson ? `${lesson.title}` : 'Lesson');

  // Remember the last lesson viewed (resume). Opening a lesson never marks it complete.
  useEffect(() => {
    if (course && lesson && status === 'active' && user?.role === 'student') setLastLesson(course.id, lesson.id);
  }, [course, lesson, status, user, setLastLesson]);

  if (!course || (course.status !== 'published' && user?.role !== 'admin')) return <NotFound />;
  if (!lesson) {
    // Unknown or unpublished lesson: send them to the first lesson.
    return lessons[0] ? <RedirectTo to={`/learn/${course.slug}/${lessons[0].id}`} /> : <NotFound />;
  }

  if (!canView) {
    return (
      <div className="wrap">
        <div className="locked">
          <div className="lock-icon"><Icon name="lock" size={32} /></div>
          {status === 'expired' || status === 'revoked' ? (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>{status === 'expired' ? 'Your access to this course has ended' : 'Your access has been removed'}</h1>
              <p className="muted">{status === 'expired' && enr ? <>Your access ended on {formatDate(enr.expiresAt)}. </> : null}Your progress has been kept. Please contact support if you have any questions.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <a href={`mailto:${state.settings.supportEmail}`} className="btn btn-primary">Contact support</a>
                <Link to="/dashboard" className="btn btn-secondary">Back to dashboard</Link>
              </div>
            </>
          ) : status === 'scheduled' && enr ? (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>Lessons open soon</h1>
              <p className="muted">Your access begins on {formatDate(enr.startAt)}.</p>
              <Link to="/dashboard" className="btn btn-primary">Back to dashboard</Link>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>This lesson is part of {course.title}</h1>
              <p className="muted">Enroll to unlock every lesson, track your progress and enjoy {course.accessMonths} months of access.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <Link to={`/courses/${course.slug}`} className="btn btn-primary">View course &amp; enroll</Link>
                {!user && <Link to={`/login?next=${encodeURIComponent(`/learn/${course.slug}/${lesson.id}`)}`} className="btn btn-secondary">Sign in</Link>}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const p = user ? progressFor(user.id, course.id) : undefined;
  const pct = progressPercent(course, p);
  const isDone = !!p?.completed.includes(lesson.id);
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const enrolled = status === 'active' && user?.role === 'student';
  const mod = course.modules.find((m) => m.lessons.some((l) => l.id === lesson.id));

  const toggleDone = () => {
    const r = setLessonComplete(course.id, lesson.id, !isDone);
    if (!r.ok) { toast(r.error, 'err'); return; }
    if (!isDone) {
      toast(next ? 'Lesson marked complete. Nicely done.' : 'Lesson marked complete — you’ve reached the final lesson!');
    } else toast('Lesson marked as not complete', 'info');
  };

  return (
    <div className="wrap">
      <div className="lesson-layout">
        <div>
          <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
            <Link to="/dashboard">My Courses</Link> / <Link to={`/courses/${course.slug}`}>{course.title}</Link>
          </nav>
          {user?.role === 'admin' && <Notice kind="info">Admin preview — progress is not recorded for admins.</Notice>}
          {!enrolled && user?.role !== 'admin' && <Notice kind="info">You’re watching a free preview lesson. <Link to={`/courses/${course.slug}`}>Enroll</Link> to unlock the full course.</Notice>}
          <div style={{ marginTop: 12 }}><VideoPlayer lesson={lesson} /></div>
          <div className="lesson-actions">
            <div>
              {enrolled ? (
                isDone ? (
                  <div className="row">
                    <span className="done-pill" role="status"><Icon name="checkCircle" /> Completed</span>
                    <button type="button" className="link-btn small" onClick={toggleDone}>Mark as not complete</button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={toggleDone}><Icon name="check" size={18} /> Mark complete</button>
                )
              ) : null}
            </div>
            <div className="lesson-nav">
              <button type="button" className="btn btn-secondary btn-sm" disabled={!prev} onClick={() => prev && nav(`/learn/${course.slug}/${prev.id}`)}>
                <Icon name="chevronLeft" size={16} /> Previous
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!next} onClick={() => next && nav(`/learn/${course.slug}/${next.id}`)}>
                Next lesson <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
          <span className="eyebrow">{mod?.title} · Lesson {idx + 1} of {lessons.length}</span>
          <h1 style={{ fontSize: 'clamp(1.6rem, 1.3rem + 1vw, 2.1rem)' }}>{lesson.title}</h1>
          <p className="row muted small" style={{ gap: 6 }}><Icon name="clock" size={16} /> {lesson.durationMin} minutes</p>
          <p>{lesson.description}</p>
          {course.curriculumSample && <p className="muted small"><span className="badge badge-muted">Sample lesson</span> Title and description are placeholders until Rekha’s final lesson notes are added.</p>}
          {enrolled && !isDone && next && <p className="muted small">Tip: “Mark complete” saves your progress. Simply opening a lesson does not count it as complete.</p>}
          {enrolled && enr && <p className="muted small">Your access runs until {formatDate(enr.expiresAt)}.</p>}
        </div>

        <aside className="lesson-side" aria-label="Course lessons" data-lenis-prevent>
          <div className="lesson-side-head">
            <strong style={{ display: 'block', marginBottom: 10 }}>{course.title}</strong>
            {enrolled && <ProgressBar value={pct} label={`${p?.completed.filter((id) => lessons.some((l) => l.id === id)).length ?? 0} of ${lessons.length} complete`} />}
          </div>
          {course.modules.map((m) => {
            const ls = m.lessons.filter((l) => l.published);
            if (!ls.length) return null;
            return (
              <div className="side-module" key={m.id}>
                <h4>{m.title}</h4>
                {ls.map((l) => {
                  const done = !!p?.completed.includes(l.id);
                  const locked = !enrolled && user?.role !== 'admin' && !l.preview;
                  return (
                    <Link key={l.id} to={`/learn/${course.slug}/${l.id}`} className="side-lesson" aria-current={l.id === lesson.id ? 'page' : undefined}>
                      <span className={`st ${done ? 'done' : ''}`} aria-hidden="true">{done ? <Icon name="check" size={13} /> : locked ? <Icon name="lock" size={12} /> : null}</span>
                      <span>{l.title}<span className="sr-only">{done ? ' (completed)' : locked ? ' (locked)' : ''}</span></span>
                      <span className="d">{l.durationMin} min</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function RedirectTo({ to }: { to: string }) {
  const nav = useNavigate();
  useEffect(() => { nav(to, { replace: true }); }, [nav, to]);
  return null;
}

/* ------------------------------ Account ------------------------------ */

export function Account() {
  const { state, user, updateProfile, changePassword } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'profile' | 'password' | 'purchases' | 'access'>('profile');
  const [prof, setProf] = useState({ name: user?.name ?? '', email: user?.email ?? '', country: user?.country ?? '' });
  const [profErr, setProfErr] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  usePageTitle('My account');
  if (!user) return null;

  const orders = state.orders.filter((o) => o.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const enrollments = state.enrollments.filter((e) => e.userId === user.id).sort((a, b) => b.startAt.localeCompare(a.startAt));

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (prof.name.trim().length < 2) er.name = 'Please enter your name.';
    if (!emailOk(prof.email)) er.email = 'Please enter a valid email address.';
    setProfErr(er);
    if (Object.keys(er).length) return;
    const r = updateProfile({ name: prof.name.trim(), email: prof.email.trim().toLowerCase(), country: prof.country.trim() || undefined });
    if (!r.ok) { setProfErr({ email: r.error }); return; }
    toast('Profile saved');
  };

  const savePw = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!pw.current) er.current = 'Enter your current password.';
    if (pw.next.length < 8 || !/[a-zA-Z]/.test(pw.next) || !/\d/.test(pw.next)) er.next = 'Use at least 8 characters, including a letter and a number.';
    if (pw.confirm !== pw.next) er.confirm = 'The passwords do not match.';
    setPwErr(er);
    if (Object.keys(er).length) return;
    const r = changePassword(pw.current, pw.next);
    if (!r.ok) { setPwErr({ current: r.error }); return; }
    setPw({ current: '', next: '', confirm: '' });
    toast('Password updated');
  };

  const tabs = [
    ['profile', 'Profile'], ['password', 'Password'], ['purchases', 'Purchase history'], ['access', 'Course access'],
  ] as const;

  return (
    <div className="wrap" style={{ maxWidth: 880, paddingBottom: 72 }}>
      <div className="dash-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/dashboard">My Courses</Link> / <span aria-current="page">Account</span></nav>
        <div className="row-between">
          <h1 style={{ fontSize: 'clamp(2.2rem, 1.6rem + 1.5vw, 3rem)', margin: 0 }}>My account</h1>
          <SignOutButton />
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Account sections">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={`acc-${k}`} aria-selected={tab === k} aria-controls="acc-panel" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div id="acc-panel" role="tabpanel" aria-labelledby={`acc-${tab}`} className="card">
        {tab === 'profile' && (
          <form className="form" onSubmit={saveProfile} noValidate style={{ maxWidth: 480 }}>
            <Field label="Full name" autoComplete="name" required value={prof.name} error={profErr.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} />
            <Field label="Email address" type="email" autoComplete="email" required value={prof.email} error={profErr.email} hint="In production, changing your email requires confirming the new address." onChange={(e) => setProf({ ...prof, email: e.target.value })} />
            <Field label="Country (optional)" autoComplete="country-name" value={prof.country} onChange={(e) => setProf({ ...prof, country: e.target.value })} />
            <div><button type="submit" className="btn btn-primary">Save profile</button></div>
          </form>
        )}
        {tab === 'password' && (
          <form className="form" onSubmit={savePw} noValidate style={{ maxWidth: 480 }}>
            <PasswordField label="Current password" autoComplete="current-password" required value={pw.current} error={pwErr.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <PasswordField label="New password" autoComplete="new-password" required value={pw.next} error={pwErr.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <PasswordField label="Confirm new password" autoComplete="new-password" required value={pw.confirm} error={pwErr.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <div className="row"><button type="submit" className="btn btn-primary">Update password</button><Link to="/forgot-password" className="small">Forgot your current password?</Link></div>
          </form>
        )}
        {tab === 'purchases' && (orders.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Date</th><th scope="col">Course</th><th scope="col">Reference</th><th scope="col">Status</th><th scope="col" className="num">Amount</th></tr></thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{formatShortDate(o.createdAt)}</td>
                    <td>{o.courseTitle}</td>
                    <td><code>{o.reference}</code></td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="num">{formatMoney(o.amount, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>No purchases yet.</p>)}
        {tab === 'access' && (enrollments.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Course</th><th scope="col">Started</th><th scope="col">Access until</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {enrollments.map((e) => {
                  const c = state.courses.find((x) => x.id === e.courseId);
                  const st = accessStatus(e);
                  return (
                    <tr key={e.id}>
                      <td>{c?.title ?? 'Removed course'}</td>
                      <td>{formatShortDate(e.startAt)}</td>
                      <td>{formatShortDate(e.expiresAt)}</td>
                      <td><AccessBadge status={st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted" style={{ margin: 0 }}>You don’t have any course access yet.</p>)}
      </div>
      <div className="card card-sm card-flat row-between" style={{ marginTop: 24 }}>
        <div><strong>Need help?</strong><br /><span className="muted small">Questions about lessons, access or payments.</span></div>
        <div className="row">
          <a href={`mailto:${state.settings.supportEmail}`} className="btn btn-secondary btn-sm"><Icon name="mail" size={16} /> Email support</a>
          <Link to="/faq" className="btn btn-ghost btn-sm">FAQ</Link>
        </div>
      </div>
    </div>
  );
}

function SignOutButton() {
  const { logout } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => { logout(); toast('You have been signed out'); nav('/'); }}>
      <Icon name="logout" size={16} /> Sign out
    </button>
  );
}

export function StatusBadge({ status }: { status: 'paid' | 'failed' | 'pending' }) {
  return status === 'paid' ? <span className="badge badge-ok">Successful</span>
    : status === 'failed' ? <span className="badge badge-err">Failed</span>
      : <span className="badge badge-warn">Pending</span>;
}

export function AccessBadge({ status }: { status: ReturnType<typeof accessStatus> }) {
  const map = {
    active: ['badge-ok', 'Active'], scheduled: ['badge-info', 'Scheduled'], expired: ['badge-err', 'Expired'],
    revoked: ['badge-err', 'Revoked'], none: ['badge-muted', 'No access'],
  } as const;
  const [cls, label] = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
