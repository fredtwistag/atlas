# Atlas

**Operational discovery copilot for Twistag clients.**

A persistent product that runs short conversations with client teams, captures how work actually happens, and surfaces a backlog of ROI-scored opportunities for AI/automation implementation.

---

## What's in this repo

This started as the **planning and spec repo**. It now also contains a **running
Next.js 15 application** — a clickable walkthrough of the whole product, built
from the specs and prototypes.

```
atlas-project/
├── README.md                ← you are here
├── CLAUDE.md                ← entry point for Claude Code
├── app/                     ← Next.js 15 App Router — the live application
│   ├── (marketing)/         ← landing + pricing
│   ├── (app)/               ← IC, manager/sponsor, and Twistag views
│   ├── api/health/          ← health endpoint
│   └── dev/components/      ← Tier-1 design-system showcase
├── components/              ← UI primitives + feature components
├── lib/                     ← types + typed data layer (mirrors the tRPC routers)
├── docs/                    ← product, architecture, design specs
├── roadmap/                 ← sprints + backlog
├── prompts/                 ← conversational engine prompts + rubric
├── design/                  ← design tokens, Tailwind config
├── prototypes/              ← 12 HTML prototypes (visual reference)
└── claude/                  ← Claude Code conventions
```

## Running the app

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build (all routes typecheck + compile)
npm test             # Vitest unit + component suite
npm run lint         # ESLint (next/core-web-vitals)
npm run typecheck    # tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs typecheck + lint + test + build on every push and PR,
plus a separate job for the database adversarial RLS tests.

### Database (slice 1: schema + RLS)

```bash
npm run db:migrate         # apply migrations to DATABASE_URL (Supabase dev, via Session pooler)
npm run test:integration   # adversarial RLS tests on an ephemeral local Postgres
```

Tenant isolation is enforced by Postgres RLS (ADR-001). All tenant-scoped queries go
through `withTenantContext()` in `db/client.ts`; cross-tenant/admin work goes through
`withServiceRole()` (audit-logged). The adversarial tests boot a throwaway Postgres via
`embedded-postgres` (no Docker needed) and prove cross-tenant read/insert/update/delete
are blocked. The UI still runs on `lib/data.ts` — wiring real queries via tRPC is a later
slice.

Key routes to walk through:
- `/` — marketing landing (and `/pricing`)
- `/me` — IC personal dashboard → start a session
- `/session/[id]` — **live discovery conversation** (scripted engine; captures
  surface in real time in the side panel)
- `/sprint/spr-northwind-q2` — manager / sponsor dashboard
- `/sprint/spr-northwind-q2/opportunity/opp-1` — opportunity detail → Approve for FDE → auto-drafted SOW
- `/sprint/spr-northwind-q2/report` — final report
- `/twistag` — Twistag multi-client cockpit
- `/dev/components` — design-system showcase

**What's real vs. stubbed.** The full UI, design system, navigation, and the
opportunity→evidence→SOW flow are real. Backend services from the architecture
(Supabase + RLS, Stytch auth, Anthropic API, Inngest, Resend) are **not yet
wired** — data is served from a typed in-memory layer in `lib/data.ts` whose
functions mirror the tRPC router surface in `docs/02-architecture.md §5`, so the
swap to the real backend is mechanical. The conversation runs a scripted engine
(no API key in this environment) behind the same seam the real Claude service
will use. This advances ATL-010 (scaffold) and ATL-018 (Tier-1 components), and
makes ATL-104/300/304/408/600/503-class screens visible against live-shaped data.

> **Note:** the architecture envisions a pnpm monorepo with `apps/web`. This
> scaffold is a single Next.js app at the repo root for a faster path to
> "runnable" — promoting it into `apps/web` later is a move, not a rewrite.

## How to use this

1. **Claude Code starts here:** [CLAUDE.md](./CLAUDE.md).
2. **Humans start here:**
   - For product context → [`docs/01-vision-and-prd.md`](./docs/01-vision-and-prd.md)
   - For tech architecture → [`docs/02-architecture.md`](./docs/02-architecture.md)
   - For current sprint → [`roadmap/`](./roadmap/)
3. **Visual reference:** open any file in [`prototypes/`](./prototypes/) in a browser.

## Quick facts

- **Codename:** Atlas
- **Status:** Specs ready + **runnable demo app** (front-end + design system live; backend services not yet wired). See "Running the app".
- **MVP scope:** Web-only (no Slack/Teams in v1). See [PRD v1](./docs/01-vision-and-prd.md).
- **Tech stack:** Next.js 15 + tRPC + Postgres + pgvector + Anthropic API.
- **Target shippable date:** Alpha in 14 weeks, Wave 1 pilots in 18 weeks.

## Project contacts

- **Product owner:** Fred (fred@twistag.com)
- **Tech lead:** TBD
- **Repo owner:** Twistag

## Glossary

- **Atlas** — the product
- **Pulse** — Twistag's proprietary AI SDLC ([twistag.com/pulse](https://twistag.com/pulse))
- **Conversation service** — Atlas's internal conversational layer (`apps/web/server/services/conversation/`). Prompt engineering + state code + Claude API. No external brand.
- **FDE** — Forward-Deployed Engineer (Twistag delivery role)
- **Sprint** — a discrete 3-4 week discovery engagement with a client team

Full glossary: [`docs/07-glossary.md`](./docs/07-glossary.md).
