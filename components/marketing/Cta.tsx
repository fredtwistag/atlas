import { cn } from "@/lib/cn";

/**
 * Marketing CTA — twistag.com button anatomy: square, lime with a 1.5px
 * pressed darker-lime bottom edge, dark fill rising on hover (CSS in
 * globals.css, gated behind hover-capable pointers). Variants: lime
 * (default), dark, paper.
 */
export function Cta({
  href,
  variant = "lime",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string;
  variant?: "lime" | "dark" | "paper";
  size?: "md" | "lg";
  className?: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      className={cn(
        "mk-btn inline-flex items-center justify-center gap-2 font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/40 focus-visible:ring-offset-2",
        variant === "dark" && "mk-btn-dark",
        variant === "paper" && "mk-btn-paper",
        size === "lg"
          ? "h-[52px] px-7 text-[15px]"
          : "h-[44px] px-5 text-[14px]",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * Secondary action — underlined link with a marching arrow on hover
 * (twistag.com's link-button-arrow).
 */
export function ArrowLink({
  href,
  className,
  children,
  ...props
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      className={cn(
        "mk-arrow-link inline-flex h-[44px] items-center gap-2 text-[15px] font-medium text-text",
        className,
      )}
      {...props}
    >
      {children}
      <span aria-hidden className="mk-arrow overflow-hidden">
        →
      </span>
    </a>
  );
}
