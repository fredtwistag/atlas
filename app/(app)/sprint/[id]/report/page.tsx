import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Download } from "lucide-react";
import { BackLink } from "@/components/ui/BackLink";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { usdShort } from "@/lib/data";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Discovery report · Atlas" };
export const dynamic = "force-dynamic";

export default async function FinalReport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireManagerOrSponsor();
  const api = await getApi();
  const sprint = await api.sprint.get({ id }).catch(() => null);
  if (!sprint) notFound();
  const [p, opps] = await Promise.all([
    api.sprint.progress({ id }),
    api.opportunity.listForSprint({ sprintId: id }),
  ]);

  const topFive = opps.slice(0, 5);
  const totalLow = topFive.reduce((s, o) => s + o.impactLow, 0);
  const totalHigh = topFive.reduce((s, o) => s + o.impactHigh, 0);
  const quickWins = opps.filter((o) => o.timeToShipWeeksHigh <= 3);
  const highImpact = opps.filter((o) => o.compositeScore >= 7.5);

  return (
    <div className="bg-bg">
      {/* Toolbar */}
      <div className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-2.5">
          <BackLink href={`/sprint/${id}`}>Back to sprint</BackLink>
          <button className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2">
            <Download className="h-3.5 w-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-12">
        {/* Cover */}
        <header className="mb-12 border-b border-border pb-10">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-brand">
            Atlas discovery report
          </div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
            {sprint.tenantName}
          </h1>
          <p className="mt-3 text-lg text-text-2">{sprint.name}</p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm text-text-2">
            <span>
              <span className="text-text-3">Focus · </span>
              {sprint.primaryFocus}
            </span>
            <span>
              <span className="text-text-3">Window · </span>
              {sprint.startDate} – {sprint.endDate}
            </span>
            <span>
              <span className="text-text-3">Sponsor · </span>
              {sprint.sponsor.name}, {sprint.sponsor.title}
            </span>
          </div>
        </header>

        {/* Executive summary */}
        <Section title="Executive summary">
          <p>
            Over {sprint.dayTotal} days, {p.participantCount} people across{" "}
            {sprint.scopeDepartment} had short, structured conversations with
            Atlas — {p.sessionsCompleted} sessions in total, producing{" "}
            {p.capturesCount} discrete captures. From those, Atlas surfaced{" "}
            <strong>{p.opportunitiesCount} opportunities</strong>,{" "}
            {p.highImpactCount} of them high-impact.
          </p>
          <p>
            The combined estimated annual impact of the top five is{" "}
            <strong>
              {usdShort(totalLow)}–{usdShort(totalHigh)}
            </strong>
            . The single most-cited friction — a manual credit-hold release that
            stalls roughly 140 orders a month — was corroborated independently
            by five contributors across Finance, Order Ops, and Warehouse.
          </p>
          <div className="my-6 grid grid-cols-3 gap-3">
            {[
              [`${p.completionPct}%`, "Participation"],
              [`${p.opportunitiesCount}`, "Opportunities"],
              [`${usdShort(totalLow)}+`, "Est. impact, top 5"],
            ].map(([v, l]) => (
              <div
                key={l}
                className="rounded-lg border border-border bg-surface p-4 text-center"
              >
                <div className="text-3xl font-semibold tracking-tight">{v}</div>
                <div className="mt-1 text-xs text-text-3">{l}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Methodology */}
        <Section title="How we got here">
          <p>
            Atlas runs discovery as conversation, not workshops. Each
            participant completed up to four short sessions on their own
            schedule, covering how work flows, where it breaks, the tools
            involved, and the one change they&apos;d make. An extraction pass
            lifted concrete moments — bottlenecks, workarounds, handoffs — from
            each reply, attributed by role, never by name.
          </p>
          <p>
            Captures were clustered by similarity and scored across five
            dimensions: financial impact, implementation feasibility, time to
            value, strategic alignment, and evidence confidence. Only
            opportunities corroborated by multiple contributors are shown here.
          </p>
        </Section>

        {/* Ranked opportunities */}
        <Section title="Opportunities, ranked">
          <div className="not-prose space-y-3">
            {opps.map((o, i) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                href={`/sprint/${id}/opportunity/${o.id}`}
                rank={i + 1}
                meta="category"
              />
            ))}
          </div>
        </Section>

        {/* Roadmap */}
        <Section title="Suggested roadmap">
          <div className="not-prose grid gap-4 sm:grid-cols-2">
            <RoadmapColumn
              title="Quick wins"
              caption="Ship in ≤ 3 weeks"
              items={quickWins.map((o) => o.title)}
            />
            <RoadmapColumn
              title="High-impact builds"
              caption="Score ≥ 7.5"
              items={highImpact.map((o) => o.title)}
            />
          </div>
        </Section>

        {/* Closing */}
        <Section title="What happens next">
          <p>
            Each opportunity above links to its full evidence and a pre-drafted
            SOW. Approve one and the Twistag engagement team aligns scope within
            48 hours; the first ship typically lands in 2–4 weeks. Nothing here
            is a slide — it&apos;s a backlog ready to execute.
          </p>
        </Section>

        <footer className="mt-12 border-t border-border pt-6 text-xs text-text-3">
          Generated by Atlas · {sprint.startDate} – {sprint.endDate} · Built by
          Twistag. Quotes attributed by role only.
        </footer>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-md leading-relaxed text-text-2 [&_strong]:font-semibold [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

function RoadmapColumn({
  title,
  caption,
  items,
}: {
  title: string;
  caption: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-text-3">{caption}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-text-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
