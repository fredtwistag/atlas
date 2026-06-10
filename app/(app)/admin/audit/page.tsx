import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/ui/PageContainer";
import { Table, THead, Th, HeaderRow, Tr, Td } from "@/components/ui/Table";
import { getApi } from "@/server/trpc/caller";
import { requireTwistagSession } from "@/lib/auth-guards";

export const metadata: Metadata = { title: "Audit log · Atlas admin" };
export const dynamic = "force-dynamic";

type SearchParams = {
  tenantId?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  includeReads?: string;
  cursor?: string;
};

const fmtAt = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Compact one-line summary of metadata, minus the always-present `actor`. */
function metaSummary(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  return Object.entries(metadata as Record<string, unknown>)
    .filter(([k]) => k !== "actor")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireTwistagSession();
  const sp = await searchParams;
  const api = await getApi();

  const includeReads = sp.includeReads === "on" || sp.includeReads === "true";
  const cursor = sp.cursor ? Number(sp.cursor) : undefined;

  const [clients, log] = await Promise.all([
    api.twistag.clientList().catch(() => []),
    api.twistag.auditLog({
      tenantId: sp.tenantId || undefined,
      action: sp.action || undefined,
      actor: sp.actor || undefined,
      from: sp.from || undefined,
      to: sp.to || undefined,
      includeReads,
      cursor: cursor && !Number.isNaN(cursor) ? cursor : undefined,
      limit: 50,
    }),
  ]);

  const tenantName = new Map(clients.map((c) => [c.tenantId, c.name]));

  // Preserve the active filters in the "Older" cursor link.
  const olderParams = new URLSearchParams();
  if (sp.tenantId) olderParams.set("tenantId", sp.tenantId);
  if (sp.action) olderParams.set("action", sp.action);
  if (sp.actor) olderParams.set("actor", sp.actor);
  if (sp.from) olderParams.set("from", sp.from);
  if (sp.to) olderParams.set("to", sp.to);
  if (includeReads) olderParams.set("includeReads", "on");
  if (log.nextCursor != null) olderParams.set("cursor", String(log.nextCursor));

  return (
    <PageContainer>
      <div className="mb-6">
        <div className="mb-1 text-sm font-medium text-text-3">
          Twistag · governance
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1.5 text-md text-text-2">
          Every Twistag cross-tenant read and admin change lands here
          automatically.
        </p>
      </div>

      {/* Filters — GET form drives searchParams. */}
      <Card className="mb-5 p-4">
        <form
          method="get"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end"
        >
          <div className="lg:col-span-1">
            <Label htmlFor="tenantId">Client</Label>
            <select
              id="tenantId"
              name="tenantId"
              defaultValue={sp.tenantId ?? ""}
              className="h-9 w-full rounded border border-border bg-surface px-3 text-base"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.tenantId} value={c.tenantId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="action">Action prefix</Label>
            <Input
              id="action"
              name="action"
              defaultValue={sp.action ?? ""}
              placeholder="twistag."
            />
          </div>
          <div>
            <Label htmlFor="actor">Actor</Label>
            <Input id="actor" name="actor" defaultValue={sp.actor ?? ""} />
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              name="from"
              type="date"
              defaultValue={sp.from ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={sp.to ?? ""} />
          </div>
          <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start">
            <label className="flex items-center gap-2 text-sm text-text-2">
              <input
                type="checkbox"
                name="includeReads"
                defaultChecked={includeReads}
                className="h-4 w-4 rounded border-border"
              />
              Include reads
            </label>
            <Button type="submit" variant="brand" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </Card>

      {log.rows.length === 0 ? (
        <Card className="border-dashed bg-transparent">
          <div className="px-6 py-12 text-center">
            <h2 className="text-md font-semibold">No audit entries match</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-2">
              Every Twistag cross-tenant read and admin change lands here
              automatically. Loosen the filters to see more.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <HeaderRow>
                <Th>At</Th>
                <Th>Action</Th>
                <Th>Client</Th>
                <Th>Actor</Th>
                <Th>Target</Th>
                <Th>Details</Th>
              </HeaderRow>
            </THead>
            <tbody>
              {log.rows.map((r) => {
                const actor = (r.metadata as { actor?: string })?.actor ?? "—";
                return (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap text-text-2">
                      {fmtAt(r.at)}
                    </Td>
                    <Td>
                      <Badge tone="outline">{r.action}</Badge>
                    </Td>
                    <Td className="text-text-2">
                      {r.tenantId
                        ? (tenantName.get(r.tenantId) ?? r.tenantId)
                        : "—"}
                    </Td>
                    <Td className="font-mono text-xs text-text-3">{actor}</Td>
                    <Td className="font-mono text-xs text-text-3">
                      {r.targetId ?? "—"}
                    </Td>
                    <Td className="max-w-xs truncate text-xs text-text-3">
                      {metaSummary(r.metadata) || "—"}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {log.nextCursor != null && (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/admin/audit?${olderParams.toString()}`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Older →
          </Link>
        </div>
      )}
    </PageContainer>
  );
}
