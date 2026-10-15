import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { IS_DEMO } from '../lib/config';
import { DEMO_ACCOUNTS } from '../lib/seed';
import { ScrollTrigger, getLenis, gsap, prefersReducedMotion, scrollToTop, usePageMotion, useSmoothScroll } from '../lib/motion';
import { Icon } from './Icon';
import { Logo } from './brand';
import { ConfirmDialog, Dialog, useToast } from './ui';

/** True in demo builds (VITE_APP_MODE=demo). Production builds compile every demo shortcut out. */
export const DEMO_MODE = IS_DEMO;

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/courses', label: 'Courses' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export function Header() {
  const { user, site } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const loc = useLocation();
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => { setOpen(false); setHidden(false); }, [loc.pathname]);

  // Compact on scroll; slide away when scrolling down, return when scrolling up.
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (Math.abs(y - last) > 6) {
        setHidden(y > last && y > 320);
        last = y;
      }
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // Freeze smooth scrolling and the page behind the open mobile menu; move focus in and back out.
  const wasOpen = useRef(false);
  useEffect(() => {
    const l = getLenis();
    if (open) { l?.stop(); document.body.style.overflow = 'hidden'; close.current?.focus(); } else {
      l?.start(); document.body.style.overflow = '';
      if (wasOpen.current) toggle.current?.focus();
    }
    wasOpen.current = open;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab') return;
      // Keep keyboard focus inside the open menu.
      const f = Array.from(document.querySelectorAll<HTMLElement>('#mobile-nav a, #mobile-nav button'));
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // The public header never links to admin; admins use the footer's Admin login.
  const account = user?.role === 'student' ? { to: '/dashboard', label: 'My Courses' } : { to: '/login', label: 'Student Login' };

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''} ${hidden && !open ? 'hidden' : ''}`} onFocus={() => setHidden(false)}>
      <div className="wrap">
        <Link to="/" className="brand" aria-label={`${site.brandName} home`}>
          <Logo />
          <span>
            <span className="brand-name">{site.brandName}</span>
            <span className="brand-sub">{site.courseBrand}</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
        </nav>
        <div className="header-actions">
          <a className="ig-link" href={site.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={`${site.brandName} on Instagram (opens in a new tab)`}>
            <Icon name="instagram" />
          </a>
          <Link to={account.to} className="btn btn-primary btn-sm login-btn">
            {account.label} <Icon name="arrowRight" size={15} />
          </Link>
          <button ref={toggle} type="button" className="icon-btn menu-toggle" aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
      <div id="mobile-nav" className="mobile-nav" hidden={!open} data-lenis-prevent role="dialog" aria-modal="true" aria-label="Menu">
        <div className="row-between">
          <Link to="/" className="brand"><Logo /><span className="brand-name">{site.brandName}</span></Link>
          <button ref={close} type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" /></button>
        </div>
        <nav aria-label="Mobile">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          <NavLink to={account.to}>{account.label}</NavLink>
        </nav>
        {IS_DEMO && (
          <button type="button" className="btn btn-outline-light btn-block" style={{ marginTop: 'auto' }}
            onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_DEMO_EVENT)); }}>
            <span className="demo-dot" aria-hidden="true" /> Demo mode: preview &amp; reset
          </button>
        )}
        <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-block" style={IS_DEMO ? undefined : { marginTop: 'auto' }}>
          <Icon name="instagram" /> Follow {site.instagramHandle}
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  const { site: s } = useStore();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-cta">
          <h2 data-split>Make a little time <em>for yourself.</em></h2>
          <div className="stack">
            <p style={{ maxWidth: '40ch', margin: 0 }}>Guided, prerecorded face yoga with {s.displayName}. Learn at your own pace, from anywhere.</p>
            <div className="row">
              <Link to="/courses" className="btn btn-light">Explore the courses <Icon name="arrowRight" size={16} /></Link>
              <Link to="/contact" className="btn btn-outline-light">Get in touch</Link>
            </div>
          </div>
        </div>
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="brand" style={{ marginBottom: 16 }}><Logo /><span className="brand-name">{s.brandName}</span></div>
            <p style={{ maxWidth: '34ch', fontSize: '0.92rem' }}>{s.footerTagline}</p>
            <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 8 }}>
              <Icon name="instagram" /> {s.instagramHandle}<span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><Link to="/courses">Courses</Link></li>
              <li><Link to="/about">About {s.displayName}</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4>Students</h4>
            <ul>
              <li><Link to="/login">Student Login</Link></li>
              <li><Link to="/register">Create an account</Link></li>
              <li><Link to="/dashboard">My Courses</Link></li>
              <li><Link to="/forgot-password">Reset password</Link></li>
            </ul>
          </div>
          <div>
            <h4>Policies</h4>
            <ul>
              <li><Link to="/policies/privacy">{s.policies.privacy.title}</Link></li>
              <li><Link to="/policies/terms">{s.policies.terms.title}</Link></li>
              <li><Link to="/policies/refund">{s.policies.refund.title}</Link></li>
              <li><a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></li>
              <li><Link to="/admin/login">Admin login</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-wordmark" aria-hidden="true">Yoga with <em>Rekha</em></div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {s.brandName}. All rights reserved.</span>
          <span>{s.footerNote ? `${s.footerNote} · ` : ''}Site by V Media Production</span>
        </div>
      </div>
    </footer>
  );
}

/** Compact footer for signed-in learning pages: no enrollment promotion, just help and account links. */
export function LearnerFooter() {
  const { site: s, user } = useStore();
  return (
    <footer className="learner-footer">
      <div className="wrap learner-footer-inner">
        <span className="brand-name" style={{ fontSize: '1rem' }}>{s.brandName}</span>
        <nav aria-label="Learner footer">
          {user ? <Link to="/dashboard">My Courses</Link> : <Link to="/courses">Courses</Link>}
          {user && <Link to="/account">Account</Link>}
          <Link to="/faq">Help &amp; FAQ</Link>
          <a href={`mailto:${s.supportEmail}`}>Email support</a>
          <Link to="/policies/terms">{s.policies.terms.title}</Link>
          <Link to="/policies/privacy">{s.policies.privacy.title}</Link>
        </nav>
        <span className="muted small">© {new Date().getFullYear()} {s.brandName}</span>
      </div>
    </footer>
  );
}

export const OPEN_DEMO_EVENT = 'ywr:open-demo';

/**
 * Demo mode only: a small floating control (on phones it lives in the menu instead, so it never covers content) that explains the demo, offers one-click previews of
 * the student and admin experiences, and resets the demo data (with confirmation).
 */
export function DemoControls({ floating = true }: { floating?: boolean }) {
  const { user, login, logout, resetDemo } = useStore();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const nav = useNavigate();
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_DEMO_EVENT, on);
    return () => window.removeEventListener(OPEN_DEMO_EVENT, on);
  }, []);
  if (!IS_DEMO) return null;

  const previewAs = async (who: 'student' | 'admin') => {
    setBusy(who);
    if (user) await logout();
    const r = await login(DEMO_ACCOUNTS[who].email, DEMO_ACCOUNTS[who].password);
    setBusy(null);
    if (!r.ok) { toast(r.error, 'err'); return; }
    setOpen(false);
    toast(who === 'admin' ? 'Previewing as the demo admin' : 'Previewing as the demo student');
    nav(who === 'admin' ? '/admin' : '/dashboard');
  };

  return (
    <>
      {floating && (
        <button type="button" className="demo-pill" onClick={() => setOpen(true)} aria-haspopup="dialog">
          <span className="demo-dot" aria-hidden="true" /> Demo mode
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="This is a demo"
        description="Sign-in, payments, video uploads and admin access are simulated. Nothing here is real security.">
        <ul className="check-list small">
          <li><Icon name="info" size={16} />Everything you change is saved only in <strong>this browser</strong>. Other people won’t see it.</li>
          <li><Icon name="info" size={16} />Records marked <span className="badge badge-outline">Sample</span> are fictional.</li>
          <li><Icon name="info" size={16} />No real payment is taken and no card details are ever requested. Please don’t use a real password.</li>
        </ul>
        <h3 style={{ fontSize: '1.05rem', marginTop: 20 }}>Preview the experience</h3>
        <div className="row">
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => previewAs('student')}>{busy === 'student' ? 'Signing in…' : 'View as demo student'}</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => previewAs('admin')}>{busy === 'admin' ? 'Signing in…' : 'View as demo admin'}</button>
          {user && <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await logout(); setOpen(false); toast('Signed out'); nav('/'); }}>Sign out</button>}
        </div>
        <hr className="rule" />
        <div className="row-between">
          <span className="small muted">Start over with the original sample content.</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmReset(true)}><Icon name="refresh" size={16} /> Reset demo data</button>
        </div>
      </Dialog>
      <ConfirmDialog open={confirmReset} danger title="Reset demo data?" confirmLabel="Reset everything"
        message="This restores the original sample courses, students, orders and settings, and signs you out. Changes made in this browser will be lost."
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => { await resetDemo?.(); setConfirmReset(false); setOpen(false); toast('Demo data has been reset'); nav('/'); }} />
    </>
  );
}

/** Shown while an admin is previewing unpublished settings on the public site. */
export function DraftPreviewBar() {
  const { previewingDraft, setPreviewDraft } = useStore();
  if (!previewingDraft) return null;
  return (
    <div className="preview-bar" role="status">
      <strong>Previewing unpublished changes.</strong>
      <span className="small">Visitors still see the published version.</span>
      <Link to="/admin/settings" className="btn btn-light btn-sm">Back to settings</Link>
      <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setPreviewDraft(false)}>Exit preview</button>
    </div>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { scrollToTop(); }, [pathname]);
  return null;
}

/** Thin gradient bar showing how far down the page you are. */
function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!bar.current || prefersReducedMotion()) return;
    const tween = gsap.fromTo(bar.current, { scaleX: 0 }, {
      scaleX: 1, ease: 'none',
      scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.3 },
    });
    const t = window.setTimeout(() => ScrollTrigger.refresh(), 700);
    return () => { window.clearTimeout(t); tween.scrollTrigger?.kill(); tween.kill(); };
  }, [pathname]);
  return <div className="scroll-progress" ref={bar} aria-hidden="true" />;
}

/** Pages whose first section is a full hero that sits under the transparent header. */
const OVERLAY = /^\/($|courses(\/[^/]+)?$|about$|faq$|contact$|policies\/)/;

export function PublicLayout() {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const learning = pathname.startsWith('/learn/');
  useSmoothScroll(true);
  usePageMotion(ref, pathname);
  return (
    <div ref={ref}>
      <ScrollProgress />
      <Header />
      {!OVERLAY.test(pathname) && <div className="header-spacer" aria-hidden="true" />}
      <main id="main" key={pathname} className="page-fade">
        <Outlet />
      </main>
      {learning ? <LearnerFooter /> : <Footer />}
      <DraftPreviewBar />
      <DemoControls />
    </div>
  );
}
