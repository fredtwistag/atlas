-- Ticket G — board-ready synthesis memo, cached on the sprint.
--
-- Generated once at sprint close from the portfolio (A), stakeholders (B), and
-- adoption risk (E). Stored as jsonb on the existing sprints table — additive,
-- nullable, no RLS change (inherits sprints policies).

ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS synthesis_memo jsonb;
