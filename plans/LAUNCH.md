# LAUNCH.md — Atlas public pilot launch plan (target: 2026-06-18)

Master index for the launch-readiness plan set (plans **013–027**), produced by
the 2026-06-11 audit (six parallel audit agents + live walkthrough of all six
roles, findings vetted against source at commit `430d2f4`). Launch shape, as
decided by Fred on 2026-06-11:

- **Pilot launch**: marketing site public; first 1–3 clients onboarded
  manually by Twistag via the invite chain. No self-serve signup, no billing.
- **Real LLM engine is a must-have** — full auto opportunity engine chosen
  (see risk note below).
- **Inngest** adopted now for background work.
- **GDPR**: manual DSR runbook + DPA for the pilot; self-serve API post-launch.

Each plan is self-contained (an executor needs only the plan file + the repo).
Execute every plan's verification gates; `npm run verify` green before merge.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| [018](018-nextjs-upgrade-and-security-headers.md) | Next.js CVE upgrade + security headers | P0 | S | — | TODO |
| [022](022-prod-cutover.md) | Prod cutover: env validation + DEPLOY runbook | P0 | M | — (START DAY 1: DNS/domain lead times) | TODO |
| [013](013-llm-service-and-conversation-engine.md) | LLM service + conversation engine | P0 | L | 018 (merge-order only) | TODO |
| [017](017-ic-edit-window-and-session-authz.md) | IC edit-window persistence + session authz fix | P0 | M | — | TODO |
| [021](021-legal-pages-and-gdpr-runbook.md) | Legal pages + GDPR DSR runbook | P0 | M | — (operator review gate) | TODO |
| [019](019-rate-limiting.md) | Rate limiting (OTP, sign-in email, nudge) | P0 | M | — | TODO |
| [014](014-capture-extraction-pipeline.md) | Capture extraction pipeline | P0 | M | 013 | TODO |
| [020](020-inngest-background-workers.md) | Inngest workers (nudge/invite/digests/reminders) | P0/P1 | M–L | steps 4,6 need 014/016 | TODO |
| [015](015-conversation-ui-live-wiring.md) | Live conversation UI; retire scripted mock | P0 | M | 013, 014 | TODO |
| [016](016-opportunity-engine.md) | Opportunity engine (cluster→score→surface) | P0 | L | 013, 014 | TODO |
| [023](023-observability.md) | Sentry + structured logs + uptime | P1 | M | 022, 018 | TODO |
| [024](024-lifecycle-guards-and-empty-states.md) | Sprint-lifecycle guards + empty states | P1 | S | coordinate w/ 020 | TODO |
| [026](026-perf-and-caching-pass.md) | Perf + caching pass (vetted set) | P1 | M | 018 | TODO |
| [025](025-invitation-expiry-and-nudge-optout.md) | Invitation expiry + nudge opt-out | P1 | M | 020 (cron step only) | TODO |
| [027](027-test-hardening.md) | Test hardening: lifecycle e2e + privacy net | P1 | M | last — after the above | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (reason) | REJECTED (rationale).

## The honest risk note

013 + 016 together are the week. The operator chose the **full auto**
opportunity engine over curated promotion; plan 016 is therefore staged so
that its Step 6 (Twistag curation mutations + admin UI) is a standalone safety
valve — **build Step 6 even if the clustering/scoring steps slip**. If by
2026-06-16 the engine's output quality is not sponsor-ready, the contingency
is: ship 013/014/015 (real conversations + real captures) + 016 Step 6
(Twistag curates opportunities from real captures by hand in /admin). That is
still an honest product — Atlas captures, Twistag curates — and it is the
pilot-playbook workflow anyway.

## Suggested week (2026-06-11 → 18)

Parallelize across executors/agents; tracks are independent unless noted.

- **Day 1 (Thu 11)** — 018 (half day, FIRST). Start 022 §4 operator actions:
  create prod Supabase (EU), buy/point domain, start Resend domain
  verification (DNS propagation!). Start 013.
- **Day 2 (Fri 12)** — 013 continues. 017 (parallel track). 021 page drafts →
  hand to Fred for copy review. 019.
- **Weekend** — 013 wraps; 014; 022 code steps (env validation, health,
  robots).
- **Day 5 (Mon 15)** — 015 (UI live). 020 steps 1–3. 016 steps 1–4.
- **Day 6 (Tue 16)** — 016 steps 5–6 + quality eyeball with Fred (**go/no-go
  on auto-surfacing vs curation fallback**). 023, 024, 026 in parallel. 020
  steps 4–6.
- **Day 7 (Wed 17)** — 025, 027. Execute `docs/runbooks/deploy.md` end-to-end
  on prod. Go/no-go smoke (runbook §7). Seed the first client tenant.
- **Launch (Thu 18)** — invite the first client manager. Twistag babysits
  sessions day 1 (pilot playbook), recompute after first sessions, review
  surfaced opportunities before the sponsor sees them.

## P2 — fast-follow backlog (not planned in detail; promote when scheduled)

- **SOW LLM generation** — replace the heuristic `lib/sow.ts` (hardcoded
  `priceUsd: 68_000`) with `prompts/sow-draft-prompt`-driven drafts consuming
  016's dimension scores. The heuristic is acceptable at launch ONLY if the
  SOW sheet is clearly labeled a draft.
- **Document upload** — Wave-1 PRD promise (manual upload), consciously
  deferred 2026-06-11 to fit the engine; tell pilot clients in kickoff comms
  ("share documents with your Twistag lead directly for now"). Needs:
  Supabase Storage bucket, documents table + RLS, upload UI, capture linkage.
- **GDPR self-serve API** — export + erasure endpoints replacing the manual
  runbook; soft-delete columns + Inngest hard-delete job.
- **Report PDF export proper** (Puppeteer/print-service) — print stylesheet
  exists and works; revisit when sponsors ask for files.
- **Report ISR/revalidation** — deferred from 026 deliberately.
- **Audit-log scale work** — archival/rollover past ~1M rows.
- **Twistag clientList aggregation** — in-memory grouping fine at pilot scale
  (`server/trpc/routers/twistag.ts:28-88`); move to SQL aggregates at >20
  tenants.
- **CI: migration-apply job + seeded-Supabase e2e in the gate; dependabot.**
- **Backups/DR + secrets-rotation runbooks** (one-pagers).
- **CSRF posture check** — verify Supabase cookie SameSite flags on prod
  domain once live; document.
- **README refresh** — the "backend not wired" section is stale and misled
  the audit itself.
- **Marketing stat footnotes** — attribute the outcomes grid ("Atlas sprint
  averages to date; engagements vary").

## Findings considered and REJECTED (do not re-audit)

- *"Dashboard/report still serve lib/data.ts mock data"* — false; tRPC + RLS
  end-to-end (the README is stale, see P2). The remaining mock was the
  conversation script (plans 013/015).
- *"Marketing anchor links dead"* — false; `id="how"`/`id="for-who"` exist
  (`app/(marketing)/page.tsx:149,233`). The DEAD links were the footer legal
  ones (plan 021).
- *"IC quotes overfetched to managers"* — by design: evidence quotes are the
  product; the rule is names-never, enforced and now regression-tested
  (plan 027 Step 3).
- *"Open-redirect guard bypassable via encoding"* — guard is sound
  (`app/auth/callback/safe-next.ts`); plan 027 adds test cases only.
- *Lucide barrel imports, tRPC HTTP cache headers* — not worth it (tree-shaking
  handles icons; RSC architecture makes transport caching moot).
- *Twistag staff RBAC granularity* — intentional flat tier for Wave 1
  (documented in `lib/twistag-admin.ts:20`); revisit v1.5.
- *Pattern library curation, KPI recalibration, pilot-orchestration
  dashboards* — v1.5 scope; Twistag operates these manually at 1–3 pilots.

## What was NOT audited

External dashboards (Vercel/Supabase/Resend prod config — covered by the 022
runbook instead), real email deliverability (022 §7 smoke covers it at
cutover), load behavior beyond pilot scale, the `alice` sibling repo, and
docs/ADR internal consistency beyond launch-relevant promises.
