import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import type { ArtTone, Course, Currency } from '../lib/types';
import { useStore } from '../lib/store';
import { asset } from '../lib/uploads';

/* ---------- Currency preference (per-viewer convenience) ---------- */

const CurrencyCtx = createContext<{ currency: Currency; setCurrency: (c: Currency) => void }>({ currency: 'INR', setCurrency: () => {} });

function initialCurrency(): Currency {
  try {
    const saved = localStorage.getItem('ywr-currency');
    if (saved === 'INR' || saved === 'USD') return saved;
  } catch { /* ignore */ }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return tz.startsWith('America/') ? 'USD' : 'INR';
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, set] = useState<Currency>(initialCurrency);
  const setCurrency = (c: Currency) => {
    set(c);
    try { localStorage.setItem('ywr-currency', c); } catch { /* ignore */ }
  };
  return <CurrencyCtx.Provider value={{ currency, setCurrency }}>{children}</CurrencyCtx.Provider>;
}
export const useCurrency = () => useContext(CurrencyCtx);

export function formatMoney(amount: number, currency: Currency) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: currency === 'INR' ? 0 : 2, minimumFractionDigits: 0,
  }).format(amount);
}

export function CurrencyToggle() {
  const { currency, setCurrency } = useCurrency();
  return (
    <div className="currency-toggle" role="group" aria-label="Display prices in">
      {(['INR', 'USD'] as Currency[]).map((c) => (
        <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>
          {c === 'INR' ? '₹ INR' : '$ USD'}
        </button>
      ))}
    </div>
  );
}

export function Price({ course, size }: { course: Course; size?: 'lg' }) {
  const { currency } = useCurrency();
  return (
    <div className="price" style={size === 'lg' ? { fontSize: '2rem' } : undefined}>
      {formatMoney(course.prices[currency], currency)}
      <small>{course.pricesSample ? 'Sample price · not final' : 'One-time payment'}</small>
    </div>
  );
}

/* ---------- Botanical line art (decorative) ---------- */

export function Botanical({ className, draw = true, style }: { className?: string; draw?: boolean; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 240 320" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true" {...(draw ? { 'data-draw': '' } : {})}>
      <path d="M120 316 C 118 250, 112 190, 122 120 S 140 40, 132 6" />
      <path d="M121 250 C 92 236, 70 214, 58 182 C 86 186, 110 206, 121 250 Z" />
      <path d="M119 212 C 146 196, 170 172, 180 140 C 152 146, 128 170, 119 212 Z" />
      <path d="M118 168 C 94 152, 80 128, 76 100 C 100 108, 116 132, 118 168 Z" />
      <path d="M124 128 C 146 112, 160 90, 162 62 C 140 72, 126 96, 124 128 Z" />
      <path d="M129 84 C 116 66, 112 46, 116 24 C 130 38, 134 60, 129 84 Z" />
      <path d="M121 250 C 100 232, 84 210, 74 192" opacity="0.6" />
      <path d="M119 212 C 140 196, 158 176, 170 152" opacity="0.6" />
      <circle cx="132" cy="8" r="4" />
      <circle cx="58" cy="182" r="2.5" />
      <circle cx="180" cy="140" r="2.5" />
    </svg>
  );
}

/** Slowly rotating circular seal with the course name. */
export function Seal({ text = 'Rekha Radiance Method · Guided Face Yoga · ' }: { text?: string }) {
  return (
    <div className="seal" aria-hidden="true">
      <svg className="ring" viewBox="0 0 200 200">
        <defs><path id="seal-path" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" /></defs>
        <circle cx="100" cy="100" r="98" fill="var(--paper)" stroke="var(--line-strong)" strokeWidth="1" />
        <text fontFamily="DM Sans, sans-serif" fontSize="13.5" fontWeight="600" letterSpacing="3.6" fill="currentColor">
          <textPath href="#seal-path">{text.toUpperCase()}</textPath>
        </text>
      </svg>
      <div className="seal-core">
        <svg width="34" height="34" viewBox="0 0 64 64"><path d="M32 12c7 8 10 15 10 22a10 10 0 0 1-20 0c0-7 3-14 10-22z" fill="#8ea58b" /><path d="M14 40c6-2 12 0 18 6 6-6 12-8 18-6-3 8-10 12-18 12s-15-4-18-12z" fill="#D8A7A0" /></svg>
      </div>
    </div>
  );
}

/* ---------- Rekha's pose images ---------- */
// NOTE: these six images are AI-generated (OpenAI content credentials embedded), supplied by the
// agency and approved for the demo. They must be replaced with real photographs or clearly
// disclosed before launch — see DEMO-NOTES.md.
export const POSES = {
  butterfly: { file: 'butterfly-pose', label: 'butterfly pose' },
  tree: { file: 'tree-pose', label: 'tree pose' },
  warrior: { file: 'warrior-ii', label: 'warrior II pose' },
  triangle: { file: 'triangle-pose', label: 'triangle pose' },
  cobra: { file: 'cobra-pose', label: 'cobra pose' },
  twist: { file: 'seated-twist', label: 'a seated twist' },
} as const;
export type Pose = keyof typeof POSES;
export const poseCutout = (p: Pose) => asset(`images/rekha/${POSES[p].file}-cutout.webp`)!;
export const poseScene = (p: Pose) => asset(`images/rekha/${POSES[p].file}.webp`)!;
/** Course images that are one of the pose scenes have a matching transparent cut-out. */
export const cutoutFor = (image?: string) => (image && /^\/?images\/rekha\//.test(image) ? asset(image.replace(/\.webp$/, '-cutout.webp')) : undefined);

/* ---------- Portrait ---------- */

interface PortraitProps {
  small?: boolean;
  /** Admin preview override; null = no uploaded photo. */
  src?: string | null;
  clip?: boolean;
  pose?: Pose;
  /** Figure rises out of the arch as the section scrolls in. */
  rise?: boolean;
}

export function Portrait({ small, src: override, clip, pose = 'butterfly', rise }: PortraitProps) {
  const { state } = useStore();
  const uploaded = override !== undefined ? override : state.settings.portrait;
  const name = state.settings.displayName;

  if (uploaded) {
    return (
      <div className={`portrait ${small ? 'portrait-sm' : ''}`} {...(clip ? { 'data-clip': '' } : {})}>
        <div className="portrait-inner" {...(small ? {} : { 'data-parallax': '10' })}>
          <img src={uploaded} alt={`Portrait of ${name}`} />
        </div>
      </div>
    );
  }

  if (small) {
    return (
      <div className="portrait portrait-sm">
        <img src={poseScene(pose)} alt={`${name} in ${POSES[pose].label}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '62% 14%' }} />
      </div>
    );
  }

  return (
    <div className="portrait portrait-pose" {...(clip ? { 'data-clip': '' } : {})}>
      <div className="portrait-arch" aria-hidden="true">
        <svg className="portrait-art" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice">
          <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45">
            <circle cx="200" cy="200" r="130" />
            <circle cx="200" cy="200" r="168" opacity="0.5" />
          </g>
        </svg>
        <span className="arch-glow" />
      </div>
      <div className="portrait-figure" {...(rise ? { 'data-rise': '' } : {})}>
        <img className="portrait-cutout" src={poseCutout(pose)} alt={`${name} in ${POSES[pose].label}`} decoding="async" />
      </div>
      <span className="arch-floor" aria-hidden="true" />
    </div>
  );
}

/* ---------- Course artwork (abstract, no people) ---------- */

const tones: Record<ArtTone, { bg: string; a: string; b: string; c: string; line: string }> = {
  sage: { bg: '#dfe6d9', a: '#c7d4c1', b: '#a9bca5', c: '#f2e1da', line: '#4a6a4f' },
  rose: { bg: '#f1ddd6', a: '#e8c6bd', b: '#d8a7a0', c: '#e1e8dc', line: '#93504a' },
  sand: { bg: '#efe3cc', a: '#e5d3b0', b: '#d3bd92', c: '#e1e8dc', line: '#765f3c' },
};

export function CourseArt({ course, label = true }: { course: Pick<Course, 'art' | 'image' | 'title'>; label?: boolean }) {
  const t = tones[course.art];
  if (course.image) {
    return (
      <div className="course-art">
        <img src={asset(course.image)} alt="" loading="lazy" />
      </div>
    );
  }
  return (
    <div className={`course-art course-art-${course.art}`} aria-hidden="true">
      <svg className="art" viewBox="0 0 500 400" preserveAspectRatio="xMidYMid slice">
        <rect width="500" height="400" fill={t.bg} />
        <circle cx="390" cy="70" r="150" fill={t.c} opacity="0.85" />
        <circle cx="90" cy="360" r="170" fill={t.a} />
        <path d="M0 300 C 110 240, 210 340, 320 280 S 500 240, 500 240 V400 H0Z" fill={t.b} opacity="0.55" />
        <circle cx="250" cy="190" r="92" fill="none" stroke={t.line} strokeWidth="1" opacity="0.35" />
        <circle cx="250" cy="190" r="118" fill="none" stroke={t.line} strokeWidth="1" opacity="0.18" />
        <g fill="none" stroke={t.line} strokeWidth="1.3" strokeLinecap="round" opacity="0.75">
          <path d="M250 330 C 248 280, 244 240, 252 190 S 264 120, 258 96" />
          <path d="M250 286 C 226 274, 210 256, 200 230 C 224 234, 242 252, 250 286 Z" />
          <path d="M249 252 C 272 238, 290 218, 298 192 C 274 198, 256 218, 249 252 Z" />
          <path d="M251 214 C 232 200, 222 180, 220 158 C 240 166, 250 186, 251 214 Z" />
          <path d="M255 170 C 270 156, 278 138, 278 118 C 262 128, 256 146, 255 170 Z" />
        </g>
      </svg>
      {label && <span className="art-label badge badge-glass">Artwork placeholder</span>}
    </div>
  );
}

export function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#fdfbf7" stroke="#ddd3c2" />
      <path d="M32 12c7 8 10 15 10 22a10 10 0 0 1-20 0c0-7 3-14 10-22z" fill="#8ea58b" />
      <path d="M14 40c6-2 12 0 18 6 6-6 12-8 18-6-3 8-10 12-18 12s-15-4-18-12z" fill="#D9A3A0" />
    </svg>
  );
}

export function ProvisionalBadge({ show, children = 'Provisional title' }: { show: boolean; children?: ReactNode }) {
  if (!show) return null;
  return <span className="badge badge-warn" title="Awaiting confirmation from Rekha">{children}</span>;
}
