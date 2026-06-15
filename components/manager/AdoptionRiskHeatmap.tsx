import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { adoptionRiskMeta } from "@/lib/ui-maps";
import type { AdoptionRiskRow } from "@/lib/adoption-risk";

/**
 * Adoption-risk heatmap (Ticket E): where deployment resistance lives, by
 * department. Role/department only — never an individual. Empty when no
 * department has surfaced opportunities yet.
 */
export function AdoptionRiskHeatmap({ rows }: { rows: AdoptionRiskRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-text-3">
          Adoption risk appears here once opportunities surface against
          departments — it flags where a rollout will meet the most resistance.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <THead>
          <HeaderRow>
            <Th>Department</Th>
            <Th>Resistance</Th>
            <Th align="right">Change-readiness</Th>
            <Th align="right">Signals</Th>
            <Th align="right">Opportunities</Th>
          </HeaderRow>
        </THead>
        <tbody>
          {rows.map((r) => {
            const meta = adoptionRiskMeta[r.level];
            return (
              <Tr key={r.department} hover={false}>
                <Td className="font-medium">{r.department}</Td>
                <Td>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </Td>
                <Td align="right" className="font-mono text-xs tabular-nums">
                  {r.avgChangeMgmtScore.toFixed(1)}/10
                </Td>
                <Td align="right" className="font-mono text-xs tabular-nums">
                  {r.resistanceSignalCount}
                </Td>
                <Td align="right" className="font-mono text-xs tabular-nums">
                  {r.oppCount}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
