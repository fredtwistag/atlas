import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** A labelled read-only field (boxed value). Used by the SOW views. */
export function Field({
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

/** A labelled checklist of strings (inclusions, exclusions, success metrics). */
export function ListField({
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
