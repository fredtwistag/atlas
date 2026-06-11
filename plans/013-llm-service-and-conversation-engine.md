# Plan 013: Build the real LLM service + conversation engine (services/llm, services/conversation)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- services/ server/trpc/routers/session.ts db/schema.ts prompts/ package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0 — blocks 2026-06-18 pilot launch
- **Effort**: L (multi-day; the dominant work item of launch week)
- **Risk**: HIGH — new external dependency (Anthropic API), new service surface
- **Depends on**: none (start immediately). Plan 018 (Next upgrade) can land before or after; coordinate merges.
- **Category**: direction (stated-but-undelivered core product)
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Atlas's entire value proposition is the conversation: ICs talk to Atlas, Atlas
probes and extracts structured captures. Today every session plays a scripted
5-turn mock from `lib/demo-data.ts` — the same conversation regardless of what
the user types. The first real client will notice within one session. This plan
builds the two missing services the architecture promises (`services/llm/`,
`services/conversation/`) and exposes them through a tRPC mutation. Plan 014
adds capture extraction/persistence; plan 015 wires the UI.

## Current state

- `services/` contains only `email/`. There is no `services/llm/` or
  `services/conversation/`.
- `package.json` has no `@anthropic-ai/sdk` dependency.
- `.env.example` already stubs the key: `# ANTHROPIC_API_KEY=` with the comment
  "Anthropic (Claude) — services/llm".
- `prompts/` contains the prompt corpus, currently consumed by NOTHING:
  `discovery-rubric.md`, `probe-patterns.md`, `scoring-rubric.md`,
  `role-prompts/{ic,manager,cfo-coo,ceo-sponsor}-role-prompts.md`.
- The conversation spec is `docs/03-conversational-engine.md`: session arcs
  (INIT → INTRO → ARC_1..4 → CLOSE → DONE), role-adaptive prompts, probe
  patterns, extraction schemas. Read it fully before starting.
- The mock the UI consumes today, `lib/demo-data.ts:7-13`:

  ```ts
  interface ScriptStep {
    assistant: string;
    /** A capture the extraction pass would lift from the user's reply to the PREVIOUS question. */
    captureOnReply?: { kind: string; summary: string };
  }
  export const conversationScript: ScriptStep[] = [ ... ]
  ```

- The sessions table (`db/schema.ts:152-174`) already has what the engine
  needs: `status`, `totalSeconds`, `messagesCount`, `captureCount`,
  `completedAt`, `editWindowEndsAt`. There is NO `session_messages` table —
  this plan adds one (migration 0006).
- tRPC conventions: routers in `server/trpc/routers/`, `tenantProcedure` from
  `server/trpc/trpc.ts:12`, all DB access through
  `withTenantContext(ctx.session, async (tx) => ...)` from `db/client.ts:63`.
  See `server/trpc/routers/session.ts` for the exemplar (its `get` and
  `editView` queries).
- Repo conventions (CLAUDE.md): strict TS, Zod on every API input AND every
  LLM output, no barrel files, tests co-located (`foo.ts` + `foo.test.ts`),
  every new table gets `tenant_id` + RLS policies + an adversarial test
  (pattern: `db/captures.integration.test.ts`). Any PR touching RLS needs 2
  approvals — this plan ADDS a table with the standard policy pattern, it does
  not modify existing policies.

## Commands you will need

| Purpose     | Command                          | Expected on success      |
|-------------|----------------------------------|--------------------------|
| Install     | `npm install`                    | exit 0                   |
| Typecheck   | `npm run typecheck`              | exit 0, no errors        |
| Lint        | `npm run lint`                   | exit 0                   |
| Unit tests  | `npm test`                       | all pass                 |
| Integration | `npm run test:integration`       | all pass (embedded-postgres) |
| Full gate   | `npm run verify`                 | exit 0 (do NOT run while `next dev` is running — known `.next` clobber gotcha; use `NEXT_DIST_DIR=.next-verify` if you must) |
| Migrate dev | `npm run db:migrate`             | applies `db/migrations/0006_*.sql` |

## Scope

**In scope** (the only files you should create/modify):
- `services/llm/client.ts`, `services/llm/client.test.ts` (create)
- `services/llm/schemas.ts` (create — Zod schemas for LLM outputs)
- `services/conversation/engine.ts`, `engine.test.ts` (create)
- `services/conversation/prompts.ts`, `prompts.test.ts` (create)
- `services/conversation/state.ts`, `state.test.ts` (create)
- `server/trpc/routers/session.ts` (add `start` + `sendMessage` mutations)
- `db/schema.ts` (add `sessionMessages` table)
- `db/migrations/0006_session_messages.sql` (create)
- `db/session-messages.integration.test.ts` (create — adversarial RLS test)
- `package.json` (add `@anthropic-ai/sdk`)
- `.env.example` (uncomment/document `ANTHROPIC_API_KEY`)

**Out of scope** (do NOT touch):
- `components/session/ConversationView.tsx` and `lib/demo-data.ts` — UI wiring
  is plan 015. Keep the mock working until 015 lands.
- Capture extraction/persistence — plan 014 (this plan returns assistant turns
  only; it records messages, not captures).
- Opportunity generation — plan 016.
- Any existing RLS policy.

## Git workflow

- Branch: `feat/013-conversation-engine`
- Conventional commits matching repo style, e.g.
  `feat(conversation): llm client + engine state machine`. Do NOT push or open
  a PR unless the operator asked.

## Steps

### Step 1: Add the Anthropic SDK and the LLM client abstraction

`npm install @anthropic-ai/sdk`. Create `services/llm/client.ts`:

- Export `async function complete(opts: { system: string; messages: {role:
  "user"|"assistant"; content: string}[]; maxTokens?: number }): Promise<string>`
  and `async function completeStructured<T>(opts: { ...same; schema:
  z.ZodType<T> }): Promise<T>`.
- Model id via `process.env.ATLAS_LLM_MODEL ?? "claude-sonnet-4-6"`. Never
  hardcode the model elsewhere; everything LLM goes through this module
  (CLAUDE.md: "abstracted through services/llm/").
- `completeStructured` parses the model's JSON output through the Zod schema;
  on parse failure it retries ONCE with the validation error appended to the
  prompt, then throws a typed `LlmOutputError`.
- No API key → throw `LlmNotConfiguredError` with a message naming
  `ANTHROPIC_API_KEY` (callers decide fallback; never silently no-op).
- Unit tests mock the SDK (`vi.mock("@anthropic-ai/sdk")`) — test the retry
  path, the schema rejection path, and the not-configured path.

**Verify**: `npm test -- services/llm` → all pass. `npm run typecheck` → exit 0.

### Step 2: Prompt loader

Create `services/conversation/prompts.ts`:

- Load the markdown prompt files from `prompts/` at module init using
  `fs.readFileSync` + `path.join(process.cwd(), "prompts", ...)` (server-only
  module; Next bundles `process.cwd()` correctly for route handlers — verify in
  step 6's integration smoke).
- Export `buildSystemPrompt(opts: { role: "ic"|"manager"|"sponsor"; userName:
  string; department: string|null; topicTitle: string; arc: Arc })` that
  composes: discovery rubric + role prompt (pick `role-prompts/ic-role-prompts.md`
  for ICs etc.) + probe patterns + arc-specific instruction per
  docs/03-conversational-engine.md.
- Unit test: prompt contains the topic title, the role file's content marker,
  and changes when `arc` changes.

**Verify**: `npm test -- services/conversation/prompts` → pass.

### Step 3: Conversation state machine

Create `services/conversation/state.ts`: the arc state machine from docs/03
(INIT → INTRO → ARC_1..4 → CLOSE → DONE), pure functions:

- `nextArc(current: Arc, messagesInArc: number): Arc` per the rubric's
  turn-count budget (sessions target 4–6 minutes ≈ 5–8 user turns; read the
  rubric and encode its numbers, citing them in a comment).
- `isDone(arc: Arc): boolean`.
- Exhaustive switch over the Arc union — no `default:` branch (CLAUDE.md state
  machine discipline). Unit-test every transition.

**Verify**: `npm test -- services/conversation/state` → pass.

### Step 4: `session_messages` table (migration 0006)

Add to `db/schema.ts` (after `sessions`, line ~174):

```ts
export const sessionMessages = pgTable("session_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sessionId: uuid("session_id").notNull().references(() => sessions.id),
  role: text("role").notNull(),            // "assistant" | "user"
  content: text("content").notNull(),
  arc: text("arc").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Write `db/migrations/0006_session_messages.sql` by hand following the exact
pattern of `db/migrations/0002_dashboard_tables.sql`: create table + the
standard 4 RLS policies (`USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`)
+ twistag-read policy + index on `(session_id, created_at)`. Then
`db/session-messages.integration.test.ts` copying the adversarial pattern from
`db/captures.integration.test.ts`: tenant B reading tenant A's rows → 0 rows.
ALSO: only the session's own `user_id` may SELECT its messages — managers must
NOT read IC transcripts (privacy rule, CLAUDE.md "Privacy by design"). Add a
second policy restricting SELECT to `user_id = (auth.jwt() ->> 'user_id')::uuid`
OR service role, and an adversarial test: same-tenant manager reads IC's
messages → 0 rows.

**Verify**: `npm run test:integration` → all pass including the 2 new
adversarial tests.

### Step 5: The engine

Create `services/conversation/engine.ts`:

- `async function takeTurn(opts: { db: Db; tenantId: string; sessionId: string;
  userId: string; userMessage: string }): Promise<{ assistant: string; arc: Arc;
  done: boolean }>`:
  1. Load session + topic + prior messages (ordered).
  2. Compute current arc via `state.ts`.
  3. `complete()` with `buildSystemPrompt(...)` + message history.
  4. Insert the user message and the assistant reply into `session_messages`,
     increment `sessions.messagesCount` — one transaction.
  5. Return the assistant text + arc + `done`.
- Transcript hygiene: do NOT `console.log` message content anywhere (CLAUDE.md:
  no transcripts in general logs).
- Unit tests with a mocked `services/llm/client`.

**Verify**: `npm test -- services/conversation/engine` → pass.

### Step 6: tRPC surface

In `server/trpc/routers/session.ts` add:

- `start`: `tenantProcedure` mutation `{ id: uuid }` — validates the session
  belongs to `ctx.session.userId` (match the `editView` ownership pattern at
  `server/trpc/routers/session.ts:114-130` — `eq(sessions.userId,
  ctx.session.userId)`), sets `status` to `"in_progress"` if `"not_started"`,
  generates the INTRO assistant message via the engine if no messages exist,
  returns `{ messages }`.
- `sendMessage`: `tenantProcedure` mutation `{ id: uuid, content:
  z.string().min(1).max(4000) }` — same ownership check, calls `takeTurn`,
  returns `{ assistant, done }`.
- Both run inside `withTenantContext`. Errors from `LlmNotConfiguredError` map
  to a `TRPCError` with a clear message ("Conversation engine not configured —
  set ANTHROPIC_API_KEY"), per the repo's error-copy rule (say what happened +
  what to do).

Integration test in `server/trpc/router.integration.test.ts` style: with the
LLM client mocked, `sendMessage` persists 2 rows in `session_messages` and an
IC cannot `sendMessage` on another user's session (expect NOT_FOUND).

**Verify**: `npm run verify` → exit 0.

### Step 7: Live smoke against the real API (manual, gated)

With a real `ANTHROPIC_API_KEY` in `.env.local`: `npm run dev`, sign in via
`/sign-in/dev` as an IC persona, and confirm a session start returns a
non-scripted assistant message that references the topic. (The UI still runs
the mock until plan 015 — exercise the mutation via the dashboard's network
tab or a one-off script `npx tsx --env-file=.env.local scripts/dev-turn.ts` you
may create under `scripts/`, which is allowed.)

**Verify**: one real round-trip logged as latency only (no content), responses
differ across two different user inputs.

## Test plan

- `services/llm/client.test.ts`: structured-output retry, schema rejection,
  not-configured error.
- `services/conversation/state.test.ts`: every arc transition + done.
- `services/conversation/prompts.test.ts`: role/topic/arc composition.
- `services/conversation/engine.test.ts`: turn persistence + arc advance with
  mocked LLM.
- `db/session-messages.integration.test.ts`: cross-tenant 0 rows; same-tenant
  manager 0 rows.
- Pattern exemplar: `db/captures.integration.test.ts`,
  `server/trpc/router.integration.test.ts`.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] `grep -rn "@anthropic-ai/sdk" services/llm/client.ts` → 1 match; `grep -rn "anthropic" app/ components/ server/ --include="*.ts*" | grep -v services/llm` → no direct SDK usage outside the abstraction
- [ ] `session_messages` migration applies cleanly: `npm run db:migrate` exit 0
- [ ] 2 new adversarial RLS tests pass
- [ ] `session.sendMessage` returns model text with key set; typed error without
- [ ] No `console.log` of message content: `grep -n "console" services/conversation/*.ts` → none log `content`

## STOP conditions

- `docs/03-conversational-engine.md` materially contradicts this plan's state
  machine (different arcs) — stop and reconcile with the operator.
- The drift check shows `server/trpc/routers/session.ts` changed since `430d2f4`.
- Adding the manager-cannot-read-messages policy breaks an existing test —
  that would mean something already reads transcripts cross-user; report it.
- You find yourself wanting to edit RLS on an EXISTING table.

## Maintenance notes

- Plan 014 builds extraction on top of `takeTurn` — keep its return shape stable.
- Plan 016 (opportunity engine) and the SOW LLM upgrade both call
  `completeStructured`; cost controls (max tokens, model pin) live in
  `services/llm/client.ts` only.
- Review focus: the ownership checks on both mutations, and that no transcript
  content reaches logs.
