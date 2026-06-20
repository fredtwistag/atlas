"use client";

import { useEffect, useRef } from "react";
import { CountUp } from "@/components/marketing/CountUp";

const rows = [
  {
    score: "7.6",
    title: "Replace the spreadsheet handoff between sales and fulfillment",
    impact: "$180–310K/YR",
    voices: "7 VOICES",
    top: true,
  },
  {
    score: "6.8",
    title: "Auto-draft supplier follow-ups from open PO status",
    impact: "$90–150K/YR",
    voices: "5 VOICES",
    top: false,
  },
  {
    score: "6.1",
    title: "One source of truth for delivery-date promises",
    impact: "$60–120K/YR",
    voices: "6 VOICES",
    top: false,
  },
];

/* Transient conversation fragments that get absorbed into the score.
 * Decorative: aria-hidden, gone by the end state, never shown under
 * reduced motion. --fx/--fy aim each one at the score chip. */
const fragments = [
  {
    text: "“every rush order gets retyped by hand”",
    beat: 300,
    style: { top: "-34px", left: "16%", "--fx": "-80px", "--fy": "70px" },
  },
  {
    text: "“I batch them after dinner”",
    beat: 700,
    style: { top: "-18px", left: "52%", "--fx": "-260px", "--fy": "60px" },
  },
  {
    text: "“nine of us touch the same order”",
    beat: 1100,
    style: { top: "-40px", left: "70%", "--fx": "-380px", "--fy": "80px" },
  },
];

/**
 * The Field Report hero artifact: the sponsor report typeset flat on the
 * page — no browser chrome, hairline rules, mono data. On first view it
 * assembles itself: conversation fragments surface, get absorbed into the
 * score (which ticks 0→8.4), ranked rows print, the lime approval stamp
 * inks on last. Beats are CSS keyframes keyed off [data-play]
 * (globals.css); reduced motion renders the finished document.
 */
export function HeroReport() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    document.querySelector(".theme-marketing")?.setAttribute("data-js", "");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.setAttribute("data-play", "");
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const beat = (ms: number) => ({ "--beat": `${ms}ms` }) as React.CSSProperties;

  return (
    <figure ref={ref} className="mk-hero-report relative mt-14 sm:mt-20">
      {/* Document header */}
      <div className="border-t-[1.5px] border-text">
        <div className="flex flex-wrap items-baseline justify-between gap-2 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
          <span>Ranked findings — ops &amp; fulfillment · demo data</span>
          <span className="hidden md:inline">
            Ranked by impact × feasibility × confidence
          </span>
        </div>
      </div>

      {/* Top finding */}
      <div className="relative border-t border-border-strong py-6 sm:py-7">
        <div aria-hidden className="absolute inset-x-0 top-0 select-none">
          {fragments.map((f) => (
            <span
              key={f.text}
              data-frag=""
              className="absolute hidden whitespace-nowrap border border-border-strong bg-bg px-2.5 py-1.5 font-mono text-[12px] text-text-2 md:inline-block"
              style={{ ...f.style, ...beat(f.beat) } as React.CSSProperties}
            >
              {f.text}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-start gap-5 sm:gap-7">
          <span
            data-beat=""
            style={beat(1300)}
            className="flex h-[60px] w-[60px] shrink-0 items-center justify-center bg-text font-mono text-[22px] font-semibold text-accent"
          >
            <CountUp
              value={8.4}
              decimals={1}
              duration={700}
              startDelay={1500}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div data-beat="" style={beat(1500)}>
              <span className="mr-2 font-mono text-xs text-text-3">01</span>
              <h3 className="inline text-[clamp(20px,2.2vw,28px)] font-medium leading-snug tracking-[-0.01em]">
                Automate rush-order intake from WhatsApp to ERP
              </h3>
            </div>
            <div
              data-beat=""
              style={beat(1800)}
              className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] uppercase tracking-[0.04em] text-text-2"
            >
              <span className="mk-mark px-1 font-medium">$340–520K/YR</span>
              <span>4–6 WKS TO SHIP</span>
              <span>9 VOICES</span>
              <span>12 QUOTES</span>
            </div>
            <blockquote
              data-beat=""
              style={beat(2100)}
              className="mt-5 max-w-[640px] border-l-2 border-text pl-4 text-[15px] leading-relaxed text-text-2"
            >
              &ldquo;Every rush order still gets retyped into the ERP by hand —
              I batch them after dinner so the morning runs don&rsquo;t
              slip.&rdquo;
              <footer className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-text-3">
                — Operations coordinator · 1 of 12 supporting quotes
              </footer>
            </blockquote>
          </div>
          <span
            className="mk-stamp mt-1 hidden border-[1.5px] border-text bg-accent px-3 py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-accent-ink sm:inline-block"
            style={beat(3100)}
          >
            Approved → SOW drafted
          </span>
        </div>
      </div>

      {/* Remaining ranked rows */}
      {rows.map((row, i) => (
        <div
          key={row.title}
          data-beat=""
          style={beat(2400 + i * 180)}
          className="flex items-center gap-5 border-t border-border py-4 sm:gap-7"
        >
          <span
            className={
              "flex h-10 w-10 shrink-0 items-center justify-center font-mono text-[14px] font-semibold " +
              (row.top ? "bg-text text-accent" : "bg-surface-2 text-text-2")
            }
          >
            {row.score}
          </span>
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
            <span className="mr-2 font-mono text-xs text-text-3">
              {String(i + 2).padStart(2, "0")}
            </span>
            {row.title}
          </span>
          <span className="hidden gap-5 font-mono text-[11px] uppercase tracking-[0.04em] text-text-3 md:flex">
            <span>{row.impact}</span>
            <span>{row.voices}</span>
          </span>
        </div>
      ))}

      <figcaption
        data-beat=""
        style={beat(3300)}
        className="border-t border-border-strong pt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-text-3"
      >
        Demo data. Real reports attribute every quote to its contributor — by name and role.
      </figcaption>
    </figure>
  );
}
