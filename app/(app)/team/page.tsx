import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "@/lib/session";
import { withTenantContext } from "@/db/client";
import { users, invitations } from "@/db/schema";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { MemberRow } from "@/components/manager/MemberRow";
import { PendingInviteRow } from "@/components/manager/PendingInviteRow";
import {
  inviteMember,
  updateMemberRoleAction,
  removeMemberAction,
  resendInviteAction,
  cancelInviteAction,
} from "./actions";

export const metadata = { title: "Team · Atlas" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "tenant") redirect("/admin");
  if (!(session.role === "manager" || session.role === "sponsor")) {
    redirect("/me");
  }

  const { invited, error } = await searchParams;

  const { members, invites } = await withTenantContext(session, async (tx) => {
    const members = await tx.select().from(users);
    const invites = await tx.select().from(invitations);
    return { members, invites };
  });

  const pending = invites.filter((i) => i.status === "pending");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Your team</h1>
        <p className="mt-1.5 text-md text-text-2">
          Invite the people whose work the discovery sprint will cover.
        </p>
      </div>

      {invited && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-md text-text-2">
          <Check className="h-4 w-4 text-success" />
          Invited <strong>{invited}</strong> — their invite email is on its way.
        </div>
      )}
      {error === "email" && (
        <div className="mb-5 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-md text-text-2">
          We saved the invite but couldn&apos;t send the email. Use{" "}
          <strong>Resend invite</strong> below to retry.
        </div>
      )}
      {error === "invalid" && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-md text-danger">
          Check the fields and try again.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-text-2">
            {members.length} member{members.length === 1 ? "" : "s"}
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                id={m.id}
                name={m.name}
                email={m.email}
                role={m.role}
                isSelf={m.id === session.userId}
                canManage
                onUpdateRole={updateMemberRoleAction}
                onRemove={removeMemberAction}
              />
            ))}
          </div>

          {pending.length > 0 && (
            <>
              <h2 className="mb-3 mt-6 text-sm font-semibold text-text-2">
                {pending.length} pending invitation
                {pending.length === 1 ? "" : "s"}
              </h2>
              <div className="space-y-2">
                {pending.map((i) => (
                  <PendingInviteRow
                    key={i.id}
                    id={i.id}
                    email={i.email}
                    role={i.role}
                    onResend={resendInviteAction}
                    onCancel={cancelInviteAction}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-md font-semibold">Invite a member</h2>
          <form action={inviteMember} className="space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Sam Rivera" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="sam@company.example"
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                className="h-9 w-full rounded border border-border bg-surface px-3 text-base"
                defaultValue="ic"
              >
                <option value="ic">Team member (IC)</option>
                <option value="sponsor">Sponsor</option>
              </select>
            </div>
            <Button type="submit" variant="brand" className="w-full">
              Send invite
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
