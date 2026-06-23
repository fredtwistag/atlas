"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "atlas:report-explainer:v1";

/**
 * A dismissible card atop the report that explains the scoring dimensions and
 * sets expectations on volume. Dismissal persists in localStorage (UI state, not
 * worth a migration). Starts hidden and reveals after the effect confirms it
 * wasn't dismissed, so dismissed readers never see a flash. Hidden in print.
 */
export function ReportExplainer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(STORAGE_KEY) !== "dismissed");
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "dismissed");
    setShow(false);
  }

  return (
    <details
      data-print-hide
      className="mb-8 rounded-lg border border-border bg-surface px-4 py-3 text-sm [&_summary]:cursor-pointer"
    >
      <summary className="flex items-center justify-between gap-2 font-medium">
        <span>How to read this report</span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            dismiss();
          }}
          aria-label="Dismiss"
          className="rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"
        >
          <X className="h-4 w-4" />
        </button>
      </summary>
      <p className="mt-2 leading-relaxed text-text-2">
        Each opportunity is scored across five dimensions — financial impact,
        implementation feasibility, time to value, strategic alignment, and
        evidence confidence — and only those corroborated by more than one
        contributor are shown. The composite score (0–10) ranks them.
      </p>
      <p className="mt-2 leading-relaxed text-text-2">
        Expect 5–10 opportunities surfaced, 1–3 of them high-impact. Approving
        one hands it to the Twistag engagement team with a pre-drafted scope, so
        the build can start within days.
      </p>
    </details>
  );
}
