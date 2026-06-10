# ADR-002 — Supabase Auth (native magic links), not Stytch

**Status:** Accepted · 2026-06-10
**Owner:** Engineering lead
**Supersedes:** Stytch references in `docs/01-vision-and-prd.md` (F1.2, decision log), `docs/02-architecture.md` §3.2, `docs/06-security-compliance.md` §4

---

## Context

The PRD and early architecture named **Stytch** as the magic-link auth provider (decision logged 2026-06-07). When the auth slice was actually built, it was built on **Supabase Auth** instead, and verified end-to-end:

- Atlas already runs on Supabase (Postgres + RLS + Storage). Supabase Auth mints the JWT that RLS reads (`auth.jwt() ->> 'tenant_id'`), so claims, the database, and row-level security are one system.
- The tenant/role claims are injected by a Postgres `custom_access_token_hook` (migration `0001`) at token-mint time — no second identity vendor to keep in sync.
- The dev sign-in shortcut and the invite flow both use `admin.auth.admin.generateLink({ type: "magiclink" })` + `verifyOtp`, which is the same primitive the invite emails now use.

The code is on Supabase Auth and proven. Rather than adopt Stytch to match stale docs, we record the pivot and update the docs.

## Decision

**Adopt Supabase Auth (native passwordless magic links + custom access-token hook) for Wave 1.** Keep passwordless — it's the right fit for these personas (invited, low-frequency users; passwords would add friction and a support burden) — but harden delivery, which is where the real magic-link risk lives.

## Hardening (the risk is delivery, not the pattern)

Corporate mail (mid-market / PE firms run Microsoft 365 heavily) breaks naive one-time links: Outlook SafeLinks and similar scanners prefetch URLs and can consume a single-use token; links opened on a different device fail.

- **6-digit OTP code in the same email + a code-entry UI** — the fallback Notion/Slack/Linear all adopted for exactly this reason.
- **Invite links land on `/auth/confirm` whose button POSTs the verification** — prefetchers only ever GET, so they can't burn the token.
- **Resend custom SMTP** with SPF/DKIM/DMARC; OTP/link expiry bumped to 24h (dashboard config).
- **`shouldCreateUser: false` + a no-enumeration sent state** — a stranger's email gets the same "if this has an account…" response, no ghost auth users.

## SSO note

SSO stays at **v1.5** as planned (magic link is enough for Wave 1 pilots). But expect **PE-firm security reviews to pull SSO forward** — when a portco's IT mandates Entra/Okta, that becomes a deal gate. Treat SSO as the most likely v1.5 item to accelerate, and keep the claims hook provider-agnostic so an OIDC source can feed the same `tenant_id`/`role` claims.

## Consequences

- One fewer vendor; auth, RLS claims, and the database are a single system.
- Sign-in email deliverability depends on two out-of-repo dashboard steps (Resend SMTP, Magic Link template with `{{ .Token }}`), documented in `.env.example`. Until done, sign-in mail flows via Supabase's rate-limited default SMTP; invite/nudge mail bypasses Supabase entirely (Resend direct).
- Docs updated to remove Stytch (see Supersedes).
