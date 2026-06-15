import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { systemCategoryMeta } from "@/lib/ui-maps";
import type { SystemInventoryEntry } from "@/lib/types";

/**
 * Current-state systems & shadow-IT inventory (Ticket F): the official tools,
 * the unofficial shadow tools people actually rely on, and the integration
 * gaps between them — surfaced from tooling/workaround captures.
 */
export function SystemsInventory({ items }: { items: SystemInventoryEntry[] }) {
  if (items.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-3">
          The systems inventory appears here as contributors mention the tools
          and workarounds they use — including the shadow spreadsheets and DMs
          the official stack doesn&apos;t cover.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      {items.map((it) => {
        const meta = systemCategoryMeta[it.category];
        return (
          <div key={it.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium leading-tight">{it.name}</span>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-text-3">{it.summary}</p>
          </div>
        );
      })}
    </Card>
  );
}
