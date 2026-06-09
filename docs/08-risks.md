# 08 — Risks & Mitigations

> Honest list. Reviewed monthly. Update status / mitigations as we learn.
> Last reviewed: 2026-06-08 (post battle-test).

---

## P0 — Crisis-level (could end the product)

### R1 — Adoption fails inside clients (web-only is high-risk)
- **Probability:** High
- **Impact:** Critical
- **Why it matters:** Without IC engagement, no signal → no opportunities → no Atlas value. Web-only ups this risk vs Slack/Teams.
- **Mitigation:**
  - Manager-pulled enrollment (not IT-driven)
  - Mobile-responsive web with magic-link friction-free entry
  - Sponsor exec endorsement before invitations go out
  - WAC tracking from day 1
  - **Kill criterion: if completion <40% in pilot 1, halt + redesign before pilot 2**
  - Pilot pricing tied to outcomes (50% off if conversion to second sprint)

### R2 — Signal quality below "comparable to senior consultant interview"
- **Probability:** Medium
- **Impact:** Critical
- **Why it matters:** Sponsor sees junior-quality output, churns.
- **Mitigation:**
  - **Ground truth dataset built pre-Sprint-1 via internal workshop** (5-10 role-played sessions, transcribed via Whisper)
  - Eval framework from week 5 of build
  - Human review of every session in alpha (5% sample at scale)
  - Prompt iteration tied to eval metrics
  - **Calibrated promises:** 5-10 opps surfaced, 1-3 high-impact (NOT 12 / 3)

### R3 — Pilots don't convert to FDE engagements
- **Probability:** Medium
- **Impact:** Critical
- **Why it matters:** Atlas economics depend on FDE pull-through; Sprint revenue alone insufficient.
- **Mitigation:**
  - Conversion rate is a tracked metric, target ≥60% FDE attach in pilot 1
  - SOW drafts auto-generated and reviewed by Twistag-side
  - Pricing: Sprint discount only if commit to FDE engagement on top opportunity
  - Bonus-tied pricing on FDE engagements aligns incentives

### R4 — RLS policy bug = cross-tenant data leak
- **Probability:** Low
- **Impact:** Critical
- **Why it matters:** One wrong policy = data leak. Single biggest security risk.
- **Mitigation:**
  - Adversarial tests required on every PR (CI gate, see ADR-001)
  - 2-engineer review required for any PR touching RLS
  - Monthly policy audit (separate from feature work)
  - Read-only DB role for monitoring, never write
  - Annual external pen test focused on tenant isolation

## P1 — High impact

### R5 — Glean / Microsoft Copilot ships equivalent feature
- **Probability:** Medium
- **Impact:** High
- **Why it matters:** Free / bundled equivalent kills the wedge.
- **Mitigation:**
  - Atlas occupies "outbound-first" lane (asks questions, not just retrieves)
  - Speed of iteration: small focused team beats Microsoft committee
  - Differentiation lives in Twistag-side cockpit + FDE pull-through, neither of which Microsoft does

### R6 — Big Consulting / Vista clone the model
- **Probability:** Medium
- **Impact:** High
- **Why it matters:** $5M+ enterprise contracts go to who looks credible at scale.
- **Mitigation:**
  - We don't compete for $5M+ contracts; mid-market + lower-mid PE are the wedge
  - Twistag's product-building DNA (visible at twistag.com/case-studies) is a credibility differentiator

### R7 — Privacy / security review blocks deals
- **Probability:** Medium
- **Impact:** High
- **Why it matters:** Big enterprise deals stall on InfoSec review.
- **Mitigation:**
  - SOC2 Type 1 by month 14, Type 2 by month 22
  - GDPR-by-design from day 1
  - Trust center + Security one-pager ready by pilot 1
  - EU residency default for European clients
  - Adversarial tests as concrete proof of RLS isolation

### R8 — LLM cost runaway
- **Probability:** Low
- **Impact:** Medium
- **Why it matters:** Per-session cost above $1.50 erodes margin.
- **Mitigation:**
  - Cost tracking from day 1 (`llm_calls` table)
  - Per-tenant rate limits
  - Prompt iteration to reduce token usage
  - Fallback to cheaper models if Sonnet pricing rises

## P2 — Medium

### R9 — Eval framework reveals systematic bias
- **Probability:** Medium
- **Impact:** Medium
- **Why it matters:** Prompts might disadvantage non-native English speakers or certain accents.
- **Mitigation:**
  - Diverse ground-truth set (workshop sources)
  - Watch for outlier patterns in completion rates by department / role
  - Multilingual support roadmapped for v1.5

### R10 — Pilot client cycles longer than expected
- **Probability:** Medium
- **Impact:** Medium
- **Why it matters:** Slow sales cycle → lower revenue ramp → cash flow pressure.
- **Mitigation:**
  - Pilot pricing structure lowers commit friction
  - Sprint mode is the entry product; second sprint comes 6-9 months later
  - Cross-referral mechanics within Twistag commercial team

### R11 — Return rate (second sprint) below 40%
- **Probability:** Medium (in first year)
- **Impact:** Medium
- **Why it matters:** Without return engagements, revenue is purely net-new acquisition.
- **Mitigation:**
  - Sprint output (final report) creates organic moment for next-scope conversation
  - FDE engagement health metrics → expansion signal
  - Renewal conversation triggered at month 9 post-Sprint

### R12 — Founder distraction (Fred wearing too many hats)
- **Probability:** High
- **Impact:** Medium
- **Mitigation:** Hire product lead ASAP (Open Decision in PRD); founder focus on commercial + strategic.

## P3 — Lower priority

### R13 — Inngest / Vercel / Supabase pricing changes
- **Probability:** Low
- **Impact:** Low-Medium
- **Mitigation:** Each is replaceable; abstractions in place where critical (LLM service); track quarterly.

### R14 — Wave 1 pilots all in similar verticals
- **Probability:** Medium
- **Impact:** Low-Medium
- **Mitigation:** Intentional pilot diversity (1 mid-market, 1 portco, 1 SaaS scale-up).

### R15 — Ground truth dataset insufficient quality
- **Probability:** Medium
- **Impact:** Medium
- **Why it matters:** Eval framework only as good as ground truth. 5-10 role-played sessions may not generalize.
- **Mitigation:**
  - Augment with first 3 real pilot sessions (manually reviewed)
  - Iterative refinement of ground truth as patterns emerge
  - Twistag-side reviewer reviews 100% of alpha sessions

---

## Removed (no longer risks after architecture decisions)

- ~~R-old-7: Hermes brand confusion~~ — N/A. Conversation layer is just code in Atlas codebase, no Hermes brand externally.
- ~~R-old-10: Hermes engine ownership conflict~~ — N/A. No shared engine; YAGNI applied.

## Review cadence

- **Weekly:** P0 risks reviewed
- **Bi-weekly:** P1 risks reviewed
- **Monthly:** Full register reviewed; new risks added; resolved risks closed
- **Quarterly:** Risk methodology revisited
