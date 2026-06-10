import { redirect } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { getSession } from "@/lib/session";
import { withServiceRole } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { inviteOrganization } from "./actions";

export const metadata = { title: "Organizations · Atlas admin" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "twistag") redirect("/me");

  const { invited, error } = await searchParams;

  const { orgs } = await withServiceRole(
    { action: "admin.orgs", actor: session.userId },
    async (tx) => {
      const ts = await tx.select().from(tenants);
      const us = await tx.select({ tenantId: users.tenantId }).from(users);
      const counts = new Map<string, number>();
      for (const u of us)
        counts.set(u.tenantId, (counts.get(u.tenantId) ?? 0) + 1);
      return {
        orgs: ts.map((t) => ({ ...t, members: counts.get(t.id) ?? 0 })),
      };
    },
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
      <div className="mb-6">
        <div className="mb-1 text-sm font-medium text-text-3">
          Twistag · super admin
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1.5 text-md text-text-2">
          Invite a new client organization and its manager. They&apos;ll sign in
          and invite their own team.
        </p>
      </div>

      {invited && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-md text-text-2">
          <Check className="h-4 w-4 text-success" />
          Invited <strong>{invited}</strong> as manager — their workspace invite
          is on its way.
        </div>
      )}
      {error === "email" && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-md text-text-2">
          We created the organization but couldn&apos;t send the manager&apos;s
          invite email. Re-invite the organization to retry.
        </div>
      )}
      {error && error !== "email" && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-md text-danger">
          That didn&apos;t look right — check the fields and try again.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-2">
            {orgs.length} organization{orgs.length === 1 ? "" : "s"}
          </h2>
          <div className="space-y-2">
            {orgs.map((o) => (
              <Card
                key={o.id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-text-3" />
                  <div>
                    <div className="font-medium leading-tight">{o.name}</div>
                    <div className="text-sm text-text-3">{o.segment}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={o.status === "active" ? "success" : "warning"}>
                    {o.status}
                  </Badge>
                  <span className="text-sm text-text-3">
                    {o.members} members
                  </span>
                </div>
              </Card>
            ))}
            {orgs.length === 0 && (
              <Card className="p-8 text-center text-md text-text-3">
                No organizations yet — invite your first one.
              </Card>
            )}
          </div>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-md font-semibold">Invite organization</h2>
          <form action={inviteOrganization} className="space-y-3">
            <div>
              <Label htmlFor="orgName">Organization name</Label>
              <Input
                id="orgName"
                name="orgName"
                required
                placeholder="Helios Health"
              />
            </div>
            <div>
              <Label htmlFor="orgSlug">Slug</Label>
              <Input
                id="orgSlug"
                name="orgSlug"
                required
                placeholder="helios-health"
              />
            </div>
            <div>
              <Label htmlFor="segment">Segment</Label>
              <Input
                id="segment"
                name="segment"
                required
                placeholder="PE portco · 100-day"
              />
            </div>
            <div className="border-t border-border pt-3">
              <Label htmlFor="managerName">Manager name</Label>
              <Input
                id="managerName"
                name="managerName"
                required
                placeholder="Jordan Lee"
              />
            </div>
            <div>
              <Label htmlFor="managerEmail">Manager email</Label>
              <Input
                id="managerEmail"
                name="managerEmail"
                type="email"
                required
                placeholder="jordan@helios.example"
              />
            </div>
            <Button type="submit" variant="brand" className="w-full">
              Create &amp; invite manager
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
