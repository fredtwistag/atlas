# Plan 014: Capture extraction — turn real conversations into persisted captures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On any
> STOP condition, stop and report. Update this plan's row in `plans/README.md`
> when done.
>
> **Drift check (run first)**: `git diff --stat 430d2f4..HEAD -- services/conversation/ services/llm/ server/trpc/routers/session.ts db/schema.ts`
> Plan 013 SHOULD have landed (its files will show as new). If plan 013 is not
> merged, STOP — this plan depends on it.

## Status

- **Priority**: P0 — blocks 2026-06-18 pilot launch
- **Effort**: M (a day-ish)
- **Risk**: MED — LLM output quality gates the whole downstream product
- **Depends on**: plans/013 (engine). Plan 020 (Inngest) is NOT required —
  extraction here runs in-request; 020 later moves the session-completion pass
  to a worker.
- **Category**: direction
- **Planned at**: commit `430d2f4`, 2026-06-11

## Why this matters

Captures are the atoms of the product: opportunities cite them as evidence, the
report aggregates them, the IC edit window edits them. The schema and UI for
captures exist; nothing real produces them. After this plan, each completed
session yields Zod-validated captures rows extracted from the actual transcript.

## Current state

- `captures` table exists and is complete (`db/schema.ts:175-193`):

  ```ts
  export const captures = pgTable("captures", {
    id, tenantId, sessionId, userId,
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    sourceQuote: text("source_quote").notNull(),
    tags: text("tags").array().notNull().default([]),
    isEdited / isRemoved / createdAt ...
  });
  ```

- `sessions.captureCount` exists (`db/schema.ts:167`) but nothing increments it.
- The manager dashboard stat card currently shows "0 captures" (verified live
  2026-06-11) because the demo seed links no captures to the active sprint —
  real extraction fixes this for real sprints.
- Capture kinds in use by the UI (`lib/ui-maps.ts`, `captureKindTone`): check
  that file and reuse its exact kind strings (e.g. "bottleneck") — do not
  invent new kinds without adding tones there.
- Extraction spec: `docs/03-conversational-engine.md` (extraction schemas
  section) + `prompts/discovery-rubric.md`. Capture quality bar: summary is a
  neutral restatement; `sourceQuote` is the user's verbatim words.
- Conventions: Zod for every LLM output (CLAUDE.md), `withTenantContext` for DB
  writes, tests co-located.

## Commands you will need

| Purpose     | Command                    | Expected            |
|-------------|----------------------------|---------------------|
| Typecheck   | `npm run typecheck`        | exit 0              |
| Unit        | `npm test`                 | all pass            |
| Integration | `npm run test:integration` | all pass            |
| Full gate   | `npm run verify`           | exit 0 (not while dev server runs) |

## Scope

**In scope**:
- `services/conversation/extract.ts`, `extract.test.ts` (create)
- `services/llm/schemas.ts` (extend with `CaptureExtraction` Zod schema)
- `services/conversation/engine.ts` (hook per-turn extraction)
- `server/trpc/routers/session.ts` (completion path: final extraction pass +
  `captureCount` update)
- `app/(app)/session/actions.ts` (`completeSession` server action — wire the
  final pass; read it first, it exists)
- `db/captures.integration.test.ts` (extend: extraction write path)

**Out of scope**:
- UI changes (plan 015 shows live captures; until then extraction is invisible
  except in DB).
- Opportunity clustering/scoring (plan 016).
- Embeddings (plan 016 adds pgvector migration).
- Moving extraction to a background worker (plan 020).

## Git workflow

- Branch: `feat/014-capture-extraction`; conventional commits
  (`feat(conversation): per-turn capture extraction`). No push unless asked.

## Steps

### Step 1: Extraction schema + prompt

In `services/llm/schemas.ts` add:

```ts
export const capturedItem = z.object({
  kind: z.enum([/* exact kinds from lib/ui-maps.ts */]),
  summary: z.string().min(8).max(280),
  sourceQuote: z.string().min(3),
  tags: z.array(z.string()).max(5).default([]),
});
export const captureExtraction = z.object({ captures: z.array(capturedItem).max(4) });
```

Create `services/conversation/extract.ts`:
`extractFromTurn(opts: { topicTitle; arc; userMessage; priorAssistant }):
Promise<CapturedItem[]>` calling `completeStructured` with an extraction system
prompt assembled from `prompts/discovery-rubric.md`. Empty array is a valid
result — never force captures from small talk. Unit-test with mocked LLM:
valid parse, empty result, quote-must-come-from-message guard (reject items
whose `sourceQuote` is not a substring of the user message; drop them, don't
throw).

**Verify**: `npm test -- services/conversation/extract` → pass.

### Step 2: Hook per-turn extraction into the engine

In `services/conversation/engine.ts` `takeTurn`: after persisting the turn, run
`extractFromTurn` and insert any captures (tenantId, sessionId, userId from the
session row) in the SAME `withTenantContext` transaction as the message insert
— a failed extraction must NOT fail the turn (catch `LlmOutputError`, log a
count-only warning, continue). Increment `sessions.captureCount` by the number
inserted. Return captures in the turn result: `{ assistant, arc, done,
captures: {id, kind, summary}[] }` so plan 015 can render them live.

**Verify**: engine unit tests updated → pass; `npm run test:integration` →
extraction write lands rows with correct tenant/user.

### Step 3: Completion pass

Read `app/(app)/session/actions.ts` (`completeSession`). Extend the completion
path (server action → router) to set `status: "completed"`, `completedAt:
now()`, `editWindowEndsAt: now() + 7 days`, `totalSeconds`, and run ONE final
whole-transcript extraction (`extractFromSession`) that catches anything the
per-turn passes missed, deduplicating against existing captures for the session
(case-insensitive summary match is enough).

**Verify**: integration test — complete a session with mocked LLM → status
flips, `editWindowEndsAt ≈ now()+7d`, no duplicate captures.

### Step 4: Capture-count truthfulness

`grep -rn "captureCount\|capture_count" app/ components/ lib/ server/` — wire
any stat that should reflect real counts (the sprint progress aggregation in
`lib/sprint-read.ts` feeds the dashboard stat card). Fix the aggregation to
count captures for the sprint's sessions if it doesn't already.

**Verify**: integration test asserting sprint progress capture count > 0 after
an extraction.

## Test plan

- `extract.test.ts`: parse, empty, substring guard.
- Engine test: turn + captures in one transaction; extraction failure doesn't
  fail the turn.
- Integration: completion sets edit window; dedupe; cross-tenant adversarial
  already covered by existing `db/captures.integration.test.ts` — keep green.

## Done criteria

- [ ] `npm run verify` exits 0
- [ ] A completed mock-LLM session produces ≥1 captures row with
  `editWindowEndsAt` 7 days out
- [ ] `sessions.captureCount` reflects inserted captures
- [ ] Extraction failure path logs counts only — `grep -n "summary\|sourceQuote" services/conversation/extract.ts | grep -i "console"` → no content logging

## STOP conditions

- `lib/ui-maps.ts` capture kinds don't match what `docs/03` specifies — ask
  which wins rather than inventing a mapping.
- `completeSession` action doesn't exist where stated — the completion flow
  moved; report.
- Per-turn extraction pushes turn latency beyond ~6s p50 in your manual smoke —
  flag it; the fallback (extraction only at completion) is a one-line switch
  and an acceptable launch posture.

## Maintenance notes

- Plan 016 consumes captures (embedding + clustering) — `kind`, `summary`,
  `sourceQuote` shapes are load-bearing.
- Plan 017 edits these rows; `isEdited`/`isRemoved` semantics already exist.
- Plan 020 moves the completion pass into an Inngest job — keep
  `extractFromSession` callable standalone.
