# ADR-004 — Company context enrichment via Claude's web search tool

**Status:** Accepted
**Date:** 2026-06-15
**Context tickets:** CTX-1 (store), CTX-2 (this), CTX-4 (injection)

## Context

When Twistag creates a client org, Atlas has zero context about the company —
the conversation prompts are org-agnostic (pre-CTX-4). The fastest way to seed
the `company_context` profile (CTX-1) is a web lookup of the company's public
profile (industry, business model, size, likely systems).

This is a new external capability, so it needs a decision record (CLAUDE.md:
"If a decision feels architectural, write an ADR").

## Decision

**Use Claude's built-in web search tool through the existing `services/llm/`
abstraction**, rather than a dedicated third-party search API (Tavily/Brave).

- **No new vendor, no new secret.** We already call Anthropic for every LLM
  operation; web search is a *server-side tool* Anthropic executes — we add it
  to the `tools` param of the existing `messages.create` call and get back a
  normal completion. There is **no manual tool-use loop** and, critically, **no
  new outbound network egress from the Atlas app** (the search runs on
  Anthropic's servers over the connection we already make). This means the
  environment network policy needs **no change** for CTX-2.
- **Single LLM path + cost tracking preserved.** The call goes through the same
  `client()` + `createMessage` chokepoint, so `llm_calls` cost tracking and the
  Sentry/`llm.call.failed` hotspot continue to apply.
- A dedicated search API was rejected: it adds a vendor, an API key, new egress
  (a network-policy change), and a second failure surface — for no benefit over
  Claude's first-party tool here.

## Human-in-the-loop (safety)

Enrichment is **public information only** and is **never auto-trusted**:

1. Twistag triggers enrichment for an org (not automatic on creation).
2. The result is written to `company_context` with `status = 'draft'` and the
   `sources` cited.
3. **CTX-4 only injects `status = 'active'` context into prompts/scoring**, so a
   draft (unreviewed) profile can never reach an IC.
4. A Twistag reviewer approves (flips to `active`) — optionally after editing.

Every enrichment call is audit-logged (action `company_context.enrich`).

## Consequences

- The web-search tool call itself can only be exercised against a live Anthropic
  key with the tool enabled; the surrounding code (param assembly, JSON parse,
  Zod validation, draft persistence, audit) is unit-tested at the seam with a
  mocked client.
- If Anthropic changes the web-search tool name/version, the change is isolated
  to one function in `services/llm/client.ts`.
- Artifact-upload context (CTX-3) is a complementary source feeding the same
  `company_context` profile.
