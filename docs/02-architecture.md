# 02 — Architecture, data model, API

> System diagram → component breakdown → data model → tRPC API → conventions.
> **Multi-tenant via Row-Level Security on Supabase.** See ADR-001.

---

## 1. System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Web Client (Next.js 15 App Router, React 19, Tailwind)             │
│  - IC journey routes (/session/[id], /me)                           │
│  - Manager dashboard (/sprint/[id])                                 │
│  - Twistag cockpit (/twistag/*)                                     │
│  - Marketing (/, /pricing)                                          │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ tRPC over HTTPS (JWT cookie)
┌──────────────────────▼──────────────────────────────────────────────┐
│  API Layer (Next.js API + tRPC + Zod)                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Routers:  auth, sprint, session, opportunity, sow,         │    │
│  │           document, manager, twistag, admin                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Services:  conversation, llm, scoring, sow, email          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ Middleware:  tenant context, auth, rate limit, audit log   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──┬───────────────┬──────────────┬───────────────┬──────────┬────────┘
   │               │              │               │          │
┌──▼──────────┐ ┌──▼──────────┐ ┌─▼────────────┐ ┌▼─────────┐ ┌▼────────┐
│ Supabase    │ │ Anthropic   │ │ Resend       │ │ Inngest  │ │ Sentry  │
│ Postgres    │ │ Claude API  │ │ (email)      │ │ (jobs)   │ │ /Highlt │
│ + pgvector  │ │             │ │              │ │          │ │ (obs)   │
│ + Auth      │ │             │ │              │ │          │ │         │
│ + Storage   │ │             │ │              │ │          │ │         │
│ (RLS)       │ │             │ │              │ │          │ │         │
└─────────────┘ └─────────────┘ └──────────────┘ └──────────┘ └─────────┘
```

## 2. Components

### 2.1 Web client
- **Framework:** Next.js 15 with App Router
- **Routing strategy:** colocated route segments (`/(ic)`, `/(manager)`, `/(twistag)`, `/(marketing)`)
- **Auth state:** server components read JWT cookie via `getSession()` helper
- **Data fetching:** Server Components for reads, Server Actions for simple mutations, tRPC for complex flows
- **State:** Zustand for non-trivial client state (e.g., conversation buffer)
- **Forms:** React Hook Form + Zod resolvers
- **Styling:** Tailwind + shadcn/ui (button, input, dialog, sheet, table, badge, avatar)

### 2.2 API layer
- **Framework:** Next.js Route Handlers wrapping tRPC server
- **Validation:** Zod schemas, single source of truth (shared with client via tRPC type inference)
- **Auth context:** middleware extracts JWT, looks up `tenant_id` + `user_id`, injects into ctx
- **DB access:** Drizzle clients use Supabase connection with JWT-derived auth — RLS does the rest
- **Audit:** every mutation logged with `tenant_id`, `user_id`, `action`, `target_id`, `at`

### 2.3 Conversation service (inside the codebase)
- **Location:** `apps/web/server/services/conversation/`
- **What it does:** Orchestrates a multi-turn discovery session with an IC
- **NOT a separate package.** It's prompt engineering + state machine + Claude API calls + Zod validation.
- **Public surface (called by tRPC):**
  - `conversation.start(sessionId, contextSnapshot)` → first message
  - `conversation.respond(sessionId, userInput)` → next message + extraction
  - `conversation.summarize(sessionId)` → final structured output
- **State:** persisted in `sessions` and `messages` tables; no in-memory state
- **See:** `docs/03-conversational-engine.md` for the rubric and prompts

### 2.4 LLM service
- **Adapter pattern.** Single interface: `llm.complete({ messages, system, schema, tools })`
- **Default provider:** Anthropic Claude Sonnet (via `@anthropic-ai/sdk`)
- **Fallback:** OpenAI (via `openai` SDK). Toggleable via env.
- **All LLM outputs validated against Zod schemas** before being returned to callers.
- **Token + cost tracking:** every call writes a `llm_calls` row with model, tokens, cost, latency, tenant.

### 2.5 Workers (Inngest)
- **Scheduled jobs:**
  - Weekly sponsor digest email (Mondays 09:00 client TZ)
  - 24h idle reminder per IC
  - Session pause expiry (auto-save and email user)
  - Sprint end-of-cycle: trigger report generation
  - Nightly: recompute opportunity scores against latest data
- **Event-driven jobs:**
  - On `session.completed` → extract entities → upsert into knowledge graph → recompute opportunity candidates
  - On `opportunity.approved` → generate SOW draft
  - On `manager.nudge.sent` → log to audit
- **Service-role bypass:** Inngest workers use the Supabase service role for cross-tenant operations (pattern library maintenance, etc.). Every bypass is wrapped in `withServiceRole()` with explicit audit logging.

### 2.6 Email (Resend)
- **Templates:** React Email components in `apps/web/emails/`
- **Templates needed in MVP:**
  - IC magic link / invite
  - IC session reminder
  - IC weekly summary (opt-in)
  - Manager weekly digest
  - Sponsor executive digest
  - SOW approved confirmation

## 3. Multi-tenancy via RLS

> See ADR-001 for full reasoning.

### 3.1 Pattern
- **Single Postgres schema** (`public`)
- **Every tenant-scoped table has `tenant_id UUID NOT NULL` column**
- **Every tenant-scoped table has RLS enabled** with policies that enforce `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`
- **Service-role bypass** allowed only inside Inngest workers + audit-logged

### 3.2 Tenant context flow
1. User signs in via Stytch magic link → JWT issued with `tenant_id`, `user_id`, `role`
2. Every request: middleware decodes JWT → injects `ctx.tenantId` and `ctx.user`
3. tRPC procedure creates a Supabase client bound to the user's JWT
4. All queries go through RLS — Postgres returns only rows where `tenant_id` matches JWT claim
5. Twistag users can switch tenant via `?tenant=` param — re-mints JWT with target tenant + audit log entry

### 3.3 Adversarial testing
Every PR that adds a tenant-scoped table OR modifies an RLS policy must include adversarial tests:
- Read attempt with wrong tenant → expects 0 rows
- Insert with wrong tenant → expects error
- Update/delete with wrong tenant → expects 0 rows affected

These tests run in CI; failures block merge.

### 3.4 Dedicated database (future, top-tier)
For Portfolio-tier clients (PE with regulatory or contractual physical-isolation requirements), offer separate Supabase project per tenant. Same schema, same code, different infrastructure. Add-on pricing.

## 4. Data model

### 4.1 Tenant-scoped tables (single schema, RLS)

Every table below has:
- `tenant_id UUID NOT NULL REFERENCES public.tenants(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- RLS enabled with the standard four policies (select/insert/update/delete)
- `CREATE INDEX <table>_tenant_idx ON <table>(tenant_id)`

```sql
-- ============ TENANT REGISTRY (no RLS — Twistag admin only) ============
CREATE TABLE public.tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  segment     TEXT NOT NULL,
  status      TEXT NOT NULL,         -- 'onboarding' | 'active' | 'paused' | 'churned'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE public.twistag_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.engagement_assignments (
  tenant_id        UUID REFERENCES public.tenants(id),
  twistag_user_id  UUID REFERENCES public.twistag_users(id),
  role             TEXT NOT NULL,
  PRIMARY KEY (tenant_id, twistag_user_id, role)
);

-- Cross-tenant pattern library (Twistag-only, no RLS)
CREATE TABLE public.patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  deploys         INTEGER NOT NULL DEFAULT 0,
  avg_outcome     JSONB,
  confidence_pct  INTEGER NOT NULL DEFAULT 0,
  embedding       VECTOR(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LLM call audit (tenant_id nullable for Twistag-side calls; service-role inserts)
CREATE TABLE public.llm_calls (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID,
  user_id      UUID,
  purpose      TEXT NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents   INTEGER NOT NULL,
  latency_ms   INTEGER NOT NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log (Twistag-only read; service-role inserts)
CREATE TABLE public.audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID,
  user_id    UUID,
  action     TEXT NOT NULL,
  target_id  TEXT,
  metadata   JSONB DEFAULT '{}'::jsonb,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ TENANT-SCOPED (RLS enabled) ============
CREATE TABLE public.users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL,           -- 'ic' | 'manager' | 'sponsor'
  department  TEXT,
  title       TEXT,
  opted_out   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE public.sprints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  name            TEXT NOT NULL,
  scope_department TEXT,
  primary_focus   TEXT NOT NULL,
  custom_focus    TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  cadence         TEXT NOT NULL,
  status          TEXT NOT NULL,
  sponsor_id      UUID REFERENCES public.users(id),
  manager_id      UUID REFERENCES public.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE TABLE public.topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  sprint_id    UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  order_idx    INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  est_minutes  INTEGER NOT NULL,
  template_id  TEXT
);

CREATE TABLE public.sprint_participants (
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id),
  sprint_id     UUID NOT NULL REFERENCES public.sprints(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL,
  PRIMARY KEY (sprint_id, user_id)
);

CREATE TABLE public.sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  sprint_id       UUID NOT NULL REFERENCES public.sprints(id),
  topic_id        UUID NOT NULL REFERENCES public.topics(id),
  user_id         UUID NOT NULL REFERENCES public.users(id),
  status          TEXT NOT NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  total_seconds   INTEGER,
  messages_count  INTEGER NOT NULL DEFAULT 0,
  edit_window_ends_at TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE public.messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  session_id  UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE public.captures (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  session_id   UUID NOT NULL REFERENCES public.sessions(id),
  user_id      UUID NOT NULL REFERENCES public.users(id),
  kind         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  source_quote TEXT NOT NULL,
  message_id   UUID REFERENCES public.messages(id),
  tags         TEXT[] NOT NULL DEFAULT '{}',
  embedding    VECTOR(1536),
  is_edited    BOOLEAN NOT NULL DEFAULT false,
  is_removed   BOOLEAN NOT NULL DEFAULT false,
  edited_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.users(id),
  sprint_id   UUID REFERENCES public.sprints(id),
  status      TEXT NOT NULL,
  extracted_text TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.opportunities (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES public.tenants(id),
  sprint_id              UUID NOT NULL REFERENCES public.sprints(id),
  title                  TEXT NOT NULL,
  description            TEXT NOT NULL,
  category               TEXT NOT NULL,
  departments            TEXT[] NOT NULL DEFAULT '{}',
  impact_cents_low       BIGINT NOT NULL,
  impact_cents_high      BIGINT NOT NULL,
  impact_unit            TEXT NOT NULL DEFAULT 'usd_per_year',
  time_to_ship_weeks_low INTEGER NOT NULL,
  time_to_ship_weeks_high INTEGER NOT NULL,
  confidence_score       INTEGER NOT NULL,
  composite_score        DECIMAL(3,1) NOT NULL,
  dimension_scores       JSONB NOT NULL,
  rationale              TEXT NOT NULL,
  status                 TEXT NOT NULL,
  surfaced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at            TIMESTAMPTZ,
  approved_by            UUID REFERENCES public.users(id)
);

CREATE TABLE public.opportunity_evidence (
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  capture_id     UUID NOT NULL REFERENCES public.captures(id),
  weight         DECIMAL(3,2) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (opportunity_id, capture_id)
);

CREATE TABLE public.opportunity_pattern_matches (
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  pattern_id     UUID NOT NULL,
  similarity     DECIMAL(3,2) NOT NULL,
  PRIMARY KEY (opportunity_id, pattern_id)
);

CREATE TABLE public.sow_drafts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id),
  opportunity_id     UUID NOT NULL REFERENCES public.opportunities(id),
  title              TEXT NOT NULL,
  scope              TEXT NOT NULL,
  inclusions         TEXT[] NOT NULL,
  exclusions         TEXT[] NOT NULL DEFAULT '{}',
  team               JSONB NOT NULL,
  start_date         DATE NOT NULL,
  duration_weeks     INTEGER NOT NULL,
  price_cents        BIGINT NOT NULL,
  outcome_bonus_cents BIGINT,
  success_metrics    TEXT[] NOT NULL,
  comments           TEXT,
  status             TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id),
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id),
  author_id      UUID NOT NULL,
  author_kind    TEXT NOT NULL,
  body           TEXT NOT NULL,
  at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 RLS policy template (applied to every tenant-scoped table)

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_tenant_select" ON public.<table>
  FOR SELECT
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_insert" ON public.<table>
  FOR INSERT
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_update" ON public.<table>
  FOR UPDATE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

CREATE POLICY "<table>_tenant_delete" ON public.<table>
  FOR DELETE
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

### 4.3 Twistag-side policy variants

Twistag users have a `twistag_role` JWT claim. For them, additional policies allow read access across tenants:

```sql
CREATE POLICY "<table>_twistag_read" ON public.<table>
  FOR SELECT
  USING (
    (auth.jwt() ->> 'twistag_role') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.engagement_assignments ea
      WHERE ea.tenant_id = public.<table>.tenant_id
        AND ea.twistag_user_id = (auth.jwt() ->> 'sub')::uuid
    )
  );
```

Twistag write access requires explicit tenant impersonation (re-mint JWT with `tenant_id` of target client). Audit-logged.

### 4.4 Indexes

```sql
-- Tenant index on every RLS-enabled table
CREATE INDEX <table>_tenant_idx ON public.<table>(tenant_id);

-- Composite indexes for high-traffic
CREATE INDEX sessions_tenant_user_idx ON public.sessions(tenant_id, user_id, status);
CREATE INDEX sessions_tenant_sprint_idx ON public.sessions(tenant_id, sprint_id, status);
CREATE INDEX captures_session_idx ON public.captures(session_id) WHERE NOT is_removed;
CREATE INDEX opportunities_tenant_sprint_idx ON public.opportunities(tenant_id, sprint_id, status);
CREATE INDEX opportunities_score_idx ON public.opportunities(tenant_id, composite_score DESC);

-- Vector
CREATE INDEX captures_embedding_idx ON public.captures USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

## 5. tRPC API surface

> One file per router under `apps/web/server/routers/`.

### 5.1 `auth` router
- `magicLink.send({ email })` → `{ sent: boolean }`
- `magicLink.verify({ token })` → `{ jwt: string }` (sets cookie)
- `session.current()` → `{ user, tenantId, role }`
- `signOut()` → `void`

### 5.2 `sprint` router
- `list()` → `Sprint[]` (RLS filters by tenant)
- `get({ id })` → `SprintDetail`
- `create({ name, scope, focus, customFocus })` → `Sprint`
- `update({ id, ... })` → `Sprint`
- `addParticipants({ id, emails: string[] })` → `{ added: number }`
- `setTopics({ id, topicIds: string[] })` → `Sprint`
- `setTimeline({ id, start, end, cadence })` → `Sprint`
- `launch({ id })` → `Sprint` (triggers invitation emails)
- `pause({ id })` → `Sprint`
- `progress({ id })` → `{ completionPct, wac, opportunitiesCount, ... }`

### 5.3 `session` router
- `myUpcoming()` → `Session[]`
- `myCompleted()` → `Session[]`
- `start({ topicId })` → `{ sessionId, firstMessage }`
- `respond({ sessionId, userMessage })` → `{ assistantMessage, capturesSoFar, progress }`
- `pause({ sessionId })` → `void`
- `resume({ sessionId })` → `{ messages, capturesSoFar, progress }`
- `complete({ sessionId })` → `{ summary, captures }`
- `editCapture({ captureId, summary })` → `Capture`
- `removeCapture({ captureId })` → `void`
- `restoreCapture({ captureId })` → `Capture`

### 5.4 `opportunity` router
- `listForSprint({ sprintId })` → `Opportunity[]`
- `get({ id })` → `OpportunityDetail`
- `approve({ id })` → `{ opportunity, sowDraft }`
- `defer({ id })` → `Opportunity`
- `decline({ id, reason })` → `Opportunity`
- `requestMoreDetail({ id })` → `Opportunity`

### 5.5 `sow` router
- `get({ id })` → `SowDraft`
- `update({ id, fields })` → `SowDraft`
- `sendToTwistag({ id })` → `{ sentAt }`

### 5.6 `document` router
- `uploadUrl({ filename, mimeType })` → `{ uploadUrl, documentId }`
- `list({ sprintId? })` → `Document[]`
- `get({ id })` → `DocumentDetail`

### 5.7 `manager` router
- `dashboard({ sprintId })` → `ManagerDashboard`
- `nudge({ participantId, channel, subject?, body? })` → `{ sent: boolean }`
- `generateNudgeDraft({ participantId })` → `{ subject, body }`

### 5.8 `twistag` router
- `clientList()` → `Client[]` (Twistag-only via JWT claim)
- `clientDetail({ tenantId })` → `ClientDetail` (impersonates target tenant)
- `patternLibrary()` → `Pattern[]`
- `addInternalNote({ tenantId, body })` → `Note`

### 5.9 `admin` router
- `auditLog({ tenantId?, since? })` → `AuditEntry[]`
- `tenantHealth({ tenantId })` → `HealthSnapshot`

## 6. Conversation service internals

> See `docs/03-conversational-engine.md` for the rubric and prompts.

### 6.1 Conversation state machine
```
[INIT] → [INTRO] → [ARC_1] → [ARC_2] → [ARC_3] → [ARC_4] → [CLOSE] → [DONE]
                       ↓ probe   ↓ probe   ↓ probe   ↓ probe
                    (max 2 each)
```

### 6.2 Orchestration loop (pseudocode)
```ts
// apps/web/server/services/conversation/respond.ts
async function respond(sessionId: string, userInput: string) {
  const state = await loadState(sessionId); // includes RLS filter via JWT
  const recent = state.messages.slice(-12);

  // 1. Extract captures from user input
  const extraction = await llm.complete({
    purpose: 'discovery.extract',
    schema: ExtractionSchema,
    system: extractionPrompt(state.currentArc, state.userRole),
    messages: [{ role: 'user', content: userInput }],
  });

  // 2. Persist captures (RLS enforces tenant_id)
  await persistCaptures(sessionId, extraction.captures);

  // 3. Decide probe-vs-advance
  const decision = await llm.complete({
    purpose: 'discovery.decide',
    schema: DecisionSchema,
    system: decisionPrompt(state),
    messages: [...recent, { role: 'user', content: userInput }],
  });

  // 4. Generate next message
  const next = await llm.complete({
    purpose: 'discovery.respond',
    system: questionPrompt(state.currentArc, state.userRole, decision),
    messages: [...recent, { role: 'user', content: userInput }],
  });

  return {
    assistantMessage: next,
    capturesSoFar: extraction.captures,
    progress: computeProgress(state),
  };
}
```

### 6.3 Schemas
```ts
const CaptureSchema = z.object({
  kind: z.enum(['bottleneck', 'workaround', 'tooling', 'handoff', 'frustration', 'sop', 'decision']),
  summary: z.string().min(15).max(280),
  source_quote: z.string(),
  tags: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

const ExtractionSchema = z.object({
  captures: z.array(CaptureSchema),
  notes_for_next_probe: z.string().nullable(),
});
```

## 7. LLM provider abstraction

```ts
// apps/web/server/services/llm/index.ts
interface CompleteOpts<T> {
  purpose: string; // for cost tracking
  system: string;
  messages: Message[];
  schema?: z.ZodType<T>;
  tools?: Tool[];
  maxTokens?: number;
  temperature?: number;
}

interface LlmService {
  complete<T = string>(opts: CompleteOpts<T>): Promise<T>;
  embed(texts: string[]): Promise<number[][]>;
}
```

Every `complete()` call:
1. Writes to `public.llm_calls` with cost + latency (service-role insert).
2. Validates output against `schema` if present (using `safeParse`, retries on failure).
3. Returns typed result.

## 8. Background jobs (Inngest)

| Job ID | Trigger | Purpose |
|---|---|---|
| `session.completed.process` | `event:session.completed` | Re-run extraction; compute opportunity candidates |
| `opportunity.score` | nightly cron | Recompute composite scores against latest captures |
| `digest.weekly.sponsor` | weekly cron | Generate + send sponsor digest email |
| `reminder.ic.idle` | hourly cron | Find sessions paused >24h; email reminder |
| `report.final.generate` | `event:sprint.completed` | Generate final PDF + HTML report |
| `sow.draft.generate` | `event:opportunity.approved` | Generate SOW from opportunity |
| `magic.link.send` | `event:auth.magic_link.requested` | Send email |
| `pattern.match.refresh` | nightly cron | Refresh opportunity → pattern matches via vector similarity |

## 9. Security at code level

- All quote-attribution to individual users hidden from manager dashboard
- IC has 7-day soft delete + edit window on every capture
- Audit log writes on every mutation
- Rate limits per tenant per route
- No PII in LLM call logs (extracts allowed but sanitized)
- RLS enforced at DB; defense in depth at application layer

## 10. Environments

| Env | URL | Branch | Notes |
|---|---|---|---|
| Local dev | `http://localhost:3000` | feature branches | Supabase local emulator |
| Preview | `*.atlas-preview.twistag.com` | PR branches | Vercel preview deployments |
| Staging | `staging.atlas.twistag.com` | `staging` | Supabase staging project |
| Production | `app.atlas.twistag.com` | `main` | Supabase prod, EU region |

## 11. Observability

- **Logs:** structured JSON via pino → Vercel logs + optional Highlight forwarding
- **Traces:** OpenTelemetry SDK → Highlight or Datadog
- **Metrics:** key counters via `metrics.service`:
  - `session.started.count`, `session.completed.count`
  - `llm.call.count`, `llm.cost.cents`
  - `opportunity.surfaced.count`, `opportunity.approved.count`
  - `email.sent.count`
- **Health endpoint:** `/api/health` returns DB + LLM + email provider status

## 12. Deployment

```
GitHub PR → Vercel preview → review → merge to main
                                          ↓
                              Vercel prod deploy
                                          ↓
                       Drizzle migrations run (single schema, single pass)
                                          ↓
                              Smoke tests on prod
```

Migrations apply once to the single schema. No per-tenant operations.
