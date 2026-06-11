"use client";

import { useEffect, useRef } from "react";

/* One IntersectionObserver for every Reveal on the page. Each element gets
 * data-inview once and is unobserved — reveals fire a single time. */
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (!observer) {
    document.querySelector(".theme-marketing")?.setAttribute("data-js", "");
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-inview", "");
            observer?.unobserve(entry.target);
          }
        }
      },
      // Start the motion before the element fully clears the fold.
      { rootMargin: "0px 0px -12% 0px" },
    );
  }
  return observer;
}

/**
 * Scroll-reveal wrapper for the marketing surface. Children stay
 * server-rendered; this only toggles `data-inview` (styles live in
 * globals.css). `delay` staggers siblings via --reveal-delay.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = getObserver();
    io.observe(el);
    return () => io.unobserve(el);
  }, []);

  return (
    <div
      ref={ref}
      data-reveal=""
      className={className}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
