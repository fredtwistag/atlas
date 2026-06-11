import { Cta, ArrowLink } from "@/components/marketing/Cta";
import { Section } from "@/components/marketing/Section";
import { Marquee } from "@/components/marketing/Marquee";
import { HeroReport } from "@/components/marketing/HeroReport";
import { Reveal } from "@/components/marketing/Reveal";
import {
  BOOKING_URL,
  TWISTAG_URL,
  TWISTAG_CLIENTS,
} from "@/components/marketing/constants";

const valueProps = [
  [
    "Conversations, not workshops",
    "Each team member spends 4–6 minutes at a time in a focused chat with Atlas. No meetings to schedule. No 45-minute interviews to dread. Done when it suits them.",
  ],
  [
    "Evidence, not opinions",
    "Every opportunity Atlas surfaces is grounded in real quotes, system signals, and comparable cases. Click any score to see exactly what evidence supports it.",
  ],
  [
    "Outcomes, not slideware",
    "You walk away with a ranked roadmap and pre-drafted SOWs for the highest-impact projects — ready to approve, ready to ship with Twistag or your own team.",
  ],
] as const;

const phases = [
  {
    phase: "Phase 1",
    title: "Capture",
    body: "The manager invites a team. Each person does 4 sessions over 3–4 weeks — 20–25 minutes total of their time. Atlas asks open questions about workflow, exceptions, frustrations, and tools.",
    rows: [
      "Day 1 — sprint launched, invites sent",
      "Day 7 — first sessions complete",
      "Day 14 — patterns emerging",
      "Day 21 — top opportunities ranked",
    ],
  },
  {
    phase: "Phase 2",
    title: "Surface",
    body: "Atlas builds an operational map from the conversations. Each bottleneck, dependency, and workaround becomes a node. The scoring engine ranks opportunities by impact, time-to-ship, and confidence.",
    rows: [
      "Conversations become quotes + signals",
      "Captured patterns across the team",
      "5–10 opportunities ranked",
      "1–3 high-impact · 2–4 quick wins",
    ],
  },
  {
    phase: "Phase 3",
    title: "Ship",
    body: "The sponsor reviews each opportunity with full evidence. Approve one — you get a pre-drafted SOW ready for delivery. Either via Twistag's FDE team or your own engineers. Either way: code, not slides.",
    rows: [
      'Click "Approve for FDE"',
      "SOW drafted in 30 seconds",
      "Scope alignment in 48 hours",
      "First ship in 2–4 weeks",
    ],
  },
] as const;

const audiences = [
  [
    "Mid-market operators",
    "AI that actually ships, not another integrator pitch.",
    "Founder-led companies $50M–$500M. No CIO, no patience for an 18-month roadmap. We do the discovery and the build, with ROI in quarters not years.",
  ],
  [
    "PE portcos",
    "Day 1 to day 100 — quick wins shipped, not promised.",
    "Post-close transformation when the CEO has a clock. Discovery in 3 weeks. First quick wins shipped by day 100. EBITDA bridge updated before the next board.",
  ],
  [
    "PE firms (direct)",
    "Value-creation thesis, finally executable.",
    "Discovery sprints on individual portcos. Direct engagement with operating partners. Repeatable playbook across a portfolio — without consultants in between.",
  ],
  [
    "Funded tech / SaaS / AI",
    "A product-building partner, not just engineering bandwidth.",
    "Most of Twistag's revenue comes from co-building SaaS and AI products with founders. Strong opinions on what to ship, what to cut, where value actually lives.",
  ],
] as const;

const deliverables = [
  [
    "5–10 opportunities. 1–3 high-impact.",
    "A ranked backlog scored on impact, feasibility, time-to-value, and confidence. Not a hundred sticky notes — a short list worth acting on.",
  ],
  [
    "Fixed fee. 3–4 weeks. Kill criteria upfront.",
    "We tell you the cost before we start, what to expect each week, and what would justify stopping the sprint if it isn't working.",
  ],
  [
    "Evidence behind every number.",
    "Click any score and see the quotes and signals that support it. Quotes are attributed by role, never by name — people talk because it's safe to.",
  ],
  [
    "A pre-drafted SOW for every approved build.",
    "Approve an opportunity and a scoped SOW is drafted on the spot — ready to ship with Twistag's delivery team or your own engineers.",
  ],
] as const;

export default function LandingPage() {
  return (
    <>
      {/* ============ COVER (§01) ============ */}
      <header className="bg-surface">
        <div className="mx-auto max-w-[1500px] px-[5%]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-strong py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
            <span>Atlas / operational discovery</span>
            <span>Doc 01 · 3–4 weeks · fixed fee · a Twistag product</span>
          </div>
          <div className="grid gap-x-10 lg:grid-cols-[110px_minmax(0,1fr)]">
            <div className="pt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3 lg:border-r lg:border-border lg:pb-20">
              <div className="lg:sticky lg:top-[76px]">
                §01
                <span className="mt-1 hidden lg:block">Findings</span>
              </div>
            </div>
            <div className="pb-16 pt-12 sm:pb-24 sm:pt-16">
              <h1 className="max-w-[1100px] text-[clamp(44px,7vw,96px)] font-medium leading-[1.02] tracking-[-0.03em]">
                Your team already knows what&apos;s broken.{" "}
                <span className="text-[color:var(--ink-faint)]">
                  Atlas gets it on the record.
                </span>
              </h1>
              <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
                <p className="max-w-[560px] text-[17px] leading-relaxed text-text-2">
                  Short, structured conversations with the team — over 3 weeks,
                  5 minutes at a time — surface the bottlenecks and AI-shaped
                  opportunities that hide between your systems. Output: a ranked
                  plan + pre-drafted SOWs for the highest-impact builds.
                </p>
                <div className="flex flex-wrap items-center gap-6">
                  <Cta
                    href={BOOKING_URL}
                    size="lg"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Book a discovery call
                  </Cta>
                  <ArrowLink href="/sign-in">See a sample report</ArrowLink>
                </div>
              </div>
              <HeroReport />
            </div>
          </div>
        </div>
      </header>

      {/* ============ TICKER ============ */}
      <Marquee />

      {/* ============ §02 METHOD ============ */}
      <Section folio="§02" label="Method">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[1fr_0.55fr]">
            <h2 className="text-[clamp(34px,4.25vw,64px)] font-medium leading-[1.02] tracking-[-0.02em]">
              A new way to discover what&apos;s{" "}
              <span className="mk-mark px-1.5">actually</span> slowing your team
              down.
            </h2>
            <p className="self-end text-[17px] leading-relaxed text-text-2">
              Without the 6-month consulting engagement. Without the all-hands
              workshop. Without the report nobody reads.
            </p>
          </div>
        </Reveal>
        <div className="mt-14 border-t border-border-strong">
          {valueProps.map(([title, desc], i) => (
            <Reveal key={title} delay={i * 80}>
              <div className="grid gap-x-10 gap-y-2 border-b border-border py-7 sm:grid-cols-[auto_0.7fr_1fr] sm:items-baseline">
                <span className="font-mono text-[12px] text-text-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-[clamp(20px,2vw,28px)] font-medium leading-tight tracking-[-0.01em]">
                  {title}
                </h3>
                <p className="text-[15px] leading-relaxed text-text-2">
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ §03 PROCESS ============ */}
      <Section folio="§03" label="Process" id="how" className="bg-surface">
        <Reveal>
          <h2 className="max-w-[700px] text-[clamp(34px,4.25vw,64px)] font-medium leading-[1.02] tracking-[-0.02em]">
            From map to ship,{" "}
            <span className="text-[color:var(--ink-faint)]">in 4 weeks.</span>
          </h2>
          <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-text-2">
            A repeatable three-phase rhythm. Same process every time. Different
            outcome every time.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-12 border-t-[1.5px] border-text md:grid-cols-3 md:gap-8">
          {phases.map((step, i) => (
            <Reveal key={step.phase} delay={i * 120}>
              <div className="pt-6">
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
                  {step.phase}
                </div>
                <h3 className="mt-3 text-[clamp(24px,2.4vw,34px)] font-medium tracking-[-0.015em]">
                  {step.title}
                </h3>
                <p className="mt-4 text-[14.5px] leading-relaxed text-text-2">
                  {step.body}
                </p>
                <div className="mt-6 border-l border-border-strong pl-5 font-mono text-[12px] leading-relaxed text-text-2">
                  {step.rows.map((r, j) => (
                    <div key={r} className="flex gap-2 py-1.5">
                      <span className="text-text-3">→</span>
                      {j === step.rows.length - 1 ? (
                        <span className="mk-mark px-1 font-medium">{r}</span>
                      ) : (
                        <span>{r}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ §04 AUDIENCE — cover spread ============ */}
      <Section folio="§04" label="Audience" id="for-who" dark>
        <Reveal>
          <h2 className="max-w-[900px] text-[clamp(34px,4.25vw,64px)] font-medium leading-[1.05] tracking-[-0.02em]">
            Built for the teams who don&apos;t have time for a{" "}
            <span className="text-white/40">transformation program.</span>
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-px bg-white/10 p-px md:grid-cols-2">
          {audiences.map(([eyebrow, title, desc], i) => (
            <Reveal key={title} delay={(i % 2) * 80}>
              <div className="mk-cell h-full p-8 sm:p-10">
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent">
                  {eyebrow}
                </div>
                <div className="mt-4 text-[clamp(20px,2vw,27px)] font-medium leading-tight tracking-[-0.01em]">
                  {title}
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-white/65">
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ §05 DELIVERABLES ============ */}
      <Section folio="§05" label="Deliverables" id="what-you-get">
        <Reveal>
          <h2 className="max-w-[760px] text-[clamp(34px,4.25vw,64px)] font-medium leading-[1.02] tracking-[-0.02em]">
            What you walk away with.
          </h2>
          <p className="mt-5 max-w-[560px] text-[16px] leading-relaxed text-text-2">
            No measured-average theater — Atlas is new. These are the
            commitments every sprint is built to keep.
          </p>
        </Reveal>
        <div className="mt-14 border-t-[1.5px] border-text">
          {deliverables.map(([title, desc], i) => (
            <Reveal key={title} delay={i * 60}>
              <div className="group grid gap-x-10 gap-y-2 border-b border-border px-2 py-8 transition-colors sm:grid-cols-[auto_1fr_1fr] sm:items-baseline hover:bg-text">
                <span className="font-mono text-[12px] text-text-3 transition-colors group-hover:text-accent">
                  D{i + 1}
                </span>
                <h3 className="text-[clamp(20px,2.2vw,30px)] font-medium leading-tight tracking-[-0.015em] transition-colors group-hover:text-white">
                  {title}
                </h3>
                <p className="text-[15px] leading-relaxed text-text-2 transition-colors group-hover:text-white/65">
                  {desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ============ §06 STUDIO ============ */}
      <Section folio="§06" label="Studio" className="bg-surface">
        <div className="grid items-start gap-12 lg:grid-cols-[1.2fr_1fr]">
          <Reveal>
            <h2 className="text-[clamp(30px,3.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
              The team behind Atlas is the team that ships what it finds.
            </h2>
            <p className="mt-6 max-w-[560px] text-[16px] leading-relaxed text-text-2">
              Atlas is built and operated by Twistag — a product studio in
              Lisbon that ships software to production for companies like
              Source.app, Indie Campers, and Defined.ai. Discovery isn&apos;t a
              report we hand off: what Atlas surfaces feeds straight into the
              delivery team that builds it.
            </p>
            <div className="mt-8">
              <ArrowLink href={TWISTAG_URL} target="_blank" rel="noreferrer">
                More about Twistag
              </ArrowLink>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="border-t-[1.5px] border-text">
              {[
                ["Atlas runs the discovery sprint", "3–4 weeks, fixed fee"],
                [
                  "You approve what's worth building",
                  "evidence on every score",
                ],
                [
                  "Twistag ships it — or your team does",
                  "SOW pre-drafted either way",
                ],
              ].map(([title, meta], i) => (
                <div
                  key={title}
                  className="group flex items-baseline gap-4 border-b border-border py-5 transition-colors hover:bg-text"
                >
                  <span className="pl-2 font-mono text-[12px] text-text-3 transition-colors group-hover:text-accent">
                    {i + 1}
                  </span>
                  <div className="pr-2">
                    <div className="text-[16px] font-medium transition-colors group-hover:text-white">
                      {title}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.04em] text-text-3 transition-colors group-hover:text-white/55">
                      {meta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={160}>
          <div className="mt-16 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-t border-border pt-6">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
              Shipped to production for
            </span>
            {TWISTAG_CLIENTS.map((name) => (
              <span
                key={name}
                className="text-[17px] font-medium tracking-tight text-text-2"
              >
                {name}
              </span>
            ))}
          </div>
        </Reveal>
      </Section>

      {/* ============ BACK COVER ============ */}
      <section className="border-t border-white/10 bg-text px-[5%] py-24 text-white sm:py-32">
        <div className="mx-auto max-w-[1500px]">
          <Reveal>
            <div className="mb-10 flex flex-wrap items-baseline justify-between gap-2 border-b border-white/15 pb-3 font-mono text-[11px] uppercase tracking-[0.08em] text-white/45">
              <span>End of brief</span>
              <span>Doc 01 · Atlas / a Twistag product</span>
            </div>
            <h2 className="max-w-[1000px] text-[clamp(38px,5.5vw,84px)] font-medium leading-[1.02] tracking-[-0.025em]">
              The first opportunity surfaces{" "}
              <span className="text-white/40">within a week.</span>
            </h2>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-8">
              <p className="max-w-[520px] text-[16px] leading-relaxed text-white/65">
                Sprint mode is fixed-fee, 3–4 weeks. We&apos;ll tell you what
                we&apos;d cost upfront, what to expect, and what would justify
                killing the project if it isn&apos;t working.
              </p>
              <div className="flex flex-wrap items-center gap-7">
                <Cta
                  href={BOOKING_URL}
                  size="lg"
                  target="_blank"
                  rel="noreferrer"
                >
                  Book a discovery call
                </Cta>
                <ArrowLink href="/pricing" className="text-white">
                  See pricing
                </ArrowLink>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
