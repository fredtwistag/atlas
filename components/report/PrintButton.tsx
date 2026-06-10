"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2"
    >
      <Download className="h-3.5 w-3.5" /> Download PDF
    </button>
  );
}
