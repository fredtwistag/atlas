"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { managerChecklist, headsUpTemplate } from "@/lib/onboarding";

/**
 * Manager first-run checklist, rendered above the launch form. Step 2 copies the
 * pilot-playbook heads-up message to the clipboard. Steps reflect live data
 * (members invited yet?); no sprint exists when this renders, so step 3 is open.
 */
export function FirstRunChecklist({ memberCount }: { memberCount: number }) {
  const steps = managerChecklist({ memberCount, hasSprint: false });
  const [copied, setCopied] = useState(false);

  async function copyHeadsUp() {
    try {
      await navigator.clipboard.writeText(headsUpTemplate());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (no user gesture / permissions) — nothing to do.
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-6 pt-10">
      <Card className="p-5">
        <h2 className="text-md font-semibold">Get your sprint going</h2>
        <p className="mb-4 mt-0.5 text-sm text-text-3">
          Three steps from here to a running discovery sprint.
        </p>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  s.done
                    ? "bg-success text-white"
                    : "bg-surface-2 text-text-2",
                )}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-sm font-medium",
                    s.done && "text-text-3 line-through",
                  )}
                >
                  {s.title}
                </div>
                <div className="text-xs text-text-3">{s.description}</div>
                {i === 1 && (
                  <button
                    type="button"
                    onClick={copyHeadsUp}
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-2 hover:bg-surface-2"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Copied" : "Copy message"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
