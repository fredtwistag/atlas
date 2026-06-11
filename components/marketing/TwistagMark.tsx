import { cn } from "@/lib/cn";
import { TWISTAG_URL } from "@/components/marketing/constants";

/**
 * "by Twistag" lockup — lime brand chip + wordmark, linking to twistag.com.
 * Used in the marketing nav, hero badge, and footer. `invert` for black
 * sections.
 */
export function TwistagMark({
  invert = false,
  className,
}: {
  invert?: boolean;
  className?: string;
}) {
  return (
    <a
      href={TWISTAG_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-[44px] items-center gap-1.5 text-[13px] font-medium transition-colors",
        invert
          ? "text-white/60 hover:text-white"
          : "text-text-3 hover:text-text",
        className,
      )}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 rounded-[2px] bg-accent ring-1 ring-inset ring-black/15"
      />
      by <span className={invert ? "text-white/85" : "text-text"}>Twistag</span>
    </a>
  );
}
