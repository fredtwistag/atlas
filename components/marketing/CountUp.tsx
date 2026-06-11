"use client";

import { useEffect, useRef } from "react";

/**
 * Ticks a number from 0 to `value` when scrolled into view. JetBrains Mono
 * (tabular) prevents layout shift. Snaps straight to the target under
 * prefers-reduced-motion. Renders the final value in markup so no-JS and
 * crawlers always see the real number.
 */
export function CountUp({
  value,
  decimals = 0,
  duration = 600,
  startDelay = 0,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  startDelay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let timeout: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        timeout = setTimeout(() => {
          const t0 = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - t0) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = (value * eased).toFixed(decimals);
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          el.textContent = (0).toFixed(decimals);
          raf = requestAnimationFrame(tick);
        }, startDelay);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [value, decimals, duration, startDelay]);

  return (
    <span ref={ref} className={className}>
      {value.toFixed(decimals)}
    </span>
  );
}
