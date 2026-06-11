import { cn } from "@/lib/cn";

/**
 * Field Report section: full-width hairline rule on top, then a document
 * grid with a narrow folio margin column (§ number + running head, mono)
 * that the content hangs off. `dark` flips the furniture for black bands.
 */
export function Section({
  folio,
  label,
  id,
  dark = false,
  className,
  children,
}: {
  folio: string;
  label: string;
  id?: string;
  dark?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-[60px] border-t",
        dark ? "border-white/15 bg-text text-white" : "border-border-strong",
        className,
      )}
    >
      <div className="mx-auto max-w-[1500px] px-[5%]">
        <div className="grid gap-x-10 lg:grid-cols-[110px_minmax(0,1fr)]">
          <div
            className={cn(
              "pt-5 font-mono text-[11px] uppercase tracking-[0.08em] lg:border-r lg:pb-16",
              dark
                ? "text-white/50 lg:border-white/15"
                : "text-text-3 lg:border-border",
            )}
          >
            <div className="lg:sticky lg:top-[76px]">
              {folio}
              <span className="mt-1 hidden lg:block">{label}</span>
            </div>
          </div>
          <div className="pb-16 pt-10 sm:pb-24 sm:pt-14">{children}</div>
        </div>
      </div>
    </section>
  );
}
