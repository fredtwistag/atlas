import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { getSession } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { PageContainer } from "@/components/ui/PageContainer";
import { BackLink } from "@/components/ui/BackLink";
import { inviteOrganization } from "./actions";

export const metadata = { title: "New client · Atlas admin" };

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "twistag") redirect("/me");

  const { invited, error } = await searchParams;

  return (
    <PageContainer className="max-w-2xl">
      <div className="mb-6">
        <BackLink href="/admin">All clients</BackLink>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          New client
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          Create a client organization and invite its manager. They&apos;ll sign
          in and invite their own team.
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

      <Card className="p-5">
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
          <div>
            <Label htmlFor="orgDomain">Website (optional)</Label>
            <Input id="orgDomain" name="orgDomain" placeholder="vizta.com" />
            <p className="mt-1 text-sm text-text-3">
              Used to point context enrichment at the right company.
            </p>
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
    </PageContainer>
  );
}
