import { redirect } from "next/navigation";
import { ne } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";
import { withTenantContext } from "@/db/client";
import { users } from "@/db/schema";
import { LaunchSprintForm } from "@/components/sprint/LaunchSprintForm";
import { FirstRunChecklist } from "@/components/sprint/FirstRunChecklist";
import { sprintLandingPath } from "@/lib/sprint-landing";

export const dynamic = "force-dynamic";

export default async function SprintIndex({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "tenant") redirect("/admin");

  const api = await getApi();
  const id = await api.sprint.currentForTenant();
  // Once we know the sprint id, sponsors land on the executive report and
  // managers on the operational dashboard.
  if (id) redirect(sprintLandingPath(session.role, id));

  // No active sprint. ICs see a wait message; managers/sponsors see the form.
  if (!(session.role === "manager" || session.role === "sponsor")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          No active sprint yet
        </h1>
        <p className="mt-2 text-md text-text-2">
          Your organization doesn&apos;t have a discovery sprint running yet.
          Once your manager launches one, it&apos;ll appear here.
        </p>
      </main>
    );
  }

  const members = await withTenantContext(session, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(ne(users.role, "manager")),
  );

  const { error } = await searchParams;
  return (
    <>
      <FirstRunChecklist memberCount={members.length} />
      <LaunchSprintForm members={members} invalid={error === "invalid"} />
    </>
  );
}
