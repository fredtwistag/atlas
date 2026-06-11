import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ConversationView } from "@/components/session/ConversationView";
import { Button } from "@/components/ui/Button";
import { getApi } from "@/server/trpc/caller";
import { requireTenantSession } from "@/lib/auth-guards";
import { hasAckedPrivacy } from "@/lib/privacy";
import { completeSession } from "../actions";

export const metadata: Metadata = { title: "Discovery session · Atlas" };
export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Privacy gate (PRD F1.5): an IC can't open a session before acknowledging.
  const claims = await requireTenantSession();
  if (claims.role === "ic" && !(await hasAckedPrivacy(claims))) {
    redirect("/me");
  }

  const api = await getApi();
  const session = await api.session.get({ id }).catch(() => null);
  if (!session) notFound();

  // Open (or resume) the session: server-side this flips not_started →
  // in_progress and generates the INTRO opener if the transcript is empty.
  // Returns the full ordered transcript so a half-done session re-renders its
  // prior turns. If the engine isn't configured (missing ANTHROPIC_API_KEY) the
  // router throws a PRECONDITION_FAILED naming the key — show an honest, fixable
  // state rather than a blank thread or a generic error page.
  let messages: Awaited<ReturnType<typeof api.session.start>>["messages"];
  try {
    ({ messages } = await api.session.start({ id }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/ANTHROPIC_API_KEY/i.test(message)) {
      return (
        <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            This session can&apos;t start yet
          </h1>
          <p className="mt-2 text-md text-text-2">
            The conversation engine isn&apos;t connected (ANTHROPIC_API_KEY is
            not set). Your sprint admin needs to configure it — once it&apos;s
            set, reopen this session and Atlas will pick up where you left off.
          </p>
          <Link href="/me" className="mt-5">
            <Button variant="brand">Back to my sprint</Button>
          </Link>
        </main>
      );
    }
    throw err;
  }

  return (
    <ConversationView
      sessionId={session.id}
      topicTitle={session.topicTitle}
      initialMessages={messages}
      onComplete={completeSession}
    />
  );
}
