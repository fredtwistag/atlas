-- Ticket C — opportunity delivery path (build vs buy vs configure).
--
-- A capability-gap classification the model produces per opportunity so the
-- report can honestly recommend buying/configuring instead of always building,
-- and so the SOW draft scopes a vendor-selection engagement for `buy`.
-- Additive + defaulted — no RLS change (inherits opportunities policies).

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS delivery           text NOT NULL DEFAULT 'build',
  ADD COLUMN IF NOT EXISTS delivery_rationale text NOT NULL DEFAULT '';
