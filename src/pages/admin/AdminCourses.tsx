import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, courseMinutes, useStore } from '../../lib/store';
import { CURRENCIES, type ArtTone, type Course, type Currency, type Lesson, type Module } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { CourseArt, formatMoney } from '../../components/brand';
import { ConfirmDialog, Dialog, Field, Notice, TextArea, usePageTitle, useToast } from '../../components/ui';
import { validateCourse } from '../../lib/demo/engine';
import { CURRENCY_NAME, parseMajor, toMajorString } from '../../lib/money';
import { IS_DEMO, PRODUCTION_CONFIG } from '../../lib/config';
import { sessionUploads } from '../../lib/uploads';
import { driveEmbed, parseDrive, parseYouTube, youTubeEmbed } from '../../lib/videoLinks';
import type { LessonVideo } from '../../lib/types';
import { formatShortDate } from '../../lib/dates';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const STATUS_BADGE = { published: ['badge-ok', 'Published'], draft: ['badge-muted', 'Draft'], archived: ['badge-warn', 'Archived'] } as const;

export function AdminCourses() {
  const { state, site, createCourse } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  usePageTitle('Courses');
  return (
    <>
      <div className="admin-top">
        <div><h1>Courses &amp; lessons</h1><p className="muted" style={{ margin: 0 }}>Create courses, organise modules and lessons, attach videos and set prices.</p></div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
          setBusy(true);
          const r = await createCourse();
          setBusy(false);
          if (!r.ok) { toast(r.error, 'err'); return; }
          toast('Draft course created');
          nav(`/admin/courses/${r.data.id}`);
        }}>
          <Icon name="plus" size={16} /> New course
        </button>
      </div>
      <div className="table-wrap">
        <table className="table table-responsive">
          <thead><tr><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Lessons</th><th scope="col">Videos</th><th scope="col">Prices</th><th scope="col">Active students</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {state.courses.map((c) => {
              const all = courseLessons(c, true);
              const withVideo = all.filter((l) => l.video).length;
              const [cls, label] = STATUS_BADGE[c.status];
              return (
                <tr key={c.id}>
                  <td data-label="Course"><strong>{c.title}</strong>{c.titleProvisional && <> <span className="badge badge-warn">Provisional</span></>}<br /><span className="muted small">/courses/{c.slug}</span></td>
                  <td data-label="Status"><span className={`badge ${cls}`}>{label}</span></td>
                  <td data-label="Lessons">{all.length} <span className="muted small">({all.filter((l) => !l.published).length} unpublished)</span></td>
                  <td data-label="Videos">{withVideo} / {all.length}</td>
                  <td data-label="Prices" style={{ whiteSpace: 'nowrap' }}>
                    {site.displayCurrencies.map((cur) => <div key={cur}>{c.prices[cur] !== undefined ? formatMoney(c.prices[cur]!, cur) : <span className="muted">No {cur} price</span>}</div>)}
                    {c.pricesSample && <span className="badge badge-outline">Sample</span>}
                  </td>
                  <td data-label="Active students">{state.enrollments.filter((e) => e.courseId === c.id && accessStatus(e) === 'active').length}</td>
                  <td data-label="Updated" style={{ whiteSpace: 'nowrap' }}>{formatShortDate(c.updatedAt)}</td>
                  <td className="num"><Link to={`/admin/courses/${c.id}`} className="btn btn-secondary btn-sm">Edit<span className="sr-only"> {c.title}</span></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>Rekha plans three courses; their final titles and curricula are not confirmed. Lesson counts here are samples, not a commitment to a particular number of videos per course.</p>
    </>
  );
}

type PriceText = Partial<Record<Currency, string>>;
const priceTextOf = (c: Course): PriceText => Object.fromEntries(CURRENCIES.map((cur) => [cur, toMajorString(c.prices[cur], cur)]));

export function AdminCourseEditor() {
  const { id } = useParams();
  const { state, site, saveCourse, deleteCourse, uploadImage } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const original = state.courses.find((c) => c.id === id);
  const [draft, setDraft] = useState<Course | null>(original ?? null);
  const [priceText, setPriceText] = useState<PriceText>(() => (original ? priceTextOf(original) : {}));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [editing, setEditing] = useState<{ moduleId: string; lesson: Lesson; isNew: boolean } | null>(null);
  const [confirmDel, setConfirmDel] = useState<null | { kind: 'course' } | { kind: 'module'; id: string } | { kind: 'lesson'; moduleId: string; id: string }>(null);
  usePageTitle(draft ? `Edit: ${draft.title}` : 'Edit course');

  useEffect(() => { if (original && !draft) { setDraft(original); setPriceText(priceTextOf(original)); } }, [original, draft]);

  // Prices are edited as text and converted to integer minor units.
  const withPrices = (c: Course): Course => {
    const prices: Course['prices'] = {};
    for (const cur of CURRENCIES) {
      const t = (priceText[cur] ?? '').trim();
      if (!t) continue;
      const v = parseMajor(t, cur);
      prices[cur] = v === null ? -1 : v;
    }
    return { ...c, prices };
  };
  const normalised = draft ? withPrices(draft) : null;
  const dirty = !!normalised && !!original && JSON.stringify({ ...normalised, updatedAt: '' }) !== JSON.stringify({ ...original, updatedAt: '' });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  if (!original || !draft || !normalised) {
    return <div className="empty"><h1 style={{ fontSize: '1.4rem' }}>Course not found</h1><Link to="/admin/courses" className="btn btn-secondary btn-sm">Back to courses</Link></div>;
  }

  const set = <K extends keyof Course>(k: K, v: Course[K]) => setDraft({ ...draft, [k]: v });
  const setModules = (modules: Module[]) => setDraft({ ...draft, modules });
  const enrolledCount = state.enrollments.filter((e) => e.courseId === draft.id).length;
  const orderCount = state.orders.filter((o) => o.courseId === draft.id).length;
  const activeCount = state.enrollments.filter((e) => e.courseId === draft.id && accessStatus(e) === 'active').length;
  const completionsFor = (lessonId: string) => Object.entries(state.progress).filter(([k, p]) => k.endsWith(`:${draft.id}`) && p.completed[lessonId]).length;

  const save = async () => {
    const er = validateCourse(state, normalised);
    for (const cur of CURRENCIES) if (normalised.prices[cur] === -1) er[`price_${cur}`] = 'Enter an amount like 3499 or 59.99.';
    setErrors(er);
    if (Object.keys(er).length) {
      toast('Please fix the highlighted fields', 'err');
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    const r = await saveCourse(normalised);
    setSaving(false);
    if (!r.ok) { setErrors({ form: r.error }); toast(r.error, 'err'); return; }
    setDraft(r.data);
    setPriceText(priceTextOf(r.data));
    toast(r.data.status === 'published' ? 'Course saved — the website has been updated' : 'Course saved');
  };

  const onImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImgBusy(true);
    const r = await uploadImage(f, 'course');
    setImgBusy(false);
    if (!r.ok) { setErrors({ ...errors, image: r.error }); return; }
    setDraft((d) => (d ? { ...d, image: r.data, imageAlt: '' } : d));
    setErrors({ ...errors, image: '', imageAlt: 'Describe the new image for screen-reader users.' });
  };

  const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const copy = arr.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };

  const updateModule = (mid: string, fn: (m: Module) => Module) => setModules(draft.modules.map((m) => (m.id === mid ? fn(m) : m)));

  const doDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.kind === 'course') {
      const r = await deleteCourse(draft.id);
      setConfirmDel(null);
      if (!r.ok) { toast(r.error, 'err'); return; }
      toast('Course deleted');
      setDraft(null);
      nav('/admin/courses', { replace: true });
      return;
    }
    if (confirmDel.kind === 'module') setModules(draft.modules.filter((m) => m.id !== confirmDel.id));
    if (confirmDel.kind === 'lesson') updateModule(confirmDel.moduleId, (m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== confirmDel.id) }));
    setConfirmDel(null);
  };

  const listInput = (label: string, key: 'audience' | 'topics', hint: string) => (
    <TextArea label={label} hint={hint} value={draft[key].join('\n')} style={{ minHeight: 110 }}
      onChange={(e) => set(key, e.target.value.split('\n').map((x) => x.replace(/^\s+/, '')).filter((x, i, a) => x || i < a.length - 1))} />
  );

  const delLesson = confirmDel?.kind === 'lesson' ? draft.modules.find((m) => m.id === confirmDel.moduleId)?.lessons.find((l) => l.id === confirmDel.id) : undefined;
  const delModule = confirmDel?.kind === 'module' ? draft.modules.find((m) => m.id === confirmDel.id) : undefined;
  const delModuleCompletions = delModule ? delModule.lessons.reduce((s, l) => s + completionsFor(l.id), 0) : 0;
  const delLessonCompletions = delLesson ? completionsFor(delLesson.id) : 0;

  return (
    <>
      <div className="admin-top admin-top-sticky">
        <div>
          <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 6 }}><Link to="/admin/courses">Courses</Link> / <span aria-current="page">Edit</span></nav>
          <h1>{draft.title || 'Untitled course'} <span className={`badge ${STATUS_BADGE[original.status][0]}`} style={{ verticalAlign: 'middle' }}>{STATUS_BADGE[original.status][1]}</span></h1>
          <p className={`small ${dirty ? 'unsaved' : 'muted'}`} style={{ margin: 0 }} aria-live="polite">{dirty ? '● Unsaved changes' : 'All changes saved.'}</p>
        </div>
        <div className="row">
          <a href={`${import.meta.env.BASE_URL}courses/${original.slug}`} className="btn btn-ghost btn-sm" target="_blank" rel="noopener"><Icon name="external" size={16} /> {original.status === 'published' ? 'View live page' : 'Preview page'}</a>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || saving} onClick={() => { setDraft(original); setPriceText(priceTextOf(original)); setErrors({}); }}>Discard changes</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save course'}</button>
        </div>
      </div>
      {errors.form && <Notice kind="err" title="The course was not saved">{errors.form}</Notice>}
      {dirty && <p className="muted small">The preview page shows the last <strong>saved</strong> version. Save to see your changes there.</p>}

      <div className="editor-stack">
        <section className="card" aria-labelledby="ce-basics">
          <h2 id="ce-basics" style={{ fontSize: '1.25rem' }}>Details</h2>
          <div className="form">
            <div className="form-row">
              <Field label="Course title" required value={draft.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
              <Field label="Web address (slug)" required value={draft.slug} error={errors.slug}
                hint={enrolledCount ? `/courses/${draft.slug} — changing this breaks links students may have saved.` : `/courses/${draft.slug}`}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
            </div>
            <label className="check"><input type="checkbox" checked={draft.titleProvisional} onChange={(e) => set('titleProvisional', e.target.checked)} /><span>Title is provisional (shows a “Sample title” label on the website)</span></label>
            <Field label="Short description" hint="One sentence for course cards and the top of the course page." value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            <TextArea label="Overview" hint="Describe the practice honestly. Avoid medical claims or promises about appearance." value={draft.description} onChange={(e) => set('description', e.target.value)} />
            <div className="form-row">
              {listInput('Intended audience', 'audience', 'One point per line.')}
              {listInput('Learning topics', 'topics', 'One topic per line.')}
            </div>
            <label className="check"><input type="checkbox" checked={draft.curriculumSample} onChange={(e) => set('curriculumSample', e.target.checked)} /><span>Curriculum is a sample (shows “Sample curriculum” labels)</span></label>
          </div>
        </section>

        <section className="card" aria-labelledby="ce-img">
          <h2 id="ce-img" style={{ fontSize: '1.25rem' }}>Course image</h2>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div className="ce-img-preview"><CourseArt course={draft} /></div>
            <div className="stack" style={{ flex: 1, minWidth: 220 }}>
              <div className="row">
                <label className={`btn btn-secondary btn-sm ${imgBusy ? 'is-busy' : ''}`} style={{ cursor: 'pointer' }}>
                  <Icon name="upload" size={16} /> {imgBusy ? 'Uploading…' : draft.image ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onImage} disabled={imgBusy} />
                </label>
                {draft.image && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, image: undefined, imageAlt: '' })}>Remove image</button>}
              </div>
              {errors.image && <span className="error" role="alert">{errors.image}</span>}
              {draft.image ? (
                <Field label="Image description (alt text)" required value={draft.imageAlt} error={errors.imageAlt}
                  hint="What the image shows, e.g. “Rekha demonstrating a seated breathing practice”. Label placeholders as placeholders."
                  onChange={(e) => set('imageAlt', e.target.value)} />
              ) : (
                <div className="field">
                  <span className="label">Placeholder artwork colour</span>
                  <div className="row">
                    {(['sage', 'rose', 'sand'] as ArtTone[]).map((t) => (
                      <label key={t} className="check" style={{ textTransform: 'capitalize' }}><input type="radio" name="art" checked={draft.art === t} onChange={() => set('art', t)} />{t}</label>
                    ))}
                  </div>
                </div>
              )}
              <p className="muted small" style={{ margin: 0 }}>Use client-approved photography only. Never present stock or AI-generated images of people as Rekha.</p>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="ce-price">
          <h2 id="ce-price" style={{ fontSize: '1.25rem' }}>Pricing, access &amp; status</h2>
          <div className="form">
            <div className="form-row form-row-3">
              {CURRENCIES.map((cur) => {
                const offered = site.displayCurrencies.includes(cur);
                return (
                  <Field key={cur} label={`Price in ${cur}`} inputMode="decimal" value={priceText[cur] ?? ''} error={errors[`price_${cur}`]}
                    hint={offered ? `${CURRENCY_NAME[cur]} — required to publish.` : `${CURRENCY_NAME[cur]} — not offered on the site (Settings → Commerce).`}
                    onChange={(e) => setPriceText({ ...priceText, [cur]: e.target.value })} />
                );
              })}
            </div>
            <label className="check"><input type="checkbox" checked={draft.pricesSample} onChange={(e) => set('pricesSample', e.target.checked)} /><span>Prices are samples (shows “Sample price · not final”)</span></label>
            {orderCount > 0 && <Notice kind="info">Price changes apply to new orders only. The {orderCount} existing order(s) keep the amount that was charged.</Notice>}
            <div className="form-row">
              <Field label="Access for new enrollments (calendar months)" type="number" min={1} max={36} value={draft.accessMonths} error={errors.months}
                hint={enrolledCount ? `Existing enrollments keep their own dates (${enrolledCount} record${enrolledCount === 1 ? '' : 's'}). Use Students → Extend for individual changes.` : 'Counted from the moment enrollment is confirmed.'}
                onChange={(e) => set('accessMonths', Number(e.target.value))} />
              <div className="field">
                <label htmlFor="ce-status">Status</label>
                <select id="ce-status" className="select" value={draft.status} aria-invalid={!!errors.status} aria-describedby={errors.status ? 'ce-status-err' : 'ce-status-hint'} onChange={(e) => set('status', e.target.value as Course['status'])}>
                  <option value="draft">Draft — hidden from the website</option>
                  <option value="published">Published — visible and open for enrollment</option>
                  <option value="archived">Archived — hidden and closed; enrolled students keep access</option>
                </select>
                {errors.status ? <span id="ce-status-err" className="error"><Icon name="alert" size={15} />{errors.status}</span>
                  : <span id="ce-status-hint" className="hint">{activeCount ? `${activeCount} student(s) have active access. Unpublishing or archiving does not remove their access.` : 'Publishing makes the course visible and purchasable.'}</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="ce-curr">
          <div className="row-between" style={{ marginBottom: 14 }}>
            <div>
              <h2 id="ce-curr" style={{ fontSize: '1.25rem', margin: 0 }}>Modules &amp; lessons</h2>
              <p className="muted small" style={{ margin: 0 }}>{draft.modules.length} modules · {courseLessons(draft, true).length} lessons · {courseMinutes(draft)} published minutes</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModules([...draft.modules, { id: newId(), title: `New module ${draft.modules.length + 1}`, lessons: [] }])}>
              <Icon name="plus" size={16} /> Add module
            </button>
          </div>
          {errors.modules && <Notice kind="err">{errors.modules}</Notice>}
          {draft.modules.length === 0 && <div className="empty"><p className="muted" style={{ margin: 0 }}>No modules yet. Add a module, then add lessons to it.</p></div>}
          {draft.modules.map((m, mi) => (
            <div className="editor-module" key={m.id}>
              <div className="editor-module-head">
                <label htmlFor={`mt-${m.id}`} className="sr-only">Module {mi + 1} title</label>
                <input id={`mt-${m.id}`} className="input input-sm" value={m.title} onChange={(e) => updateModule(m.id, (x) => ({ ...x, title: e.target.value }))} />
                <span className="order-btns">
                  <button type="button" className="icon-btn icon-btn-sm" disabled={mi === 0} aria-label={`Move module “${m.title}” up`} onClick={() => setModules(move(draft.modules, mi, -1))}><Icon name="arrowUp" size={16} /></button>
                  <button type="button" className="icon-btn icon-btn-sm" disabled={mi === draft.modules.length - 1} aria-label={`Move module “${m.title}” down`} onClick={() => setModules(move(draft.modules, mi, 1))}><Icon name="arrowDown" size={16} /></button>
                </span>
                <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" aria-label={`Delete module “${m.title}”`} onClick={() => setConfirmDel({ kind: 'module', id: m.id })}><Icon name="trash" size={16} /></button>
              </div>
              {m.lessons.map((l, li) => (
                <div className="editor-lesson" key={l.id}>
                  <span className="order-btns">
                    <button type="button" className="icon-btn icon-btn-sm" disabled={li === 0} aria-label={`Move lesson “${l.title}” up`} onClick={() => updateModule(m.id, (x) => ({ ...x, lessons: move(x.lessons, li, -1) }))}><Icon name="arrowUp" size={16} /></button>
                    <button type="button" className="icon-btn icon-btn-sm" disabled={li === m.lessons.length - 1} aria-label={`Move lesson “${l.title}” down`} onClick={() => updateModule(m.id, (x) => ({ ...x, lessons: move(x.lessons, li, 1) }))}><Icon name="arrowDown" size={16} /></button>
                  </span>
                  <div className="t">
                    <strong>{l.title}</strong>
                    <span className="badge-row">
                      <span className="muted small">{l.durationMin} min</span>
                      {l.published ? <span className="badge badge-ok">Published</span> : <span className="badge badge-muted">Unpublished</span>}
                      {l.preview && <span className="badge badge-sage">Free preview</span>}
                      {l.video ? <span className="badge badge-info"><Icon name="video" size={12} /> {{ upload: 'Demo upload', storage: 'Protected video', youtube: 'YouTube', gdrive: 'Google Drive', url: 'Video link' }[l.video.kind]}</span> : <span className="badge badge-warn">No video yet</span>}
                      {l.captionsUrl && <span className="badge badge-muted">Captions</span>}
                      {l.transcript && <span className="badge badge-muted">Transcript</span>}
                    </span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ moduleId: m.id, lesson: l, isNew: false })}><Icon name="edit" size={15} /> Edit<span className="sr-only"> {l.title}</span></button>
                  <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" aria-label={`Delete lesson “${l.title}”`} onClick={() => setConfirmDel({ kind: 'lesson', moduleId: m.id, id: l.id })}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              <div style={{ padding: '10px 14px' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ moduleId: m.id, isNew: true, lesson: { id: newId(), title: '', description: '', durationMin: 15, preview: false, published: false } })}>
                  <Icon name="plus" size={16} /> Add lesson
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="card danger-zone" aria-labelledby="ce-danger">
          <h2 id="ce-danger" style={{ fontSize: '1.25rem' }}>Remove this course</h2>
          {enrolledCount > 0 || orderCount > 0 ? (
            <p className="muted" style={{ margin: 0 }}>This course has {orderCount} order(s) and {enrolledCount} enrollment record(s), so it can’t be deleted — that would damage purchase history. Set its status to <strong>Archived</strong> to hide it and close enrollment; enrolled students keep their access.</p>
          ) : (
            <div className="row-between"><p className="muted" style={{ margin: 0 }}>Permanently delete this unused course and its lessons.</p><button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ kind: 'course' })}>Delete course…</button></div>
          )}
        </section>
      </div>

      {editing && (
        <LessonDialog
          key={editing.lesson.id} lesson={editing.lesson} isNew={editing.isNew} coursePublished={original.status === 'published'}
          completions={completionsFor(editing.lesson.id)} activeStudents={activeCount}
          onCancel={() => setEditing(null)}
          onSave={(l) => {
            updateModule(editing.moduleId, (m) => ({ ...m, lessons: editing.isNew ? [...m.lessons, l] : m.lessons.map((x) => (x.id === l.id ? l : x)) }));
            setEditing(null);
            toast('Lesson updated — remember to save the course', 'info');
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDel} danger onCancel={() => setConfirmDel(null)} onConfirm={doDelete}
        title={confirmDel?.kind === 'course' ? 'Delete this course?' : confirmDel?.kind === 'module' ? 'Delete this module?' : 'Delete this lesson?'}
        confirmLabel="Delete"
        message={confirmDel?.kind === 'course' ? 'This permanently removes the course and all of its lessons. This cannot be undone.'
          : confirmDel?.kind === 'module'
            ? (delModuleCompletions ? <>Students have completed lessons in this module ({delModuleCompletions} completion record(s)), so saving will be refused. <strong>Unpublish the lessons instead.</strong></> : 'The module and all lessons inside it will be removed when you save the course.')
            : delLessonCompletions ? <>{delLessonCompletions} student(s) have completed this lesson, so saving will be refused. <strong>Unpublish it instead</strong> — their progress is kept.</>
              : delLesson?.video && delLesson.published ? 'This published lesson has a video that students can currently watch. It will be removed when you save the course.' : 'The lesson will be removed when you save the course.'}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'} title="Leave without saving?" danger confirmLabel="Leave and discard"
        message="You have unsaved changes to this course. If you leave now, they will be lost."
        onCancel={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}

function LessonDialog({ lesson, isNew, coursePublished, completions, activeStudents, onSave, onCancel }: {
  lesson: Lesson; isNew: boolean; coursePublished: boolean; completions: number; activeStudents: number;
  onSave: (l: Lesson) => void; onCancel: () => void;
}) {
  const { uploadVideo } = useStore();
  const [l, setL] = useState<Lesson>(lesson);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState(lesson.video?.kind === 'url' ? lesson.video.src : '');
  type Source = 'youtube' | 'gdrive' | 'upload' | 'url';
  const [source, setSource] = useState<Source>(lesson.video?.kind === 'gdrive' ? 'gdrive' : lesson.video?.kind === 'url' ? 'url' : lesson.video?.kind === 'upload' || lesson.video?.kind === 'storage' ? 'upload' : 'youtube');
  const [ytLink, setYtLink] = useState(lesson.video?.kind === 'youtube' ? `https://youtu.be/${lesson.video.src}` : '');
  const [driveLink, setDriveLink] = useState(lesson.video?.kind === 'gdrive' ? `https://drive.google.com/file/d/${lesson.video.src}/view` : '');
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<null | (() => void)>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const live = coursePublished && lesson.published && !!lesson.video;
  const hostingReady = IS_DEMO || !!PRODUCTION_CONFIG?.videoHostingEnabled;

  // Replacing or removing a video students are using needs a confirmation first.
  const guard = (fn: () => void) => (live && l.video ? setConfirmReplace(() => fn) : fn());

  const attachUrl = () => {
    const v = videoUrl.trim();
    if (!/^https:\/\/[^\s]+$/.test(v)) { setErrors({ ...errors, video: 'Enter a full https:// link from your video host.' }); return; }
    setErrors({ ...errors, video: '' });
    guard(() => setL((cur) => ({ ...cur, video: { kind: 'url', src: v, attachedAt: new Date().toISOString() } })));
  };

  const attachId = (kind: 'youtube' | 'gdrive') => {
    const id = kind === 'youtube' ? parseYouTube(ytLink) : parseDrive(driveLink);
    if (!id) {
      setErrors({ ...errors, [kind]: kind === 'youtube'
        ? 'That doesn’t look like a YouTube video link. Paste the link from Share, e.g. https://youtu.be/abc123XYZ_0'
        : 'That doesn’t look like a Google Drive file link. Use Share → Copy link, e.g. https://drive.google.com/file/d/…/view' });
      return;
    }
    setErrors({ ...errors, [kind]: '' });
    const video: LessonVideo = { kind, src: id, attachedAt: new Date().toISOString() };
    guard(() => setL((cur) => ({ ...cur, video })));
  };

  const startUpload = async (f: File) => {
    setUploadError('');
    setLastFile(f);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setUpload({ name: f.name, pct: 0 });
    const r = await uploadVideo(l.id, f, (pct) => setUpload({ name: f.name, pct }), ctrl.signal);
    setUpload(null);
    if (!r.ok) { setUploadError(r.error); return; }
    setLastFile(null);
    setL((cur) => ({ ...cur, video: r.data }));
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) guard(() => void startUpload(f));
  };

  const save = () => {
    const er: Record<string, string> = {};
    if (!l.title.trim()) er.title = 'Please enter a lesson title.';
    if (!(Number.isInteger(l.durationMin) && l.durationMin >= 1 && l.durationMin <= 180)) er.duration = 'Enter a whole number of minutes between 1 and 180.';
    if (l.captionsUrl && !/^https:\/\/\S+\.vtt(\?|$)/i.test(l.captionsUrl)) er.captions = 'Use an https:// link to a WebVTT (.vtt) captions file.';
    if (upload) er.video = 'Please wait for the upload to finish, or cancel it.';
    setErrors(er);
    if (Object.keys(er).length) return;
    onSave({ ...l, title: l.title.trim(), captionsUrl: l.captionsUrl?.trim() || undefined, transcript: l.transcript?.trim() || undefined });
  };

  return (
    <Dialog open onClose={onCancel} size="lg" title={isNew ? 'Add lesson' : 'Edit lesson'}
      footer={<><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn btn-primary" onClick={save} disabled={!!upload}>{isNew ? 'Add lesson' : 'Apply changes'}</button></>}>
      <div className="form">
        <Field label="Lesson title" required value={l.title} error={errors.title} onChange={(e) => setL({ ...l, title: e.target.value })} />
        <TextArea label="Description" value={l.description} onChange={(e) => setL({ ...l, description: e.target.value })} style={{ minHeight: 90 }} />
        <div className="form-row">
          <Field label="Duration (minutes)" type="number" min={1} max={180} value={l.durationMin} error={errors.duration} onChange={(e) => setL({ ...l, durationMin: Number(e.target.value) })} />
          <div className="field">
            <span className="label">Visibility</span>
            <label className="check"><input type="checkbox" checked={l.published} onChange={(e) => setL({ ...l, published: e.target.checked })} /><span>Published (visible to enrolled students)</span></label>
            <label className="check"><input type="checkbox" checked={l.preview} onChange={(e) => setL({ ...l, preview: e.target.checked })} /><span>Free preview (anyone can watch)</span></label>
            {!l.published && completions > 0 && <span className="hint">{completions} student(s) completed this lesson. Unpublishing keeps their record but removes it from progress totals.</span>}
          </div>
        </div>

        <fieldset className="fieldset">
          <legend>Video</legend>
          {l.video ? (
            <div className="notice notice-ok" style={{ marginBottom: 14 }}>
              <Icon name="video" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{{ url: 'Video link attached', youtube: 'YouTube video attached', gdrive: 'Google Drive video attached', storage: `Protected video: ${l.video.fileName ?? 'uploaded file'}`, upload: `Demo upload: ${l.video.fileName}` }[l.video.kind]}</strong>
                <div className="small" style={{ wordBreak: 'break-all' }}>{{
                  url: l.video.src,
                  youtube: `Video ID ${l.video.src} — plays inside the site’s protected player.`,
                  gdrive: `File ID ${l.video.src} — plays inside the site’s protected player.`,
                  storage: 'Stored privately; students get a short-lived link only while their access is active.',
                  upload: 'Simulated: plays only in this browser session.',
                }[l.video.kind]}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => guard(() => { setL((cur) => ({ ...cur, video: undefined })); sessionUploads.delete(l.id); })}>Remove</button>
            </div>
          ) : <p className="muted small" style={{ marginTop: 0 }}>No video attached yet. Students will see a “video coming soon” placeholder.</p>}
          {live && <Notice kind="warn">This lesson is published{activeStudents ? ` and ${activeStudents} student(s) have active access` : ''}. Replacing or removing its video takes effect for students when you save the course.</Notice>}

          <div className="tabs tabs-compact" role="tablist" aria-label="Video source" style={{ marginTop: 14 }}>
            {([['youtube', 'YouTube (unlisted)'], ['gdrive', 'Google Drive'], ['upload', 'Upload file'], ['url', 'Other link']] as [Source, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" id={`vs-${k}`} aria-selected={source === k} aria-controls="vs-panel" onClick={() => setSource(k)}>{label}</button>
            ))}
          </div>
          <div id="vs-panel" role="tabpanel" aria-labelledby={`vs-${source}`}>
            {source === 'youtube' && (
              <div className="stack">
                <div className="form-row" style={{ alignItems: 'end' }}>
                  <Field label="YouTube link" placeholder="https://youtu.be/…" value={ytLink} error={errors.youtube} onChange={(e) => setYtLink(e.target.value)} />
                  <div><button type="button" className="btn btn-secondary" onClick={() => attachId('youtube')}>{l.video?.kind === 'youtube' ? 'Replace video' : 'Attach video'}</button></div>
                </div>
                <p className="muted small" style={{ margin: 0 }}>In YouTube Studio set the video to <strong>Unlisted</strong> (not Private — private videos can’t play on other sites) and keep <strong>Allow embedding</strong> on.</p>
                {parseYouTube(ytLink) && <div className="video-preview"><iframe src={youTubeEmbed(parseYouTube(ytLink)!)} title="YouTube preview" allow="encrypted-media" /></div>}
              </div>
            )}
            {source === 'gdrive' && (
              <div className="stack">
                <div className="form-row" style={{ alignItems: 'end' }}>
                  <Field label="Google Drive link" placeholder="https://drive.google.com/file/d/…/view" value={driveLink} error={errors.gdrive} onChange={(e) => setDriveLink(e.target.value)} />
                  <div><button type="button" className="btn btn-secondary" onClick={() => attachId('gdrive')}>{l.video?.kind === 'gdrive' ? 'Replace video' : 'Attach video'}</button></div>
                </div>
                <p className="muted small" style={{ margin: 0 }}>In Drive: <strong>Share → General access → Anyone with the link → Viewer</strong>, then in Share settings (⚙) untick <strong>“Viewers and commenters can see the option to download, print and copy”</strong>. Large videos can take a while to process before they play.</p>
                {parseDrive(driveLink) && <div className="video-preview"><iframe src={driveEmbed(parseDrive(driveLink)!)} title="Google Drive preview" allow="encrypted-media" /></div>}
              </div>
            )}
            {source === 'upload' && (
              <div>
                <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Upload a video file {IS_DEMO ? <span className="badge badge-info">Simulated</span> : hostingReady ? <span className="badge badge-ok">Protected storage</span> : <span className="badge badge-muted">Not configured</span>}
                </span>
            {upload ? (
              <div className="stack" aria-live="polite">
                <div className="row-between small"><span>Uploading {upload.name}…</span><span>{Math.round(upload.pct)}%</span></div>
                <div className="upload-bar" role="progressbar" aria-valuenow={Math.round(upload.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><span style={{ width: `${upload.pct}%` }} /></div>
                <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => abort.current?.abort()}>Cancel upload</button></div>
              </div>
            ) : hostingReady ? (
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={16} /> {l.video ? 'Replace with a file' : 'Choose video file'}
                <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={onFile} />
              </label>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>Uploads are switched off until protected video storage is configured (see SETUP-PRODUCTION.md → Video).</p>
            )}
            {uploadError && (
              <div className="row" role="alert" style={{ marginTop: 8 }}>
                <span className="error">{uploadError}</span>
                {lastFile && uploadError !== 'Upload cancelled.' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void startUpload(lastFile)}><Icon name="refresh" size={14} /> Retry</button>}
              </div>
            )}
              </div>
            )}
            {source === 'url' && (
              <div className="form-row" style={{ alignItems: 'end' }}>
                <Field label="Video link" type="url" placeholder="https://…" value={videoUrl} error={errors.video}
                  hint="An MP4 link or an embeddable player URL from another host." onChange={(e) => setVideoUrl(e.target.value)} />
                <div><button type="button" className="btn btn-secondary" onClick={attachUrl}>Attach link</button></div>
              </div>
            )}
          </div>
          <Notice kind="info" title="How protected is the video?">
            Students watch inside the site’s player, which shows a moving watermark with their email, covers the links that open the video on YouTube or Drive, and blocks right-click and download buttons. In production only students with active access receive the video. <strong>No website can stop screen recording</strong>, and a determined viewer can still find a YouTube or Drive video’s address — for the strongest protection, upload files to private storage instead.
          </Notice>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Accessibility</legend>
          <Field label="Captions file (WebVTT link, optional)" type="url" placeholder="https://…/lesson.vtt" value={l.captionsUrl ?? ''} error={errors.captions} onChange={(e) => setL({ ...l, captionsUrl: e.target.value })} />
          <TextArea label="Transcript (optional)" hint="Shown under the video for students with access. Separate paragraphs with a blank line." value={l.transcript ?? ''} style={{ minHeight: 100 }} onChange={(e) => setL({ ...l, transcript: e.target.value })} />
        </fieldset>
        {!isNew && <Notice kind="info">Changes apply to the course draft. Select “Save course” afterwards to publish them.</Notice>}
      </div>
      <ConfirmDialog open={!!confirmReplace} danger title="Change a video students are using?" confirmLabel="Yes, change it"
        message="Students with access are currently able to watch this video. The change takes effect when you save the course."
        onCancel={() => setConfirmReplace(null)} onConfirm={() => { const fn = confirmReplace; setConfirmReplace(null); fn?.(); }} />
    </Dialog>
  );
}
