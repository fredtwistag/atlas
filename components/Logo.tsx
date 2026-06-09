import Link from "next/link";
import { cn } from "@/lib/cn";

/** The Atlas wordmark + mark, matching prototypes/atlas-landing.html. */
export function Logo({
  href = "/",
  className,
  invert = false,
}: {
  href?: string;
  className?: string;
  invert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight",
        invert ? "text-surface" : "text-text",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-6 w-6 rounded-[5px]",
          invert ? "bg-surface" : "bg-text",
        )}
      >
        <span
          className={cn(
            "absolute inset-1 rounded-[2px] border-[1.5px]",
            invert ? "border-text" : "border-surface",
          )}
        />
      </span>
      Atlas
    </Link>
  );
}
