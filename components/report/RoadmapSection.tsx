import { Check } from "lucide-react";
import type { Opportunity } from "@/lib/types";

function Column({ title, caption, items, empty }: { title: string; caption: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <h3 className="text-md font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-text-3">{caption}</p>
      {items.length === 0 ? (
        <p className="text-sm text-text-3">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it} className="flex items-start gap-2 text-sm text-text-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Suggested roadmap, sequenced left→right by funding horizon. */
export function RoadmapSection({ opps }: { opps: Opportunity[] }) {
  const quickWins = opps.filter((o) => o.horizon === "quick_win").map((o) => o.title);
  const strategicBets = opps.filter((o) => o.horizon === "strategic_bet").map((o) => o.title);
  const solidBets = opps.filter((o) => o.horizon !== "quick_win" && o.horizon !== "strategic_bet").map((o) => o.title);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-2xl font-semibold tracking-tight">Suggested roadmap</h2>
      <div className="not-prose grid gap-4 sm:grid-cols-3">
        <Column title="Quick wins" caption="Fast, standalone, low-disruption" items={quickWins} empty="Short-cycle fixes land here as they surface." />
        <Column title="Solid bets" caption="Clear value, standard delivery" items={solidBets} empty="Ranked opportunities land here as they surface." />
        <Column title="Strategic bets" caption="High impact, bigger lift" items={strategicBets} empty="Larger, higher-impact plays land here." />
      </div>
    </section>
  );
}
