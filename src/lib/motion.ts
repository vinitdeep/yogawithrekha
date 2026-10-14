import { useEffect, useLayoutEffect, type RefObject } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Motion system for the public site.
 *
 * Declarative hooks, applied by attribute so pages stay simple:
 *   data-split          headline revealed line-by-line (masked). Short headlines only.
 *   data-reveal         fades/rises in when scrolled into view (children of data-reveal-group stagger)
 *   data-reveal-group   container whose direct children stagger in
 *   data-parallax="n"   decorative layer drifts n% while its section crosses the viewport
 *   data-scrub-words    paragraph whose words brighten as you scroll through it
 *   data-draw           SVG whose paths draw themselves in
 *   data-clip           image/frame revealed with a soft clip-path wipe
 *
 * Everything is skipped when the visitor prefers reduced motion: content simply renders in place.
 */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let lenis: Lenis | null = null;
export const getLenis = () => lenis;

/** Smooth scrolling, synced to GSAP's ticker so ScrollTrigger stays in step. */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    const l = new Lenis({ lerp: 0.09, wheelMultiplier: 1, touchMultiplier: 1.3, syncTouch: false });
    lenis = l;
    l.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    document.documentElement.classList.add('lenis-on');
    return () => {
      gsap.ticker.remove(tick);
      l.destroy();
      lenis = null;
      document.documentElement.classList.remove('lenis-on');
    };
  }, [enabled]);
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
}

/** Wires up all data-* motion inside `scope` for the current page. Re-runs when `key` changes. */
export function usePageMotion(scope: RefObject<HTMLElement>, key: string) {
  useLayoutEffect(() => {
    const root = scope.current;
    if (!root) return;
    const reduced = prefersReducedMotion();
    if (reduced) {
      root.classList.add('motion-ready');
      return;
    }
    const splits: SplitText[] = [];

    const ctx = gsap.context(() => {
      // Headlines: masked line reveal
      root.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
        const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
        splits.push(split);
        const inHero = !!el.closest('[data-hero]');
        gsap.from(split.lines, {
          yPercent: 110,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.09,
          delay: inHero ? 0.15 : 0,
          scrollTrigger: inHero ? undefined : { trigger: el, start: 'top 88%', once: true },
          onComplete: () => split.revert(),
        });
      });

      // Single reveals
      root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
        const inHero = !!el.closest('[data-hero]');
        const delay = Number(el.dataset.revealDelay ?? 0) + (inHero ? 0.45 : 0);
        gsap.from(el, {
          opacity: 0, y: 36, duration: 1.1, ease: 'power3.out', delay,
          scrollTrigger: inHero ? undefined : { trigger: el, start: 'top 90%', once: true },
        });
      });

      // Staggered groups
      root.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
        gsap.from(group.children, {
          opacity: 0, y: 40, duration: 1, ease: 'power3.out', stagger: 0.12,
          scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        });
      });

      // Soft clip-path wipe for frames and images
      root.querySelectorAll<HTMLElement>('[data-clip]').forEach((el) => {
        const inHero = !!el.closest('[data-hero]');
        gsap.fromTo(el,
          { clipPath: 'inset(18% 12% 18% 12% round 400px 400px 28px 28px)', scale: 1.04 },
          {
            clipPath: 'inset(0% 0% 0% 0% round 400px 400px 28px 28px)', scale: 1, duration: 1.6, ease: 'expo.out',
            delay: inHero ? 0.25 : 0,
            scrollTrigger: inHero ? undefined : { trigger: el, start: 'top 85%', once: true },
            clearProps: 'clipPath,transform',
          });
      });

      // Decorative parallax (never on text or controls)
      root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
        const amount = Number(el.dataset.parallax || 12);
        gsap.fromTo(el, { yPercent: -amount / 2 }, {
          yPercent: amount / 2, ease: 'none',
          scrollTrigger: { trigger: el.parentElement ?? el, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
        });
      });

      // Words brighten with scroll
      root.querySelectorAll<HTMLElement>('[data-scrub-words]').forEach((el) => {
        const split = SplitText.create(el, { type: 'words', wordsClass: 'scrub-word' });
        splits.push(split);
        gsap.fromTo(split.words, { opacity: 0.16 }, {
          opacity: 1, ease: 'none', stagger: 0.05,
          scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.5 },
        });
      });

      // Dark sections start as an inset rounded card and open to full width as they arrive
      root.querySelectorAll<HTMLElement>('[data-expand]').forEach((el) => {
        const inset = window.innerWidth < 761 ? 3 : 5;
        gsap.fromTo(el,
          { clipPath: `inset(0% ${inset}% 0% ${inset}% round 48px)` },
          { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
            scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 15%', scrub: true } });
      });

      // Tiles that rise and settle into place, tied to the scrollbar
      root.querySelectorAll<HTMLElement>('[data-rise-group]').forEach((group) => {
        gsap.fromTo(group.children,
          { y: 140, scale: 0.92, opacity: 0, rotateX: 8, transformPerspective: 1200 },
          { y: 0, scale: 1, opacity: 1, rotateX: 0, ease: 'power2.out', stagger: 0.12,
            scrollTrigger: { trigger: group, start: 'top 95%', end: 'top 35%', scrub: 0.8 } });
      });

      // Footer wordmark rises up from below as the page ends
      root.querySelectorAll<HTMLElement>('.footer-wordmark').forEach((el) => {
        gsap.fromTo(el, { yPercent: 60, opacity: 0.2 }, { yPercent: 0, opacity: 1, ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom bottom', scrub: true } });
      });

      // Figures that rise up out of their arch as the section arrives
      root.querySelectorAll<HTMLElement>('[data-rise]').forEach((el) => {
        gsap.fromTo(el, { yPercent: 26, scale: 0.94 }, { yPercent: 0, scale: 1, ease: 'none',
          scrollTrigger: { trigger: el.parentElement ?? el, start: 'top 95%', end: 'top 35%', scrub: 0.6 } });
      });

      // Bars that grow when seen
      root.querySelectorAll<HTMLElement>('[data-grow]').forEach((el) => {
        gsap.from(el, { scaleX: 0, duration: 1.6, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
      });

      // Line-art that draws itself
      root.querySelectorAll<SVGSVGElement>('[data-draw]').forEach((svg) => {
        const paths = svg.querySelectorAll<SVGPathElement | SVGCircleElement>('path, circle, ellipse, line');
        paths.forEach((p) => {
          const len = (p as SVGGeometryElement).getTotalLength?.() ?? 600;
          p.style.strokeDasharray = `${len}`;
          p.style.strokeDashoffset = `${len}`;
        });
        const inHero = !!svg.closest('[data-hero]');
        gsap.to(paths, {
          strokeDashoffset: 0, duration: 2.6, ease: 'power2.inOut', stagger: 0.08, delay: inHero ? 0.4 : 0,
          scrollTrigger: inHero ? undefined : { trigger: svg, start: 'top 85%', once: true },
        });
      });
    }, root);

    root.classList.add('motion-ready');
    const refresh = () => ScrollTrigger.refresh();
    document.fonts?.ready.then(refresh);
    const t = window.setTimeout(refresh, 600);

    return () => {
      window.clearTimeout(t);
      splits.forEach((s) => s.revert());
      ctx.revert();
    };
  }, [scope, key]);
}

export { gsap, ScrollTrigger };
