import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { accessStatus, courseLessons, courseMinutes, useStore } from '../../lib/store';
import type { ArtTone, Course, Lesson, Module } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { CourseArt, formatMoney } from '../../components/brand';
import { ConfirmDialog, Dialog, Field, Notice, TextArea, usePageTitle, useToast } from '../../components/ui';
import { sessionUploads } from '../../lib/uploads';
import { formatShortDate } from '../../lib/dates';

const newId = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function AdminCourses() {
  const { state, createCourse } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  usePageTitle('Courses');
  return (
    <>
      <div className="admin-top">
        <div><h1>Courses &amp; lessons</h1><p className="muted" style={{ margin: 0 }}>Create courses, organise modules and lessons, and attach videos.</p></div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => { const c = createCourse(); toast('Draft course created'); nav(`/admin/courses/${c.id}`); }}>
          <Icon name="plus" size={16} /> New course
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Lessons</th><th scope="col">Videos attached</th><th scope="col">Price (INR / USD)</th><th scope="col">Active students</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {state.courses.map((c) => {
              const all = courseLessons(c, true);
              const withVideo = all.filter((l) => l.video).length;
              return (
                <tr key={c.id}>
                  <td><strong>{c.title}</strong>{c.titleProvisional && <> <span className="badge badge-warn">Provisional</span></>}<br /><span className="muted small">/{c.slug}</span></td>
                  <td>{c.status === 'published' ? <span className="badge badge-ok">Published</span> : <span className="badge badge-muted">Draft</span>}</td>
                  <td>{all.length} <span className="muted small">({all.filter((l) => !l.published).length} unpublished)</span></td>
                  <td>{withVideo} / {all.length}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatMoney(c.prices.INR, 'INR')} / {formatMoney(c.prices.USD, 'USD')}{c.pricesSample && <><br /><span className="badge badge-outline">Sample</span></>}</td>
                  <td>{state.enrollments.filter((e) => e.courseId === c.id && accessStatus(e) === 'active').length}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatShortDate(c.updatedAt)}</td>
                  <td className="num"><Link to={`/admin/courses/${c.id}`} className="btn btn-secondary btn-sm">Edit<span className="sr-only"> {c.title}</span></Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 16 }}>Rekha plans three courses; their final titles and curricula are not confirmed. The lesson counts here are samples and are not a commitment to a particular number of videos per course.</p>
    </>
  );
}

export function AdminCourseEditor() {
  const { id } = useParams();
  const { state, saveCourse, deleteCourse } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const original = state.courses.find((c) => c.id === id);
  const [draft, setDraft] = useState<Course | null>(original ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ moduleId: string; lesson: Lesson; isNew: boolean } | null>(null);
  const [confirmDel, setConfirmDel] = useState<null | { kind: 'course' } | { kind: 'module'; id: string } | { kind: 'lesson'; moduleId: string; id: string }>(null);
  usePageTitle(draft ? `Edit: ${draft.title}` : 'Edit course');

  useEffect(() => { if (original && !draft) setDraft(original); }, [original, draft]);
  const dirty = !!draft && !!original && JSON.stringify({ ...draft, updatedAt: '' }) !== JSON.stringify({ ...original, updatedAt: '' });

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  if (!original || !draft) {
    return <div className="empty"><h1 style={{ fontSize: '1.4rem' }}>Course not found</h1><Link to="/admin/courses" className="btn btn-secondary btn-sm">Back to courses</Link></div>;
  }

  const set = <K extends keyof Course>(k: K, v: Course[K]) => setDraft({ ...draft, [k]: v });
  const setModules = (modules: Module[]) => setDraft({ ...draft, modules });
  const enrolledCount = state.enrollments.filter((e) => e.courseId === draft.id).length;

  const validate = () => {
    const er: Record<string, string> = {};
    if (!draft.title.trim()) er.title = 'A course title is required.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)) er.slug = 'Use lowercase letters, numbers and single hyphens only.';
    else if (state.courses.some((c) => c.id !== draft.id && c.slug === draft.slug)) er.slug = 'Another course already uses this web address.';
    if (!(draft.prices.INR >= 0)) er.inr = 'Enter a price of 0 or more.';
    if (!(draft.prices.USD >= 0)) er.usd = 'Enter a price of 0 or more.';
    if (!(draft.accessMonths >= 1 && draft.accessMonths <= 36)) er.months = 'Choose between 1 and 36 months.';
    if (draft.status === 'published') {
      if (!courseLessons(draft).length) er.status = 'A published course needs at least one published lesson.';
      if (draft.prices.INR <= 0 || draft.prices.USD <= 0) er.status = 'Set prices in both currencies before publishing.';
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const save = () => {
    if (!validate()) { toast('Please fix the highlighted fields', 'err'); return; }
    saveCourse(draft);
    toast('Course saved — the website has been updated');
  };

  const onImage = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrors({ ...errors, image: 'Please choose a JPG, PNG or WebP image.' }); return; }
    if (f.size > 1.5 * 1024 * 1024) { setErrors({ ...errors, image: 'Demo limit: images must be under 1.5 MB (production will resize and optimise uploads).' }); return; }
    const r = new FileReader();
    r.onload = () => { set('image', String(r.result)); setErrors({ ...errors, image: '' }); };
    r.onerror = () => setErrors({ ...errors, image: 'The image could not be read. Please try another file.' });
    r.readAsDataURL(f);
  };

  const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const copy = arr.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  };

  const updateModule = (mid: string, fn: (m: Module) => Module) => setModules(draft.modules.map((m) => (m.id === mid ? fn(m) : m)));

  const doDelete = () => {
    if (!confirmDel) return;
    if (confirmDel.kind === 'course') { deleteCourse(draft.id); toast('Course deleted'); setConfirmDel(null); nav('/admin/courses'); return; }
    if (confirmDel.kind === 'module') setModules(draft.modules.filter((m) => m.id !== confirmDel.id));
    if (confirmDel.kind === 'lesson') updateModule(confirmDel.moduleId, (m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== confirmDel.id) }));
    setConfirmDel(null);
  };

  const listInput = (label: string, key: 'audience' | 'topics', hint: string) => (
    <TextArea label={label} hint={hint} value={draft[key].join('\n')} style={{ minHeight: 110 }}
      onChange={(e) => set(key, e.target.value.split('\n').map((x) => x.replace(/^\s+/, '')).filter((x, i, a) => x || i < a.length - 1))} />
  );

  return (
    <>
      <div className="admin-top">
        <div>
          <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 6 }}><Link to="/admin/courses">Courses</Link> / <span aria-current="page">Edit</span></nav>
          <h1>{draft.title || 'Untitled course'}</h1>
          <p className="muted small" style={{ margin: 0 }} aria-live="polite">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
        </div>
        <div className="row">
          {original.status === 'published' && <Link to={`/courses/${original.slug}`} className="btn btn-ghost btn-sm" target="_blank"><Icon name="external" size={16} /> View live page</Link>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => { setDraft(original); setErrors({}); }}>Discard changes</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save course</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
        <section className="card" aria-labelledby="ce-basics">
          <h2 id="ce-basics" style={{ fontSize: '1.25rem' }}>Details</h2>
          <div className="form">
            <div className="form-row">
              <Field label="Course title" required value={draft.title} error={errors.title} onChange={(e) => set('title', e.target.value)} />
              <Field label="Web address (slug)" required value={draft.slug} error={errors.slug} hint={`/courses/${draft.slug}`} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))} />
            </div>
            <label className="check"><input type="checkbox" checked={draft.titleProvisional} onChange={(e) => set('titleProvisional', e.target.checked)} /><span>Title is provisional (shows a “Sample title” label on the website)</span></label>
            <Field label="Short tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
            <TextArea label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} />
            <div className="form-row">
              {listInput('Who it’s for', 'audience', 'One point per line.')}
              {listInput('Learning topics', 'topics', 'One topic per line.')}
            </div>
            <label className="check"><input type="checkbox" checked={draft.curriculumSample} onChange={(e) => set('curriculumSample', e.target.checked)} /><span>Curriculum is a sample (shows “Sample curriculum” labels)</span></label>
          </div>
        </section>

        <section className="card" aria-labelledby="ce-img">
          <h2 id="ce-img" style={{ fontSize: '1.25rem' }}>Course image</h2>
          <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
            <div style={{ width: 260, borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--line)' }}><CourseArt course={draft} /></div>
            <div className="stack" style={{ flex: 1, minWidth: 220 }}>
              <div className="field">
                <span className="label">Placeholder artwork colour</span>
                <div className="row">
                  {(['sage', 'rose', 'sand'] as ArtTone[]).map((t) => (
                    <label key={t} className="check" style={{ textTransform: 'capitalize' }}><input type="radio" name="art" checked={draft.art === t} onChange={() => set('art', t)} />{t}</label>
                  ))}
                </div>
              </div>
              <div className="row">
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  <Icon name="upload" size={16} /> {draft.image ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onImage} />
                </label>
                {draft.image && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('image', undefined)}>Remove image</button>}
              </div>
              {errors.image && <span className="error" style={{ color: 'var(--err)', fontSize: '0.85rem' }} role="alert">{errors.image}</span>}
              <p className="muted small" style={{ margin: 0 }}>Use client-approved photography only. Never use stock or AI-generated images of people presented as Rekha.</p>
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="ce-price">
          <h2 id="ce-price" style={{ fontSize: '1.25rem' }}>Pricing, access &amp; status</h2>
          <div className="form">
            <div className="form-row">
              <Field label="Price in INR (₹)" type="number" min={0} step={1} inputMode="numeric" value={draft.prices.INR} error={errors.inr} onChange={(e) => set('prices', { ...draft.prices, INR: Number(e.target.value) })} />
              <Field label="Price in USD ($)" type="number" min={0} step={1} inputMode="decimal" value={draft.prices.USD} error={errors.usd} onChange={(e) => set('prices', { ...draft.prices, USD: Number(e.target.value) })} />
            </div>
            <label className="check"><input type="checkbox" checked={draft.pricesSample} onChange={(e) => set('pricesSample', e.target.checked)} /><span>Prices are samples (shows “Sample price · not final”)</span></label>
            <div className="form-row">
              <Field label="Access duration (calendar months)" type="number" min={1} max={36} value={draft.accessMonths} error={errors.months}
                hint={enrolledCount ? 'Changes apply to new enrollments only. Existing access dates are not changed.' : 'Applies from the date enrollment is confirmed.'}
                onChange={(e) => set('accessMonths', Number(e.target.value))} />
              <div className="field">
                <label htmlFor="ce-status">Status</label>
                <select id="ce-status" className="select" value={draft.status} aria-invalid={!!errors.status} aria-describedby={errors.status ? 'ce-status-err' : undefined} onChange={(e) => set('status', e.target.value as Course['status'])}>
                  <option value="draft">Draft — hidden from the website</option>
                  <option value="published">Published — visible and open for enrollment</option>
                </select>
                {errors.status && <span id="ce-status-err" className="error"><Icon name="alert" size={15} />{errors.status}</span>}
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
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModules([...draft.modules, { id: newId('m'), title: `New module ${draft.modules.length + 1}`, lessons: [] }])}>
              <Icon name="plus" size={16} /> Add module
            </button>
          </div>
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
                <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete module “${m.title}”`} onClick={() => setConfirmDel({ kind: 'module', id: m.id })}><Icon name="trash" size={16} /></button>
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
                      {l.video ? <span className="badge badge-info"><Icon name="video" size={12} /> {l.video.kind === 'url' ? 'Hosted video' : 'Demo upload'}</span> : <span className="badge badge-warn">No video yet</span>}
                    </span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing({ moduleId: m.id, lesson: l, isNew: false })}><Icon name="edit" size={15} /> Edit<span className="sr-only"> {l.title}</span></button>
                  <button type="button" className="icon-btn icon-btn-sm" aria-label={`Delete lesson “${l.title}”`} onClick={() => setConfirmDel({ kind: 'lesson', moduleId: m.id, id: l.id })}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              <div style={{ padding: '10px 14px' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing({ moduleId: m.id, isNew: true, lesson: { id: newId('l'), title: '', description: '', durationMin: 15, preview: false, published: false } })}>
                  <Icon name="plus" size={16} /> Add lesson
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="card" aria-labelledby="ce-danger" style={{ borderColor: '#ecbcb7' }}>
          <h2 id="ce-danger" style={{ fontSize: '1.25rem' }}>Delete course</h2>
          {enrolledCount > 0 ? (
            <p className="muted" style={{ margin: 0 }}>This course has {enrolledCount} enrollment record(s), so it can’t be deleted. Set it to Draft to hide it from the website instead.</p>
          ) : (
            <div className="row-between"><p className="muted" style={{ margin: 0 }}>Permanently remove this course and its lessons.</p><button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ kind: 'course' })}>Delete course</button></div>
          )}
        </section>
      </div>

      {editing && (
        <LessonDialog
          key={editing.lesson.id} lesson={editing.lesson} isNew={editing.isNew}
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
          : confirmDel?.kind === 'module' ? 'The module and all lessons inside it will be removed when you save the course. Students lose access to those lessons.'
            : 'The lesson will be removed when you save the course. Completion records for it will no longer count towards progress.'}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'} title="Leave without saving?" danger confirmLabel="Leave and discard"
        message="You have unsaved changes to this course. If you leave now, they will be lost."
        onCancel={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}

function LessonDialog({ lesson, isNew, onSave, onCancel }: { lesson: Lesson; isNew: boolean; onSave: (l: Lesson) => void; onCancel: () => void }) {
  const [l, setL] = useState<Lesson>(lesson);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState(lesson.video?.kind === 'url' ? lesson.video.src : '');
  const [upload, setUpload] = useState<{ name: string; pct: number } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearInterval(timer.current), []);

  const attachUrl = () => {
    const v = videoUrl.trim();
    if (!/^https:\/\/[^\s]+$/.test(v)) { setErrors({ ...errors, video: 'Enter a full https:// link from your video host.' }); return; }
    setErrors({ ...errors, video: '' });
    setL({ ...l, video: { kind: 'url', src: v, attachedAt: new Date().toISOString() } });
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploadError('');
    if (!f.type.startsWith('video/')) { setUploadError(`“${f.name}” is not a video file. Please choose an MP4, MOV or WebM file.`); return; }
    if (f.size > 4 * 1024 ** 3) { setUploadError('This file is larger than 4 GB. Please export a smaller version.'); return; }
    // Simulated upload progress. Production: direct upload to the video host with real progress events.
    let pct = 0;
    setUpload({ name: f.name, pct });
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      pct = Math.min(100, pct + 4 + Math.random() * 10);
      setUpload({ name: f.name, pct });
      if (pct >= 100) {
        window.clearInterval(timer.current);
        sessionUploads.set(l.id, URL.createObjectURL(f));
        setL((cur) => ({ ...cur, video: { kind: 'upload', src: 'session', fileName: f.name, attachedAt: new Date().toISOString() } }));
        setTimeout(() => setUpload(null), 600);
      }
    }, 180);
  };

  const cancelUpload = () => { window.clearInterval(timer.current); setUpload(null); setUploadError('Upload cancelled.'); };

  const save = () => {
    const er: Record<string, string> = {};
    if (!l.title.trim()) er.title = 'Please enter a lesson title.';
    if (!(l.durationMin >= 1 && l.durationMin <= 180)) er.duration = 'Enter a duration between 1 and 180 minutes.';
    if (upload) er.video = 'Please wait for the upload to finish.';
    setErrors(er);
    if (Object.keys(er).length) return;
    onSave({ ...l, title: l.title.trim() });
  };

  return (
    <Dialog open onClose={onCancel} size="lg" title={isNew ? 'Add lesson' : 'Edit lesson'}
      footer={<><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn btn-primary" onClick={save}>{isNew ? 'Add lesson' : 'Apply changes'}</button></>}>
      <div className="form">
        <Field label="Lesson title" required value={l.title} error={errors.title} onChange={(e) => setL({ ...l, title: e.target.value })} />
        <TextArea label="Description" value={l.description} onChange={(e) => setL({ ...l, description: e.target.value })} style={{ minHeight: 90 }} />
        <div className="form-row">
          <Field label="Duration (minutes)" type="number" min={1} max={180} value={l.durationMin} error={errors.duration} onChange={(e) => setL({ ...l, durationMin: Number(e.target.value) })} />
          <div className="field">
            <span className="label">Visibility</span>
            <label className="check"><input type="checkbox" checked={l.published} onChange={(e) => setL({ ...l, published: e.target.checked })} /><span>Published (visible to enrolled students)</span></label>
            <label className="check"><input type="checkbox" checked={l.preview} onChange={(e) => setL({ ...l, preview: e.target.checked })} /><span>Free preview (anyone can watch)</span></label>
          </div>
        </div>

        <fieldset style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 16, margin: 0 }}>
          <legend style={{ fontWeight: 600, padding: '0 6px' }}>Video</legend>
          {l.video ? (
            <div className="notice notice-ok" style={{ marginBottom: 14 }}>
              <Icon name="video" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{l.video.kind === 'url' ? 'Hosted video attached' : `Demo upload: ${l.video.fileName}`}</strong>
                <div className="small" style={{ wordBreak: 'break-all' }}>{l.video.kind === 'url' ? l.video.src : 'Plays only in this browser session (demo).'}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setL({ ...l, video: undefined }); sessionUploads.delete(l.id); }}>Remove</button>
            </div>
          ) : <p className="muted small" style={{ marginTop: 0 }}>No video attached yet. Students will see a “video coming soon” placeholder.</p>}

          <div className="form-row" style={{ alignItems: 'end' }}>
            <Field label={l.video ? 'Replace with a hosted video link' : 'Hosted video link'} type="url" placeholder="https://…" value={videoUrl} error={errors.video}
              hint="An MP4 link or an embeddable player URL from your video host." onChange={(e) => setVideoUrl(e.target.value)} />
            <div><button type="button" className="btn btn-secondary" onClick={attachUrl}>Attach link</button></div>
          </div>

          <div style={{ marginTop: 14 }}>
            <span className="label" style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Or upload a file <span className="badge badge-info">Simulated</span></span>
            {upload ? (
              <div className="stack" aria-live="polite">
                <div className="row-between small"><span>Uploading {upload.name}…</span><span>{Math.round(upload.pct)}%</span></div>
                <div className="upload-bar" role="progressbar" aria-valuenow={Math.round(upload.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><span style={{ width: `${upload.pct}%` }} /></div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelUpload}>Cancel upload</button>
              </div>
            ) : (
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Icon name="upload" size={16} /> {l.video ? 'Replace with a file' : 'Choose video file'}
                <input type="file" accept="video/*" className="sr-only" onChange={onFile} />
              </label>
            )}
            {uploadError && <p className="error" role="alert" style={{ color: 'var(--err)', fontSize: '0.85rem', marginTop: 8 }}>{uploadError}</p>}
            <p className="muted small" style={{ marginBottom: 0, marginTop: 8 }}>
              Production: files upload directly to the configured video host, and paid lessons use protected playback (signed, expiring links). This reduces casual sharing but cannot fully prevent screen recording.
            </p>
          </div>
        </fieldset>
        {!isNew && <Notice kind="info">Changes apply to the course draft. Select “Save course” afterwards to publish them.</Notice>}
      </div>
    </Dialog>
  );
}
