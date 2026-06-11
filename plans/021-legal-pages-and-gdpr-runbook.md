# Plan 021: Legal surface — /privacy, /terms, /security pages + GDPR ops runbook

> **Executor instructions**: Follow step by step; verify each step. On any STOP
> condition, stop and report. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- app/(marketing)/ docs/06-security-compliance.md emails/`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P0 — an EU pilot client cannot lawfully be onboarded without it
- **Effort**: M (copy-heavy, code-light)
- **Risk**: LOW technically; the COPY needs operator/legal review before launch
  — that review is a hard gate, see STOP conditions
- **Depends on**: none
- **Category**: docs / security
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

The marketing footer links "Privacy" and "Security · SOC 2" to `href="#"`
(`app/(marketing)/page.tsx:392-397` area) and the page claims "GDPR compliant"
with nothing behind it. No `/privacy`, `/terms`, or `/security` routes exist
anywhere in `app/`. Twistag is Portuguese; the pilot clients are real EU
companies; GDPR Articles 13/14 require transparency at the point of data
collection, and ICs are handing over workplace observations — sensitive
employee-relations data. The operator decided (2026-06-11): data-subject
rights are served by a documented MANUAL runbook + DPA for the pilot, not a
self-serve API.

## Current state

- Footer: `app/(marketing)/page.tsx` ~line 385-407 — links with `href="#"`,
  plus a "GDPR compliant" claim around line 407.
- `docs/06-security-compliance.md` — internal promises incl. data-subject
  rights flows ("/api/gdpr/export", deletion cycle), retention windows,
  sub-processors. The published pages must only promise what is TRUE at
  launch; where docs/06 describes unbuilt endpoints, the published policy
  describes the manual process instead.
- Privacy promises already made to ICs in-product (`components/me/PrivacyGate.tsx:7-12`):
  role-not-name attribution, 7-day edit window, skip any question, aggregated
  themes only. The privacy policy must restate these identically — no drift.
- Stack facts for the policy (verified in code): Supabase (DB + auth, EU
  region must be confirmed by operator — see STOP), Resend (email), Anthropic
  (LLM, from plan 013), Vercel (hosting), Inngest (jobs, plan 020). Auth uses
  strictly-necessary cookies only (Supabase session); there is NO analytics
  tooling in `package.json` — so no consent banner is required, and the policy
  states "no tracking cookies".
- Marketing layout: there is no shared `(marketing)/layout.tsx` — the footer is
  inline in `page.tsx`. The new pages may extract a small shared footer
  component (allowed below).
- Style guide (CLAUDE.md): honest, specific, no corporate-speak. Legal pages
  included.

## Commands you will need

| Purpose   | Command            | Expected |
|-----------|--------------------|----------|
| Full gate | `npm run verify`   | exit 0   |
| Dev       | `npm run dev`      | pages render at /privacy /terms /security |

## Scope

**In scope**:
- `app/(marketing)/privacy/page.tsx`, `app/(marketing)/terms/page.tsx`,
  `app/(marketing)/security/page.tsx` (create)
- `components/marketing/SiteFooter.tsx` (create; extract from page.tsx) +
  wire into `app/(marketing)/page.tsx` and `app/(marketing)/pricing/page.tsx`
- `app/sitemap.ts` (add the three routes)
- `docs/runbooks/gdpr-dsr.md` (create — internal runbook, not a route)
- `emails/NudgeEmail.tsx` (one-line privacy footer addition) + its test

**Out of scope**:
- GDPR API endpoints (post-launch fast-follow, recorded in P2)
- DPA legal drafting (operator/legal task; the runbook links a placeholder
  path `docs/legal/dpa-template.md` the operator fills)
- Cookie banner (not needed — no analytics; do NOT add one)
- SOC 2 claims — see Step 2; the current footer text "Security · SOC 2" must
  be SOFTENED, not backed.

## Git workflow

- Branch: `feat/021-legal-surface`; conventional commits. No push unless asked.

## Steps

### Step 1: Privacy policy page

`/privacy` — plain typographic page (match the marketing type scale; Fraunces
display + the existing prose styles). Sections, in honest plain language:

1. Who we are (Twistag, Portugal; contact email — placeholder
   `privacy@twistag.com`, operator confirms).
2. What Atlas collects: account data (name, work email, role/title),
   conversation content (messages, extracted captures), usage/audit events.
3. How it's used: discovery analysis for YOUR employer's sprint; never for
   model training; never sold.
4. The IC promises — restate PrivacyGate's four promises verbatim.
5. Sub-processors table: Supabase, Vercel, Resend, Anthropic, Inngest (+
   regions; operator confirms regions before merge).
6. Retention: state actuals — sprint data retained for the engagement +
   N days (operator sets N; placeholder marked `TODO-OPERATOR` must be
   resolved before merge — see done criteria).
7. Your rights (access, rectification, erasure, portability, objection) +
   "email privacy@twistag.com; we respond within 30 days" — served manually
   per the runbook.
8. Cookies: strictly-necessary session cookies only; no analytics, no
   tracking.

**Verify**: page renders; `npm run verify` exit 0.

### Step 2: Terms + Security pages, fix the footer

- `/terms`: pilot-stage terms — service description, acceptable use, client
  data ownership (the client owns sprint outputs), no-training clause,
  liability cap placeholder for legal review, governing law Portugal.
- `/security`: practices page that is TRUE today: RLS multi-tenant isolation
  with adversarial tests, encrypted in transit/at rest (Supabase defaults),
  audited cross-tenant staff access, magic-link auth (no passwords stored),
  responsible-disclosure contact. SOC 2: write "SOC 2 readiness in progress"
  ONLY if the operator confirms; otherwise omit entirely and change the footer
  label to "Security".
- `SiteFooter.tsx`: real links (`/privacy`, `/terms`, `/security`,
  `mailto:hello@twistag.com`); remove the bare "GDPR compliant" badge text and
  link the claim to /privacy instead.

**Verify**: zero `href="#"` left: `grep -n 'href="#"' app/(marketing)/**/*.tsx components/marketing/*.tsx` → no matches. All three pages in `sitemap.ts`.

### Step 3: GDPR DSR runbook (internal)

`docs/runbooks/gdpr-dsr.md`: for each right — exact manual procedure with SQL
(read-only export via Supabase SQL editor scoped by user email → JSON; erasure
via the IC-edit semantics: set captures `is_removed`, null out
message content for the user's sessions, anonymize `users.name`/`email` to
`deleted-user-{id}` — NOT row deletion, FK graph stays intact), who executes
(Twistag admin), deadline tracking (30 days), where to log completion
(audit_log action `gdpr.request`). Note that plan 013's `session_messages`
table is included in export + erasure scope.

**Verify**: runbook's SQL statements are syntactically valid against
`db/schema.ts` column names (dry-read them against the schema; do not run
mutations anywhere).

### Step 4: Email privacy footer

`emails/NudgeEmail.tsx`: add one line to its footer: "Your answers are
attributed to your role, never your name — and you can edit them for 7 days."
Update `emails/NudgeEmail.test.tsx` accordingly.

**Verify**: `npm test -- emails` → pass.

## Test plan

- Render tests are covered by the verify gate (page components are server
  components; smoke = build success).
- Footer link integrity grep (Step 2).
- NudgeEmail test update.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] `/privacy`, `/terms`, `/security` live, linked from the footer on all
  marketing pages, present in sitemap
- [ ] `grep -rn "TODO-OPERATOR" app/ docs/runbooks/` → ZERO matches (all
  placeholders resolved with the operator — retention days, regions, contact
  addresses, SOC 2 stance)
- [ ] No unbacked compliance claims: page text contains no "SOC 2 compliant",
  no bare "GDPR compliant" badge
- [ ] `docs/runbooks/gdpr-dsr.md` exists and covers all five rights

## STOP conditions

- You cannot confirm Supabase project region / retention windows / SOC 2
  stance — these are operator answers; collect them in one batch, don't guess.
- Anything in the policy would contradict actual behavior (e.g. analytics
  tooling appears in package.json by the time you run) — reconcile first.
- **Hard gate**: the operator (Fred) must read the three pages before this
  merges. Request that review explicitly in the PR description.

## Maintenance notes

- When the GDPR API fast-follow lands, update §7 of the policy and retire the
  manual-runbook wording.
- Any new sub-processor (e.g. an embeddings vendor from plan 016 Step 1) MUST
  be added to the §5 table in the same PR that adds the dependency.
