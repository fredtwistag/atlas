import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { reportHeadline } from "@/lib/report-hero";
import { moneyShort } from "@/lib/format";
import type { Sprint, SprintProgress, Opportunity } from "@/lib/types";
import type { Currency } from "@/lib/format";

/** The report hero: headline + key metrics + the recommended first move. */
export function ReportHero({
  sprint,
  progress: p,
  opps,
  currency,
  opportunityHref,
  isSponsor = false,
}: {
  sprint: Sprint;
  progress: SprintProgress;
  opps: Opportunity[];
  currency: Currency;
  opportunityHref?: (id: string) => string;
  isSponsor?: boolean;
}) {
  const totalLow = opps.slice(0, 5).reduce((s, o) => s + o.impactLow, 0);
  const totalHigh = opps.slice(0, 5).reduce((s, o) => s + o.impactHigh, 0);
  const top = opps[0];
  const metrics: [string, string][] = [
    [`${p.opportunitiesCount}`, "Opportunities"],
    [`${p.highImpactCount}`, "High-impact"],
    [`${moneyShort(totalLow, currency)}+`, "Est. impact / yr"],
  ];

  return (
    <header className="mb-10 border-b border-border pb-8">
      <div className="mb-4 flex items-center gap-3">
        <CompanyLogo domain={sprint.tenantDomain} name={sprint.tenantName} size="md" />
        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-brand">
          Atlas discovery report · {sprint.name}
        </div>
      </div>
      <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight">
        {reportHeadline({ tenantName: sprint.tenantName, totalLow, totalHigh, currency })}
      </h1>
      <p className="mt-3 text-md text-text-2">
        {p.participantCount} people · {p.sessionsCompleted} sessions · {p.capturesCount} captures across {sprint.scopeDepartment}.
      </p>

      <div className="not-prose mt-6 grid grid-cols-3 gap-3">
        {metrics.map(([v, l]) => (
          <div key={l} className="rounded-lg bg-surface-2 p-4">
            <div className="text-2xl font-semibold tracking-tight">{v}</div>
            <div className="mt-1 text-xs text-text-3">{l}</div>
          </div>
        ))}
      </div>

      {top ? (
        <div className="not-prose mt-4 flex items-center justify-between gap-4 rounded-lg border border-accent-blue bg-accent-blue-soft p-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-blue-text">
              Recommended first move
            </div>
            <div className="truncate text-md font-medium">{top.title}</div>
            <div className="text-xs text-text-2">
              {moneyShort(top.impactLow, currency)}–{moneyShort(top.impactHigh, currency)}/yr ·{" "}
              {top.timeToShipWeeksLow}–{top.timeToShipWeeksHigh} wks · backed by {top.contributorCount} people
            </div>
          </div>
          {opportunityHref ? (
            <Link
              href={opportunityHref(top.id)}
              className="shrink-0 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
            >
              {isSponsor ? "Approve →" : "Review →"}
            </Link>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
