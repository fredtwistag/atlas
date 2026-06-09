import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";

export const dynamic = "force-dynamic";

export default async function SprintIndex() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.kind !== "tenant") redirect("/admin");

  const api = await getApi();
  const id = await api.sprint.currentForTenant();
  if (id) redirect(`/sprint/${id}`);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        No active sprint yet
      </h1>
      <p className="mt-2 text-md text-text-2">
        Your organization doesn&apos;t have a discovery sprint running. Once
        Twistag launches one, it&apos;ll appear here.
      </p>
    </main>
  );
}
