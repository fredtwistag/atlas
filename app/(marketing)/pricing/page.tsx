import Link from "next/link";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Atlas — Pricing" };

const tiers = [
  {
    name: "Sprint",
    price: "$25K–$95K",
    cadence: "fixed-fee · 3–4 weeks",
    tagline: "One discovery sprint, scoped to your team size.",
    features: [
      "Up to 4 sessions per participant",
      "Ranked, ROI-scored opportunity backlog",
      "Click-through evidence on every score",
      "Pre-drafted SOWs for approved opportunities",
      "Interactive + PDF final report",
    ],
    cta: "Book a sprint",
    highlight: true,
  },
  {
    name: "Atlas Core",
    price: "Coming in v1.5",
    cadence: "subscription",
    tagline: "Persistent discovery once Slack/Teams integration lands.",
    features: [
      "Always-on capture in the flow of work",
      "Rolling opportunity backlog",
      "Quarterly re-scoring",
    ],
    cta: "Join the waitlist",
    highlight: false,
  },
  {
    name: "Portfolio",
    price: "Coming in v1.5",
    cadence: "for PE firms",
    tagline: "Cross-portfolio discovery and value-creation tracking.",
    features: [
      "Multiple portcos, one cockpit",
      "Repeatable playbook across the portfolio",
      "Dedicated-database isolation option",
    ],
    cta: "Talk to us",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <nav className="border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1180px] items-center px-7">
          <Logo />
          <div className="flex-1" />
          <ButtonLink href="/sign-in" variant="primary">
            See the product
          </ButtonLink>
        </div>
      </nav>

      <section className="px-7 py-20 text-center">
        <h1 className="text-5xl font-semibold tracking-tight">
          Priced to the outcome, not the hour.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-text-2">
          Wave 1 is Sprint mode only. We tell you the cost upfront and what
          would justify killing the project if it isn&apos;t working.
        </p>
      </section>

      <section className="px-7 pb-24">
        <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={
                "flex flex-col rounded-lg border bg-surface p-6 " +
                (t.highlight ? "border-brand shadow" : "border-border")
              }
            >
              {t.highlight && (
                <span className="mb-3 w-fit rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
                  Available now
                </span>
              )}
              <h2 className="text-2xl font-semibold tracking-tight">
                {t.name}
              </h2>
              <div className="mt-2 text-3xl font-medium tracking-tight">
                {t.price}
              </div>
              <div className="text-sm text-text-3">{t.cadence}</div>
              <p className="mt-3 text-md text-text-2">{t.tagline}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-text-2"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <ButtonLink
                href="/sign-in"
                variant={t.highlight ? "brand" : "secondary"}
                className="mt-5 w-full"
              >
                {t.cta}
              </ButtonLink>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-xl text-center text-sm text-text-3">
          <Link
            href="/"
            className="font-medium text-brand hover:text-brand-hover"
          >
            ← Back home
          </Link>
        </p>
      </section>
    </div>
  );
}
