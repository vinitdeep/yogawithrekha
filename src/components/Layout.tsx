import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { ScrollTrigger, getLenis, gsap, prefersReducedMotion, scrollToTop, usePageMotion, useSmoothScroll } from '../lib/motion';
import { Icon } from './Icon';
import { Logo } from './brand';

/** Demo labels (demo credentials, "simulated" notices). Set VITE_DEMO_MODE=false to hide them. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/courses', label: 'Courses' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export function Header() {
  const { user, state } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const loc = useLocation();

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

  // Freeze smooth scrolling and the page behind the open mobile menu.
  useEffect(() => {
    const l = getLenis();
    if (open) { l?.stop(); document.body.style.overflow = 'hidden'; } else { l?.start(); document.body.style.overflow = ''; }
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const account = user ? (user.role === 'admin' ? { to: '/admin', label: 'Admin' } : { to: '/dashboard', label: 'My Courses' }) : { to: '/login', label: 'Student Login' };

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''} ${hidden && !open ? 'hidden' : ''}`} onFocus={() => setHidden(false)}>
      <div className="wrap">
        <Link to="/" className="brand" aria-label={`${state.settings.brandName} home`}>
          <Logo />
          <span>
            <span className="brand-name">{state.settings.brandName}</span>
            <span className="brand-sub">{state.settings.courseBrand}</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
        </nav>
        <div className="header-actions">
          <a className="ig-link" href={state.settings.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Yoga with Rekha on Instagram (opens in a new tab)">
            <Icon name="instagram" />
          </a>
          <Link to={account.to} className="btn btn-primary btn-sm login-btn">
            {account.label} <Icon name="arrowRight" size={15} />
          </Link>
          <button type="button" className="icon-btn menu-toggle" aria-expanded={open} aria-controls="mobile-nav" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
      <div id="mobile-nav" className="mobile-nav" hidden={!open} data-lenis-prevent>
        <div className="row-between">
          <Link to="/" className="brand"><Logo /><span className="brand-name">{state.settings.brandName}</span></Link>
          <button type="button" className="icon-btn" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="x" /></button>
        </div>
        <nav aria-label="Mobile">
          {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end}>{l.label}</NavLink>)}
          <NavLink to={account.to}>{account.label}</NavLink>
        </nav>
        <a href={state.settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light btn-block" style={{ marginTop: 'auto' }}>
          <Icon name="instagram" /> Follow {state.settings.instagramHandle}
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  const { state } = useStore();
  const s = state.settings;
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-cta">
          <h2 data-split>Make a little time <em>for yourself.</em></h2>
          <div className="stack">
            <p style={{ maxWidth: '40ch', margin: 0 }}>Guided, prerecorded face yoga with {s.displayName}. Learn at your own pace, from anywhere.</p>
            <div className="row">
              <Link to="/courses" className="btn btn-light">Explore the Courses <Icon name="arrowRight" size={16} /></Link>
              <Link to="/contact" className="btn btn-outline-light">Get in touch</Link>
            </div>
          </div>
        </div>
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="brand" style={{ marginBottom: 16 }}><Logo /><span className="brand-name">{s.brandName}</span></div>
            <p style={{ maxWidth: '34ch', fontSize: '0.92rem' }}>Online yoga classes, workshops and — soon — the {s.courseBrand}.</p>
            <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="row" style={{ gap: 8 }}>
              <Icon name="instagram" /> {s.instagramHandle}<span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li><Link to="/courses">Courses</Link></li>
              <li><Link to="/about">About Rekha</Link></li>
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
              <li><Link to="/policies/privacy">Privacy Policy</Link></li>
              <li><Link to="/policies/terms">Terms</Link></li>
              <li><Link to="/policies/refund">Refund Policy</Link></li>
              <li><a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a></li>
              <li><Link to="/admin/login">Admin login</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-wordmark" aria-hidden="true">Yoga with <em>Rekha</em></div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {s.brandName}. All rights reserved.</span>
          <span>Policy pages are drafts awaiting review · Site by V Media Production</span>
        </div>
      </div>
    </footer>
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
      <Footer />
    </div>
  );
}
