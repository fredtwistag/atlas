"use client";

import { useId, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Quote,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import { PageContainer } from "@/components/ui/PageContainer";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sheet } from "@/components/ui/Sheet";
import { Field, ListField } from "@/components/ui/DetailField";
import { ScoreBadge } from "@/components/ScoreBadge";
import { cn } from "@/lib/cn";
import { moneyRange, moneyShort, type Currency } from "@/lib/format";
import { pluralize } from "@/lib/text";
import type { Opportunity, SowDraft } from "@/lib/types";
import { WorkflowDiagram } from "@/components/workflow/WorkflowDiagram";
import type { WorkflowMapView } from "@/services/synthesis/workflows/types";

type Tab = "evidence" | "workflow" | "patterns" | "discussion";

export function OpportunityDetail({
  sprintId,
  opp,
  sow,
  approverRole,
  onApprove,
  readOnly = false,
  backHref,
  backLabel,
  currency,
  workflow,
  transcriptBaseHref,
}: {
  sprintId: string;
  opp: Opportunity;
  /** Required for the approve flow; omit for a read-only view. */
  sow?: SowDraft;
  approverRole?: string;
  onApprove?: (sprintId: string, oppId: string) => Promise<void>;
  /** Hides the approve action — e.g. the Twistag admin drill-down, where
   * approval stays with the client's sponsor and manager. */
  readOnly?: boolean;
  backHref?: string;
  backLabel?: string;
  currency: Currency;
  /** This opportunity's current-state diagram, when one was surfaced. */
  workflow?: WorkflowMapView | null;
  /** Base path for transcript links (e.g. `/admin/.../session`); the session id
   * is appended. When set, each evidence quote with a source session links to
   * its conversation. Admin-only (managers/sponsors can't read others'). A
   * string (not a fn) so it crosses the server→client boundary. */
  transcriptBaseHref?: string;
}) {
  const [tab, setTab] = useState<Tab>("evidence");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [approved, setApproved] = useState(opp.status === "approved");
  const [approving, setApproving] = useState(false);

  const tabKeys: Tab[] = workflow
    ? ["evidence", "workflow", "patterns", "discussion"]
    : ["evidence", "patterns", "discussion"];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const tabId = (key: Tab) => `${baseId}-tab-${key}`;
  const panelId = (key: Tab) => `${baseId}-panel-${key}`;

  function onTabKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabKeys.length;
    else if (e.key === "ArrowLeft")
      next = (idx - 1 + tabKeys.length) % tabKeys.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabKeys.length - 1;
    else return;
    e.preventDefault();
    setTab(tabKeys[next]);
    tabRefs.current[next]?.focus();
  }

  const isSponsor = approverRole === "sponsor";
  const approveLabel = isSponsor
    ? "Approve as sponsor"
    : "Approve for FDE engagement";

  const confidenceLabel = [
    "—",
    "Very low",
    "Low",
    "Moderate",
    "High",
    "Very high",
  ][opp.confidenceScore];

  return (
    <PageContainer>
      <div className="mb-5">
        <BackLink href={backHref ?? `/sprint/${sprintId}`}>
          {backLabel ?? "Back to sprint"}
        </BackLink>
      </div>

      {/* Hero */}
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{opp.category}</Badge>
            {opp.departments.map((d) => (
              <Badge key={d} tone="outline">
                {d}
              </Badge>
            ))}
          </div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight">
            {opp.title}
          </h1>
          <p className="mt-2.5 text-md leading-relaxed text-text-2">
            {opp.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ScoreBadge score={opp.compositeScore} size="lg" />
        </div>
      </div>

      {/* Key metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            icon: TrendingUp,
            label: "Est. annual impact",
            value: `${moneyRange(opp.impactLow, opp.impactHigh, currency)}`,
          },
          {
            icon: Clock,
            label: "Time to ship",
            value: `${opp.timeToShipWeeksLow}–${opp.timeToShipWeeksHigh} weeks`,
          },
          {
            icon: Users,
            label: "Corroborating voices",
            value: pluralize(opp.contributorCount, "contributor"),
          },
          {
            icon: Sparkles,
            label: "Confidence",
            value: confidenceLabel,
          },
        ].map((m) => (
          <Card key={m.label} className="p-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
              <m.icon className="h-3.5 w-3.5" />
              {m.label}
            </div>
            <div className="text-lg font-semibold tracking-tight">
              {m.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {/* Rationale */}
          <Card className="mb-6 p-5">
            <h2 className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-brand" /> Why this surfaced
            </h2>
            <p className="text-md leading-relaxed text-text-2">
              {opp.rationale}
            </p>
          </Card>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Opportunity detail"
            className="mb-4 flex gap-1 border-b border-border"
          >
            {(
              [
                ["evidence", `Evidence · ${opp.evidence.length}`],
                ...(workflow
                  ? ([["workflow", "Workflow"]] as [Tab, string][])
                  : []),
                ["patterns", "Patterns"],
                ["discussion", "Discussion"],
              ] as [Tab, string][]
            ).map(([key, label], idx) => {
              const selected = tab === key;
              return (
                <button
                  key={key}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  role="tab"
                  id={tabId(key)}
                  aria-selected={selected}
                  aria-controls={panelId(key)}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(key)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                    selected
                      ? "border-brand text-text"
                      : "border-transparent text-text-3 hover:text-text-2",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {tab === "evidence" && (
            <div
              role="tabpanel"
              id={panelId("evidence")}
              aria-labelledby={tabId("evidence")}
              tabIndex={0}
              className="space-y-3"
            >
              {opp.evidence.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge tone="neutral">{c.kind}</Badge>
                    <span
                      className="min-w-0 truncate text-xs font-medium text-text-2"
                      title={`${c.contributorName} · ${c.contributorRole}`}
                    >
                      {c.contributorName}
                      <span className="text-text-3">
                        {" "}
                        · {c.contributorRole}
                      </span>
                    </span>
                  </div>
                  <p className="mb-2.5 text-md font-medium leading-snug">
                    {c.summary}
                  </p>
                  <div className="flex gap-2 rounded border border-border bg-bg p-3">
                    <Quote className="h-3.5 w-3.5 shrink-0 text-text-3" />
                    <p className="text-[13px] italic leading-relaxed text-text-2">
                      “{c.sourceQuote}”
                    </p>
                  </div>
                  {transcriptBaseHref && c.sessionId ? (
                    <Link
                      href={`${transcriptBaseHref}/${c.sessionId}`}
                      className="mt-2.5 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline"
                    >
                      View conversation <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </Card>
              ))}
              <p className="px-1 text-xs leading-relaxed text-text-3">
                Quotes are attributed to each contributor by name and role so
                you know who to follow up with. Contributors can still edit or
                remove anything they said for 7 days after their session.
              </p>
            </div>
          )}

          {tab === "workflow" && workflow && (
            <div
              role="tabpanel"
              id={panelId("workflow")}
              aria-labelledby={tabId("workflow")}
              tabIndex={0}
            >
              <p className="mb-3 text-[13px] text-text-3">
                Current state, synthesized from this opportunity&apos;s evidence.
                The highlighted step is what this opportunity removes.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface p-3">
                <WorkflowDiagram graph={workflow.graph} instanceId={workflow.id} />
              </div>
            </div>
          )}

          {tab === "patterns" && (
            <div
              role="tabpanel"
              id={panelId("patterns")}
              aria-labelledby={tabId("patterns")}
              tabIndex={0}
            >
              <Card className="p-5">
                {opp.patternMatch ? (
                  <>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
                      Twistag-internal · pattern library
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-md font-semibold">
                          {opp.patternMatch.title}
                        </h3>
                        <p className="mt-1 text-sm text-text-2">
                          Shipped {opp.patternMatch.deploys} times across prior
                          Twistag engagements.
                        </p>
                      </div>
                      <Badge tone="brand">
                        {Math.round(opp.patternMatch.similarity * 100)}% match
                      </Badge>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-text-3">
                    No strong pattern match yet. Vector similarity runs nightly.
                  </p>
                )}
              </Card>
            </div>
          )}

          {tab === "discussion" && (
            <div
              role="tabpanel"
              id={panelId("discussion")}
              aria-labelledby={tabId("discussion")}
              tabIndex={0}
            >
              <Card className="p-8 text-center">
                <MessageSquare className="mx-auto mb-2 h-6 w-6 text-text-3" />
                <p className="text-sm font-medium">No comments yet</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-text-3">
                  This is where the manager, sponsor, and Twistag align on scope
                  before approving. Comments notify by email (opt-in).
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Right rail: scoring breakdown + action */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Score breakdown</h2>
            <div className="space-y-3">
              {opp.dimensionScores.map((d) => (
                <div key={d.key}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-text-2">{d.label}</span>
                    <span className="font-semibold tabular-nums">
                      {d.score}/10
                    </span>
                  </div>
                  <ProgressBar value={d.score * 10} />
                  <p className="mt-1 text-xs leading-relaxed text-text-3">
                    {d.reasoning}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {approved ? (
            <Card className="border-success/40 bg-success-soft p-5 text-center">
              <Check className="mx-auto mb-1.5 h-6 w-6 text-success" />
              <p className="text-sm font-semibold text-success">
                Approved for FDE
              </p>
              <p className="mt-1 text-sm text-text-2">
                SOW draft sent to the Twistag engagement team. They&apos;ll
                align scope within 48 hours.
              </p>
            </Card>
          ) : readOnly ? (
            <Card className="p-4 text-center">
              <p className="text-sm text-text-3">
                Read-only view. Approving an opportunity stays with the
                client&apos;s sponsor and manager.
              </p>
            </Card>
          ) : (
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              onClick={() => setSheetOpen(true)}
            >
              {approveLabel} <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Approve sheet */}
      {!readOnly && sow ? (
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          eyebrow="Auto-drafted SOW"
          title={approveLabel}
          footer={
            <>
              <span className="text-xs text-text-3">
                Editable before send. Generated in ~30s from the evidence.
              </span>
              <Button
                variant="brand"
                disabled={approving}
                onClick={async () => {
                  setApproving(true);
                  try {
                    await onApprove?.(sprintId, opp.id);
                    setApproved(true);
                    setSheetOpen(false);
                  } finally {
                    setApproving(false);
                  }
                }}
              >
                {approving ? "Sending…" : "Send to Twistag"}
              </Button>
            </>
          }
        >
          <Field label="Engagement title" value={sow.title} />
          <Field label="Scope" value={sow.scope} multiline />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration" value={`${sow.durationWeeks} weeks`} />
            <Field
              label="Indicative price (draft)"
              value={moneyShort(sow.priceUsd, currency).replace("K", ",000")}
            />
          </div>

          <ListField label="Inclusions" items={sow.inclusions} tone="success" />
          <ListField label="Exclusions" items={sow.exclusions} tone="neutral" />

          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
              Team
            </div>
            <div className="space-y-1.5">
              {sow.team.map((t) => (
                <div
                  key={t.role}
                  className="flex items-center justify-between rounded border border-border bg-bg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{t.role}</span>
                  <span className="text-text-3">{t.allocation}</span>
                </div>
              ))}
            </div>
          </div>

          <ListField
            label="Success metrics"
            items={sow.successMetrics}
            tone="brand"
          />
        </Sheet>
      ) : null}
    </PageContainer>
  );
}
