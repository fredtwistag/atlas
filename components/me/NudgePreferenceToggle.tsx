"use client";

import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { setNudgePreference } from "@/app/(app)/me/actions";

/**
 * The "Allow nudges from your manager" toggle on /me (plan 025, GDPR Art. 21).
 * Optimistic: flips immediately, then persists via the server action. On failure
 * it reverts and shows an honest error. The confirmation + error text live in an
 * aria-live region so screen-reader users hear the result of the toggle.
 *
 * Default on (allow). When off, manager nudges and system idle reminders skip
 * this person entirely.
 */
export function NudgePreferenceToggle({ initialAllow }: { initialAllow: boolean }) {
  const [allow, setAllow] = useState(initialAllow);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !allow;
    setAllow(next); // optimistic
    setError(null);
    setStatus(null);
    start(async () => {
      const result = await setNudgePreference(next);
      if (result.ok) {
        setStatus(
          result.allow
            ? "Nudges are on. Your manager can send you the occasional reminder."
            : "Nudges are off. Your manager and Atlas won't send you reminders.",
        );
      } else {
        setAllow(!next); // revert
        setError(result.error);
      }
    });
  }

  return (
    <Card className="mb-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {allow ? (
              <Bell className="h-4 w-4 text-brand" />
            ) : (
              <BellOff className="h-4 w-4 text-text-3" />
            )}
            <h3 className="text-md font-semibold">
              Allow nudges from your manager
            </h3>
          </div>
          <p className="mt-1 text-sm text-text-2">
            When this is on, your manager can send you an occasional reminder to
            finish a session, and Atlas may send a gentle one too. Turn it off
            and we&apos;ll stop — your sessions stay open either way.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={allow}
          aria-label="Allow nudges from your manager"
          disabled={pending}
          onClick={toggle}
          className={cn(
            "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
            allow ? "bg-brand" : "bg-surface-2",
            pending && "opacity-60",
          )}
        >
          <span
            className={cn(
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              allow ? "translate-x-[22px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>

      {/* Screen readers announce the result; sighted users see the confirmation. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {status && !error && (
        <p className="mt-3 text-[13px] text-text-3">{status}</p>
      )}
      {error && (
        <p className="mt-3 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
