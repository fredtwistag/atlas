"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Sign in to Atlas
      </h1>
      <p className="mt-1 text-md text-text-2">
        We&apos;ll email you a magic link — no password.
      </p>

      {sent ? (
        <div className="mt-6 rounded-lg border border-success/40 bg-success-soft px-4 py-3 text-md text-text-2">
          Check <strong>{email}</strong> for your sign-in link.
        </div>
      ) : (
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button
            type="submit"
            variant="brand"
            className="w-full"
            disabled={busy}
          >
            {busy ? "Sending…" : "Send magic link"}
          </Button>
        </form>
      )}

      <a
        href="/sign-in/dev"
        className="mt-6 inline-block text-sm font-medium text-brand hover:text-brand-hover"
      >
        Dev: one-click sign-in →
      </a>
    </main>
  );
}
