import { cn } from "@/lib/cn";

/**
 * Standard wide-page wrapper: centered with a max width so content doesn't
 * stretch edge-to-edge on large monitors. Use for the manager dashboard,
 * opportunity detail, and the Twistag cockpit. Narrower pages (report, team,
 * settings) keep their own tighter max-width.
 */
export function PageContainer({
  children,
  className,
  as: Tag = "main",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "main" | "div";
}) {
  return (
    <Tag className={cn("mx-auto w-full max-w-[1400px] px-6 py-8 lg:px-8", className)}>
      {children}
    </Tag>
  );
}
