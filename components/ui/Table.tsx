import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Thin styled table primitives for the data-dense, full-width views (manager
 * dashboard, Twistag cockpit). They encode the shared look — uppercase header,
 * hairline row borders, row hover — so the markup isn't duplicated per page.
 * Wrap in a `Card` (overflow-hidden) at the call site.
 */

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />;
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn(className)} {...props} />;
}

export function Th({
  className,
  align = "left",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-text-3",
        align === "center" && "text-center",
        align === "right" && "text-right",
        align === "left" && "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function HeaderRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b border-border", className)} {...props} />;
}

export function Tr({
  className,
  hover = true,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { hover?: boolean }) {
  return (
    <tr
      className={cn(
        "border-b border-border last:border-0",
        hover && "hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  className,
  align = "left",
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "center" | "right";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3",
        align === "center" && "text-center",
        align === "right" && "text-right",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Status-icon cell (Vanta-style ✓ / ✗ / — columns). `null` renders a neutral
 * dash for "not applicable".
 */
export function StatusCell({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="inline-flex text-text-faint" aria-label="Not applicable">
        <Minus className="h-4 w-4" />
      </span>
    );
  }
  return ok ? (
    <span className="inline-flex text-success" aria-label="Pass">
      <Check className="h-4 w-4" />
    </span>
  ) : (
    <span className="inline-flex text-text-faint" aria-label="Fail">
      <X className="h-4 w-4" />
    </span>
  );
}
