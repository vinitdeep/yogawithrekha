import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import type { FaqItem, Settings } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { Portrait } from '../../components/brand';
import { ConfirmDialog, Field, Notice, TextArea, emailOk, usePageTitle, useToast } from '../../components/ui';

type Tab = 'brand' | 'about' | 'contact' | 'faq' | 'policies' | 'access' | 'data';

export function AdminSettings() {
  const { state, updateSettings, resetDemo } = useStore();
  const go = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('brand');
  const [s, setS] = useState<Settings>(state.settings);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [delFaq, setDelFaq] = useState<string | null>(null);
  usePageTitle('Settings');

  const dirty = JSON.stringify(s) !== JSON.stringify(state.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const save = () => {
    const er: Record<string, string> = {};
    if (!s.brandName.trim()) er.brandName = 'Brand name is required.';
    if (!emailOk(s.supportEmail)) er.supportEmail = 'Enter a valid support email address.';
    if (!/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(s.instagramUrl)) er.instagramUrl = 'Enter the full profile link, e.g. https://www.instagram.com/yoga_with_rekha/';
    if (s.whatsappVerified && !/^\+?\d[\d\s-]{7,}$/.test(s.whatsappNumber)) er.whatsappNumber = 'Enter the number with country code, e.g. +91 98xxx xxxxx.';
    if (s.faqs.some((f) => !f.question.trim() || !f.answer.trim())) er.faq = 'Every FAQ needs a question and an answer.';
    setErrors(er);
    if (Object.keys(er).length) {
      toast('Please fix the highlighted fields', 'err');
      if (er.brandName) setTab('brand'); else if (er.supportEmail || er.instagramUrl || er.whatsappNumber) setTab('contact'); else if (er.faq) setTab('faq');
      return;
    }
    updateSettings(s);
    toast('Settings saved — the website has been updated');
  };

  const onPortrait = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrors({ ...errors, portrait: 'Please choose a JPG, PNG or WebP image.' }); return; }
    if (f.size > 1.5 * 1024 * 1024) { setErrors({ ...errors, portrait: 'Demo limit: images must be under 1.5 MB.' }); return; }
    const r = new FileReader();
    r.onload = () => { set('portrait', String(r.result)); setErrors({ ...errors, portrait: '' }); };
    r.readAsDataURL(f);
  };

  const updateFaq = (id: string, patch: Partial<FaqItem>) => set('faqs', s.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const moveFaq = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= s.faqs.length) return;
    const a = s.faqs.slice();
    [a[i], a[j]] = [a[j], a[i]];
    set('faqs', a);
  };

  const tabs: [Tab, string][] = [['brand', 'Brand'], ['about', 'About Rekha'], ['contact', 'Contact & social'], ['faq', 'FAQ'], ['policies', 'Policies'], ['access', 'Access rules'], ['data', 'Demo data']];

  return (
    <>
      <div className="admin-top">
        <div><h1>Settings</h1><p className="muted small" style={{ margin: 0 }} aria-live="polite">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p></div>
        <div className="row">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => { setS(state.settings); setErrors({}); }}>Discard</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Save settings</button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" id={`st-${k}`} aria-selected={tab === k} aria-controls="st-panel" onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div id="st-panel" role="tabpanel" aria-labelledby={`st-${tab}`} className="card">
        {tab === 'brand' && (
          <div className="form" style={{ maxWidth: 640 }}>
            <Field label="Brand name" required value={s.brandName} error={errors.brandName} onChange={(e) => set('brandName', e.target.value)} />
            <Field label="Course brand" value={s.courseBrand} onChange={(e) => set('courseBrand', e.target.value)} />
            <Field label="Public display name" value={s.displayName} hint="Used throughout public copy." onChange={(e) => set('displayName', e.target.value)} />
            <div className="field">
              <span className="label">Portrait of Rekha</span>
              <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
                <div style={{ width: 160 }}><Portrait src={s.portrait ?? null} /></div>
                <div className="stack" style={{ flex: 1, minWidth: 200 }}>
                  <div className="row">
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      <Icon name="upload" size={16} /> {s.portrait ? 'Replace portrait' : 'Upload portrait'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onPortrait} />
                    </label>
                    {s.portrait && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('portrait', undefined)}>Use default pose images</button>}
                  </div>
                  {errors.portrait && <span className="error" role="alert" style={{ color: 'var(--err)', fontSize: '0.85rem' }}>{errors.portrait}</span>}
                  <p className="muted small" style={{ margin: 0 }}>Only upload a photograph supplied or approved by Rekha. The preview here is not saved until you select “Save settings”.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="form" style={{ maxWidth: 720 }}>
            <Notice kind="warn" title="Unpublished until confirmed">
              The full name and credential text below come from a publicly indexed profile and are stored for reference only. They stay hidden on the website until Rekha confirms them and you tick “Confirmed — show publicly”.
            </Notice>
            <Field label="Full name" value={s.fullName} onChange={(e) => set('fullName', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.fullNameConfirmed} onChange={(e) => set('fullNameConfirmed', e.target.checked)} /><span>Confirmed by Rekha — show full name publicly</span></label>
            <Field label="Qualifications / credentials" value={s.credentials} onChange={(e) => set('credentials', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.credentialsConfirmed} onChange={(e) => set('credentialsConfirmed', e.target.checked)} /><span>Verified — show qualifications publicly</span></label>
            <TextArea label="Introduction" value={s.aboutIntro} onChange={(e) => set('aboutIntro', e.target.value)} style={{ minHeight: 100 }} />
            <TextArea label="Personal story" value={s.personalStory} hint="Leave blank until Rekha supplies her story. Separate paragraphs with a blank line. Avoid medical or guaranteed-result claims." onChange={(e) => set('personalStory', e.target.value)} style={{ minHeight: 180 }} />
          </div>
        )}

        {tab === 'contact' && (
          <div className="form" style={{ maxWidth: 640 }}>
            <Field label="Support email" type="email" required value={s.supportEmail} error={errors.supportEmail} hint="Currently a placeholder." onChange={(e) => set('supportEmail', e.target.value)} />
            <Field label="Instagram profile link" type="url" value={s.instagramUrl} error={errors.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} />
            <Field label="Instagram handle" value={s.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} />
            <Field label="WhatsApp number" value={s.whatsappNumber} error={errors.whatsappNumber} hint="With country code. Only shown once marked as verified." onChange={(e) => set('whatsappNumber', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.whatsappVerified} onChange={(e) => set('whatsappVerified', e.target.checked)} /><span>Number verified by Rekha — show WhatsApp link on the Contact page</span></label>
          </div>
        )}

        {tab === 'faq' && (
          <div className="stack">
            {errors.faq && <Notice kind="err">{errors.faq}</Notice>}
            {s.faqs.map((f, i) => (
              <div key={f.id} className="card card-sm card-flat">
                <div className="form">
                  <div className="form-row">
                    <Field label="Question" value={f.question} onChange={(e) => updateFaq(f.id, { question: e.target.value })} error={!f.question.trim() && errors.faq ? 'Required' : undefined} />
                    <Field label="Category" value={f.category} onChange={(e) => updateFaq(f.id, { category: e.target.value })} list="faq-cats" />
                  </div>
                  <TextArea label="Answer" value={f.answer} style={{ minHeight: 80 }} onChange={(e) => updateFaq(f.id, { answer: e.target.value })} error={!f.answer.trim() && errors.faq ? 'Required' : undefined} />
                  <div className="row-between">
                    <label className="check"><input type="checkbox" checked={f.draft} onChange={(e) => updateFaq(f.id, { draft: e.target.checked })} /><span>Draft (depends on an unconfirmed policy)</span></label>
                    <span className="row" style={{ gap: 4 }}>
                      <button type="button" className="icon-btn icon-btn-sm" disabled={i === 0} aria-label="Move question up" onClick={() => moveFaq(i, -1)}><Icon name="arrowUp" size={16} /></button>
                      <button type="button" className="icon-btn icon-btn-sm" disabled={i === s.faqs.length - 1} aria-label="Move question down" onClick={() => moveFaq(i, 1)}><Icon name="arrowDown" size={16} /></button>
                      <button type="button" className="icon-btn icon-btn-sm" aria-label="Delete question" onClick={() => setDelFaq(f.id)}><Icon name="trash" size={16} /></button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <datalist id="faq-cats">{[...new Set(s.faqs.map((f) => f.category))].map((c) => <option key={c} value={c} />)}</datalist>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('faqs', [...s.faqs, { id: `f-${Date.now().toString(36)}`, category: 'Enrollment', question: '', answer: '', draft: false }])}><Icon name="plus" size={16} /> Add question</button>
          </div>
        )}

        {tab === 'policies' && (
          <div className="stack">
            <Notice kind="warn">Policy text is placeholder content. Have it reviewed by a qualified professional before launch, then untick “Draft”.</Notice>
            {(['privacy', 'terms', 'refund'] as const).map((k) => (
              <div key={k} className="card card-sm card-flat">
                <div className="form">
                  <Field label="Page title" value={s.policies[k].title} onChange={(e) => set('policies', { ...s.policies, [k]: { ...s.policies[k], title: e.target.value } })} />
                  <TextArea label="Content" hint="A line followed by more lines becomes a heading. Separate sections with a blank line." value={s.policies[k].body} style={{ minHeight: 200 }} onChange={(e) => set('policies', { ...s.policies, [k]: { ...s.policies[k], body: e.target.value } })} />
                  <label className="check"><input type="checkbox" checked={s.policies[k].draft} onChange={(e) => set('policies', { ...s.policies, [k]: { ...s.policies[k], draft: e.target.checked } })} /><span>Draft — show “awaiting review” notice on the page</span></label>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'access' && (
          <div className="form" style={{ maxWidth: 640 }}>
            <div className="field">
              <label htmlFor="rule">When does six-month access start?</label>
              <select id="rule" className="select" value={s.accessStartRule} onChange={(e) => set('accessStartRule', e.target.value as Settings['accessStartRule'])}>
                <option value="enrollment">When enrollment is confirmed (demo assumption)</option>
                <option value="launch-date">On the launch date, for anyone who enrolls before it</option>
              </select>
              <span className="hint">Applies to new enrollments only.</span>
            </div>
            <Field label="Launch date" type="date" value={s.launchDate} onChange={(e) => set('launchDate', e.target.value)} hint="Target launch is approximately 15 December 2026." />
            <Notice kind="info" title="Month-end rule">
              Access lasts the course’s number of calendar months and ends at the end of the same day-of-month. If that day doesn’t exist in the final month, access ends on the last day of that month (for example 31 August → 28 February). In production, expiry is enforced on the server.
            </Notice>
          </div>
        )}

        {tab === 'data' && (
          <div className="stack" style={{ maxWidth: 640 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              All courses, students, orders and settings in this demo are saved in this browser only. Resetting restores the original sample content and signs you out.
            </p>
            <div><button type="button" className="btn btn-danger" onClick={() => setConfirmReset(true)}><Icon name="refresh" size={18} /> Reset demo data</button></div>
          </div>
        )}
      </div>
      <ConfirmDialog open={confirmReset} danger title="Reset demo data?" confirmLabel="Reset everything"
        message="This restores the original sample courses, students, orders and settings, and signs you out. Changes made in this browser will be lost."
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => { resetDemo(); setConfirmReset(false); toast('Demo data has been reset'); go('/admin/login'); }} />
      <ConfirmDialog open={!!delFaq} danger title="Delete this question?" confirmLabel="Delete" message="It will be removed from the FAQ when you save settings."
        onCancel={() => setDelFaq(null)} onConfirm={() => { set('faqs', s.faqs.filter((f) => f.id !== delFaq)); setDelFaq(null); }} />
    </>
  );
}
