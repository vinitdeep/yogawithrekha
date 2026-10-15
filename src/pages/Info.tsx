import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Icon } from '../components/Icon';
import { Portrait } from '../components/brand';
import { FaqList } from '../components/course';
import { Field, Notice, TextArea, emailOk, usePageTitle } from '../components/ui';
import { InstagramCard } from './Home';
import { DEMO_MODE } from '../components/Layout';
import NotFound from './NotFound';

export function About() {
  const { site: s } = useStore();
  usePageTitle(s.seo.about.title || `About ${s.displayName}`, s.seo.about.description || s.aboutIntro);
  // Unconfirmed details are never shown, even if they are stored.
  const name = s.fullNameConfirmed && s.fullName.trim() ? s.fullName : s.displayName;
  const credentialsPublic = s.credentialsConfirmed && s.credentials.trim();
  return (
    <>
      <section className="page-hero" data-hero>
        <div className="wrap split">
          <div style={{ maxWidth: 440, width: '100%', margin: '0 auto' }}><Portrait clip pose="twist" /></div>
          <div>
            <span className="eyebrow" data-reveal>About</span>
            <h1 data-split>Meet <em>{name}</em></h1>
            {credentialsPublic && <p className="badge badge-sage" style={{ fontSize: '0.85rem' }}>{s.credentials}</p>}
            <p className="lead" data-reveal>{s.aboutIntro}</p>
            <div className="row" style={{ marginTop: 24 }} data-reveal>
              <Link to="/courses" className="btn btn-primary">Explore the courses</Link>
              <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <Icon name="instagram" /> {s.instagramHandle}<span className="sr-only">(opens in a new tab)</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap wrap-narrow">
          <span className="eyebrow">{s.displayName}’s story</span>
          <h2 data-split>Teaching, in <em>her own words</em></h2>
          {s.personalStory ? (
            s.personalStory.split(/\n{2,}/).map((para, i) => <p key={i} className={i === 0 ? 'lead' : ''}>{para}</p>)
          ) : (
            <div className="empty" style={{ textAlign: 'left' }}>
              <span className="badge badge-warn">Coming soon</span>
              <p className="muted" style={{ marginTop: 12 }}>
                {s.displayName} will share her story here — how she came to yoga, what she enjoys about teaching, and what she hopes students take from the {s.courseBrand}.
              </p>
            </div>
          )}

          <h2 style={{ marginTop: 48 }}>Qualifications</h2>
          {credentialsPublic ? (
            <p>{s.credentials}</p>
          ) : (
            <div className="empty" style={{ textAlign: 'left' }}>
              <span className="badge badge-warn">Awaiting verification</span>
              <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>Verified qualifications will be listed here once the details are confirmed.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="wrap" data-reveal><InstagramCard /></div>
      </section>
    </>
  );
}

export function Faq() {
  const { site } = useStore();
  const [q, setQ] = useState('');
  usePageTitle(site.seo.faq.title || 'FAQ', site.seo.faq.description);
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const items = site.faqs.filter((f) => f.published && (!term || `${f.question} ${f.answer}`.toLowerCase().includes(term)));
    const map = new Map<string, typeof items>();
    items.forEach((f) => map.set(f.category, [...(map.get(f.category) ?? []), f]));
    return [...map.entries()];
  }, [q, site.faqs]);
  const anyDraft = site.faqs.some((f) => f.published && f.draft);
  return (
    <>
      <section className="page-hero" data-hero>
        <div className="wrap wrap-narrow">
          <span className="eyebrow" data-reveal>Help</span>
          <h1 data-split>Frequently asked <em>questions</em></h1>
          <p className="lead" data-reveal>Everything you need to know about enrolling, learning and getting support.</p>
          <div className="field" style={{ maxWidth: 480, marginTop: 20 }} data-reveal>
            <label htmlFor="faq-q" className="sr-only">Search questions</label>
            <input id="faq-q" className="input" type="search" placeholder="Search questions…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </section>
      <section className="section-tight">
        <div className="wrap wrap-narrow">
          {anyDraft && <Notice kind="warn">Answers marked <strong>Draft</strong> depend on policies (refunds, renewals, payment methods) that have not been confirmed yet.</Notice>}
          {groups.length === 0 && <div className="empty" style={{ marginTop: 28 }}><h2 style={{ fontSize: '1.3rem' }}>No matching questions</h2><p className="muted">Try a different word, or <Link to="/contact">contact us</Link>.</p></div>}
          {groups.map(([cat, items]) => (
            <div key={cat} style={{ marginTop: 40 }}>
              <h2 style={{ fontSize: '1.4rem' }}>{cat}</h2>
              <FaqList items={items} />
            </div>
          ))}
          <div className="card card-flat center" style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: '1.4rem' }}>Still have a question?</h2>
            <p className="muted">We’re happy to help.</p>
            <Link to="/contact" className="btn btn-primary">Contact support</Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function Contact() {
  const { site: s, sendContact } = useStore();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'saved' | 'sent'>('idle');
  usePageTitle(s.seo.contact.title || 'Contact', s.seo.contact.description);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!form.name.trim()) er.name = 'Please enter your name.';
    if (!emailOk(form.email)) er.email = 'Please enter a valid email address, like name@example.com.';
    if (form.message.trim().length < 10) er.message = 'Please write a message of at least 10 characters.';
    setErrors(er);
    if (Object.keys(er).length) {
      document.getElementById(`c-${Object.keys(er)[0]}`)?.focus();
      return;
    }
    if (status === 'sending') return;
    setStatus('sending');
    const r = await sendContact(form.name.trim(), form.email.trim(), form.message.trim());
    if (!r.ok) { setStatus('idle'); setErrors({ form: r.error }); return; }
    setStatus(r.data.delivered ? 'sent' : 'saved');
    setForm({ name: '', email: '', message: '' });
  };

  const wa = s.whatsappVerified && s.whatsappNumber ? `https://wa.me/${s.whatsappNumber.replace(/\D/g, '')}` : null;

  return (
    <>
      <section className="page-hero" data-hero>
        <div className="wrap">
          <span className="eyebrow" data-reveal>Contact</span>
          <h1 data-split>Get in <em>touch</em></h1>
          <p className="lead" data-reveal>Questions about a course, your account or a payment? Send a message and we’ll get back to you.</p>
        </div>
      </section>
      <section className="section-tight">
        <div className="wrap checkout-grid">
          <div className="card">
            {status === 'saved' || status === 'sent' ? (
              <div role="status">
                {status === 'saved' ? (
                  <Notice kind="demo" title="Message saved in this demo — not sent">
                    No email service is connected, so your message has <strong>not</strong> been delivered to anyone. It is stored in this browser only (an admin can see it in the demo dashboard).
                  </Notice>
                ) : (
                  <Notice kind="ok" title="Thank you — your message has been received">We’ll reply to the email address you gave as soon as we can.</Notice>
                )}
                <button type="button" className="btn btn-secondary" style={{ marginTop: 18 }} onClick={() => setStatus('idle')}>Write another message</button>
              </div>
            ) : (
              <form className="form" onSubmit={submit} noValidate>
                {DEMO_MODE && <Notice kind="demo">Demo form: messages are validated and saved locally, but are not delivered.</Notice>}
                {errors.form && <Notice kind="err">{errors.form}</Notice>}
                <Field id="c-name" label="Your name" required autoComplete="name" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Field id="c-email" label="Email address" type="email" required autoComplete="email" value={form.email} error={errors.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <TextArea id="c-message" label="Message" required value={form.message} error={errors.message} hint="Include the course name if your question is about a specific course." onChange={(e) => setForm({ ...form, message: e.target.value })} />
                <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
                  {status === 'sending' ? <><span className="spinner" aria-hidden="true" /> Sending…</> : 'Send message'}
                </button>
              </form>
            )}
          </div>
          <aside className="stack">
            <div className="card card-sm card-flat">
              <h2 style={{ fontSize: '1.2rem' }}>Support email</h2>
              <a href={`mailto:${s.supportEmail}`} className="row" style={{ gap: 8 }}><Icon name="mail" />{s.supportEmail}</a>
              {s.supportEmail.endsWith('example.com') && <p className="muted small" style={{ margin: '8px 0 0' }}>Placeholder address — the real support email will be added.</p>}
            </div>
            <div className="card card-sm card-flat">
              <h2 style={{ fontSize: '1.2rem' }}>Instagram</h2>
              <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 8 }}><Icon name="instagram" />{s.instagramHandle}<span className="sr-only">(opens in a new tab)</span></a>
            </div>
            {wa && (
              <div className="card card-sm card-flat">
                <h2 style={{ fontSize: '1.2rem' }}>WhatsApp</h2>
                <a href={wa} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 8 }}><Icon name="whatsapp" />Message on WhatsApp</a>
              </div>
            )}
            <div className="card card-sm card-flat">
              <h2 style={{ fontSize: '1.2rem' }}>Before you write</h2>
              <p className="muted small" style={{ margin: 0 }}>Many questions are answered in the <Link to="/faq">FAQ</Link>.</p>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

export function Policy() {
  const { kind } = useParams();
  const { site } = useStore();
  const doc = kind && (kind === 'privacy' || kind === 'terms' || kind === 'refund') ? site.policies[kind] : null;
  usePageTitle(doc?.title ?? 'Policy');
  if (!doc) return <NotFound />;
  const blocks = doc.body.split(/\n{2,}/);
  return (
    <section className="page-hero" data-hero>
      <div className="wrap wrap-narrow">
        <span className="eyebrow" data-reveal>Policies</span>
        <h1 data-split>{doc.title}</h1>
        {doc.draft && <Notice kind="warn" title="Draft — awaiting review">This text is placeholder content and has not been approved by {site.brandName} or reviewed by a legal professional.</Notice>}
        <div className="prose" style={{ marginTop: 28 }}>
          {blocks.map((b, i) => {
            const [first, ...rest] = b.split('\n');
            if (rest.length) return <div key={i}><h2>{first}</h2>{rest.map((r, j) => <p key={j}>{r}</p>)}</div>;
            return <p key={i}>{first}</p>;
          })}
        </div>
      </div>
    </section>
  );
}
