import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "brand" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "focus-ring inline-flex items-center justify-center gap-1.5 rounded-sm font-medium leading-none whitespace-nowrap transition-colors duration-fast ease-geist border disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-faint disabled:border-transparent";

const variants: Record<Variant, string> = {
  // Primary action: solid near-black (gray-1000) fill, surface-colored label.
  primary: "bg-brand text-surface border-transparent hover:bg-brand-hover",
  // Secondary: surface fill with a hairline border that darkens on hover.
  secondary:
    "bg-surface text-text border-border hover:bg-surface-2 hover:border-border-strong",
  // Ghost / tertiary: transparent, tints with a gray wash on hover.
  ghost:
    "bg-transparent text-text-2 border-transparent hover:bg-surface-2 hover:text-text",
  // Brand: the blue accent CTA (links, info-forward actions).
  brand:
    "bg-accent-blue text-white border-transparent hover:bg-accent-blue-hover",
  // Destructive: solid red-800.
  danger: "bg-danger text-white border-transparent hover:bg-danger-strong",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[14px]",
  md: "h-10 px-3 text-[14px]",
  lg: "h-12 px-3.5 text-[16px]",
  // ≥44px square hit area for icon-only buttons (WCAG 2.5.5). Pixel-based, not
  // h-11 — the app's root font is 14px, so rem units would render only ~38px.
  icon: "h-[44px] w-[44px] p-0",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
