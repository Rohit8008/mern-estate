import { useEffect, useRef, useState } from 'react';

/**
 * Scroll-into-view reveal for the public marketing pages. Fades and lifts its
 * content the first time it enters the viewport, then stops observing.
 *
 * `prefers-reduced-motion` is honoured: the content renders fully visible with
 * no animation, so nothing is hidden from a visitor who asked for less motion
 * (and nothing is hidden if IntersectionObserver is unavailable — we show).
 *
 * Props:
 *   as     — element/tag to render (default 'div'); 'li', 'section', etc.
 *   delay  — ms to stagger the reveal (used by lists to cascade)
 *   amount — visibility threshold 0–1 before it triggers (default 0.12)
 */
export default function Reveal({ as: Tag = 'div', delay = 0, amount = 0.12, className = '', children, ...props }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: amount, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [amount]);

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${shown ? 'reveal-in' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </Tag>
  );
}
