import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, progressStats, resumeLesson, useStore } from '../lib/store';
import { IS_DEMO } from '../lib/config';
import type { Course, Enrollment } from '../lib/types';
import { Icon } from '../components/Icon';
import { CourseArt, ProvisionalBadge, formatMoney } from '../components/brand';
import { Field, Notice, PasswordField, ProgressBar, emailOk, usePageTitle, useToast } from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import { ACCESS_TZ_LABEL, formatAccessDate, formatAccessEnd, formatLocalDateTime, formatShortDate, remainingLabel } from '../lib/dates';
import NotFound from './NotFound';

/* ------------------------------ Dashboard ------------------------------ */

export function Dashboard() {
  const { state, user, progressFor, enrollmentFor } = useStore();
  usePageTitle('My Courses');
  if (!user) return null;

  // One row per course: the enrollment that currently decides access.
  const courseIds = [...new Set(state.enrollments.filter((e) => e.userId === user.id).map((e) => e.courseId))];
  const order = { active: 0, scheduled: 1, expired: 2, revoked: 3, none: 4 };
  const rows = courseIds
    .map((cid) => ({ e: enrollmentFor(user.id, cid)!, c: state.courses.find((c) => c.id === cid) }))
    .filter((r): r is { e: Enrollment; c: Course } => !!r.c && !!r.e)
    .sort((a, b) => order[accessStatus(a.e)] - order[accessStatus(b.e)]);

  const resume = rows
    .filter((r) => accessStatus(r.e) === 'active')
    .map((r) => ({ ...r, p: progressFor(user.id, r.c.id) }))
    .sort((a, b) => (b.p?.updatedAt ?? '').localeCompare(a.p?.updatedAt ?? ''))[0];
  const next = resume && resumeLesson(resume.c, resume.p);
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

      {resume && next && (
        <div className="card resume-card">
          <div className="row-between">
            <div>
              <span className="eyebrow" style={{ marginBottom: 4 }}>Continue learning</span>
              <h2 style={{ fontSize: '1.35rem', margin: '0 0 4px' }}>{next.title}</h2>
              <p className="muted" style={{ margin: 0 }}>{resume.c.title} · {next.durationMin} min{resume.p?.completed[next.id] ? ' · completed' : ''}</p>
            </div>
            <Link to={`/learn/${resume.c.slug}/${next.id}`} className="btn btn-primary"><Icon name="play" size={16} /> {resume.p?.lastLessonId ? 'Resume lesson' : 'Start learning'}</Link>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: '1.5rem', marginTop: 32 }}>Your courses</h2>
      {rows.length === 0 ? (
        <div className="empty">
          <Icon name="book" size={44} />
          <h3>You haven’t enrolled in a course yet</h3>
          <p className="muted">When you enroll, your courses and progress will appear here.</p>
          <Link to="/courses" className="btn btn-primary">Explore the courses</Link>
        </div>
      ) : rows.map(({ e, c }) => <EnrolledCourse key={e.id} e={e} c={c} />)}
      <p className="muted small" style={{ marginTop: 28 }}>
        Access dates follow {ACCESS_TZ_LABEL}: access ends at 11:59 pm IST on the date shown. Progress counts the lessons currently published in each course; if new lessons are added, your percentage updates to include them.
      </p>
    </div>
  );
}

function EnrolledCourse({ e, c }: { e: Enrollment; c: Course }) {
  const { user, progressFor, site } = useStore();
  const status = accessStatus(e);
  const p = user ? progressFor(user.id, c.id) : undefined;
  const { done, total, pct } = progressStats(c, p);
  const next = resumeLesson(c, p);
  const badge = {
    active: <span className="badge badge-ok">Active</span>,
    scheduled: <span className="badge badge-info">Starts {formatAccessDate(e.startAt)}</span>,
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
        <ProgressBar value={pct} label={`${done} of ${total} lessons complete · ${total - done} remaining`} />
        <dl className="kv" style={{ margin: 0 }}>
          <div><dt>Enrolled</dt><dd>{formatAccessDate(e.startAt)}</dd></div>
          <div><dt>{status === 'expired' ? 'Access ended' : 'Access until'}</dt><dd title={`Your time: ${formatLocalDateTime(e.expiresAt)}`}>{formatAccessEnd(e.expiresAt)}</dd></div>
          <div><dt>Remaining</dt><dd>{status === 'active' ? remainingLabel(e.expiresAt) : status === 'scheduled' ? 'Not started' : '—'}</dd></div>
        </dl>
        {(status === 'expired' || status === 'revoked') && (
          <Notice kind="warn" title={status === 'expired' ? 'Your access period has ended' : 'Your access to this course has been removed'}>
            <p>Lessons are locked, but your progress is kept. If you have questions, our support team can help.</p>
            <div className="row">
              <a href={`mailto:${site.supportEmail}?subject=${encodeURIComponent(`Course access: ${c.title}`)}`} className="btn btn-secondary btn-sm"><Icon name="support" size={16} /> Contact support</a>
              {status === 'expired' && c.status === 'published' && <Link to={`/courses/${c.slug}`} className="btn btn-ghost btn-sm">View course</Link>}
            </div>
          </Notice>
        )}
        {status === 'scheduled' && <Notice kind="info">Your access opens on {formatAccessDate(e.startAt)}. We’ll email you when lessons are available.</Notice>}
      </div>
    </article>
  );
}

/* ------------------------------ Lesson ------------------------------ */

export function LessonPage() {
  const { slug, lessonId } = useParams();
  const { state, site, user, enrollmentFor, progressFor, setLessonComplete, setLastLesson, playbackUrl } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [video, setVideo] = useState<{ lessonId: string; url: string | null; error?: string } | null>(null);
  const course = state.courses.find((c) => c.slug === slug);
  const lessons = useMemo(() => (course ? courseLessons(course) : []), [course]);
  const idx = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[idx];
  const enr = user && course ? enrollmentFor(user.id, course.id) : undefined;
  const isAdmin = user?.role === 'admin';
  const status = isAdmin ? 'active' : accessStatus(enr);
  const canView = !!course && !!lesson && (status === 'active' || (lesson.preview && course.status === 'published'));
  usePageTitle(lesson ? `${lesson.title}` : 'Lesson');

  // Remember the last lesson opened (resume). Opening a lesson never marks it complete.
  useEffect(() => {
    if (course && lesson && status === 'active' && user?.role === 'student') void setLastLesson(course.id, lesson.id);
  }, [course?.id, lesson?.id, status, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask the backend for a playable URL. In production the server re-checks access every time.
  useEffect(() => {
    if (!canView || !course || !lesson) return;
    let live = true;
    setVideo(null);
    void playbackUrl(course.id, lesson.id).then((r) => {
      if (!live) return;
      setVideo(r.ok ? { lessonId: lesson.id, url: r.data } : { lessonId: lesson.id, url: null, error: r.error });
    });
    return () => { live = false; };
  }, [canView, course?.id, lesson?.id, lesson?.video?.src]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!course || (course.status === 'draft' && !isAdmin)) return <NotFound />;
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
              <p className="muted">{status === 'expired' && enr ? <>Your access ended on {formatAccessEnd(enr.expiresAt)}. </> : null}Your progress has been kept. Please contact support if you have any questions.</p>
              <div className="row" style={{ justifyContent: 'center' }}>
                <a href={`mailto:${site.supportEmail}?subject=${encodeURIComponent(`Course access: ${course.title}`)}`} className="btn btn-primary">Contact support</a>
                <Link to="/dashboard" className="btn btn-secondary">Back to dashboard</Link>
              </div>
            </>
          ) : status === 'scheduled' && enr ? (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>Lessons open soon</h1>
              <p className="muted">Your access begins on {formatAccessDate(enr.startAt)}.</p>
              <Link to="/dashboard" className="btn btn-primary">Back to dashboard</Link>
            </>
          ) : course.status !== 'published' ? (
            <>
              <h1 style={{ fontSize: '1.9rem' }}>This course isn’t available</h1>
              <p className="muted">It is no longer open for enrollment.</p>
              <Link to="/courses" className="btn btn-primary">See current courses</Link>
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
  const { done: doneCount, total, pct } = progressStats(course, p);
  const isDone = !!p?.completed[lesson.id];
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  const enrolled = status === 'active' && user?.role === 'student';
  const mod = course.modules.find((m) => m.lessons.some((l) => l.id === lesson.id));

  const toggleDone = async () => {
    if (saving) return;
    setSaving(true);
    const r = await setLessonComplete(course.id, lesson.id, !isDone);
    setSaving(false);
    if (!r.ok) { toast(r.error, 'err'); return; }
    if (!isDone) toast(next ? 'Lesson marked complete. Nicely done.' : 'Lesson marked complete — you’ve reached the final lesson!');
    else toast('Lesson marked as not complete', 'info');
  };

  return (
    <div className="wrap">
      <div className="lesson-layout">
        <div>
          <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
            {user ? <Link to="/dashboard">My Courses</Link> : <Link to="/courses">Courses</Link>} / <Link to={`/courses/${course.slug}`}>{course.title}</Link>
          </nav>
          {isAdmin && <Notice kind="info">Admin preview — progress is not recorded for admins.</Notice>}
          {!enrolled && !isAdmin && <Notice kind="info">You’re watching a free preview lesson. <Link to={`/courses/${course.slug}`}>Enroll</Link> to unlock the full course.</Notice>}
          <div style={{ marginTop: 12 }}>
            {video?.error
              ? <div className="player player-error"><Notice kind="err" title="This video can’t be played right now">{video.error}</Notice></div>
              : <VideoPlayer lesson={lesson} src={video?.lessonId === lesson.id ? video.url : undefined} loading={!video || video.lessonId !== lesson.id} />}
          </div>
          <div className="lesson-actions">
            <div>
              {enrolled ? (
                isDone ? (
                  <div className="row">
                    <span className="done-pill" role="status"><Icon name="checkCircle" /> Completed</span>
                    <button type="button" className="link-btn small" onClick={toggleDone} disabled={saving}>Mark as not complete</button>
                  </div>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={toggleDone} disabled={saving}><Icon name="check" size={18} /> {saving ? 'Saving…' : 'Mark complete'}</button>
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
          {lesson.transcript && (
            <details className="transcript">
              <summary>Transcript</summary>
              {lesson.transcript.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
            </details>
          )}
          {course.curriculumSample && <p className="muted small"><span className="badge badge-muted">Sample lesson</span> Title and description are placeholders until Rekha’s final lesson notes are added.</p>}
          {enrolled && !isDone && <p className="muted small">“Mark complete” saves your progress. Simply opening or playing a lesson does not count it as complete.</p>}
          {enrolled && enr && <p className="muted small">Your access runs until {formatAccessEnd(enr.expiresAt)}.</p>}
        </div>

        <aside className="lesson-side" aria-label="Course lessons" data-lenis-prevent>
          <div className="lesson-side-head">
            <strong style={{ display: 'block', marginBottom: 10 }}>{course.title}</strong>
            {enrolled && <ProgressBar value={pct} label={`${doneCount} of ${total} complete`} />}
          </div>
          {course.modules.map((m) => {
            const ls = m.lessons.filter((l) => l.published);
            if (!ls.length) return null;
            return (
              <div className="side-module" key={m.id}>
                <h4>{m.title}</h4>
                {ls.map((l) => {
                  const done = !!p?.completed[l.id];
                  const locked = !enrolled && !isAdmin && !l.preview;
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
  const { state, site, user, updateProfile, changePassword } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'profile' | 'password' | 'purchases' | 'access'>('profile');
  const [prof, setProf] = useState({ name: user?.name ?? '', email: user?.email ?? '', country: user?.country ?? '' });
  const [profErr, setProfErr] = useState<Record<string, string>>({});
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  usePageTitle('My account');
  if (!user) return null;

  const orders = state.orders.filter((o) => o.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const enrollments = state.enrollments.filter((e) => e.userId === user.id).sort((a, b) => b.startAt.localeCompare(a.startAt));

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    if (prof.name.trim().length < 2) er.name = 'Please enter your name.';
    if (!emailOk(prof.email)) er.email = 'Please enter a valid email address.';
    setProfErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const r = await updateProfile({ name: prof.name.trim(), email: prof.email.trim().toLowerCase(), country: prof.country.trim() });
    setBusy(false);
    if (!r.ok) { setProfErr({ form: r.error }); return; }
    toast(r.data.emailPending ? 'Profile saved. Check your new email address to confirm the change.' : 'Profile saved');
  };

  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    if (!pw.current) er.current = 'Enter your current password.';
    if (pw.next.length < 8 || !/[a-zA-Z]/.test(pw.next) || !/\d/.test(pw.next)) er.next = 'Use at least 8 characters, including a letter and a number.';
    if (pw.confirm !== pw.next) er.confirm = 'The passwords do not match.';
    setPwErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const r = await changePassword(pw.current, pw.next);
    setBusy(false);
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
            {profErr.form && <Notice kind="err">{profErr.form}</Notice>}
            <Field label="Full name" autoComplete="name" required value={prof.name} error={profErr.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} />
            <Field label="Email address" type="email" autoComplete="email" required value={prof.email} error={profErr.email}
              hint={IS_DEMO ? 'In production, changing your email requires confirming the new address.' : 'If you change it, we’ll email the new address to confirm before it takes effect.'}
              onChange={(e) => setProf({ ...prof, email: e.target.value })} />
            <Field label="Country (optional)" autoComplete="country-name" value={prof.country} onChange={(e) => setProf({ ...prof, country: e.target.value })} />
            <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
          </form>
        )}
        {tab === 'password' && (
          <form className="form" onSubmit={savePw} noValidate style={{ maxWidth: 480 }}>
            <PasswordField label="Current password" autoComplete="current-password" required value={pw.current} error={pwErr.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            <PasswordField label="New password" autoComplete="new-password" required value={pw.next} error={pwErr.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <PasswordField label="Confirm new password" autoComplete="new-password" required value={pw.confirm} error={pwErr.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            <div className="row"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</button><Link to="/forgot-password" className="small">Forgot your current password?</Link></div>
            <p className="muted small" style={{ margin: 0 }}>Passwords are managed by {IS_DEMO ? 'the (simulated) sign-in service' : 'our sign-in provider'}. Nobody at {site.brandName} can see your password.</p>
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
                  return (
                    <tr key={e.id}>
                      <td>{c?.title ?? 'Course no longer available'}{e.source === 'admin-grant' && <><br /><span className="muted small">Complimentary access</span></>}</td>
                      <td>{formatAccessDate(e.startAt)}</td>
                      <td>{formatAccessEnd(e.expiresAt)}</td>
                      <td><AccessBadge status={accessStatus(e)} /></td>
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
          <a href={`mailto:${site.supportEmail}`} className="btn btn-secondary btn-sm"><Icon name="mail" size={16} /> Email support</a>
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
    <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await logout(); toast('You have been signed out'); nav('/', { replace: true }); }}>
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
