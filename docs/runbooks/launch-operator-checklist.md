# Atlas — Launch Operator Checklist

> **For Fred.** Everything the code can't do for itself, in the order to do it.
> Target launch: **2026-06-18** (pilot). Deep detail for each step lives in
> [`deploy.md`](deploy.md); this is the do-it-tomorrow punch list.
>
> All application code for the launch set (plans 013–027) is merged to `main`
> and green: typecheck + lint + 206 unit + 205 integration + production build.
> What remains is **external account/dashboard setup** — none of it is in the repo.

---

## 0. Do this first (5 min)

- [ ] **Rotate the Anthropic API key.** The key used during the build was pasted
      in plaintext in a chat transcript — treat it as compromised. Generate a new
      one at console.anthropic.com and use the new value everywhere below.
- [ ] Decide go-live domain: `atlas.twistag.com` (assumed throughout).

---

## 1. Production Supabase project (EU region)

Region **must** be EU to match the privacy posture.

- [ ] Create a new Supabase project in an **EU** region (e.g. `eu-central-1`).
- [ ] Project Settings → Database: set a strong DB password.
- [ ] Connect → copy two connection strings:
  - **Transaction pooler** (port **6543**) → this becomes `DATABASE_URL`
  - **Session pooler / direct** (port **5432**) → this becomes `DIRECT_URL`
- [ ] Copy `Project URL`, `anon` key, and `service_role` key (Settings → API).
- [ ] Apply **all** migrations, in order, against the **direct** URL:
      ```bash
      DIRECT_URL="postgresql://...:5432/postgres" npm run db:migrate
      ```
      This applies `db/migrations/0000` … `0009`. **Do NOT run any `db:seed*`
      script on prod** — those are dev-only.

---

## 2. Supabase Auth configuration

- [ ] **Enable the access-token hook**: Authentication → Hooks → Customize Access
      Token → select function `public.custom_access_token_hook`. (Without this,
      JWTs carry no `tenant_id`/`user_id`/`role` claims and RLS denies everything.)
- [ ] Authentication → URL Configuration: set **Site URL** and **Redirect URLs**
      to `https://atlas.twistag.com` (and `/auth/callback`).
- [ ] Authentication → Emails → SMTP: set **Resend** as the custom SMTP provider.
- [ ] Edit the **Magic Link** email template to include `{{ .Token }}` (the
      6-digit code the sign-in UI expects) and bump OTP/link **expiry to 24h**.

---

## 3. Resend (transactional email)

- [ ] Verify the sending domain (add the SPF + DKIM DNS records Resend lists).
      DNS propagation has lead time — **do this early.**
- [ ] Set `EMAIL_FROM` to a verified address, e.g. `Atlas <atlas@twistag.com>`
      (must NOT contain `resend.dev` — prod env validation rejects it).
- [ ] Smoke test once the prod env is wired: `npm run email:test`.

---

## 4. Domain & DNS

- [ ] Point `atlas.twistag.com` at Vercel (CNAME/A per Vercel's instructions).
- [ ] Confirm HTTPS is issued. **DNS + cert propagation has lead time** — don't
      leave this for launch morning.

---

## 5. Vercel — environment variables & domain

Set every variable below (Production scope). Detail/table also in `deploy.md` §5.

| Variable | Value source | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key | ✅ |
| `DATABASE_URL` | Supabase **pooler :6543** string | ✅ |
| `DIRECT_URL` | Supabase **direct :5432** string | ✅ |
| `RESEND_API_KEY` | Resend API key | ✅ (prod) |
| `EMAIL_FROM` | `Atlas <atlas@twistag.com>` | ✅ (prod) |
| `ANTHROPIC_API_KEY` | **new, rotated** key | ✅ (prod) |
| `APP_URL` | `https://atlas.twistag.com` | ✅ (prod) |
| `ATLAS_LLM_MODEL` | optional override (default `claude-sonnet-4-6`) | optional |
| `DB_POOL_MAX` | `1` recommended on Vercel serverless | optional |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | from step 6 | for workers |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | from step 7 | optional |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | for source maps | optional |

- [ ] All required vars set (the app **fails loud at boot** in prod if any
      required one is missing — that's by design).
- [ ] Add the custom domain `atlas.twistag.com` in Vercel; enable HTTPS.
- [ ] Turn on Vercel **WAF / bot protection** (outer rate-limit layer; the app
      has its own limiter underneath).

---

## 6. Inngest Cloud (background workers)

Powers nudges, invite sends, weekly digests, idle reminders, session-completion
extraction, and nightly opportunity recompute.

- [ ] Create an Inngest Cloud app.
- [ ] Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` in Vercel (step 5).
- [ ] Register the serve endpoint: `https://atlas.twistag.com/api/inngest`.
- [ ] Confirm all functions appear in the Inngest dashboard after first deploy.

---

## 7. Sentry (error tracking + uptime)

- [ ] Create a Sentry **Next.js** project in an **EU** org; copy the DSN.
- [ ] Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel (optionally
      `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source-map upload).
      (Sentry is a no-op without a DSN, so this is safe to defer a day.)
- [ ] Create an issue alert → email/Slack; fire a test event.
- [ ] Point an external uptime monitor (e.g. UptimeRobot) at
      `https://atlas.twistag.com/api/health` — expect `200`, alert on `503`.

---

## 8. Legal pages — a decision to make (plan 021)

The marketing footer currently links to **external** Twistag corporate legal
(`twistag.com/privacy-policy`, `/terms`) — so there are **no dead links** and
launch is **not blocked**. Choose one:

- [ ] **Keep external Twistag legal** (no action), **or**
- [ ] **Adopt Atlas-specific internal pages**: merge branch
      `feat/021-legal-surface`, then fill the `[OPERATOR CONFIRM: …]` placeholders
      (effective date, legal entity name/address, `privacy@`/`security@` mailboxes,
      sub-processor regions, retention window, liability cap, SOC 2 stance) and
      review the draft copy. The GDPR DSR runbook is already merged
      ([`gdpr-dsr.md`](gdpr-dsr.md)).

---

## 9. Go / no-go smoke test (~15 min, after deploy)

Run on the **prod** domain (full detail in `deploy.md` §7):

- [ ] Magic-link sign-in works on `atlas.twistag.com`.
- [ ] Invite round-trip lands in a real mailbox.
- [ ] An IC session returns a **real** Claude reply that references the topic
      (this also confirms `ANTHROPIC_API_KEY` is live).
- [ ] `GET /api/health` returns `200` with `database: ok`.
- [ ] One nudge send goes out (and is visible in Inngest).
- [ ] **Eyeball opportunity quality** (the Day-6 go/no-go): run an opportunity
      recompute against real captures and review the surfaced items. If quality
      isn't sponsor-ready, use the **Twistag curation safety valve** in `/admin`
      (edit/hide/surface by hand) — Atlas captures, Twistag curates. Either way
      is an honest pilot.

---

## 10. First client

- [ ] Super admin creates the org + invites the first manager via
      `/admin/clients/new`; the manager then invites the team.
- [ ] Twistag babysits day-1 sessions (pilot playbook), recomputes after the
      first sessions, and reviews surfaced opportunities **before** the sponsor
      sees them.

---

## Still to verify manually (not runnable in CI — need the live app)

These passed at the code/test level but need a running app + real key/seeded DB:

- [ ] Live conversation E2E: two different answers produce different real
      replies; with the key unset the page shows the honest "can't start yet"
      state (no infinite spinner); completing a session opens the 7-day IC edit
      window.
- [ ] Turn latency p50 acceptable (< ~6–8s). If per-turn extraction is too slow,
      there's a one-line switch to extraction-at-completion-only.
- [ ] Playwright e2e suite (`npm run test:e2e`) against a seeded Supabase + key.

## Rollback (if needed)

- Vercel: instant rollback / promote the previous deployment.
- DB: restore from Supabase backup (Pro = daily). **Never roll back migrations —
  roll forward.**

---

_Generated 2026-06-12 alongside the plans 013–027 launch build. Detail:
[`deploy.md`](deploy.md) · [`gdpr-dsr.md`](gdpr-dsr.md) · master plan:
[`../../plans/LAUNCH.md`](../../plans/LAUNCH.md)._
