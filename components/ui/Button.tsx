import { forwardRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "brand" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded font-medium leading-none transition-all border border-transparent disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1";

const variants: Record<Variant, string> = {
  primary: "bg-text text-surface hover:bg-[#1f1f23]",
  secondary:
    "bg-surface text-text border-border hover:bg-surface-2 hover:border-border-strong",
  ghost: "text-text-2 hover:text-text hover:bg-surface-2",
  brand: "bg-brand text-white hover:bg-brand-hover",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[13.5px]",
  lg: "h-11 px-5 text-[14.5px]",
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
