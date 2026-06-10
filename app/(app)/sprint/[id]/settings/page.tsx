import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BackLink } from "@/components/ui/BackLink";
import { Input, Label } from "@/components/ui/Input";
import { CloseSprintButton } from "@/components/sprint/CloseSprintButton";
import { getApi } from "@/server/trpc/caller";
import { requireManagerOrSponsor } from "@/lib/auth-guards";
import { updateSprintAction, closeSprintAction } from "./actions";

export const metadata: Metadata = { title: "Sprint settings · Atlas" };
export const dynamic = "force-dynamic";

export default async function SprintSettings({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  await requireManagerOrSponsor();
  const api = await getApi();
  const sprint = await api.sprint.get({ id }).catch(() => null);
  if (!sprint) notFound();

  const { saved, error } = await searchParams;
  const completed = sprint.status === "completed";

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 lg:px-8">
      <BackLink href={`/sprint/${id}`}>Back to sprint</BackLink>

      <div className="mb-6 mt-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Sprint settings
        </h1>
        <p className="mt-1.5 text-md text-text-2">
          Edit the basics, or close the sprint when discovery is done.
        </p>
      </div>

      {saved && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-md text-text-2">
          <Check className="h-4 w-4 text-success" />
          Changes saved.
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-md text-danger">
          Check the name and focus and try again.
        </div>
      )}

      <Card className="p-6">
        <form action={updateSprintAction.bind(null, id)} className="space-y-4">
          <div>
            <Label htmlFor="name">Sprint name</Label>
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              defaultValue={sprint.name}
              disabled={completed}
            />
          </div>
          <div>
            <Label htmlFor="primaryFocus">Primary focus</Label>
            <Input
              id="primaryFocus"
              name="primaryFocus"
              required
              minLength={2}
              defaultValue={sprint.primaryFocus}
              disabled={completed}
            />
          </div>
          <Button type="submit" variant="brand" disabled={completed}>
            Save changes
          </Button>
        </form>
      </Card>

      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-md font-semibold">
              Sprint status
              <Badge tone={completed ? "neutral" : "brand"}>
                {completed ? "Completed" : "Active"}
              </Badge>
            </h2>
            <p className="mt-1 max-w-md text-sm text-text-2">
              {completed
                ? "This sprint is closed. The report is final and your team can launch a new sprint."
                : "Closing marks the sprint completed and frees your org to launch a new one. The report stays available."}
            </p>
          </div>
          {!completed && (
            <CloseSprintButton onClose={closeSprintAction.bind(null, id)} />
          )}
        </div>
      </Card>
    </main>
  );
}
