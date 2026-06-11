# Runbook: Production cutover

> Plan 022. This is the ordered checklist to take Atlas from "Vercel pointing at
> the DEV Supabase project" to a real production deployment on a custom domain
> with verified email. **Start this on Day 1**: DNS and Resend domain
> verification have propagation lead times you cannot compress on launch day.
>
> You (the operator) run every step here. The code side (env validation, health
> checks, env-based URLs) already ships in the app — this runbook is the
> dashboard work the code cannot do for you.
>
> **Guardrail the app enforces for you:** on every production server boot,
> `instrumentation.ts` runs `validateEnv()` (`lib/env.ts`). If any required prod
> variable is missing or malformed, the deploy **crashes loudly at boot** with a
> message naming every offending key. That is intentional — better a failed
> deploy than the old silent failures (no `RESEND_API_KEY` → no invites, and no
> way to notice). So if a deploy won't boot, read the error: it tells you which
> env var to fix. The validation never runs at build time, so a missing key
> fails the *deploy*, not the *build*.

---

## 0. Prerequisites

- [ ] Vercel project access (Owner/Member) for the Atlas app.
- [ ] Supabase org access (ability to create a project).
- [ ] Resend account access with permission to add a sending domain.
- [ ] DNS access for `atlas.twistag.com` (to add domain + Resend records).
- [ ] An Anthropic API key for production (`ANTHROPIC_API_KEY`).
- [ ] A local checkout on `main` with `node_modules` installed, so you can run
      `npm run db:migrate` and `npm run email:test` against the prod env.

---

## 1. Supabase production project

1. [ ] **Create a new Supabase project — EU region.** It MUST be an EU region
       (e.g. `eu-central-1` / `eu-west-2`) to match the privacy policy and GDPR
       posture. Name it clearly, e.g. `atlas-prod`. Set a strong DB password and
       store it in the team password manager.
2. [ ] **Bootstrap roles/extensions — usually NOT needed.** `db/bootstrap.sql`
       only recreates the Supabase-managed roles (`anon`, `authenticated`,
       `service_role`, `supabase_auth_admin`) and the `auth.jwt()`/`auth.uid()`
       shims for LOCAL Postgres. Its own header says it is **"NOT applied against
       the real Supabase project (which already has them)."** A real Supabase
       project ships these objects, so **skip bootstrap on prod.** (The migrate
       CLI runs with `withBootstrap: false` for exactly this reason.) Only run it
       by hand in the SQL editor if a migration later fails because one of those
       objects is missing.
3. [ ] **Capture both connection strings** from Project → Connect:
       - **Transaction pooler (port `:6543`)** → this becomes `DATABASE_URL`
         (the app runtime connection; `prepare:false` is set in code).
       - **Session / direct (port `:5432`)** → this becomes `DIRECT_URL`
         (migrations only).
       `lib/env.ts` REFUSES a prod boot if `DATABASE_URL` is not `:6543` or
       `DIRECT_URL` is not `:5432`, so copy the right one into the right slot.
4. [ ] **Capture the API keys** from Project → API: the project URL
       (`NEXT_PUBLIC_SUPABASE_URL`), the `anon` public key
       (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), and the `service_role` key
       (`SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to the browser).

---

## 2. Migrations

> Run from your local checkout, pointing `DIRECT_URL` at the prod `:5432` URL.
> Migrations need a session-pinned connection (multi-statement DDL), so they use
> the direct port, NOT the pooler.

1. [ ] Apply **ALL** of `db/migrations/` in filename order:
       ```
       DIRECT_URL='postgresql://...@...:5432/postgres' npm run db:migrate
       ```
       The migrate runner applies every `*.sql` file in `db/migrations/` in
       sorted order and records each in `public.schema_migrations`, so it is
       safe to re-run (already-applied files are skipped). This currently spans
       `0001`–`0005` **plus the engine-track migrations (`0006`+) that later
       plans add** — do not hand-pick a fixed list; let the runner apply
       whatever is present in `db/migrations/`.
2. [ ] **Do NOT run any seed script on prod.** `npm run db:seed`,
       `npm run db:seed:dashboard`, and `db/seed-demo.ts` are **dev-only** — they
       create demo tenants and fake data. Production starts empty and is
       populated through the app (see §6). There is no prod seed step.
3. [ ] Sanity check in the Supabase SQL editor:
       ```sql
       SELECT filename FROM public.schema_migrations ORDER BY filename;
       ```
       confirms every migration applied.

---

## 3. Auth configuration (Supabase dashboard)

1. [ ] **Enable the custom access-token hook.** Authentication → Hooks (or
       Auth → Hooks) → "Customize Access Token (JWT) Claims" → select the
       Postgres function **`public.custom_access_token_hook`** (defined in
       migration `0001_auth_onboarding.sql`; execute is granted only to
       `supabase_auth_admin`). Without this, JWTs won't carry `tenant_id` / role
       claims and RLS will deny everything. Verify a fresh sign-in produces a
       token with the tenant claim.
2. [ ] **Set URLs.** Authentication → URL Configuration:
       - **Site URL** = `https://atlas.twistag.com`
       - **Redirect URLs** = add `https://atlas.twistag.com/**` (covers
         `/auth/confirm` and `/auth/callback`).
3. [ ] **SMTP = Resend.** Authentication → Emails → SMTP Settings → enable custom
       SMTP and point it at Resend (host `smtp.resend.com`, port `465`, username
       `resend`, password = a Resend API key, sender = your verified
       `EMAIL_FROM` address from §4). The sign-in magic-link email is sent by
       Supabase Auth (GoTrue), NOT by this app — so it needs Resend configured
       here, separately from the app's `RESEND_API_KEY`.
4. [ ] **Magic Link template.** Authentication → Emails → Templates → Magic Link:
       include `{{ .Token }}` (the 6-digit code) in the body so the OTP-code
       sign-in path works, alongside the magic link.
5. [ ] **OTP / link expiry = 24h.** Authentication → providers/email settings:
       bump the OTP and magic-link expiry to 24 hours so invited users aren't
       racing a short window.

---

## 4. Resend (transactional email — invites + nudges)

> This is the app's OWN Resend integration (`services/email/send.ts`), separate
> from the Supabase SMTP in §3 — though both can use the same verified domain.

1. [ ] **Add and verify the sending domain** in Resend → Domains (e.g.
       `atlas.twistag.com` or a `mail.` subdomain). Add the DNS records Resend
       lists — at minimum:
       - **SPF** (TXT, e.g. `v=spf1 include:amazonses.com ~all`)
       - **DKIM** (the CNAME/TXT records Resend generates)
       - optionally **DMARC** (TXT `_dmarc`).
       Wait for Resend to show the domain as **Verified** (DNS can take up to a
       few hours — this is the Day-1 lead-time item).
2. [ ] **Set `EMAIL_FROM`** to a verified-domain sender, e.g.
       `Atlas <atlas@atlas.twistag.com>`. It MUST NOT contain `resend.dev` —
       `lib/env.ts` rejects the sandbox sender on a prod boot (it spam-folders).
3. [ ] **Create the production `RESEND_API_KEY`** in Resend → API Keys.
4. [ ] **Send a test** with prod env loaded (point `.env.local`, or inline vars,
       at the prod `RESEND_API_KEY` + `EMAIL_FROM`):
       ```
       npm run email:test
       ```
       Confirm the templates land in a real inbox (not spam) before launch.

---

## 5. Vercel

### 5a. Environment variables

Set these in Vercel → Project → Settings → Environment Variables. **Every
required key below is enforced by `lib/env.ts` on prod boot** — a missing one
fails the deploy at startup with a named error.

| Variable                        | Env(s)            | Required        | Where the value comes from |
|---------------------------------|-------------------|-----------------|----------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`      | Prod (+ Preview)  | required        | §1.4 Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod (+ Preview)  | required        | §1.4 Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY`     | Prod (+ Preview)  | required        | §1.4 Supabase `service_role` key (server-only) |
| `DATABASE_URL`                  | Prod (+ Preview)  | required        | §1.3 Transaction pooler URL (`:6543`) |
| `DIRECT_URL`                    | Prod              | required-prod   | §1.3 Session/direct URL (`:5432`) — also used locally for migrations |
| `APP_URL`                       | Prod              | required-prod   | `https://atlas.twistag.com` (https, no trailing slash) |
| `RESEND_API_KEY`                | Prod              | required-prod   | §4.3 Resend API key |
| `EMAIL_FROM`                    | Prod              | required-prod   | §4.2 verified-domain sender (no `resend.dev`) |
| `ANTHROPIC_API_KEY`             | Prod              | required-prod   | Anthropic console |
| `DB_POOL_MAX`                   | Prod              | optional        | `1` on serverless (each instance opens its own pool) |
| `INNGEST_EVENT_KEY`             | Prod              | slot — plan 020 | Inngest Cloud (add when 020 lands) |
| `INNGEST_SIGNING_KEY`           | Prod              | slot — plan 020 | Inngest Cloud (add when 020 lands) |
| `SENTRY_DSN`                    | Prod              | slot — plan 023 | Sentry/observability (add when 023 lands) |

> Keep this table in sync with `lib/env.ts`: every new env var a future plan
> adds MUST land here and in `.env.example` in the same PR.

### 5b. Domain + HTTPS

1. [ ] Vercel → Settings → Domains → add `atlas.twistag.com`, follow the DNS
       instructions, and confirm the HTTPS certificate is issued.
2. [ ] Confirm `APP_URL` matches the live domain exactly.

### 5c. Edge protection

1. [ ] Enable Vercel's **WAF / bot protection / attack-challenge** toggle as the
       outer rate-limit layer (the app's own rate limiting is plan 019 — this is
       the edge layer in front of it).

---

## 6. First-client bootstrap

> Production starts empty. The first org is created through the app, not a seed.

1. [ ] A **Twistag super admin** signs in (magic link to a `twistag_users`
       identity). They land on `/admin`.
2. [ ] Go to **`/admin/clients/new`**, fill in the org (name, slug, segment) and
       the **first manager** (name + email), and submit. This creates the client
       organization and emails the manager their workspace invite.
3. [ ] The **manager** accepts the invite, signs in, and invites their own team
       (sponsors + ICs) from inside the app. This is the invite chain:
       **super admin → organization → manager → members**.

---

## 7. Go / no-go smoke (≈15 min, on the prod domain)

Run all of these against `https://atlas.twistag.com` before declaring launch:

1. [ ] **Magic-link sign-in** works end-to-end with a real mailbox.
2. [ ] **Invite round-trip**: invite a real address, receive the email, accept,
       land in the app.
3. [ ] **IC session turn** with the **real LLM** (`ANTHROPIC_API_KEY` live) — a
       message gets a response.
4. [ ] **`GET /api/health` returns 200** with `checks.database = "ok"` (and
       `email`/`llm` = `"ok"` now that the keys are set). A 503 here means the
       DB check failed — stop and fix before launch.
5. [ ] **`/privacy` renders** (legal page is live).
6. [ ] **One nudge send** goes out to a real mailbox.

If any step fails, do not launch — fix and re-smoke.

---

## 8. Rollback

- **App (Vercel):** Vercel → Deployments → pick the last-known-good deployment →
  **"Promote to Production"** (instant rollback). No rebuild needed.
- **Database:** **Never roll back migrations — roll forward.** If a migration is
  bad, write a new corrective migration. For data loss/corruption, restore from
  the Supabase **Pro daily backup** (Database → Backups) — note this restores to
  a point in time, so coordinate with the team before restoring prod.
- **Env mistake:** if a deploy crashes at boot with an `Invalid environment`
  error, the message names the bad key — fix it in Vercel env vars and redeploy.
  This is the validation working as intended, not a regression.
