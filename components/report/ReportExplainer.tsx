"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/Card";

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
    <Card data-print-hide className="relative mb-10 border-brand/30 p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 rounded p-1 text-text-3 hover:bg-surface-2 hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>
      <h2 className="text-md font-semibold">How to read this report</h2>
      <p className="mt-2 text-sm leading-relaxed text-text-2">
        Each opportunity is scored across five dimensions — financial impact,
        implementation feasibility, time to value, strategic alignment, and
        evidence confidence — and only those corroborated by more than one
        contributor are shown. The composite score (0–10) ranks them.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-text-2">
        Expect 5-10 opportunities surfaced, 1-3 of them high-impact. Approving
        one hands it to the Twistag engagement team with a pre-drafted scope, so
        the build can start within days.
      </p>
    </Card>
  );
}
