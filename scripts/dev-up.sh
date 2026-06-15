#!/usr/bin/env bash
#
# Local dev bring-up for Atlas (see docs/runbooks/run-locally.md).
# Applies migrations, seeds the demo dashboard, and starts the dev server.
#
# Prereq: a .env.local with your Supabase + DB creds (the app needs Supabase
# Auth to run — there is no DB-only auth path). Required keys:
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL
# Recommended (for the new LLM features): ANTHROPIC_API_KEY
#
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "✗ .env.local not found. Copy .env.example and fill in your Supabase + DB creds:"
  echo "    cp .env.example .env.local   # then edit it"
  exit 1
fi

missing=()
for key in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY DATABASE_URL; do
  grep -qE "^${key}=." .env.local || missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "✗ .env.local is missing required keys: ${missing[*]}"
  exit 1
fi

if ! grep -qE "^ANTHROPIC_API_KEY=." .env.local; then
  echo "⚠ ANTHROPIC_API_KEY not set — the conversation engine, opportunity recompute,"
  echo "  and CTX-2/CTX-3 enrichment won't work (those panels stay empty). Continuing."
fi

echo "→ Installing dependencies…"
npm install

echo "→ Applying migrations…"
if ! npm run db:migrate; then
  echo ""
  echo "✗ Migrations failed. The most common cause is pointing DDL at the Supabase"
  echo "  transaction pooler (port 6543). Add your DIRECT (session, port 5432)"
  echo "  connection to .env.local and re-run:"
  echo "    DIRECT_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
  echo "  (Leave DATABASE_URL as-is for the app.)"
  exit 1
fi

echo "→ Seeding the demo dashboard (Northwind tenant + sprint + opportunities)…"
npm run db:seed:dashboard

echo ""
echo "✓ Ready. Starting the dev server on http://localhost:3000"
echo "  • Sign in at http://localhost:3000/sign-in/dev (pick any seeded persona)"
echo "  • To populate the new synthesis panels (portfolio / stakeholders / systems /"
echo "    memo / themes), sign in as Twistag → open the client → click Recompute"
echo "    (needs ANTHROPIC_API_KEY)."
echo ""
npm run dev
