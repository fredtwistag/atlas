# 03 — Conversation Service

> Atlas's conversational core. The IP is in the rubric, the role-adaptive prompts, and the scoring rubric — not the LLM.
> Implementation: `apps/web/server/services/conversation/`. Prompt engineering + state machine + Claude API. No separate package, no external brand.

---

## 1. Philosophy

- **Outbound, not retrieval.** Atlas asks the right questions — it doesn't search what exists.
- **4-arc rubric.** Each topic conversation walks through 4 specific arcs in order.
- **Role-adaptive.** What we ask a CFO is different from what we ask an AE.
- **Probe budget.** Maximum 2 follow-ups per arc to prevent dragging the session.
- **Extract continuously.** Every user turn triggers an extraction pass; the IC sees what was captured live in the side panel.
- **Honest about constraints.** If the user wants to skip a question, that's fine.

## 2. The 4-arc structure

Each topic conversation has 4 arcs, run sequentially:

### Arc 1 — Workflow walkthrough
**Goal:** Map how the work actually happens, step by step. The narrative spine.

**Opening question template:** "Tell me what happens from the moment [trigger event] up until [outcome]. Just talk it through like you'd explain it to a new hire."

**Probe targets:** missing steps, hidden actors (other people involved), undocumented decisions.

### Arc 2 — Frustration mining
**Goal:** Where does it hurt? Where is the rework loop?

**Opening question template:** "Where does this process slow down or get frustrating? Not the textbook frustration — the actual one that gets you complaining at lunch."

**Probe targets:** specifics ("when does this happen, how often"), measurable impact ("how much time/money does this cost").

### Arc 3 — Edge cases & exceptions
**Goal:** What happens when the standard process doesn't apply?

**Opening question template:** "What does the team do when the standard process doesn't work? Walk me through the most recent exception you handled."

**Probe targets:** workarounds (Excel, shadow tools, Slack DMs), escalation paths, tribal knowledge that lives in one person's head.

### Arc 4 — Tools & constraints
**Goal:** What's in the toolkit, and what's missing?

**Opening question template:** "What tools or systems do you actually use for this — and which ones do you fight with?"

**Probe targets:** workarounds in spreadsheets, systems people avoid, missing connections between systems.

## 3. System prompt — master (Conversation service)

```
You are Atlas, a discovery copilot helping {tenant_name} understand how work
actually happens across its teams.

You are running a conversational interview with {user_name}, who works as
{user_role} in the {user_department} department.

Your CURRENT TOPIC is: {topic_title}
{topic_description}

You are currently in ARC {arc_index} of 4: {arc_name}.
{arc_goal_explainer}

ARC HISTORY: {arcs_done}
PROBE BUDGET FOR THIS ARC: {probes_remaining} probes remaining out of 2.

RULES:
1. Ask ONE question at a time. Open-ended. Concrete.
2. If their answer is vague, probe ONCE for specifics — names, numbers,
   frequency, time impact. Use one of your probe budget if you do.
3. If they give a clear, complete answer, advance to the next sub-question or
   the next arc.
4. If they want to skip ("not sure", "let's move on"), accept it without
   pushing.
5. Never lecture. Never recommend solutions during the conversation.
6. Never repeat what they just said back to them in a long acknowledgement
   ("That's really interesting..."). Brief acknowledgements only.
7. Refer to specific people only by their role, not by name, in your
   responses. If the user names someone, you can use that name to follow up,
   but never invent names.
8. Tone: peer talking to peer. Short sentences. Conversational, not corporate.
9. After every 2 turns, summarize internally what you've captured so far
   (see CAPTURED state below).

CAPTURED SO FAR:
{captures_summary}

When you complete arc 4, output:
{ "type": "session_complete", "message": "...your closing message..." }

Your output for every other turn must be ONLY a single message to the user.
No commentary, no XML, just the message text.
```

## 4. Role-adaptive prompts

Each role gets a customized augmentation to the master prompt. See `prompts/role-prompts/` for the full files. Summary:

### IC (`ic-role-prompts.md`)
- Focuses on day-to-day workflow specifics
- Asks for concrete instances and numbers
- Uses peer language ("you", informal)

### Manager / Department Head (`manager-role-prompts.md`)
- Focuses on systemic issues across the team
- Probes for decision dependencies and approval chains
- Uses operational language (KPIs, throughput, blockers)

### CFO / COO / Sr Operator (`cfo-coo-role-prompts.md`)
- Focuses on margin impact and EBITDA bridges
- Probes for systemic risk and audit-trail concerns
- Uses financial language (cost, revenue, working capital)

### CEO / Sponsor (`ceo-sponsor-role-prompts.md`)
- Focuses on strategic constraints and big-picture friction
- Probes for what would change if {bottleneck} disappeared
- Briefer sessions (3 questions instead of 4)

## 5. Probe patterns

When the conversation service detects vagueness in a user response, it probes with one of these patterns:

### Pattern A — Quantify
- Trigger: vague frequency or impact ("a lot", "sometimes", "kinda")
- Probe template: "When you say [vague word] — roughly how many times a [week/month]? And about how long does each one take?"

### Pattern B — Concrete instance
- Trigger: generalization ("we usually do X")
- Probe template: "Can you give me a recent example? What happened in the last week or two?"

### Pattern C — Hidden actor
- Trigger: passive voice ("then it gets approved", "it goes to finance")
- Probe template: "Who's involved in [that step]? Same person each time, or does it depend?"

### Pattern D — Workaround surfacing
- Trigger: mention of friction without naming the workaround
- Probe template: "When [the standard process] doesn't work, what do you actually do? Like the unofficial fallback."

### Pattern E — Counterfactual
- Trigger: complaint about a constraint
- Probe template: "If [constraint] weren't there, what would change?"

### Pattern F — Tribal knowledge
- Trigger: "you have to ask [person]", "it depends on context"
- Probe template: "Is that documented anywhere, or does it live in their head?"

## 6. Extraction schema

Every user turn → extraction pass → structured captures.

```ts
const CaptureSchema = z.object({
  kind: z.enum([
    'bottleneck',      // Where the process slows down
    'workaround',      // Unofficial fix for a broken process
    'tooling',         // Tool/system reference (good or bad)
    'handoff',         // Coordination between roles or systems
    'frustration',     // Pain point without obvious workaround
    'sop',             // Standard operating procedure mentioned
    'decision',        // Decision/approval gate
  ]),
  summary: z.string()
    .min(15).max(280)
    .describe("First-person paraphrase of what was said. Active voice."),
  source_quote: z.string()
    .describe("The exact words the user used. Used for evidence display."),
  tags: z.array(z.string()).max(5)
    .describe("Short tags. e.g. ['margin risk', 'cross-functional', 'aging-out']."),
  confidence: z.number().min(0).max(1)
    .describe("How confident you are this is a real capture vs noise. <0.5 = drop."),
});
```

## 7. Opportunity surfacing

### When opportunities surface
- After every 5 new captures across the sprint, the surfacing job runs
- Day 0-7: opportunities have status `provisional` (don't show in manager dash until day 7)
- After day 7: surfaced opportunities visible to manager

### Surfacing algorithm
1. Cluster captures via embedding similarity within sprint
2. For each cluster with ≥3 captures from ≥2 distinct contributors:
   - Generate candidate opportunity title + description
   - Score across 5 dimensions
   - Match against `public.patterns` library
3. Persist as `opportunity` with status `surfaced`
4. Emit `opportunity.surfaced` event for downstream (notifications, Twistag-side update)

### Scoring rubric

Each dimension scored 0-10. Composite = weighted average.

| Dimension | Weight | What it measures |
|---|---|---|
| Financial impact | 0.30 | Estimated annual $ impact range |
| Time to ship | 0.15 | How fast can a FDE pod ship |
| AI suitability | 0.20 | Is this AI-shaped vs workflow redesign |
| Change mgmt cost | 0.15 | How disruptive is the change |
| Dependency depth | 0.20 | Standalone or needs other things first |

See `prompts/scoring-rubric.md` for the scoring prompts.

### Auto-rationale
Every opportunity stores `rationale` (text) that summarizes:
- Which captures support the impact estimate
- Which patterns matched
- Major uncertainties
- Recommended next step

## 8. SOW draft generation

Triggered by `opportunity.approved` event. Uses a template + LLM completion to fill in:
- Scope (1-2 paragraphs)
- Inclusions (bullet list)
- Exclusions (bullet list)
- Team (matched from Twistag-side capacity)
- Start date + duration
- Price (heuristic based on duration × team capacity)
- Outcome bonus (10-20% of base)
- Success metrics (3-5 measurable)

See `prompts/sow-draft-prompt.md`.

## 9. Evaluation framework

We need to measure conversation quality from day 1.

### Eval datasets
- **Ground truth set:** 10 role-played sessions built in pre-Sprint-1 workshop (Twistag people playing IC/manager/CFO/CEO roles), transcribed via Whisper, manually scored by senior Twistag. Grows iteratively with pilot transcripts (anonymized, with consent).
- **Adversarial set:** 10 synthetic transcripts designed to stress-test the rubric (vague answers, sensitive content, unrelated tangents).
- **Production sample:** randomly sampled 5% of live sessions, reviewed weekly by Twistag-side.

### Metrics
- **Coverage:** % of ground-truth captures Atlas extracted
- **Precision:** % of Atlas captures that ground-truth reviewers agreed with
- **Probe appropriateness:** % of Atlas probes rated "useful" by reviewer (binary)
- **Off-arc rate:** % of Atlas messages that wandered from the current arc

### Targets (week 16 alpha)
- Coverage ≥75%
- Precision ≥80% (calibrated from 85% — realistic for LLM extraction)
- Probe appropriateness ≥75%
- Off-arc rate ≤10%

### Eval running
- CI runs ground-truth eval on every prompt change
- Production sample eval runs weekly via Inngest cron + Twistag-side reviewer
- Drift alert: if any metric drops >5pp in a week, halt rollouts of prompt changes

## 10. Costs

Estimated per-session cost (Claude Sonnet, prompt + extraction + decision + response):
- Input tokens per turn: ~2,500
- Output tokens per turn: ~400
- ~10 turns per session
- Per-session: ~$0.40-$0.60

Per-sprint (1 client, 100 contributors × 4 sessions): ~$200.

**Cost watch:** if average per-session cost exceeds $1.50, escalate. Likely cause: runaway probe loops or prompt bloat.
