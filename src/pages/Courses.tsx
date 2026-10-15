import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, courseMinutes, isLive, resumeLesson, usePublishedCourses, useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { CurrencyToggle, Portrait, Price, ProvisionalBadge, cutoutFor, useCurrency } from '../components/brand';
import { CourseCard, Curriculum, FaqList } from '../components/course';
import { Dialog, Notice, TextArea, usePageTitle, useToast } from '../components/ui';
import type { Course } from '../lib/types';
import { VideoPlayer, usePlayback } from '../components/VideoPlayer';
import { formatAccessDate, formatAccessEnd } from '../lib/dates';
import NotFound from './NotFound';

export function Courses() {
  const courses = usePublishedCourses();
  const { site } = useStore();
  usePageTitle(site.seo.courses.title || 'Courses', site.seo.courses.description);
  return (
    <>
      <section className="page-hero" data-hero>
        <div className="wrap">
          <span className="eyebrow" data-reveal>{site.courseBrand}</span>
          <h1 data-split>The <em>courses</em></h1>
          <p className="lead" data-reveal>Each course is a set of prerecorded video lessons you can follow at your own pace, with six months of access from the day you enroll.</p>
        </div>
      </section>
      <section className="section-tight">
        <div className="wrap">
          <Notice kind="warn" title="Sample course content">
            Rekha is planning three courses; the courses shown here are demo samples of how the catalogue can look. Titles, descriptions, lesson lists, prices and the sample videos (from public YouTube channels) are placeholders and have not been confirmed.
            They are not presented as a beginner-to-advanced sequence; each can be taken on its own.
          </Notice>
          <div className="row-between" style={{ margin: '28px 0 20px' }}>
            <p className="muted" style={{ margin: 0 }}>{courses.length} courses available</p>
            <CurrencyToggle />
          </div>
          {courses.length ? (
            <div className="grid grid-3" data-reveal-group>{courses.map((c, i) => <CourseCard key={c.id} course={c} headingLevel={2} index={i} />)}</div>
          ) : (
            <div className="empty"><Icon name="book" size={40} /><h2>Courses are coming soon</h2><p className="muted">Check back closer to launch.</p></div>
          )}
          <p className="muted small" style={{ marginTop: 24 }}>
            Prices can be shown in different currencies for convenience. Choosing a display currency does not guarantee that a particular payment method will be available in your country.
          </p>
        </div>
      </section>
    </>
  );
}

export function CourseDetail() {
  const { slug } = useParams();
  const { state, site, user, enrollmentFor, progressFor } = useStore();
  const { currency } = useCurrency();
  const [previewOpen, setPreviewOpen] = useState(false);
  const course = state.courses.find((c) => c.slug === slug && (c.status === 'published' || user?.role === 'admin'));
  const lessons = course ? courseLessons(course) : [];
  const preview = lessons.find((l) => l.preview);
  const playback = usePlayback(course?.id, preview);
  usePageTitle(course?.title ?? 'Course', course?.tagline);
  if (!course) return <NotFound />;

  const enr = user ? enrollmentFor(user.id, course.id) : undefined;
  const status = accessStatus(enr);
  const live = isLive(status);
  const p = user ? progressFor(user.id, course.id) : undefined;
  const resumeId = resumeLesson(course, p)?.id;
  const s = site;
  const faqs = s.faqs.filter((f) => f.published && ['Six-month access', 'Prerecorded format', 'Login and lesson access', 'Payment questions'].includes(f.category)).slice(0, 5);

  const mode = s.enrollmentMode ?? 'checkout';
  const pending = user ? state.accessRequests.find((r) => r.userId === user.id && r.courseId === course.id && r.status === 'pending') : undefined;
  const requestBtn = (primary: boolean) => (
    <RequestAccessButton course={course} primary={primary} disabled={!!pending} />
  );
  const action = live ? (
    <Link to={`/learn/${course.slug}/${resumeId}`} className="btn btn-primary btn-block">Continue learning</Link>
  ) : pending ? (
    <button type="button" className="btn btn-secondary btn-block" disabled>Access requested — awaiting approval</button>
  ) : mode === 'request' ? requestBtn(true) : (
    <Link to={`/checkout/${course.slug}`} className="btn btn-primary btn-block">{status === 'expired' ? 'Enroll again' : 'Enroll now'}</Link>
  );

  return (
    <>
      {course.status !== 'published' && <div className="wrap admin-preview-note"><Notice kind="warn">{course.status === 'draft' ? 'Draft course' : 'Archived course'} — admin preview. Visitors can’t see this page.</Notice></div>}
      <section className="detail-hero" data-hero>
        {cutoutFor(course.image) && (
          <div className="detail-figure" aria-hidden="true">
            <span className="detail-figure-ring" />
            <img src={cutoutFor(course.image)} alt="" data-reveal />
          </div>
        )}
        <div className="wrap" style={{ position: 'relative', zIndex: 1 }}>
          <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/courses">Courses</Link> / <span aria-current="page">{course.title}</span></nav>
          <div className="badge-row" style={{ marginBottom: 12 }}>
            <ProvisionalBadge show={course.titleProvisional} children="Sample title — awaiting confirmation" />
            {course.curriculumSample && <span className="badge badge-muted">Sample curriculum</span>}
          </div>
          <h1 data-split>{course.title}</h1>
          <p className="lead" data-reveal>{course.tagline}</p>
          <div className="course-meta" style={{ fontSize: '0.95rem', marginTop: 16 }}>
            <span><Icon name="user" size={16} />With {s.displayName}</span>
            <span><Icon name="video" size={16} />{lessons.length} prerecorded lessons</span>
            <span><Icon name="clock" size={16} />{courseMinutes(course)} minutes in total</span>
            <span><Icon name="calendar" size={16} />{course.accessMonths} months of access</span>
          </div>
        </div>
      </section>

      <div className="wrap section-tight">
        <div className="detail-grid">
          <div className="stack" style={{ display: 'grid', gap: 48 }}>
            <section aria-labelledby="ov">
              <h2 id="ov">Overview</h2>
              <p>{course.description}</p>
              {course.audience.length > 0 && (
                <>
                  <h3 style={{ marginTop: 24 }}>This course may suit you if…</h3>
                  <ul className="check-list">{course.audience.map((a) => <li key={a}><Icon name="check" size={18} />{a}</li>)}</ul>
                </>
              )}
            </section>

            {course.topics.length > 0 && (
              <section aria-labelledby="topics">
                <div className="row" style={{ marginBottom: 8 }}><h2 id="topics" style={{ margin: 0 }}>What you’ll explore</h2>{course.curriculumSample && <span className="badge badge-muted">Sample</span>}</div>
                <ul className="check-list grid grid-2" style={{ gap: 12 }}>{course.topics.map((t) => <li key={t}><Icon name="leaf" size={18} />{t}</li>)}</ul>
              </section>
            )}

            {/* Controlled in Admin → Courses → (course) → "Show a preview video on the course page". */}
            {course.showPreview !== false && preview && (
              <section aria-labelledby="prev">
                <h2 id="prev">Preview a lesson</h2>
                <VideoPlayer lesson={preview} src={playback.src} loading={playback.loading} label="Free preview · placeholder" />
                <p className="muted small" style={{ marginTop: 10 }}>{preview.title} · {preview.durationMin} min. {preview.description}</p>
              </section>
            )}

            <section aria-labelledby="curr">
              <div className="row" style={{ marginBottom: 8 }}><h2 id="curr" style={{ margin: 0 }}>Course curriculum</h2>{course.curriculumSample && <span className="badge badge-muted">Sample curriculum</span>}</div>
              {course.curriculumSample && <p className="muted small">Lesson titles and durations are illustrative. Rekha’s final lesson list will replace them.</p>}
              <Curriculum course={course} />
            </section>

            <section aria-labelledby="inst" className="card card-flat">
              <div className="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <div style={{ width: 96, flex: 'none' }}><Portrait small /></div>
                <div>
                  <span className="eyebrow" style={{ marginBottom: 4 }}>Your instructor</span>
                  <h2 id="inst" style={{ fontSize: '1.4rem' }}>{s.fullNameConfirmed && s.fullName.trim() ? s.fullName : s.displayName}</h2>
                  <p className="muted" style={{ margin: 0 }}>{s.aboutIntro}</p>
                  <Link to="/about" className="link-btn" style={{ display: 'inline-block', marginTop: 10 }}>More about {s.displayName}</Link>
                </div>
              </div>
            </section>

            <section aria-labelledby="access">
              <h2 id="access">How access works</h2>
              <p>Your access lasts <strong>{course.accessMonths} calendar months</strong>, starting the moment your enrollment is confirmed. During that time you can watch every lesson as often as you like, on any device.</p>
              <p className="muted">For example, if you enroll on 15 December 2026 with six months of access, it runs until 11:59 pm India time (IST) on 15 June 2027. If your start date falls on a day that doesn’t exist in the final month (such as 31 August), access ends on that month’s last day (28 or 29 February). Your exact end date and time are always shown on your dashboard.</p>
            </section>

            <section aria-labelledby="cfaq">
              <h2 id="cfaq">Questions about this course</h2>
              <FaqList items={faqs} />
            </section>
          </div>

          <aside className="detail-aside" aria-label="Enrollment">
            <div className="card enroll-card">
              <div className="row-between" style={{ marginBottom: 16 }}>
                <Price course={course} size="lg" />
                <CurrencyToggle />
              </div>
              {live && enr ? (
                <Notice kind="ok" title="You’re enrolled">
                  {status === 'scheduled' ? <>Access opens on {formatAccessDate(enr.startAt)}.</> : <>Access until {formatAccessEnd(enr.expiresAt)}.</>}
                </Notice>
              ) : status === 'expired' && enr ? (
                <Notice kind="warn" title="Your previous access has ended">Ended on {formatAccessDate(enr.expiresAt)}. You can enroll again below.</Notice>
              ) : null}
              {pending && <Notice kind="info" title="Access requested">Sent on {formatAccessDate(pending.createdAt)}. You’ll be able to start as soon as {s.displayName} approves it.</Notice>}
              <div style={{ margin: '16px 0' }}>{action}</div>
              {!live && !pending && mode === 'both' && <div style={{ margin: '-6px 0 16px' }}>{requestBtn(false)}</div>}
              <ul className="check-list small">
                <li><Icon name="check" size={16} />{lessons.length} guided video lessons</li>
                <li><Icon name="check" size={16} />{course.accessMonths} months of access</li>
                <li><Icon name="check" size={16} />Progress saved to your account</li>
                <li><Icon name="check" size={16} />Watch on phone, tablet or computer</li>
              </ul>
              {course.pricesSample && <p className="muted small" style={{ marginTop: 14, marginBottom: 0 }}>Sample price in {currency}. Final pricing will be confirmed before launch.</p>}
              <button type="button" className="link-btn small" style={{ marginTop: 10 }} onClick={() => setPreviewOpen(true)}>What’s included?</button>
            </div>
          </aside>
        </div>
      </div>

      {/* Phones: a slim enrollment bar that sits in the page flow at the end, so it never hides the last content. */}
      <div className="mobile-enroll" aria-label="Enrollment">
        <Price course={course} />
        <div style={{ minWidth: 160 }}>{action}</div>
      </div>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} title="What’s included">
        <ul className="check-list">
          <li><Icon name="check" size={18} />{lessons.length} prerecorded lessons ({courseMinutes(course)} minutes in total)</li>
          <li><Icon name="check" size={18} />Organised into {course.modules.length} modules</li>
          <li><Icon name="check" size={18} />{course.accessMonths} calendar months of access from enrollment</li>
          <li><Icon name="check" size={18} />Mark lessons complete and track your progress</li>
          <li><Icon name="check" size={18} />Revisit completed lessons any time during your access</li>
        </ul>
      </Dialog>
    </>
  );
}

/**
 * "Request access" — for students who pay Rekha directly (UPI / bank transfer). The request goes to
 * Admin → Students, where it is approved (access granted) or declined. Signed-out visitors are sent
 * to sign in / register first and come back here.
 */
function RequestAccessButton({ course, primary, disabled }: { course: Course; primary: boolean; disabled?: boolean }) {
  const { user, site, requestAccess } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const back = `/courses/${course.slug}`;

  const start = () => {
    if (!user) { nav(`/register?next=${encodeURIComponent(back)}`); return; }
    setOpen(true);
  };
  const send = async () => {
    if (busy) return;
    setBusy(true);
    const r = await requestAccess(course.id, message);
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setOpen(false);
    toast(`Request sent — ${site.displayName} will confirm your access soon`);
  };

  return (
    <>
      <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-block`} onClick={start} disabled={disabled}>
        {primary ? 'Request access' : 'Paid directly? Request access'}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Request access: ${course.title}`}
        description={`Signed in as ${user?.email ?? ''}`}
        footer={<><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></>}>
        <div className="form">
          {site.requestInstructions && <p className="muted" style={{ margin: 0 }}>{site.requestInstructions}</p>}
          <TextArea label="Message (optional)" value={message} maxLength={500} style={{ minHeight: 90 }}
            hint="For example your UPI / bank reference and the date you paid. Please don’t include card numbers or passwords."
            onChange={(e) => setMessage(e.target.value)} />
          {error && <Notice kind="err">{error}</Notice>}
          <p className="muted small" style={{ margin: 0 }}>Access starts once {site.displayName} approves your request. It then lasts {course.accessMonths} calendar months.</p>
        </div>
      </Dialog>
    </>
  );
}
