# CLAUDE.md — Atlas Project Context

> Read this file first. Then `docs/01-vision-and-prd.md`. Then check `roadmap/` for the current sprint.

---

## What Atlas is

Atlas is an **operational discovery sprint product** built by Twistag. Client teams have short conversations with Atlas over 3-4 weeks; Atlas captures how the work actually happens; sponsors get a ranked, ROI-scored opportunity backlog with click-through evidence, plus auto-drafted SOWs that kick off Twistag FDE engagements.

**MVP Wave 1 is Sprint-mode only.** Subscription tiers (Atlas Core, Portfolio) come in v1.5 once Slack/Teams integration makes "persistent" honest.

**The product is sold to:** mid-market operators, PE portcos, PE firms (direct, no white-label channel in MVP), and funded SaaS/AI scale-ups.

## Where things live

| What | Where |
|---|---|
| Vision + PRD | `docs/01-vision-and-prd.md` |
| Architecture | `docs/02-architecture.md` |
| Conversation service spec | `docs/03-conversational-engine.md` |
| Design system | `docs/04-design-system.md` |
| Pilot playbook | `docs/05-pilot-playbook.md` |
| Security & compliance | `docs/06-security-compliance.md` |
| Glossary | `docs/07-glossary.md` |
| Risks | `docs/08-risks.md` |
| ADRs (architecture decisions) | `docs/adrs/` |
| Sprint roadmap (20 weeks) | `roadmap/milestones.md` |
| Sprint backlog | `roadmap/sprints.md` |
| Full backlog | `roadmap/backlog.md` |
| Conversation prompts | `prompts/` |
| Design tokens | `design/tokens.css` |
| Tailwind config | `design/tailwind.config.js` |
| Visual reference (prototypes) | `prototypes/*.html` |

## Tech stack (don't deviate without ADR)

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui (selectively).
- **Backend:** Next.js API routes + tRPC + Zod.
- **Database:** Postgres 16 on Supabase. **Multi-tenant via Row-Level Security (RLS) on a single schema with `tenant_id` column.** See ADR-001.
- **Vector:** pgvector for embeddings. No Neo4j in MVP.
- **Auth:** Stytch magic links (no SSO in MVP). JWT contains `tenant_id`.
- **LLM:** Anthropic Claude Sonnet via API, abstracted through `services/llm/`.
- **Conversation:** Service inside the Atlas codebase (`services/conversation/`). NOT a separate package, NOT branded externally — it's prompt engineering + state machine + Claude API.
- **Email:** Resend.
- **Workers:** Inngest for scheduled tasks.
- **File storage:** Supabase Storage.
- **Observability:** OpenTelemetry → Highlight or Datadog.
- **Deployment:** Vercel (frontend + API) + Supabase (DB) + Inngest Cloud.

## Project conventions

### Code
- **Strict TypeScript.** No `any` without `// eslint-disable-next-line` and a reason.
- **Server actions for mutations** when single-step. tRPC for everything else.
- **Zod schemas** for every API input AND every LLM output (validate before use).
- **Functional components only.** No class components.
- **Co-locate** test files next to source: `foo.ts` + `foo.test.ts`.
- **No barrel files** (no `index.ts` re-exports). Direct imports.

### Naming
- **Routes:** lower-kebab (`/discovery/sprints/[sprintId]`).
- **Components:** PascalCase (`SprintHeader.tsx`).
- **Hooks:** camelCase (`useSprintProgress.ts`).
- **DB tables:** snake_case, plural (`sprints`, `opportunities`).
- **tRPC procedures:** camelCase verbs (`sprint.create`, `opportunity.approveForFde`).

### Multi-tenancy is the default — RLS pattern
- **Every table has `tenant_id uuid NOT NULL`.**
- **Every table has RLS policies** `USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`.
- **Service-role bypass** allowed only inside Inngest workers + audit-logged.
- **PR rule:** any PR that touches RLS policies requires 2 engineer approvals.
- **Adversarial test required:** every new table gets a test that tries to read another tenant's row → expects 0 rows.
- **No bypass via service role** in tRPC procedures — go through user JWT.

### Privacy by design
- IC quotes are **never** displayed with the IC's name in the manager UI. Only role.
- Internal records DO link quote → contributor, but only used for the IC's own edit window + Twistag debugging.
- Do not log full conversation transcripts to general application logs.

## How to pick up work

1. Open `roadmap/milestones.md` to see what milestone we're in.
2. Open `roadmap/sprints.md` for the active sprint backlog.
3. Pick a ticket — usually start with the highest-priority unblocked one.
4. Each ticket has: acceptance criteria, references (prototypes, prompts, schemas), and DoD.
5. If a ticket needs design clarification, check `prototypes/` first. If still unclear, propose in a `## Questions` section at the bottom of the ticket and move on.

## What NOT to build (Wave 1)

- Slack/Teams integration → v1.5, not Wave 1
- Voice (Whisper, ElevenLabs) → v1.5
- SSO (Entra, Google, Okta) → magic link is enough for Wave 1
- System signal connectors (Salesforce, HubSpot, etc.) → v2
- Cross-portfolio insights → v2 (need >5 clients first)
- Mobile-native apps → never (mobile-responsive web is fine)
- Pull capability ("ask Atlas a question") → v2
- Document connectors (Notion, Drive) → v2, manual upload only in Wave 1
- Vertical specialization → v2
- Reflective layer (auto-KPI tracking post-deploy) → v2
- **Atlas Core/Ship/Portfolio subscriptions** → v1.5 (Sprint mode only in Wave 1)
- **White-label channel partnerships** → not in roadmap (direct sales only)

## Style guide

- **Voice:** Honest, specific, no corporate-speak. No "leverage", "unlock", "seamless", "robust", "empower", "game-changer", "cutting-edge".
- **Copy in UI:** Short. Active voice. Direct.
- **Error messages:** Tell the user what happened and what they can do. No "Something went wrong."
- **Empty states:** Pair-friendly. Show what would normally be here + how to get there.
- **Numerical promises:** Calibrated to reality. "5-10 opportunities surfaced per sprint, 1-3 high-impact." NEVER "12 opportunities, 3 high-impact" — that math doesn't hold.

## When in doubt

- Match the prototype.
- If the prototype doesn't show it, look at how Linear, Vanta, or Thoropass solve it.
- If you have to choose between adding a feature and shipping the milestone, ship.
- If a decision feels architectural, write an ADR in `docs/adrs/` before implementing.

## Status updates

After each significant ticket:
1. Update the ticket status in the sprint file.
2. If you discovered something material, append a `## Findings` section.
3. If you added new tickets, add them to `roadmap/backlog.md` first, then promote to a sprint when ready.

---

**Default behaviour when unsure:** ask in a PR description, not in code comments. Code comments age badly.
