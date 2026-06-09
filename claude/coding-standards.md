# Coding Standards

> Read this once. Refer back when stuck.

---

## TypeScript

- **Strict mode** always (`"strict": true`). No `any` without justification.
- **No `as`** type assertions unless coercing between widened narrowed types you control.
- **Prefer `unknown` over `any`** when accepting variable input; narrow with Zod.
- **Discriminated unions** for state machines (e.g. session status).
- **Type all function returns explicitly** for exported functions.

## React / Next.js

- **Server components by default.** Mark client components with `'use client'` only when needed (interactivity, hooks).
- **Co-locate** components: `feature/components/X.tsx`, `feature/components/X.test.tsx`, `feature/components/X.stories.tsx` (optional).
- **No `useEffect` for data fetching.** Use Server Components or tRPC's React Query integration.
- **Form handling:** React Hook Form + Zod resolvers always.
- **Loading states:** `<Suspense fallback={<Skeleton />}>` boundaries at meaningful UI levels.

## tRPC

- Every procedure: input Zod schema + output Zod schema (output schema for queries to enable strict types).
- Procedures grouped by entity in `apps/web/server/routers/`.
- **All mutations write to audit log.**
- **All procedures access DB via `getDb(ctx.tenantId)`.**

## Database

- **All tenant-scoped tables have `tenant_id uuid NOT NULL`** with RLS policies. See ADR-001.
- **Every PR adding a tenant-scoped table** must include an adversarial test (see Adversarial Tests section).
- **All tables have `created_at`** (default `now()`).
- **Use `uuid` for primary keys.**
- **Indexes for any column** queried by filter or sort. Always include `tenant_id` first in composite indexes.
- **Migrations** via Drizzle; run via `pnpm migrate`. Single schema; one pass.

## Adversarial tests for tenant isolation

Every PR that adds a tenant-scoped table OR modifies an RLS policy must include tests:

```typescript
import { describe, it, expect } from 'vitest';
import { asUser } from '@/test/helpers';

describe('opportunities — tenant isolation', () => {
  it('prevents reading other tenant rows', async () => {
    // Insert as tenant A (via service role)
    await seedRow({ tenant_id: TENANT_A, title: 'secret' });

    // Read as tenant B user
    await asUser({ tenantId: TENANT_B }, async (db) => {
      const result = await db.select().from(opportunities).where(eq(opportunities.title, 'secret'));
      expect(result).toHaveLength(0);
    });
  });

  it('prevents inserting with wrong tenant_id', async () => {
    await asUser({ tenantId: TENANT_A }, async (db) => {
      const result = await db.insert(opportunities).values({
        tenant_id: TENANT_B, // wrong tenant
        // ... other fields
      });
      expect(result.error).toBeTruthy();
    });
  });

  // Repeat for update and delete operations
});
```

**CI gate:** these tests must pass on every PR. PR cannot merge if any adversarial test fails.

## LLM calls

- **Always go through `llm.service`.** No direct SDK calls.
- **Always validate** outputs against Zod schema.
- **Always specify `purpose`** for cost tracking.
- **Always test** with a fixture before merging.

## Naming

| Thing | Convention | Example |
|---|---|---|
| File | kebab-case | `sprint-setup.tsx` |
| Component | PascalCase | `SprintSetup` |
| Hook | camelCase, `use` prefix | `useSprintProgress` |
| Type / Interface | PascalCase | `Opportunity` |
| Zod schema | PascalCase + `Schema` | `OpportunitySchema` |
| DB table | snake_case, plural | `opportunities` |
| tRPC procedure | camelCase | `opportunity.approveForFde` |
| Constant | SCREAMING_SNAKE | `MAX_PROBE_BUDGET` |
| Env var | SCREAMING_SNAKE | `STYTCH_API_SECRET` |

## Imports

- **No barrel files.** Import directly: `import { Button } from '@/components/button'`.
- **Group imports:** external → internal → relative. (Prettier or import sorter handles.)
- **No circular imports.** If you hit one, refactor.

## File structure (monorepo root)

```
.
├── apps/
│   ├── web/                  ← Next.js app (frontend + tRPC)
│   │   ├── app/             ← App Router routes
│   │   ├── components/      ← UI components
│   │   ├── server/          ← tRPC routers, services
│   │   ├── emails/          ← React Email templates
│   │   └── lib/             ← Helpers
│   └── workers/             ← Inngest workers
├── packages/
│   ├── db/                  ← Drizzle schemas + client
│   ├── ui/                  ← Shared UI components (Tier 1)
│   ├── llm/                 ← LLM service abstraction
│   ├── hermes/              ← Conversational engine
│   └── shared/              ← Cross-package types
├── docs/                    ← Project docs (this folder's parent)
├── prototypes/              ← Reference HTML
└── tooling/                 ← Scripts, CLIs (e.g. migration runner)
```

## Testing

- **Unit:** Vitest, co-located with source.
- **Integration:** Vitest, against test Postgres (per-test schema).
- **E2E:** Playwright, sparingly, for critical flows only (sign-in, IC session, opportunity approve).
- **LLM eval:** dedicated `packages/llm-eval` harness; runs on prompt changes via CI.

## Commits

- **Conventional Commits:** `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`
- **One concern per commit.** Squash on merge.
- **Reference tickets:** `feat(opp): add scoring engine [ATL-403]`

## PRs

- **One ticket per PR** when possible.
- **PR description includes:**
  - What changed
  - Why
  - How to test
  - Screenshots if UI
  - Migration notes if DB

## ADRs

When a decision is architectural (changes the shape of the system or has long-term effect):
1. Write an ADR in `docs/adrs/NNNN-decision.md`
2. Use template: Context, Decision, Consequences, Alternatives considered
3. Link from the relevant ticket/PR

## Don't

- Don't use `localStorage` for anything that needs to survive sign-out
- Don't fetch in `useEffect` — use Server Components or tRPC
- Don't render lists without keys
- Don't disable ESLint rules without `// eslint-disable-next-line` + reason
- Don't merge to main without CI green
- Don't ship UI without designs (check prototypes first)
- Don't add a dependency without considering bundle size
- Don't use a 3rd-party UI library when shadcn/ui has a primitive
- Don't add Slack/Teams code in MVP (out of scope)

## When in doubt

1. Check prototype for visual answer
2. Check existing pattern in codebase
3. Ask in PR description
4. Default: choose the boring, well-known solution
