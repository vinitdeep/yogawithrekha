import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { useStore } from '../../lib/store';
import { CURRENCIES, type Currency, type FaqItem, type PageKey, type Settings } from '../../lib/types';
import { Icon } from '../../components/Icon';
import { Portrait } from '../../components/brand';
import { ConfirmDialog, Field, Notice, TextArea, usePageTitle, useToast } from '../../components/ui';
import { validateSettings } from '../../lib/demo/engine';
import { CURRENCY_NAME } from '../../lib/money';
import { IS_DEMO } from '../../lib/config';
import { formatDateTime } from '../../lib/dates';
import { OPEN_DEMO_EVENT } from '../../components/Layout';

type Tab = 'brand' | 'home' | 'about' | 'contact' | 'faq' | 'footer' | 'policies' | 'commerce' | 'seo' | 'data';

const TAB_OF_FIELD: Record<string, Tab> = {
  brandName: 'brand', courseBrand: 'brand', displayName: 'brand', portraitAlt: 'brand', logoAlt: 'brand',
  heroHeadline: 'home', heroAccent: 'home', heroPrimaryCta: 'home',
  supportEmail: 'contact', instagramUrl: 'contact', whatsappNumber: 'contact',
  faq: 'faq', displayCurrencies: 'commerce', defaultCurrency: 'commerce', defaultAccessMonths: 'commerce', launchDate: 'commerce',
};

const PAGES: [PageKey, string][] = [['home', 'Home'], ['courses', 'Courses'], ['about', 'About'], ['faq', 'FAQ'], ['contact', 'Contact']];

export function AdminSettings() {
  const { state, saveSettingsDraft, publishSettings, discardSettingsDraft, setPreviewDraft, uploadImage } = useStore();
  const go = useNavigate();
  const toast = useToast();
  const base = state.settingsDraft ?? state.settings;
  const [tab, setTab] = useState<Tab>('brand');
  const [s, setS] = useState<Settings>(base);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'publish' | 'discardDraft' | { faq: string }>(null);
  usePageTitle('Website settings');

  // If the saved draft changes elsewhere (another tab), follow it when there are no local edits.
  const baseJson = JSON.stringify(base);
  const dirty = JSON.stringify(s) !== baseJson;
  useEffect(() => { if (!dirty) setS(base); }, [baseJson]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasDraft = !!state.settingsDraft;

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !busy && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((cur) => ({ ...cur, [k]: v }));

  const check = (): boolean => {
    const er = validateSettings(s);
    setErrors(er);
    const first = Object.keys(er)[0];
    if (first) {
      setTab(TAB_OF_FIELD[first] ?? (first.startsWith('seo_') ? 'seo' : tab));
      toast('Please fix the highlighted fields', 'err');
      return false;
    }
    return true;
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!check()) return false;
    setBusy('save');
    const r = await saveSettingsDraft(s);
    setBusy(null);
    if (!r.ok) { toast(r.error, 'err'); return false; }
    toast('Draft saved — not yet visible to visitors');
    return true;
  };

  const preview = async () => {
    if (dirty && !(await saveDraft())) return;
    setPreviewDraft(true);
    go('/');
  };

  const doPublish = async () => {
    if (dirty && !(await saveDraft())) { setConfirm(null); return; }
    setBusy('publish');
    const r = await publishSettings();
    setBusy(null);
    setConfirm(null);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setPreviewDraft(false);
    toast('Published — the website has been updated');
  };

  const doDiscardDraft = async () => {
    setBusy('discard');
    const r = await discardSettingsDraft();
    setBusy(null);
    setConfirm(null);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setS(state.settings);
    setPreviewDraft(false);
    toast('Unpublished changes discarded', 'info');
  };

  const onImage = (key: 'portrait' | 'logo') => async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(key);
    const r = await uploadImage(f, key);
    setBusy(null);
    if (!r.ok) { setErrors({ ...errors, [key]: r.error }); return; }
    setS((cur) => ({ ...cur, [key]: r.data, [`${key}Alt`]: '' }));
    setErrors({ ...errors, [key]: '', [`${key}Alt`]: 'Describe the new image.' });
  };

  const updateFaq = (id: string, patch: Partial<FaqItem>) => set('faqs', s.faqs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const moveFaq = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= s.faqs.length) return;
    const a = s.faqs.slice();
    [a[i], a[j]] = [a[j], a[i]];
    set('faqs', a);
  };
  const setPolicy = (k: 'privacy' | 'terms' | 'refund', patch: Partial<Settings['policies']['privacy']>) => set('policies', { ...s.policies, [k]: { ...s.policies[k], ...patch } });
  const toggleCurrency = (c: Currency, on: boolean) => set('displayCurrencies', on ? CURRENCIES.filter((x) => x === c || s.displayCurrencies.includes(x)) : s.displayCurrencies.filter((x) => x !== c));

  const tabs: [Tab, string][] = [
    ['brand', 'Brand & images'], ['home', 'Homepage'], ['about', 'About'], ['contact', 'Contact & social'], ['faq', 'FAQ'],
    ['footer', 'Footer'], ['policies', 'Policies'], ['commerce', 'Currency & access'], ['seo', 'Page titles & SEO'],
    ...(IS_DEMO ? [['data', 'Demo data'] as [Tab, string]] : []),
  ];
  const err = (k: string) => errors[k] || undefined;

  return (
    <>
      <div className="admin-top admin-top-sticky">
        <div>
          <h1>Website settings</h1>
          <p className="small" style={{ margin: 0 }} aria-live="polite">
            {dirty ? <span className="unsaved">● Unsaved edits</span> : hasDraft ? <span className="badge badge-warn">Draft saved · not published</span> : <span className="muted">Everything is published{state.settingsPublishedAt ? ` (last ${formatDateTime(state.settingsPublishedAt)})` : ''}.</span>}
          </p>
        </div>
        <div className="row">
          {dirty && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setS(base); setErrors({}); }}>Undo edits</button>}
          <button type="button" className="btn btn-secondary btn-sm" disabled={!dirty || !!busy} onClick={() => void saveDraft()}>{busy === 'save' ? 'Saving…' : 'Save draft'}</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={(!dirty && !hasDraft) || !!busy} onClick={() => void preview()}><Icon name="eye" size={15} /> Preview</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={(!dirty && !hasDraft) || !!busy} onClick={() => check() && setConfirm('publish')}>Publish…</button>
        </div>
      </div>
      {hasDraft && !dirty && (
        <Notice kind="info">
          You have saved changes that visitors can’t see yet. <button type="button" className="link-btn" onClick={() => void preview()}>Preview them on the site</button>, publish them, or{' '}
          <button type="button" className="link-btn link-danger" onClick={() => setConfirm('discardDraft')}>discard the draft</button>.
        </Notice>
      )}

      <div className="tabs tabs-scroll" role="tablist" aria-label="Settings sections">
        {tabs.map(([k, label]) => <button key={k} type="button" role="tab" id={`st-${k}`} aria-selected={tab === k} aria-controls="st-panel" onClick={() => setTab(k)}>{label}</button>)}
      </div>
      <div id="st-panel" role="tabpanel" aria-labelledby={`st-${tab}`} className="card">
        {tab === 'brand' && (
          <div className="form" style={{ maxWidth: 680 }}>
            <div className="form-row">
              <Field label="Brand name" required value={s.brandName} error={err('brandName')} onChange={(e) => set('brandName', e.target.value)} />
              <Field label="Offering name" required value={s.courseBrand} error={err('courseBrand')} hint="e.g. Rekha Radiance Method" onChange={(e) => set('courseBrand', e.target.value)} />
            </div>
            <Field label="Founder’s public name" required value={s.displayName} error={err('displayName')} hint="Used throughout the website." onChange={(e) => set('displayName', e.target.value)} />
            <ImageSetting label="Portrait" value={s.portrait} alt={s.portraitAlt} altError={err('portraitAlt')} uploadError={err('portrait')} busy={busy === 'portrait'}
              onFile={onImage('portrait')} onRemove={() => setS({ ...s, portrait: undefined })} onAlt={(v) => set('portraitAlt', v)}
              preview={<div style={{ width: 150 }}><Portrait src={s.portrait ?? null} /></div>}
              help="Only upload a photograph supplied or approved by Rekha. Without one, the site uses the placeholder pose images." />
            <ImageSetting label="Logo" value={s.logo} alt={s.logoAlt} altError={err('logoAlt')} uploadError={err('logo')} busy={busy === 'logo'}
              onFile={onImage('logo')} onRemove={() => setS({ ...s, logo: undefined })} onAlt={(v) => set('logoAlt', v)}
              preview={s.logo ? <img src={s.logo} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} /> : <span className="muted small">Using the drawn leaf mark.</span>}
              help="A square image works best. Use an approved logo file only." />
          </div>
        )}

        {tab === 'home' && (
          <div className="form" style={{ maxWidth: 720 }}>
            <Field label="Small heading above the headline" value={s.heroEyebrow} onChange={(e) => set('heroEyebrow', e.target.value)} />
            <Field label="Headline" required value={s.heroHeadline} error={err('heroHeadline')} hint={`${s.heroHeadline.length}/70 characters. Short headlines leave room for the course introduction and portrait.`} onChange={(e) => set('heroHeadline', e.target.value)} />
            <Field label="Accent words" value={s.heroAccent} error={err('heroAccent')} hint="Part of the headline shown in the gradient colour. Leave blank for none." onChange={(e) => set('heroAccent', e.target.value)} />
            <TextArea label="Supporting text" value={s.heroText} style={{ minHeight: 90 }} hint="Avoid medical claims or promises about appearance." onChange={(e) => set('heroText', e.target.value)} />
            <div className="form-row">
              <Field label="Main button label" required value={s.heroPrimaryCta} error={err('heroPrimaryCta')} hint="Links to Courses." onChange={(e) => set('heroPrimaryCta', e.target.value)} />
              <Field label="Secondary link label" value={s.heroSecondaryCta} hint="A quieter text link to About. Leave blank to hide." onChange={(e) => set('heroSecondaryCta', e.target.value)} />
            </div>
          </div>
        )}

        {tab === 'about' && (
          <div className="form" style={{ maxWidth: 720 }}>
            <Notice kind="warn" title="Unpublished until confirmed">
              The full name and qualifications stay off the website until you tick the confirmation boxes{IS_DEMO ? '' : ' — and are removed from the published data until then'}. Only tick them once Rekha has confirmed the details in writing.
            </Notice>
            <Field label="Full name" value={s.fullName} onChange={(e) => set('fullName', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.fullNameConfirmed} onChange={(e) => set('fullNameConfirmed', e.target.checked)} /><span>Confirmed by Rekha — show full name publicly</span></label>
            <Field label="Qualifications" value={s.credentials} onChange={(e) => set('credentials', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.credentialsConfirmed} onChange={(e) => set('credentialsConfirmed', e.target.checked)} /><span>Verified — show qualifications publicly</span></label>
            <TextArea label="Introduction" value={s.aboutIntro} onChange={(e) => set('aboutIntro', e.target.value)} style={{ minHeight: 100 }} />
            <TextArea label="Personal story" value={s.personalStory} hint="Leave blank until Rekha supplies her story. Separate paragraphs with a blank line. Avoid medical or guaranteed-result claims." onChange={(e) => set('personalStory', e.target.value)} style={{ minHeight: 180 }} />
          </div>
        )}

        {tab === 'contact' && (
          <div className="form" style={{ maxWidth: 640 }}>
            <Field label="Support email" type="email" required value={s.supportEmail} error={err('supportEmail')} hint={s.supportEmail.endsWith('example.com') ? 'Placeholder — replace before launch.' : undefined} onChange={(e) => set('supportEmail', e.target.value)} />
            <div className="form-row">
              <Field label="Instagram profile link" type="url" value={s.instagramUrl} error={err('instagramUrl')} onChange={(e) => set('instagramUrl', e.target.value)} />
              <Field label="Instagram handle" value={s.instagramHandle} onChange={(e) => set('instagramHandle', e.target.value)} />
            </div>
            <Field label="WhatsApp number (optional)" value={s.whatsappNumber} error={err('whatsappNumber')} hint="With country code, e.g. +91 98xxx xxxxx. Shown only once marked verified." onChange={(e) => set('whatsappNumber', e.target.value)} />
            <label className="check"><input type="checkbox" checked={s.whatsappVerified} onChange={(e) => set('whatsappVerified', e.target.checked)} /><span>Number verified by Rekha — show a WhatsApp link on the Contact page</span></label>
          </div>
        )}

        {tab === 'faq' && (
          <div className="stack">
            {errors.faq && <Notice kind="err">{errors.faq}</Notice>}
            <p className="muted small" style={{ margin: 0 }}>{s.faqs.filter((f) => f.published).length} of {s.faqs.length} questions are shown on the website, in this order.</p>
            {s.faqs.map((f, i) => (
              <div key={f.id} className={`card card-sm card-flat ${f.published ? '' : 'is-hidden-item'}`}>
                <div className="form">
                  <div className="form-row">
                    <Field label={`Question ${i + 1}`} value={f.question} onChange={(e) => updateFaq(f.id, { question: e.target.value })} error={!f.question.trim() && errors.faq ? 'Required' : undefined} />
                    <Field label="Category" value={f.category} onChange={(e) => updateFaq(f.id, { category: e.target.value })} list="faq-cats" />
                  </div>
                  <TextArea label="Answer" value={f.answer} style={{ minHeight: 80 }} onChange={(e) => updateFaq(f.id, { answer: e.target.value })} error={!f.answer.trim() && errors.faq ? 'Required' : undefined} />
                  <div className="row-between">
                    <span className="row" style={{ gap: 18 }}>
                      <label className="check"><input type="checkbox" checked={f.published} onChange={(e) => updateFaq(f.id, { published: e.target.checked })} /><span>Show on website</span></label>
                      <label className="check"><input type="checkbox" checked={f.draft} onChange={(e) => updateFaq(f.id, { draft: e.target.checked })} /><span>Label as draft (depends on an unconfirmed policy)</span></label>
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <button type="button" className="icon-btn icon-btn-sm" disabled={i === 0} aria-label={`Move question ${i + 1} up`} onClick={() => moveFaq(i, -1)}><Icon name="arrowUp" size={16} /></button>
                      <button type="button" className="icon-btn icon-btn-sm" disabled={i === s.faqs.length - 1} aria-label={`Move question ${i + 1} down`} onClick={() => moveFaq(i, 1)}><Icon name="arrowDown" size={16} /></button>
                      <button type="button" className="icon-btn icon-btn-sm icon-btn-danger" aria-label={`Delete question ${i + 1}`} onClick={() => setConfirm({ faq: f.id })}><Icon name="trash" size={16} /></button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <datalist id="faq-cats">{[...new Set(s.faqs.map((f) => f.category))].map((c) => <option key={c} value={c} />)}</datalist>
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => set('faqs', [...s.faqs, { id: `f-${Date.now().toString(36)}`, category: 'Enrollment', question: '', answer: '', published: false, draft: false }])}><Icon name="plus" size={16} /> Add question</button></div>
          </div>
        )}

        {tab === 'footer' && (
          <div className="form" style={{ maxWidth: 640 }}>
            <TextArea label="Footer description" value={s.footerTagline} style={{ minHeight: 70 }} onChange={(e) => set('footerTagline', e.target.value)} />
            <Field label="Footer note" value={s.footerNote} hint="Small print next to the copyright line, e.g. “Policy pages are drafts awaiting review”." onChange={(e) => set('footerNote', e.target.value)} />
          </div>
        )}

        {tab === 'policies' && (
          <div className="stack">
            <Notice kind="warn">Policy text is placeholder content. Have it reviewed by a qualified professional and approved by Rekha before unticking “Draft”. Don’t describe a refund policy that hasn’t been confirmed.</Notice>
            {(['privacy', 'terms', 'refund'] as const).map((k) => (
              <div key={k} className="card card-sm card-flat">
                <div className="form">
                  <Field label="Page title" value={s.policies[k].title} onChange={(e) => setPolicy(k, { title: e.target.value })} />
                  <TextArea label="Content" hint="A line followed by more lines becomes a heading. Separate sections with a blank line." value={s.policies[k].body} style={{ minHeight: 200 }} onChange={(e) => setPolicy(k, { body: e.target.value })} />
                  <label className="check"><input type="checkbox" checked={s.policies[k].draft} onChange={(e) => setPolicy(k, { draft: e.target.checked })} /><span>Draft — show an “awaiting review” notice on the page</span></label>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'commerce' && (
          <div className="form" style={{ maxWidth: 680 }}>
            <fieldset className="fieldset">
              <legend>Currencies</legend>
              <p className="muted small" style={{ marginTop: 0 }}>Choose which currencies prices are shown in. Every published course needs a price in each one. Showing a currency doesn’t guarantee a payment method is available in that country.</p>
              {CURRENCIES.map((c) => (
                <label key={c} className="check"><input type="checkbox" checked={s.displayCurrencies.includes(c)} onChange={(e) => toggleCurrency(c, e.target.checked)} /><span>{c} — {CURRENCY_NAME[c]}</span></label>
              ))}
              {errors.displayCurrencies && <span className="error">{errors.displayCurrencies}</span>}
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="def-cur">Default currency</label>
                <select id="def-cur" className="select" value={s.defaultCurrency} aria-invalid={!!errors.defaultCurrency} onChange={(e) => set('defaultCurrency', e.target.value as Currency)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="hint">Used when we can’t tell where a visitor is. Visitors in the US and Canada see USD/CAD automatically when offered.</span>
                {errors.defaultCurrency && <span className="error">{errors.defaultCurrency}</span>}
              </div>
            </fieldset>
            <Field label="Default access for new courses (calendar months)" type="number" min={1} max={36} value={s.defaultAccessMonths} error={err('defaultAccessMonths')}
              hint="Pre-fills new courses. Each course has its own setting, and existing enrollments are never changed." onChange={(e) => set('defaultAccessMonths', Number(e.target.value))} />
            <div className="field">
              <label htmlFor="rule">When does access start?</label>
              <select id="rule" className="select" value={s.accessStartRule} onChange={(e) => set('accessStartRule', e.target.value as Settings['accessStartRule'])}>
                <option value="enrollment">When the enrollment is confirmed (default)</option>
                <option value="launch-date">On the launch date, for anyone who enrolls before it</option>
              </select>
              <span className="hint">Applies to new enrollments only. Both rules are enforced by the server in production.</span>
            </div>
            {s.accessStartRule === 'launch-date' && <Field label="Launch date" type="date" value={s.launchDate} error={err('launchDate')} onChange={(e) => set('launchDate', e.target.value)} hint="Tentatively around 15 December 2026. Access starts at 00:00 IST on this date." />}
            <Notice kind="info" title="How the end date is calculated">
              Access ends at 11:59 pm India Standard Time on the same day-of-month after the course’s number of calendar months. If that day doesn’t exist in the final month, access ends on that month’s last day (for example 31 August → 28 February, or 29 February in a leap year).
            </Notice>
          </div>
        )}

        {tab === 'seo' && (
          <div className="stack">
            <p className="muted small" style={{ margin: 0 }}>Browser-tab titles and search-result descriptions for the main pages. “{s.brandName}” is added to each title automatically.</p>
            {PAGES.map(([k, label]) => (
              <div key={k} className="card card-sm card-flat">
                <div className="form-row">
                  <Field label={`${label} — page title`} value={s.seo[k].title} hint={k === 'home' ? 'Leave blank to use the brand and offering name.' : undefined} onChange={(e) => set('seo', { ...s.seo, [k]: { ...s.seo[k], title: e.target.value } })} />
                  <TextArea label={`${label} — description`} value={s.seo[k].description} error={err(`seo_${k}`)} hint={`${s.seo[k].description.length}/170 characters`} style={{ minHeight: 70 }} onChange={(e) => set('seo', { ...s.seo, [k]: { ...s.seo[k], description: e.target.value } })} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'data' && IS_DEMO && (
          <div className="stack" style={{ maxWidth: 640 }}>
            <p className="muted" style={{ marginTop: 0 }}>All courses, students, orders and settings in this demo are saved in this browser only. Resetting restores the original sample content and signs you out.</p>
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => window.dispatchEvent(new Event(OPEN_DEMO_EVENT))}>Open demo controls (preview as student, reset)…</button></div>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirm === 'publish'} title="Publish these settings?" confirmLabel={busy === 'publish' ? 'Publishing…' : 'Publish now'}
        message={<>Visitors will see the changes immediately. The change is recorded in the audit history.{s.policies.privacy.draft || s.policies.terms.draft || s.policies.refund.draft ? ' Policies still marked draft will keep their “awaiting review” notice.' : ''}</>}
        onCancel={() => setConfirm(null)} onConfirm={doPublish} />
      <ConfirmDialog open={confirm === 'discardDraft'} danger title="Discard unpublished changes?" confirmLabel="Discard draft"
        message="The saved draft is thrown away and the settings go back to what visitors currently see."
        onCancel={() => setConfirm(null)} onConfirm={doDiscardDraft} />
      <ConfirmDialog open={!!confirm && typeof confirm === 'object'} danger title="Delete this question?" confirmLabel="Delete"
        message="It is removed from your draft. Visitors keep seeing it until you publish."
        onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm && typeof confirm === 'object') set('faqs', s.faqs.filter((f) => f.id !== confirm.faq)); setConfirm(null); }} />
      <ConfirmDialog open={blocker.state === 'blocked'} title="Leave without saving?" danger confirmLabel="Leave and discard"
        message="You have edits that haven’t been saved as a draft. If you leave now, they will be lost."
        onCancel={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
    </>
  );
}

function ImageSetting({ label, value, alt, altError, uploadError, busy, onFile, onRemove, onAlt, preview, help }: {
  label: string; value?: string; alt: string; altError?: string; uploadError?: string; busy: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void; onRemove: () => void; onAlt: (v: string) => void; preview: ReactNode; help: string;
}) {
  return (
    <fieldset className="fieldset">
      <legend>{label}</legend>
      <div className="row" style={{ alignItems: 'flex-start', gap: 20 }}>
        {preview}
        <div className="stack" style={{ flex: 1, minWidth: 220 }}>
          <div className="row">
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Icon name="upload" size={16} /> {busy ? 'Uploading…' : value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onFile} disabled={busy} />
            </label>
            {value && <button type="button" className="btn btn-ghost btn-sm" onClick={onRemove}>Remove</button>}
          </div>
          {uploadError && <span className="error" role="alert">{uploadError}</span>}
          {value && <Field label={`${label} description (alt text)`} required value={alt} error={altError} onChange={(e) => onAlt(e.target.value)} />}
          <p className="muted small" style={{ margin: 0 }}>{help}{IS_DEMO ? ' Demo: images are stored in this browser (max 1.5 MB).' : ''}</p>
        </div>
      </div>
    </fieldset>
  );
}
