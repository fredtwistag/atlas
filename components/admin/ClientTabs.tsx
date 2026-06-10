"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Tab = { id: string; label: string; content: React.ReactNode };

/**
 * Roving-tabindex tablist (pattern shared with OpportunityDetail). The page
 * server-renders each panel and passes it in as `content`; this client shell
 * owns selection + keyboard nav. All panels stay mounted (hidden) so form/input
 * state survives tab switches.
 */
export function ClientTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft")
      next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Client detail"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((t, idx) => {
          const selected = idx === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[idx] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(idx)}
              onKeyDown={(e) => onKeyDown(e, idx)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
                selected
                  ? "border-brand text-text"
                  : "border-transparent text-text-3 hover:text-text-2",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t, idx) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          tabIndex={0}
          hidden={idx !== active}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
