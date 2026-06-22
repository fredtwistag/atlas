"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Label } from "@/components/ui/Input";
import { ScoreBadge } from "@/components/ScoreBadge";
import { opportunityStatusMeta } from "@/lib/ui-maps";
import type { OpportunityStatus } from "@/lib/types";

export type CurationOpportunity = {
  id: string;
  title: string;
  description: string;
  rationale: string;
  impactLow: number;
  impactHigh: number;
  compositeScore: number;
  status: string;
  sprintName: string;
  sowStatus: string | null;
};

const CURATION_STATUSES = ["provisional", "surfaced", "hidden"] as const;

/**
 * Plan 016 Step 6 — Twistag curation of one opportunity. Inline edit form
 * (title/description/rationale/impact) + status controls. Approved rows are
 * read-only: the server refuses to mutate them and the UI reflects that.
 */
export function OpportunityCurationCard({
  opp,
  detailHref,
  sowHref,
  onUpdate,
  onSetStatus,
}: {
  opp: CurationOpportunity;
  /** Opens the read-only opportunity detail (evidence + conversations). */
  detailHref: string;
  /** Opens the read-only SOW view; null when no SOW draft exists yet. */
  sowHref: string | null;
  onUpdate: (
    opportunityId: string,
    patch: {
      title?: string;
      description?: string;
      rationale?: string;
      impactLow?: number;
      impactHigh?: number;
    },
  ) => Promise<void>;
  onSetStatus: (
    opportunityId: string,
    status: "provisional" | "surfaced" | "hidden",
  ) => Promise<void>;
}) {
  const approved = opp.status === "approved";
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(opp.title);
  const [description, setDescription] = useState(opp.description);
  const [rationale, setRationale] = useState(opp.rationale);
  const [impactLow, setImpactLow] = useState(String(opp.impactLow));
  const [impactHigh, setImpactHigh] = useState(String(opp.impactHigh));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const meta = opportunityStatusMeta[opp.status as OpportunityStatus] ?? {
    label: opp.status,
    tone: "neutral" as const,
  };

  function save() {
    setError(null);
    const low = Number(impactLow);
    const high = Number(impactHigh);
    if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0) {
      setError("Impact must be whole, non-negative numbers.");
      return;
    }
    if (low > high) {
      setError("Impact low must be ≤ impact high.");
      return;
    }
    start(async () => {
      try {
        await onUpdate(opp.id, {
          title,
          description,
          rationale,
          impactLow: low,
          impactHigh: high,
        });
        setEditing(false);
      } catch {
        setError("Couldn't save those edits.");
      }
    });
  }

  function changeStatus(status: "provisional" | "surfaced" | "hidden") {
    setError(null);
    start(async () => {
      try {
        await onSetStatus(opp.id, status);
      } catch {
        setError("Couldn't change status.");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <ScoreBadge score={opp.compositeScore} />
        <div className="min-w-0 flex-1">
          <Link
            href={detailHref}
            className="font-medium leading-tight hover:text-brand hover:underline"
          >
            {opp.title}
          </Link>
          <div className="text-xs text-text-3">{opp.sprintName}</div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {opp.sowStatus ? (
          sowHref ? (
            <Link href={sowHref} aria-label={`Open SOW · ${opp.sowStatus}`}>
              <Badge tone="outline" className="hover:border-brand">
                SOW · {opp.sowStatus}
              </Badge>
            </Link>
          ) : (
            <Badge tone="outline">SOW · {opp.sowStatus}</Badge>
          )
        ) : null}
      </div>

      {approved ? (
        <p className="mt-3 text-xs text-text-3">
          Approved by the client&apos;s sponsor — frozen. Curation is disabled.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-text-2">Status:</span>
            {CURATION_STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={opp.status === s ? "brand" : "secondary"}
                disabled={pending || opp.status === s}
                onClick={() => changeStatus(s)}
              >
                {opportunityStatusMeta[s].label}
              </Button>
            ))}
            <span className="flex-1" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing((v) => !v);
                setError(null);
              }}
            >
              {editing ? "Cancel" : "Edit"}
            </Button>
          </div>

          {editing && (
            <div className="space-y-3 rounded border border-border bg-surface-2/40 p-3">
              <div>
                <Label htmlFor={`title-${opp.id}`}>Title</Label>
                <Input
                  id={`title-${opp.id}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`desc-${opp.id}`}>Description</Label>
                <Textarea
                  id={`desc-${opp.id}`}
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`rat-${opp.id}`}>Rationale</Label>
                <Textarea
                  id={`rat-${opp.id}`}
                  rows={4}
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor={`low-${opp.id}`}>Impact low (USD/yr)</Label>
                  <Input
                    id={`low-${opp.id}`}
                    inputMode="numeric"
                    value={impactLow}
                    onChange={(e) => setImpactLow(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor={`high-${opp.id}`}>Impact high (USD/yr)</Label>
                  <Input
                    id={`high-${opp.id}`}
                    inputMode="numeric"
                    value={impactHigh}
                    onChange={(e) => setImpactHigh(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="brand"
                  size="sm"
                  disabled={pending}
                  onClick={save}
                >
                  {pending ? "Saving…" : "Save edits"}
                </Button>
              </div>
            </div>
          )}

          {error ? (
            <span role="alert" className="block text-xs text-danger">
              {error}
            </span>
          ) : null}
        </div>
      )}
    </Card>
  );
}
