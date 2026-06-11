"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { signInErrorMessage } from "@/lib/sign-in-errors";
import { requestSignInCode, verifySignInCode } from "./actions";

function SignInForm() {
  const searchParams = useSearchParams();
  const paramMessage = signInErrorMessage(searchParams.get("error"));

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The server action rate-limits the send, folds "no account" into success
      // (no enumeration), and on throttle returns success while skipping the send.
      await requestSignInCode(email);
      // Success, no-account, AND throttled all land here — same state.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't send your code. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setCodeError(null);
    const result = await verifySignInCode(email, code);
    setVerifying(false);
    if (!result.ok) {
      setCodeError(result.error);
      return;
    }
    // Session is set; the callback resolves landing + accepts the invitation.
    window.location.assign("/auth/callback");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Sign in to Atlas
      </h1>
      <p className="mt-1 text-md text-text-2">
        We&apos;ll email you a sign-in link and a 6-digit code — no password.
      </p>

      {sent ? (
        <div className="mt-6 space-y-4">
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-md text-text-2"
          >
            If <strong>{email}</strong> has an Atlas account, a sign-in link
            (and a 6-digit code) is on its way.
            <span className="mt-1 block text-sm text-text-3">
              If you requested several codes, wait a few minutes before trying
              again.
            </span>
          </div>
          <form onSubmit={onVerifyCode} className="space-y-3">
            <div>
              <Label htmlFor="code">Enter your 6-digit code</Label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]*"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {codeError && (
              <p className="text-sm text-danger" role="alert">
                {codeError}
              </p>
            )}
            <Button
              type="submit"
              variant="brand"
              className="w-full"
              disabled={verifying || code.trim().length < 6}
            >
              {verifying ? "Verifying…" : "Verify code"}
            </Button>
          </form>
        </div>
      ) : (
        <>
          {paramMessage && (
            <div
              role="alert"
              className="mt-6 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-md text-text-2"
            >
              {paramMessage}
            </div>
          )}
          <form onSubmit={onSubmit} className="mt-6 space-y-3">
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              variant="brand"
              className="w-full"
              disabled={busy}
            >
              {busy ? "Sending…" : "Send sign-in link"}
            </Button>
          </form>
        </>
      )}

      {process.env.NODE_ENV !== "production" && (
        <a
          href="/sign-in/dev"
          className="mt-6 inline-block text-sm font-medium text-brand hover:text-brand-hover"
        >
          Dev: one-click sign-in →
        </a>
      )}
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
