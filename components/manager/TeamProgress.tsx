import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { participantStatusMeta } from "@/lib/ui-maps";
import type { Participant } from "@/lib/types";

/**
 * Team progress: a table on desktop, stacked cards on mobile. Each contributor
 * links to their participant detail page.
 */
export function TeamProgress({
  sprintId,
  participants,
}: {
  sprintId: string;
  participants: Participant[];
}) {
  const href = (uid: string) => `/sprint/${sprintId}/participant/${uid}`;

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden overflow-hidden lg:block">
        <Table>
          <THead>
            <HeaderRow>
              <Th>Contributor</Th>
              <Th>Progress</Th>
              <Th>Status</Th>
              <Th align="right">Last active</Th>
            </HeaderRow>
          </THead>
          <tbody>
            {participants.map((pt) => {
              const meta = participantStatusMeta[pt.status];
              const pct = Math.round(
                (pt.sessionsCompleted / pt.sessionsTotal) * 100,
              );
              const needsNudge =
                pt.status === "idle" || pt.status === "not_started";
              return (
                <Tr key={pt.user.id} hover={false}>
                  <Td>
                    <Link
                      href={href(pt.user.id)}
                      className="flex items-center gap-2.5 hover:text-brand"
                    >
                      <Avatar name={pt.user.name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium leading-tight">
                          {pt.user.name}
                        </div>
                        <div className="text-xs text-text-3">
                          {pt.user.department}
                        </div>
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={pct}
                        tone={pt.status === "idle" ? "warning" : "brand"}
                        className="w-20"
                      />
                      <span className="font-mono text-xs tabular-nums text-text-3">
                        {pt.sessionsCompleted}/{pt.sessionsTotal}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </Td>
                  <Td align="right" className="text-xs text-text-3">
                    {needsNudge ? (
                      <Link
                        href={href(pt.user.id)}
                        className="font-medium text-brand hover:text-brand-hover"
                      >
                        Send nudge →
                      </Link>
                    ) : (
                      pt.lastActiveLabel
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2 lg:hidden">
        {participants.map((pt) => {
          const meta = participantStatusMeta[pt.status];
          const pct = Math.round(
            (pt.sessionsCompleted / pt.sessionsTotal) * 100,
          );
          return (
            <Link key={pt.user.id} href={href(pt.user.id)} className="block">
              <Card className="p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={pt.user.name} size="sm" />
                    <div className="min-w-0">
                      <div className="font-medium leading-tight">
                        {pt.user.name}
                      </div>
                      <div className="text-xs text-text-3">
                        {pt.user.department}
                      </div>
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <ProgressBar
                    value={pct}
                    tone={pt.status === "idle" ? "warning" : "brand"}
                    className="flex-1"
                  />
                  <span className="font-mono text-xs tabular-nums text-text-3">
                    {pt.sessionsCompleted}/{pt.sessionsTotal}
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
