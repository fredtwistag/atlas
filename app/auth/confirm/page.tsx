import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { confirmInvite } from "./actions";

export const metadata: Metadata = { title: "Continue to Atlas" };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Logo />
      {token_hash ? (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            You&apos;re almost in
          </h1>
          <p className="mt-1 text-md text-text-2">
            Confirm it&apos;s you to finish signing in to Atlas.
          </p>
          <form action={confirmInvite} className="mt-6">
            <input type="hidden" name="token_hash" value={token_hash} />
            <Button type="submit" variant="brand" className="w-full">
              Continue to Atlas
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            This link is missing something
          </h1>
          <p className="mt-1 text-md text-text-2">
            It may have expired or already been used. Request a fresh sign-in
            link and we&apos;ll send a new one.
          </p>
          <a
            href="/sign-in"
            className="mt-6 inline-block text-sm font-medium text-brand hover:text-brand-hover"
          >
            Request a new sign-in link →
          </a>
        </>
      )}
    </main>
  );
}
