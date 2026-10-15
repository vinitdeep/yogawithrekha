import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePublishedCourses, useStore } from '../lib/store';
import type { Course } from '../lib/types';
import { Icon, type IconName } from '../components/Icon';
import { Botanical, CurrencyToggle, Portrait, poseCutout, poseScene, type Pose } from '../components/brand';
import { CourseCard, FaqList } from '../components/course';
import { usePageTitle } from '../components/ui';
import { ScrollTrigger, getLenis, gsap, prefersReducedMotion } from '../lib/motion';

const words = ['Breathe', 'Soften', 'Release', 'Make time for yourself', 'Practise at your pace', 'Return to stillness'];

/** Headline with the configured accent words drawn in the gradient. */
export function AccentHeadline({ text, accent }: { text: string; accent: string }) {
  const i = accent ? text.indexOf(accent) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<em>{accent}</em>{text.slice(i + accent.length)}</>;
}

export default function Home() {
  const { site: s } = useStore();
  const courses = usePublishedCourses();
  usePageTitle(s.seo.home.title, s.seo.home.description);
  const hero = useRef<HTMLElement>(null);

  // Hero exit: copy lifts and fades, portrait sinks and shrinks, chips drift at different depths.
  useLayoutEffect(() => {
    const el = hero.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const st = { trigger: el, start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.hero-copy', { yPercent: -18, opacity: 0, ease: 'none', scrollTrigger: { ...st, end: 'bottom 20%' } });
      gsap.to('.hv-portrait', { yPercent: 14, scale: 0.86, ease: 'none', scrollTrigger: st });
      gsap.to('.chip-1', { yPercent: -260, ease: 'none', scrollTrigger: st });
      gsap.to('.chip-2', { yPercent: -120, ease: 'none', scrollTrigger: st });
      gsap.to('.chip-3', { yPercent: -340, ease: 'none', scrollTrigger: st });
    }, el);
    // Pointer depth: figure, arch and chips shift by different amounts as the mouse moves
    let off = () => {};
    if (window.matchMedia('(pointer: fine)').matches) {
      const layers: [string, number][] = [['.hero .portrait-figure', 22], ['.hero .portrait-arch', -10], ['.hero .chip-1', 30], ['.hero .chip-2', -26], ['.hero .chip-3', 38]];
      const movers = layers.flatMap(([sel, amt]) => {
        const t = el.querySelector(sel);
        return t ? [{ amt, x: gsap.quickTo(t, 'x', { duration: 0.9, ease: 'power3.out' }), y: gsap.quickTo(t, 'y', { duration: 0.9, ease: 'power3.out' }) }] : [];
      });
      const onMove = (e: PointerEvent) => {
        const nx = e.clientX / window.innerWidth - 0.5;
        const ny = e.clientY / window.innerHeight - 0.5;
        movers.forEach((m) => { m.x(nx * m.amt); m.y(ny * m.amt * 0.6); });
      };
      el.addEventListener('pointermove', onMove);
      off = () => el.removeEventListener('pointermove', onMove);
    }
    return () => { off(); ctx.revert(); };
  }, []);

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="hero" data-hero ref={hero}>
        <div className="hero-bg" data-parallax="16">
          <div className="orb orb-rose" />
          <div className="orb orb-sage" />
        </div>
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="eyebrow" data-reveal>{s.heroEyebrow}</span>
            <h1 data-split><AccentHeadline text={s.heroHeadline} accent={s.heroAccent} /></h1>
            <p className="lead" data-reveal>{s.heroText}</p>
            <div className="row hero-actions" data-reveal data-reveal-delay="0.1">
              <Link to="/courses" className="btn btn-primary">{s.heroPrimaryCta} <Icon name="arrowRight" size={17} /></Link>
              {s.heroSecondaryCta && <Link to="/about" className="link-arrow">{s.heroSecondaryCta} <Icon name="arrowRight" size={16} /></Link>}
            </div>
            <div className="hero-meta" data-reveal data-reveal-delay="0.2">
              <span><Icon name="video" size={17} />Prerecorded video lessons</span>
              <span><Icon name="devices" size={17} />Phone, tablet or computer</span>
              <span><Icon name="calendar" size={17} />Six months of access</span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hv-portrait"><Portrait clip pose="butterfly" /></div>
            <div className="chip chip-1" data-reveal data-reveal-delay="0.5"><span className="ci"><Icon name="play" size={14} /></span><span>Prerecorded lessons<small>Watch anytime</small></span></div>
            <div className="chip chip-2" data-reveal data-reveal-delay="0.65"><span className="ci rose"><Icon name="calendar" size={15} /></span><span>6-month access<small>From enrollment</small></span></div>
            <div className="chip chip-3" data-reveal data-reveal-delay="0.8"><span className="ci sage"><Icon name="chart" size={15} /></span><span>Track your progress<small>Saved to your account</small></span></div>
          </div>
        </div>
        <div className="scroll-cue" aria-hidden="true">Scroll<span /></div>
      </section>

      <Marquee />

      {/* ---------- (01) Statement ---------- */}
      <section className="section">
        <div className="wrap statement-grid">
          <div className="statement-side">
            <span className="index-num">Learning, your way</span>
            
          </div>
          <div>
            <p className="statement statement-wide" data-scrub-words>
              {s.displayName} already teaches online yoga classes and workshops. The {s.courseBrand} brings her guidance into prerecorded lessons you can follow from home — no fixed class times, just a calm practice that fits your day.
            </p>
            <div className="row" style={{ marginTop: 40, gap: 28 }} data-reveal>
              <p className="muted" style={{ maxWidth: '46ch', margin: 0 }}>Watch a lesson, practise along, pause or repeat it whenever you need to, and pick up where you left off next time.</p>
              <Link to="/about" className="link-arrow">About {s.displayName} <Icon name="arrowRight" size={16} /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- (02) Bento ---------- */}
      <section className="section section-alt" style={{ paddingTop: 'clamp(72px, 9vw, 128px)' }}>
        <div className="wrap">
          <div className="row-between" style={{ alignItems: 'flex-end', marginBottom: 'clamp(32px, 4vw, 56px)' }}>
            <div className="section-head" style={{ margin: 0 }}>
              <span className="index-num">What’s included</span>
              <h2 data-split style={{ marginTop: 14 }}>A calm, structured <em>way to practise</em></h2>
            </div>
            <p className="muted" style={{ maxWidth: '34ch', margin: 0 }} data-reveal>Everything you need to build a steady practice — and nothing you don’t.</p>
          </div>
          <div className="bento" data-rise-group>
            <article className="bento-card bento-a">
              <span className="tag">Guided lessons</span>
              <h3>Follow {s.displayName}, step by step.</h3>
              <p>Calm, clearly explained prerecorded video lessons you can pause, repeat and return to.</p>
              <div className="mini-player" aria-hidden="true">
                <div className="screen" style={{ backgroundImage: `linear-gradient(rgba(15,21,17,0.35), rgba(15,21,17,0.55)), url(${poseScene('warrior')})` }}><span><Icon name="play" size={22} style={{ marginLeft: 3 }} /></span></div>
                <div className="bar"><span>Lesson preview</span><i><b /></i><span>15–20 min</span></div>
              </div>
            </article>
            <article className="bento-card bento-b">
              <span className="tag">Access</span>
              <h3>Six months to learn</h3>
              <p>Return to any lesson as often as you like.</p>
              <div className="big-num" aria-hidden="true">6<small>months</small></div>
            </article>
            <article className="bento-card bento-c">
              <span className="tag">Flexible study</span>
              <h3>Your pace, any device</h3>
              <p>No fixed class times. Practise when it suits your day.</p>
              <div className="devices-row" aria-hidden="true"><span><Icon name="devices" size={22} /></span><span><Icon name="clock" size={22} /></span><span><Icon name="repeat" size={22} /></span></div>
            </article>
            <article className="bento-card bento-d">
              <span className="tag">Progress tracking</span>
              <h3>See your practice take shape</h3>
              <p>Mark lessons complete and your progress is saved to your account.</p>
              <div className="mock-progress" aria-hidden="true">
                <div className="row-between"><span>Example course progress</span><span>60%</span></div>
                <div className="mock-bar"><span data-grow /></div>
                <div className="mock-list">
                  <span className="done"><Icon name="check" size={14} /> Welcome</span>
                  <span className="done"><Icon name="check" size={14} /> Breath &amp; posture</span>
                  <span>Next: Full session</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ---------- (03) Journey ---------- */}
      <Journey />

      {/* ---------- (04) Courses ---------- */}
      <CourseShowcase courses={courses.slice(0, 3)} />

      {/* ---------- (05) About ---------- */}
      <section className="section section-dark" data-expand style={{ marginTop: 'clamp(80px, 11vw, 168px)', overflow: 'hidden' }}>
        <Botanical className="about-botanical" />
        <div className="wrap split">
          <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}><Portrait pose="tree" rise /></div>
          <div>
            
            <span className="eyebrow" style={{ display: 'flex', marginTop: 12 }}>Meet your teacher</span>
            <p className="about-quote" data-reveal>{s.aboutIntro}</p>
            {s.credentialsConfirmed && s.credentials.trim() && <p className="muted" data-reveal>{s.credentials}</p>}
            <div className="row" style={{ marginTop: 12 }} data-reveal>
              <Link to="/about" className="btn btn-light">Read Rekha’s story <Icon name="arrowRight" size={16} /></Link>
              <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline-light"><Icon name="instagram" size={18} /> {s.instagramHandle}<span className="sr-only">(opens in a new tab)</span></a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Instagram ---------- */}
      <section className="section-tight" style={{ paddingTop: 'clamp(72px, 9vw, 128px)' }}>
        <div className="wrap" data-reveal><InstagramCard /></div>
      </section>

      {/* ---------- (06) FAQ ---------- */}
      <section className="section" style={{ paddingTop: 'clamp(48px, 6vw, 96px)' }}>
        <div className="wrap faq-split">
          <div className="sticky">
            <span className="index-num">FAQ</span>
            <h2 data-split style={{ marginTop: 12 }}>Questions, <em>answered</em></h2>
            <p className="muted" data-reveal>Enrolling, lesson access, devices and support.</p>
            <Link to="/faq" className="link-arrow" data-reveal>See all FAQs <Icon name="arrowRight" size={16} /></Link>
          </div>
          <div data-reveal><FaqList items={s.faqs.filter((f) => f.published && !f.draft).slice(0, 6)} /></div>
        </div>
      </section>
    </>
  );
}

/** Endless marquee whose speed and direction respond to scrolling. */
function Marquee() {
  const track = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const loop = gsap.to(el, { xPercent: -50, ease: 'none', duration: 38, repeat: -1 });
      let dir = 1;
      ScrollTrigger.create({
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        onUpdate: (self) => {
          const v = self.getVelocity();
          if (Math.abs(v) > 40) dir = v > 0 ? 1 : -1;
          gsap.to(loop, { timeScale: dir * Math.min(5, 1 + Math.abs(v) / 400), duration: 0.25, overwrite: true });
          gsap.to(loop, { timeScale: dir, duration: 1.2, delay: 0.25, overwrite: false });
        },
      });
    });
    return () => ctx.revert();
  }, []);
  const row = (
    <>
      {words.map((w) => (
        <span className="marquee-item" key={w}>{w}<span className="star" aria-hidden="true">✦</span></span>
      ))}
    </>
  );
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track" ref={track}>{row}{row}</div>
    </div>
  );
}

/** "How it works" as sticky stacking cards: each step pins, and the one beneath settles back. */
function Journey() {
  const { site } = useStore();
  const stack = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = stack.current;
    if (!el || prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('.stack-card', el);
      cards.forEach((card) => {
        const fig = card.querySelector('.stack-figure');
        if (fig) gsap.fromTo(fig, { yPercent: 35, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: card, start: 'top 95%', end: 'top 45%', scrub: true } });
      });
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const st = { trigger: next, start: 'top 85%', end: () => `top ${parseFloat(getComputedStyle(next).top) + 10}px`, scrub: true, invalidateOnRefresh: true };
        gsap.to(card, { scale: 0.9 + i * 0.02, ease: 'none', scrollTrigger: st });
        // Dim with an opaque shade layer — fading the card itself would let cards behind show through.
        gsap.to(card.querySelector('.stack-shade'), { opacity: 0.55, ease: 'none', scrollTrigger: { ...st } });
      });
    }, el);
    return () => ctx.revert();
  }, []);
  const items: [string, string, IconName, Pose][] = [
    ['Choose a course', 'Browse the courses and read what each one covers, lesson by lesson.', 'book', 'triangle'],
    ['Enroll', 'Create your account and complete a secure checkout in a few minutes.', 'card', 'twist'],
    ['Log in', 'Sign in with Student Login to reach your personal dashboard.', 'user', 'tree'],
    ['Start learning', `Open your first lesson and practise along with ${site.displayName}.`, 'play', 'warrior'],
  ];
  return (
    <section className="section section-dark" data-expand>
      <div className="wrap journey">
        <div className="journey-sticky">
          <span className="index-num">How it works</span>
          <h2 data-split style={{ color: '#fff', marginTop: 14 }}>Four simple steps <em>to begin</em></h2>
          <p className="lead" data-reveal>From choosing a course to your first lesson, the whole journey takes just a few minutes.</p>
          <Link to="/courses" className="btn btn-light" data-reveal style={{ marginTop: 12 }}>Choose a course <Icon name="arrowRight" size={16} /></Link>
        </div>
        <div className="stack" ref={stack}>
          {items.map(([t, d, icon, pose], i) => (
            <article className={`stack-card stack-${i}`} key={t} style={{ top: `calc(118px + ${i * 26}px)` }}>
              <div className="stack-top">
                <span className="stack-num">0{i + 1}</span>
                <span className="stack-icon"><Icon name={icon} size={22} /></span>
              </div>
              <h3>{t}</h3>
              <p>{d}</p>
              <img className="stack-figure" src={poseCutout(pose)} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <span className="stack-shade" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * "Explore the courses" — a pinned, cinematic horizontal showcase.
 * Desktop: the whole section pins; cards travel sideways with the scrollbar, swing in tilted and
 * small, straighten at centre, and their artwork drifts at its own speed. A giant outline word
 * moves the other way behind them, and a live counter tracks progress.
 * Phones and reduced motion: a plain swipeable row.
 */
function CourseShowcase({ courses }: { courses: Course[] }) {
  const sec = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const total = courses.length + 1;

  useLayoutEffect(() => {
    if (!sec.current || !rail.current || !wrap.current || prefersReducedMotion()) return;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 761px)', () => {
      const section = sec.current!;
      const track = rail.current!;
      section.classList.add('is-pinned');
      // Cards start off to the right and travel until the last card meets the right edge,
      // so there is always a journey — even on screens wide enough to show every card.
      const distance = () => Math.max(0, track.scrollWidth - wrap.current!.clientWidth);
      const startX = () => Math.round(window.innerWidth * 0.42);
      const travel = () => startX() + distance();
      const length = () => `+=${Math.round(Math.max(travel() * 1.6, window.innerHeight * 1.6))}`;

      const move = gsap.fromTo(track, { x: () => startX() }, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: section, start: 'top top', end: length,
          pin: true, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (self) => {
            const n = Math.min(total, Math.floor(self.progress * (total - 0.001)) + 1);
            if (count.current) count.current.textContent = String(n).padStart(2, '0');
            if (fill.current) fill.current.style.transform = `scaleX(${self.progress})`;
          },
        },
      });

      // Giant outline word drifts the opposite way for depth
      gsap.fromTo('.cs-bg', { xPercent: 4 }, { xPercent: -30, ease: 'none', scrollTrigger: { trigger: section, start: 'top top', end: length, scrub: 1, invalidateOnRefresh: true } });

      gsap.utils.toArray<HTMLElement>('.course-rail > *', track).forEach((card) => {
        // Swing in from the right: tilted and smaller, straightening as it nears centre
        gsap.fromTo(card,
          { rotate: 5, scale: 0.84, yPercent: 10, opacity: 0.55 },
          { rotate: 0, scale: 1, yPercent: 0, opacity: 1, ease: 'none',
            scrollTrigger: { trigger: card, containerAnimation: move, start: 'left 105%', end: 'left 72%', scrub: true } });
        // Artwork moves inside its frame at its own speed (window parallax)
        const art = card.querySelector('.course-art svg.art, .course-art img');
        if (art) {
          gsap.fromTo(art, { xPercent: 10, scale: 1.18 }, { xPercent: -10, scale: 1.18, ease: 'none',
            scrollTrigger: { trigger: card, containerAnimation: move, start: 'left right', end: 'right left', scrub: true } });
        }
      });

      // Keyboard: tabbing to a card that is off to the side scrolls the page to reveal it
      const onFocus = (e: FocusEvent) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>('.course-rail > *');
        const st = move.scrollTrigger;
        if (!card || !st) return;
        const target = Math.min(travel(), Math.max(0, startX() + card.offsetLeft - 80));
        const y = st.start + (target / Math.max(1, travel())) * (st.end - st.start);
        const l = getLenis();
        if (l) l.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
      };
      track.addEventListener('focusin', onFocus);
      return () => { track.removeEventListener('focusin', onFocus); section.classList.remove('is-pinned'); };
    });
    return () => mm.revert();
  }, [total]);

  return (
    <section className="courses-show" ref={sec} aria-labelledby="home-courses">
      <div className="cs-bg" aria-hidden="true">Courses · Courses</div>
      <div className="wrap cs-head">
        <div>
          <span className="index-num">The courses</span>
          <h2 id="home-courses" data-split>Explore the <em>courses</em></h2>
          <p className="muted cs-note" data-reveal>Titles, lessons and prices shown are samples while the final curriculum is prepared.</p>
        </div>
        <div className="cs-side" data-reveal>
          <div className="cs-counter" aria-hidden="true">
            <span ref={count}>01</span><span className="cs-of">/ {String(total).padStart(2, '0')}</span>
            <span className="cs-track"><span ref={fill} /></span>
          </div>
          <CurrencyToggle />
          <p className="cs-hint" aria-hidden="true">Keep scrolling <Icon name="arrowDown" size={13} /></p>
        </div>
      </div>
      <div className="course-rail-wrap" ref={wrap}>
        <div className="course-rail" ref={rail}>
          {courses.map((c, i) => <CourseCard key={c.id} course={c} index={i} />)}
          <Link to="/courses" className="course-card rail-end">
            <span className="index-num">All courses</span>
            <span className="rail-end-title">Compare every course <Icon name="arrowRight" size={26} /></span>
            <span className="muted small">Lesson formats, access and sample pricing side by side.</span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function InstagramCard() {
  const { site: s } = useStore();
  return (
    <div className="ig-card">
      <div className="ig-avatar"><Icon name="instagram" size={34} /></div>
      <div>
        <span className="eyebrow" style={{ marginBottom: 8, color: 'var(--rose-deep)' }}>Practice with Rekha on Instagram</span>
        <h2>{s.instagramHandle}</h2>
        <p className="muted" style={{ margin: 0 }}>Follow along for updates from {s.displayName}’s classes and workshops.</p>
      </div>
      <a href={s.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-rose">
        Visit Instagram <Icon name="external" size={16} /><span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
