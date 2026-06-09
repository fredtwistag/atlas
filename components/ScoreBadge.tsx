import { cn } from "@/lib/cn";

/** Composite opportunity score (0–10) as a colored chip. */
export function ScoreBadge({
  score,
  size = "md",
}: {
  score: number;
  size?: "md" | "lg";
}) {
  const tone =
    score >= 8
      ? "bg-brand text-white"
      : score >= 6.5
        ? "bg-brand-soft text-brand"
        : "bg-surface-2 text-text-2";

  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-lg font-mono font-semibold leading-none tabular-nums",
        tone,
        size === "lg" ? "h-16 w-16" : "h-11 w-11",
      )}
    >
      <span className={size === "lg" ? "text-2xl" : "text-lg"}>
        {score.toFixed(1)}
      </span>
      {size === "lg" && (
        <span className="mt-1 font-sans text-[9px] uppercase tracking-wide opacity-70">
          score
        </span>
      )}
    </span>
  );
}
