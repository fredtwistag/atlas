import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const fieldStyles =
  "focus-ring w-full rounded-sm border border-border bg-surface px-3 text-base text-text placeholder:text-text-3 transition-colors disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-faint";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldStyles, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldStyles, "resize-none py-2.5 leading-relaxed", className)}
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
      className={cn("mb-1.5 block text-sm font-medium text-text-2", className)}
      {...props}
    />
  );
}
