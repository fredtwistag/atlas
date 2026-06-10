import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="bg-bg">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center gap-8 px-7">
          <Logo />
          <div className="hidden gap-6 md:flex">
            {[
              ["How it works", "#how"],
              ["For who", "#for-who"],
              ["Outcomes", "#outcomes"],
              ["Pricing", "/pricing"],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="text-[13.5px] font-medium text-text-2 transition-colors hover:text-text"
              >
                {label}
              </a>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link
              href="/me"
              className="px-3 py-1.5 text-[13.5px] font-medium text-text-2 transition-colors hover:text-text"
            >
              Sign in
            </Link>
            <ButtonLink href="/sign-in" variant="primary">
              See the product
            </ButtonLink>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-7 pb-28 pt-20 text-center">
        <div className="mx-auto max-w-[880px]">
          <h1 className="text-[clamp(44px,7vw,72px)] font-semibold leading-[1.0] tracking-[-0.035em]">
            An{" "}
            <em className="not-italic text-brand">
              operational discovery sprint
            </em>{" "}
            that ends in shipped work.
          </h1>
          <p className="mx-auto mt-7 max-w-[600px] text-[19px] leading-relaxed text-text-2">
            Atlas runs short, structured conversations with the team — over 3
            weeks, 5 minutes at a time — to surface the bottlenecks and
            AI-shaped opportunities that hide between your systems. Output: a
            ranked plan + pre-drafted SOWs for the highest-impact builds.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-2.5">
            <ButtonLink
              href="/sign-in"
              variant="primary"
              size="lg"
            >
              See a live sprint
            </ButtonLink>
            <ButtonLink
              href="/sign-in"
              variant="secondary"
              size="lg"
            >
              See a sample report
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <div className="border-y border-border bg-surface">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-7 px-7 py-[22px]">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-3">
            Built by Twistag — shipped to production for
          </span>
          <div className="flex flex-1 flex-wrap gap-7">
            {[
              "Source.app",
              "NVISO",
              "Aralab",
              "PepTalk",
              "Indie Campers",
              "Defined.ai",
              "Refraction",
            ].map((name) => (
              <span
                key={name}
                className="text-[18px] font-semibold tracking-tight text-text-2"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Value props */}
      <section className="border-t border-border bg-surface px-7 py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-14 max-w-[760px]">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-text-3">
              What Atlas does
            </div>
            <h2 className="text-[clamp(36px,5vw,48px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              A new way to discover what&apos;s actually slowing your team down.
            </h2>
            <p className="mt-4 max-w-[580px] text-[18px] leading-relaxed text-text-2">
              Without the 6-month consulting engagement. Without the all-hands
              workshop. Without the report nobody reads.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                "01",
                "Conversations, not workshops.",
                "Each team member spends 4–6 minutes at a time in a focused chat with Atlas. No meetings to schedule. No 45-minute interviews to dread. Done when it suits them.",
              ],
              [
                "02",
                "Evidence, not opinions.",
                "Every opportunity Atlas surfaces is grounded in real quotes, system signals, and comparable cases. Click any score to see exactly what evidence supports it.",
              ],
              [
                "03",
                "Outcomes, not slideware.",
                "You walk away with a ranked roadmap and pre-drafted SOWs for the highest-impact projects — ready to approve, ready to ship with Twistag or your own team.",
              ],
            ].map(([num, title, desc]) => (
              <div
                key={num}
                className="rounded-lg border border-border bg-bg p-7"
              >
                <div className="mb-8 text-sm font-semibold text-text-3">
                  {num}
                </div>
                <h3 className="mb-3 text-2xl font-semibold leading-tight tracking-tight">
                  {title}
                </h3>
                <p className="text-md leading-relaxed text-text-2">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="px-7 py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-16 max-w-[720px]">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-text-3">
              How it works
            </div>
            <h2 className="text-[clamp(36px,5vw,48px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              From map to ship, in 4 weeks.
            </h2>
            <p className="mt-4 max-w-[580px] text-[18px] leading-relaxed text-text-2">
              A repeatable three-phase rhythm. Same process every time.
              Different outcome every time.
            </p>
          </div>
          <div className="grid gap-[18px] md:grid-cols-3">
            {[
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
                  "40+ conversations → 150+ quotes",
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
            ].map((step) => (
              <div key={step.phase}>
                <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
                  <span className="h-px w-6 bg-text-3" />
                  {step.phase}
                </div>
                <h3 className="mb-3.5 text-[26px] font-semibold leading-tight tracking-tight">
                  {step.title}
                </h3>
                <p className="text-md leading-relaxed text-text-2">
                  {step.body}
                </p>
                <div className="mt-5 rounded-lg border border-border bg-bg p-[18px] font-mono text-[11.5px] leading-relaxed text-text-2">
                  {step.rows.map((r, j) => (
                    <div key={j} className="flex gap-2 py-1">
                      <span className="text-text-3">→</span>
                      <span
                        className={
                          j === step.rows.length - 1
                            ? "font-medium text-brand"
                            : ""
                        }
                      >
                        {r}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For who */}
      <section id="for-who" className="bg-text px-7 py-24 text-surface">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-16 max-w-[700px]">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-white/50">
              For who
            </div>
            <h2 className="text-[clamp(36px,5vw,48px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              Built for the teams who don&apos;t have time for a transformation
              program.
            </h2>
            <p className="mt-4 text-[18px] leading-relaxed text-white/70">
              Mid-market operators, PE portcos in their first 100 days, PE firms
              direct, and funded SaaS/AI scale-ups looking for a product
              partner.
            </p>
          </div>
          <div className="grid gap-[18px] md:grid-cols-2">
            {[
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
            ].map(([eyebrow, title, desc]) => (
              <div
                key={title}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-7"
              >
                <div className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-white/50">
                  {eyebrow}
                </div>
                <div className="mb-3 text-2xl font-semibold leading-tight tracking-tight">
                  {title}
                </div>
                <p className="text-md leading-relaxed text-white/70">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes */}
      <section id="outcomes" className="px-7 py-24">
        <div className="mx-auto max-w-[1180px]">
          <div className="mx-auto mb-14 max-w-[760px] text-center">
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-text-3">
              Outcomes
            </div>
            <h2 className="text-[clamp(36px,5vw,48px)] font-semibold leading-[1.08] tracking-[-0.025em]">
              What discovery actually moves.
            </h2>
            <p className="mx-auto mt-4 max-w-[580px] text-[18px] leading-relaxed text-text-2">
              Averages across Atlas sprints. Numbers from individual engagements
              vary.
            </p>
          </div>
          <div className="grid gap-3.5 md:grid-cols-3">
            {[
              [
                "86",
                "%",
                "Average team participation",
                "Across all Atlas sprints. Most contributors complete every session — the 6-minute format makes it work.",
              ],
              [
                "$720",
                "K",
                "Median est. annual impact, top 5",
                "For mid-market clients. Combined across the top 5 opportunities in a typical sprint. Ranges from $400K to $1.4M.",
              ],
              [
                "4.6",
                "/ 5",
                "Signal quality, sponsor-rated",
                '"Comparable to a senior consultant interview" — what sponsors tell us comparing Atlas output to MBB diagnostic reports.',
              ],
            ].map(([stat, unit, label, ctx]) => (
              <div
                key={label}
                className="rounded-lg border border-border bg-surface p-7"
              >
                <div className="mb-2 text-[56px] font-semibold leading-none tracking-[-0.03em]">
                  {stat}
                  <span className="ml-0.5 text-[22px] font-medium text-text-3">
                    {unit}
                  </span>
                </div>
                <div className="mb-2.5 text-md font-semibold">{label}</div>
                <div className="text-[13px] leading-relaxed text-text-2">
                  {ctx}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-surface px-7 py-24 text-center">
        <div className="mx-auto max-w-[760px]">
          <h2 className="text-[clamp(40px,6vw,56px)] font-semibold leading-[1.05] tracking-[-0.025em]">
            The first opportunity surfaces within a week.
          </h2>
          <p className="mx-auto mt-6 max-w-[540px] text-[17px] leading-relaxed text-text-2">
            Sprint mode is fixed-fee, 3–4 weeks. We&apos;ll tell you what
            we&apos;d cost upfront, what to expect, and what would justify
            killing the project if it isn&apos;t working.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <ButtonLink
              href="/sign-in"
              variant="primary"
              size="lg"
            >
              Explore a live sprint <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/pricing" variant="secondary" size="lg">
              See pricing
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-bg px-7 pb-8 pt-14">
        <div className="mx-auto max-w-[1180px]">
          <div className="mb-12 grid gap-9 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-3.5 max-w-[280px] text-[13px] leading-relaxed text-text-2">
                An operational discovery sprint. Built by Twistag for operators,
                portcos, and partners that need to ship.
              </p>
            </div>
            {[
              [
                "Product",
                ["How it works", "Pricing", "Sample report", "Changelog"],
              ],
              ["For", ["Mid-market", "PE portcos", "PE firms", "Scale-ups"]],
              [
                "Company",
                ["About Twistag", "Privacy", "Security · SOC 2", "Contact"],
              ],
            ].map(([heading, links]) => (
              <div key={heading as string}>
                <h5 className="mb-3.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-3">
                  {heading}
                </h5>
                {(links as string[]).map((l) => (
                  <a
                    key={l}
                    href="#"
                    className="block py-1.5 text-[13.5px] text-text-2 transition-colors hover:text-text"
                  >
                    {l}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-7 text-xs text-text-3">
            <span>© 2026 Twistag. Atlas is a product of Twistag.</span>
            <span>Made in Lisbon · GDPR compliant</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
