# Run Atlas locally

How to bring up the full app on your machine and click through everything,
including the engine work from the 2026-06-15 session (plan 028).

> The app **requires Supabase Auth** — every page goes through
> `getSession()` → `supabase.auth.getUser()`, and even `/sign-in/dev` mints a
> Supabase session. There is no DB-only auth path, so you need a Supabase
> project (cloud free tier, or a local `supabase start` stack) plus its Postgres.

## 1. Configure env

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Key | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (seed + workers) |
| `DATABASE_URL` | Postgres connection string the app uses (Supabase pooler, port 6543, is fine) |
| `DIRECT_URL` | **Recommended** — a direct/session connection (port 5432) used **for migrations**. Supabase's transaction pooler (6543) can't run the multi-statement DDL transactions migrations use. Settings → Database → Connection string → "Session". |
| `ANTHROPIC_API_KEY` | **Recommended** — needed for the conversation engine, opportunity recompute, and CTX-2/CTX-3 enrichment. Without it those panels stay empty. |

> ⚠️ **You must run migrations before starting the app.** `npm run dev` on its
> own does **not** migrate — if the DB is behind, you'll get errors like
> `column "synthesis_memo" does not exist`. Use `./scripts/dev-up.sh` (it
> migrates first) or run `npm run db:migrate` yourself. The runner applies every
> `db/migrations/*.sql` not yet in the `schema_migrations` table, so on an
> existing DB it just applies the new ones (`0010–0019`).

## 2. One command

```bash
./scripts/dev-up.sh
```

That runs `npm install` → `npm run db:migrate` (applies migrations **0001–0019**)
→ `npm run db:seed:dashboard` (Northwind demo tenant + sprint + opportunities)
→ `npm run dev`.

Prefer to do it by hand:

```bash
npm install
npm run db:migrate
npm run db:seed:dashboard
npm run dev
```

## 3. Sign in

Open `http://localhost:3000/sign-in/dev` and pick a seeded persona (Twistag
staff, or a manager/sponsor/IC of the Northwind tenant).

## 4. Where this session's work shows up

- **Twistag → a client → Context tab** — CTX-1/2/4 + the admin UI: *Enrich from
  web* (CTX-2), *Ingest document* (CTX-3), *Approve draft* (draft→active).
- **Manager dashboard (a sprint)** — new panels: **Pilot portfolio** (A),
  **Adoption risk by department** (E), **Systems & shadow IT** (F),
  **Stakeholder map** (B). Opportunity cards show **horizon** (D) +
  **delivery** (C) chips.
- **Report page** — the **Synthesis** memo section (G) + a horizon-split roadmap.

### Populate the synthesis panels

The synthesis tables (portfolio, stakeholders, systems inventory, synthesis
memo, sprint themes) are produced by **recompute**, an LLM pass — they are not
seeded. With `ANTHROPIC_API_KEY` set:

- Sign in as **Twistag** → open the client → click **Recompute**. This clusters
  + scores the seeded captures and fills the portfolio / stakeholder / systems
  panels and (on sprint close) the synthesis memo.

Without `ANTHROPIC_API_KEY`, the base dashboard, seeded opportunities, and the
report render, but the LLM-derived panels show their empty states.

## Notes

- **Migrations are required** before the app will run against a DB that predates
  this session — `0010–0019` add the financial-signal columns, company context,
  horizon, delivery, portfolios, systems inventory, stakeholders, synthesis
  memo, sprint themes, and documents.
- The CTX-3 document path here is **paste-text**; binary file upload (Supabase
  Storage) + PDF/DOCX parsing are tracked follow-ups.
