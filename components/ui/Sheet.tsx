"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Right-side slide-over dialog. Handles the modal a11y basics: role="dialog",
 * aria-modal, Escape to close, focus trap, and focus return to the trigger.
 */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Move focus into the panel.
    panelRef.current
      ?.querySelector<HTMLElement>("button, a, input, textarea")
      ?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        className="absolute inset-0 bg-text/30 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-xl flex-col bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            {eyebrow ? (
              <div className="text-xs font-semibold uppercase tracking-[0.06em] text-brand">
                {eyebrow}
              </div>
            ) : null}
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {children}
        </div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
