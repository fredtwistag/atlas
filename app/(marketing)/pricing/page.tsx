import { Cta, ArrowLink } from "@/components/marketing/Cta";
import {
  BOOKING_URL,
  TWISTAG_CONTACT_URL,
} from "@/components/marketing/constants";

export const metadata = { title: "Atlas — Pricing" };

const tiers = [
  {
    name: "Sprint",
    price: "$25K–$95K",
    cadence: "Fixed fee · 3–4 weeks",
    tagline: "One discovery sprint, scoped to your team size.",
    features: [
      "Up to 4 sessions per participant",
      "Ranked, ROI-scored opportunity backlog",
      "Click-through evidence on every score",
      "Pre-drafted SOWs for approved opportunities",
      "Interactive + PDF final report",
    ],
    cta: "Book a sprint",
    href: BOOKING_URL,
    available: true,
  },
  {
    name: "Atlas Core",
    price: "Coming in v1.5",
    cadence: "Subscription",
    tagline: "Persistent discovery once Slack/Teams integration lands.",
    features: [
      "Always-on capture in the flow of work",
      "Rolling opportunity backlog",
      "Quarterly re-scoring",
    ],
    cta: "Join the waitlist",
    href: TWISTAG_CONTACT_URL,
    available: false,
  },
  {
    name: "Portfolio",
    price: "Coming in v1.5",
    cadence: "For PE firms",
    tagline: "Cross-portfolio discovery and value-creation tracking.",
    features: [
      "Multiple portcos, one cockpit",
      "Repeatable playbook across the portfolio",
      "Dedicated-database isolation option",
    ],
    cta: "Talk to us",
    href: TWISTAG_CONTACT_URL,
    available: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <header className="bg-surface">
        <div className="mx-auto max-w-[1500px] px-[5%]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-strong py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-text-3">
            <span>Atlas / pricing</span>
            <span>Doc 02 · rate card · a Twistag product</span>
          </div>
          <div className="pb-14 pt-12 sm:pb-20 sm:pt-16">
            <h1 className="max-w-[1000px] text-[clamp(38px,5.5vw,84px)] font-medium leading-[1.02] tracking-[-0.025em]">
              Priced to the outcome,{" "}
              <span className="text-[color:var(--ink-faint)]">
                not the hour.
              </span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[16px] leading-relaxed text-text-2">
              Wave 1 is Sprint mode only. We tell you the cost upfront and what
              would justify killing the project if it isn&apos;t working.
            </p>
          </div>
        </div>
      </header>

      <section className="border-t border-border-strong">
        <div className="mx-auto max-w-[1500px] px-[5%] py-14 sm:py-20">
          <div className="grid border-t-[1.5px] border-text md:grid-cols-3">
            {tiers.map((t, i) => (
              <div
                key={t.name}
                className={
                  "flex flex-col px-0 py-8 md:px-8 md:py-10 " +
                  (i > 0
                    ? "border-t border-border md:border-l md:border-t-0 "
                    : "") +
                  (t.available ? "bg-surface" : "")
                }
              >
                {t.available ? (
                  <span className="mb-5 w-fit border-[1.5px] border-text bg-accent px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink [transform:rotate(-2deg)]">
                    Available now
                  </span>
                ) : (
                  <span className="mb-5 h-[33px] w-fit py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text-3">
                    {t.cadence}
                  </span>
                )}
                <h2 className="text-[clamp(22px,2.2vw,30px)] font-medium tracking-[-0.015em]">
                  {t.name}
                </h2>
                <div className="mt-2 text-[clamp(26px,2.6vw,38px)] font-medium tracking-[-0.02em]">
                  {t.price}
                </div>
                {t.available ? (
                  <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-text-3">
                    {t.cadence}
                  </div>
                ) : null}
                <p className="mt-4 text-[14.5px] leading-relaxed text-text-2">
                  {t.tagline}
                </p>
                <div className="mt-6 flex-1 border-t border-border">
                  {t.features.map((f) => (
                    <div
                      key={f}
                      className="flex items-baseline gap-3 border-b border-border py-2.5 text-[14px] text-text-2"
                    >
                      <span className="font-mono text-[11px] text-text-3">
                        →
                      </span>
                      {f}
                    </div>
                  ))}
                </div>
                <div className="mt-8">
                  {t.available ? (
                    <Cta
                      href={t.href}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full"
                    >
                      {t.cta}
                    </Cta>
                  ) : (
                    <ArrowLink href={t.href} target="_blank" rel="noreferrer">
                      {t.cta}
                    </ArrowLink>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-10 max-w-[640px] text-center text-[14px] leading-relaxed text-text-2">
            Not sure which fits? Book a call and we&apos;ll tell you honestly —
            including if Atlas isn&apos;t the right tool yet.
          </p>
        </div>
      </section>
    </>
  );
}
