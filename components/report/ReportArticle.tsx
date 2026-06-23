import { Check } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { OpportunityCard } from "@/components/opportunity/OpportunityCard";
import { ReportExplainer } from "@/components/report/ReportExplainer";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import { moneyShort } from "@/lib/format";
import { highImpactLead, corroborationLine, narrativeFallback } from "@/lib/report-content";
import type {
  Sprint,
  SprintProgress,
  Opportunity,
  SynthesisMemo,
} from "@/lib/types";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

/**
 * The discovery report body, shared by the manager/sponsor report and the
 * Twistag read-only report. The page owns the toolbar + data fetch; this owns
 * the `<article>`. Pass `opportunityHref` to make the ranked cards link to their
 * detail (manager view); omit it for the read-only Twistag view.
 */
export function ReportArticle({
  sprint,
  progress: p,
  opps,
  memo,
  workflowMaps,
  opportunityHref,
}: {
  sprint: Sprint;
  progress: SprintProgress;
  opps: Opportunity[];
  memo?: SynthesisMemo | null;
  workflowMaps?: WorkflowMapView[];
  opportunityHref?: (id: string) => string;
}) {
  const topFive = opps.slice(0, 5);
  const currency = sprint.tenantCurrency;
  const totalLow = topFive.reduce((s, o) => s + o.impactLow, 0);
  const totalHigh = topFive.reduce((s, o) => s + o.impactHigh, 0);
  // Barbell by funding horizon (Ticket D), derived at scoring time — not the
  // old ad-hoc ≤3-weeks / ≥7.5-composite split.
  const quickWins = opps.filter((o) => o.horizon === "quick_win");
  const strategicBets = opps.filter((o) => o.horizon === "strategic_bet");
  const solidBets = opps.filter(
    (o) => o.horizon !== "quick_win" && o.horizon !== "strategic_bet",
  );

  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      {/* Scoring explainer — dismissible, hidden in print. */}
      <ReportExplainer />

      {/* Cover */}
      <header className="mb-12 border-b border-border pb-10">
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.1em] text-brand">
          Atlas discovery report
        </div>
        <CompanyLogo
          domain={sprint.tenantDomain}
          name={sprint.tenantName}
          size="lg"
          className="mb-4"
        />
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

      {/* Synthesis — the board-ready spine. Uses the generated memo when
          present, else a deterministic fallback so it never silently vanishes. */}
      <Section title="Synthesis">
        {memo && memo.openingNarrative ? (
          <>
            <p>{memo.openingNarrative}</p>
            {memo.portfolioStory ? <p>{memo.portfolioStory}</p> : null}
            {memo.sequencingLogic ? <p>{memo.sequencingLogic}</p> : null}
            {memo.riskNarrative ? <p>{memo.riskNarrative}</p> : null}
            {memo.recommendedNextStep ? (
              <p>
                <strong>Recommended next step. </strong>
                {memo.recommendedNextStep}
              </p>
            ) : null}
          </>
        ) : (
          (() => {
            const fallback = narrativeFallback({
              scopeDepartment: sprint.scopeDepartment,
              participantCount: p.participantCount,
              opportunitiesCount: p.opportunitiesCount,
              opps,
              totalLow,
              totalHigh,
              currency,
            });
            return fallback ? <p>{fallback}</p> : null;
          })()
        )}
      </Section>

      {/* Executive summary */}
      <Section title="Executive summary">
        <p>
          Over {sprint.dayTotal} days, Atlas held short, structured
          conversations with {p.participantCount} contributor
          {p.participantCount === 1 ? "" : "s"} across {sprint.scopeDepartment} —{" "}
          {p.sessionsCompleted} sessions producing {p.capturesCount} discrete
          captures. From those, Atlas surfaced{" "}
          <strong>{highImpactLead(p.opportunitiesCount, p.highImpactCount, currency)}</strong>.
        </p>
        <p>
          The combined estimated annual impact of the top five is{" "}
          <strong>
            {moneyShort(totalLow, currency)}–{moneyShort(totalHigh, currency)}
          </strong>
          .{" "}
          {topFive[0] ? (
            <>
              The highest-ranked — <strong>{topFive[0].title}</strong> — is
              estimated at {moneyShort(topFive[0].impactLow, currency)}–
              {moneyShort(topFive[0].impactHigh, currency)}/yr.
            </>
          ) : null}{" "}
          {corroborationLine(opps)}
        </p>
        <div className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            [`${moneyShort(totalLow, currency)}+`, "Est. impact, top 5"],
            [`${p.opportunitiesCount}`, "Opportunities"],
            [`${p.capturesCount}`, "Captures"],
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
          Atlas runs discovery as conversation, not workshops. Each participant
          completed up to four short sessions on their own schedule, covering
          how work flows, where it breaks, the tools involved, and the one
          change they&apos;d make. An extraction pass lifted concrete moments —
          bottlenecks, workarounds, handoffs — from each reply, attributed to
          the contributor by name and role.
        </p>
        <p>
          Captures were clustered by similarity and scored across five
          dimensions: financial impact, implementation feasibility, time to
          value, strategic alignment, and evidence confidence. Each opportunity
          links back to the verbatim captures that drove its score, attributed
          to the contributor by name and role.
        </p>
      </Section>

      {/* Ranked opportunities */}
      <Section title="Opportunities, ranked">
        {opps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-text-3">
            No opportunities surfaced yet. They appear here as Atlas extracts
            and scores captures from completed sessions.
          </p>
        ) : (
          <div className="not-prose space-y-3">
            {opps.map((o, i) => (
              <OpportunityCard
                key={o.id}
                opp={o}
                href={opportunityHref?.(o.id)}
                rank={i + 1}
                meta="category"
                currency={currency}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Impact vs. effort — the portfolio matrix (per-opportunity flow
          diagrams now live inside each opportunity). */}
      {workflowMaps && workflowMaps.length > 0 ? (
        <Section title="Impact vs. effort">
          <p>
            Every surfaced opportunity placed by estimated impact against the
            effort to ship it — the upper-left quadrant is where to start. Each
            opportunity&apos;s own workflow diagram lives on its detail page.
          </p>
          <div className="not-prose mt-4 space-y-8">
            {workflowMaps.map((m) => (
              <figure key={m.id} className="rounded-lg border border-border bg-surface p-4">
                <figcaption className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text">{m.title}</span>
                  {m.basedOnSessions > 0 ? (
                    <span className="text-xs text-text-3">
                      Based on {m.basedOnSessions} session
                      {m.basedOnSessions === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </figcaption>
                <WorkflowDiagram graph={m.graph} instanceId={m.id} />
                {m.kind === "impact_effort" ? (
                  <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-2">
                    {m.graph.steps.map((s, i) => (
                      <li key={s.id}>
                        {i + 1}. {s.label}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </figure>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Roadmap */}
      <Section title="Suggested roadmap">
        <div className="not-prose grid gap-4 sm:grid-cols-3">
          <RoadmapColumn
            title="Quick wins"
            caption="Fast, standalone, low-disruption"
            items={quickWins.map((o) => o.title)}
            empty="No quick wins yet — short-cycle fixes land here as they surface."
          />
          <RoadmapColumn
            title="Solid bets"
            caption="Clear value, standard delivery"
            items={solidBets.map((o) => o.title)}
            empty="Ranked opportunities land here as they surface."
          />
          <RoadmapColumn
            title="Strategic bets"
            caption="High impact, bigger lift"
            items={strategicBets.map((o) => o.title)}
            empty="No strategic bets yet — larger, higher-impact plays land here."
          />
        </div>
      </Section>

      {/* Closing */}
      <Section title="What happens next">
        <p>
          Each opportunity above links to its full evidence and a pre-drafted
          SOW. Approve one and the Twistag engagement team aligns scope within
          48 hours; the first ship typically lands in 2–4 weeks. Nothing here is
          a slide — it&apos;s a backlog ready to execute.
        </p>
      </Section>

      <footer className="mt-12 border-t border-border pt-6 text-xs text-text-3">
        Generated by Atlas · {sprint.startDate} – {sprint.endDate} · Built by
        Twistag. Quotes attributed to contributors by name and role.
      </footer>
    </article>
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
  empty,
}: {
  title: string;
  caption: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-text-3">{caption}</p>
      {items.length === 0 ? (
        <p className="text-sm text-text-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2 text-sm text-text-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
