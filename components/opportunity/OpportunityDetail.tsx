"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock,
  MessageSquare,
  Quote,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ScoreBadge } from "@/components/ScoreBadge";
import { cn } from "@/lib/cn";
import { usdRange, usdShort } from "@/lib/data";
import type { Opportunity, SowDraft } from "@/lib/types";

type Tab = "evidence" | "patterns" | "discussion";

export function OpportunityDetail({
  sprintId,
  opp,
  sow,
}: {
  sprintId: string;
  opp: Opportunity;
  sow: SowDraft;
}) {
  const [tab, setTab] = useState<Tab>("evidence");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [approved, setApproved] = useState(false);

  const confidenceLabel = ["—", "Very low", "Low", "Moderate", "High", "Very high"][
    opp.confidenceScore
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href={`/sprint/${sprintId}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-text-2 hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sprint
      </Link>

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
          <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tight">
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
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        {[
          {
            icon: TrendingUp,
            label: "Est. annual impact",
            value: `${usdRange(opp.impactLow, opp.impactHigh)}`,
          },
          {
            icon: Clock,
            label: "Time to ship",
            value: `${opp.timeToShipWeeksLow}–${opp.timeToShipWeeksHigh} weeks`,
          },
          {
            icon: Users,
            label: "Corroborating voices",
            value: `${opp.contributorCount} contributors`,
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
            <div className="text-lg font-semibold tracking-tight">{m.value}</div>
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
            <p className="text-md leading-relaxed text-text-2">{opp.rationale}</p>
          </Card>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 border-b border-border">
            {(
              [
                ["evidence", `Evidence · ${opp.evidence.length}`],
                ["patterns", "Patterns"],
                ["discussion", "Discussion"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                  tab === key
                    ? "border-brand text-text"
                    : "border-transparent text-text-3 hover:text-text-2",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "evidence" && (
            <div className="space-y-3">
              {opp.evidence.map((c) => (
                <Card key={c.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge tone="neutral">{c.kind}</Badge>
                    <span className="text-xs font-medium text-text-3">
                      {c.contributorRole}
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
                </Card>
              ))}
              <p className="px-1 text-xs leading-relaxed text-text-3">
                Quotes are attributed by role only. Internal records link each
                quote to its contributor for that person&apos;s own edit window —
                never shown here.
              </p>
            </div>
          )}

          {tab === "patterns" && (
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
          )}

          {tab === "discussion" && (
            <Card className="p-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-6 w-6 text-text-3" />
              <p className="text-sm font-medium">No comments yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-text-3">
                This is where the manager, sponsor, and Twistag align on scope
                before approving. Comments notify by email (opt-in).
              </p>
            </Card>
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
                    <span className="font-semibold tabular-nums">{d.score}/10</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${d.score * 10}%` }}
                    />
                  </div>
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
                SOW draft sent to the Twistag engagement team. They&apos;ll align
                scope within 48 hours.
              </p>
            </Card>
          ) : (
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              onClick={() => setSheetOpen(true)}
            >
              Approve for FDE engagement <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Approve sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <button
            className="absolute inset-0 bg-text/30 backdrop-blur-sm"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
          />
          <div className="relative z-10 flex h-full w-full max-w-xl flex-col bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-brand">
                  Auto-drafted SOW
                </div>
                <h2 className="font-serif text-xl font-medium tracking-tight">
                  Approve for FDE engagement
                </h2>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                className="rounded p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <Field label="Engagement title" value={sow.title} />
              <Field label="Scope" value={sow.scope} multiline />

              <div className="grid grid-cols-2 gap-4">
                <Field label="Duration" value={`${sow.durationWeeks} weeks`} />
                <Field
                  label="Fixed price"
                  value={usdShort(sow.priceUsd).replace("K", ",000")}
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
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              <span className="text-xs text-text-3">
                Editable before send. Generated in ~30s from the evidence.
              </span>
              <Button
                variant="brand"
                onClick={() => {
                  setApproved(true);
                  setSheetOpen(false);
                }}
              >
                Send to Twistag
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        {label}
      </div>
      <div
        className={cn(
          "rounded border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text",
          multiline && "min-h-[80px]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ListField({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "success" | "neutral" | "brand";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-text-3">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-text-2">
            <Check
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                tone === "success"
                  ? "text-success"
                  : tone === "brand"
                    ? "text-brand"
                    : "text-text-3",
              )}
            />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
