import * as React from 'react';

const reduceMotion = () => typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Marks an element revealed the first time it scrolls into view, so CSS can animate it in. Reveals
 * immediately when IntersectionObserver is unavailable (tests, very old browsers) or the user asked
 * for reduced motion, so content is never stuck hidden.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(options: { threshold?: number; rootMargin?: string } = {}) {
  const ref = React.useRef<T | null>(null);
  const [revealed, setRevealed] = React.useState(false);
  const { threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = options;
  React.useEffect(() => {
    const el = ref.current;
    if (!el || revealed) return;
    if (typeof IntersectionObserver === 'undefined' || reduceMotion()) {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [revealed, threshold, rootMargin]);
  return { ref, revealed };
}

/** Wrapper that fades/slides its children in when scrolled to; `delay` (ms) staggers siblings. */
export function Reveal({ as: Tag = 'div', delay = 0, className, children, ...rest }: { as?: 'div' | 'li' | 'section' | 'article'; delay?: number; className?: string; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const { ref, revealed } = useReveal<HTMLElement>();
  return React.createElement(
    Tag,
    { ref, className: ['reveal', className].filter(Boolean).join(' '), 'data-revealed': revealed ? '' : undefined, style: delay ? { transitionDelay: `${delay}ms` } : undefined, ...rest },
    children,
  );
}

/**
 * Animates a number from 0 to the figure inside `value` once `active`, keeping any prefix/suffix
 * ("30+" → 0+ … 30+, "99.9%" → 0.0% … 99.9%). Strings without a number are returned unchanged.
 */
export function useCountUp(value: string, active: boolean, durationMs = 1400): string {
  const match = /^(.*?)(\d+(?:\.\d+)?)(.*)$/.exec(value);
  const target = match ? Number(match[2]) : NaN;
  const decimals = match && match[2].includes('.') ? match[2].split('.')[1].length : 0;
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    if (!active || Number.isNaN(target)) return;
    if (reduceMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);
  if (!match) return value;
  return `${match[1]}${n.toFixed(decimals)}${match[3]}`;
}
