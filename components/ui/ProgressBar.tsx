import { cn } from "@/lib/cn";

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  /** 0–100 */
  value: number;
  tone?: "brand" | "success" | "warning" | "text";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = {
    brand: "bg-accent-blue",
    success: "bg-success",
    warning: "bg-warning",
    text: "bg-text",
  }[tone];

  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-surface-2",
        className,
      )}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all", fill)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
