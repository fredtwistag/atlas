"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

/** The company_context fields the panel renders (subset of the DB row). */
export type AdminCompanyContext = {
  status: string;
  summary: string | null;
  industry: string | null;
  businessModel: string | null;
  sizeBand: string | null;
  revenueBand: string | null;
  maturity: string | null;
  keySystems: string[];
  knownPains: string[];
  sources: unknown;
  enrichedBy: string | null;
} | null;

type Feedback = { kind: "ok" | "error"; msg: string } | null;

const MIME_OPTIONS = [
  { value: "text/markdown", label: "Markdown (.md)" },
  { value: "text/plain", label: "Plain text (.txt)" },
  { value: "text/csv", label: "CSV (.csv)" },
];

/**
 * Twistag company-context panel (CTX-1/2/3 admin UI). Shows the current profile
 * + status, runs web enrichment, ingests a pasted text artifact, and approves a
 * draft so CTX-4 starts injecting it into IC prompts. Enrichment + ingestion
 * land as `draft`; nothing steers prompts until Approve.
 */
export function CompanyContextPanel({
  context,
  onEnrich,
  onIngest,
  onApprove,
}: {
  context: AdminCompanyContext;
  onEnrich: () => Promise<void>;
  onIngest: (input: {
    filename: string;
    mimeType: string;
    text: string;
  }) => Promise<void>;
  onApprove: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [filename, setFilename] = useState("");
  const [mimeType, setMimeType] = useState(MIME_OPTIONS[0].value);
  const [text, setText] = useState("");

  const status = context?.status ?? "none";
  const statusTone =
    status === "active"
      ? "success"
      : status === "draft"
        ? "warning"
        : "neutral";
  const statusLabel =
    status === "active"
      ? "Active — steering prompts"
      : status === "draft"
        ? "Draft — pending review"
        : "No context yet";

  function run(fn: () => Promise<void>, ok: string) {
    setFeedback(null);
    start(async () => {
      try {
        await fn();
        setFeedback({ kind: "ok", msg: ok });
      } catch {
        setFeedback({
          kind: "error",
          msg: "That didn't go through. Check the Anthropic key / try again.",
        });
      }
    });
  }

  const sourceCount = Array.isArray(context?.sources)
    ? (context!.sources as unknown[]).length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {context?.enrichedBy ? (
          <span className="text-xs text-text-3">
            source: {context.enrichedBy}
            {sourceCount > 0 ? ` · ${sourceCount} cited` : ""}
          </span>
        ) : null}
      </div>

      {feedback ? (
        <p
          className={
            feedback.kind === "ok"
              ? "text-sm text-success"
              : "text-sm text-danger"
          }
          role="status"
        >
          {feedback.msg}
        </p>
      ) : null}

      {/* Current profile */}
      {context ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label="Summary" value={context.summary} full />
          <Field label="Industry" value={context.industry} />
          <Field label="Business model" value={context.businessModel} />
          <Field label="Size" value={context.sizeBand} />
          <Field label="Revenue" value={context.revenueBand} />
          <Field label="Maturity" value={context.maturity} />
          <Field label="Key systems" value={context.keySystems.join(", ")} />
          <Field
            label="Known pains"
            value={context.knownPains.join(", ")}
            full
          />
        </dl>
      ) : (
        <p className="text-sm text-text-3">
          No company context yet. Enrich from the web or ingest a document to
          seed it — it stays a draft until you approve it.
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(onEnrich, "Enriched from the web — review the draft above.")
          }
        >
          {pending ? "Working…" : "Enrich from web"}
        </Button>
        {status === "draft" ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(onApprove, "Approved — it now steers IC prompts.")
            }
          >
            Approve draft
          </Button>
        ) : null}
      </div>

      {/* Ingest a pasted text artifact */}
      <form
        className="max-w-xl space-y-3 border-t border-border pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!filename.trim() || !text.trim()) {
            setFeedback({
              kind: "error",
              msg: "Add a filename and paste some text first.",
            });
            return;
          }
          run(
            () => onIngest({ filename: filename.trim(), mimeType, text }),
            "Document ingested into the draft context.",
          );
          setText("");
        }}
      >
        <h3 className="text-sm font-semibold">Ingest a document</h3>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="doc-filename">Filename</Label>
            <Input
              id="doc-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="ops-manual.md"
            />
          </div>
          <div>
            <Label htmlFor="doc-mime">Type</Label>
            <select
              id="doc-mime"
              value={mimeType}
              onChange={(e) => setMimeType(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              {MIME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="doc-text">Text</Label>
          <textarea
            id="doc-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            placeholder="Paste the document's text…"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Working…" : "Ingest document"}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-medium text-text-3">{label}</dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}
