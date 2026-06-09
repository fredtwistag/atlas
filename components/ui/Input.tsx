import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const fieldStyles =
  "w-full rounded border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-3 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-50";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldStyles, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldStyles, "resize-none leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-sm font-medium text-text-2",
        className,
      )}
      {...props}
    />
  );
}
