# Opportunity Scoring Rubric

> Five dimensions, each 0-10. Composite weighted average. Auto-rationale required.

---

## Dimensions

### 1. Financial impact (weight 0.30)

**Question:** Estimated annual $ impact if shipped.

| Score | Range | Examples |
|---|---|---|
| 9-10 | $500K+/yr | Margin recovery on enterprise deals; major cycle time uplift on big revenue process |
| 7-8 | $200K-$500K/yr | Quick win in pricing leakage; significant ops efficiency |
| 5-6 | $75K-$200K/yr | Visibility tooling; mid-friction automation |
| 3-4 | $25K-$75K/yr | Documentation gap; minor process gap |
| 1-2 | <$25K/yr | Nice-to-have polish |

**Source of estimate:**
- Required: at least 2 of (a) IC quote with frequency × cost-per-incident, (b) system signal corroborating frequency, (c) cross-portfolio pattern match
- If estimate sourced from one signal only → cap confidence at 0.6

### 2. Time to ship (weight 0.15)

**Question:** How fast can a Twistag FDE pod ship a working v1?

| Score | Range | What that means |
|---|---|---|
| 9-10 | 1-2 weeks | Quick win, no data prep, low dependencies |
| 7-8 | 3-4 weeks | Standard build, light data prep |
| 5-6 | 5-8 weeks | Moderate integration work or data cleanup |
| 3-4 | 9-16 weeks | Significant integration, multiple systems |
| 1-2 | 16+ weeks | Heavy data foundation, multi-stakeholder rollout |

### 3. AI-suitability (weight 0.20)

**Question:** Is this AI-shaped, or is it workflow redesign that doesn't need AI?

| Score | Range | What that means |
|---|---|---|
| 9-10 | Pure AI play | Unstructured data → structured signal; agentic decisioning; doc summarization |
| 7-8 | AI-augmented | Mostly workflow, but AI accelerates a key step |
| 5-6 | Hybrid | Rules-based with AI exception handling, or vice versa |
| 3-4 | Workflow first | AI is decorative; redesign is the real work |
| 1-2 | No AI fit | Should ship without AI — process or tooling change |

> Note: low AI-suitability doesn't mean low value. Some of the best opportunities are workflow redesigns. But score honestly so the SOW reflects reality.

### 4. Change management cost (weight 0.15)

**Question:** How disruptive is the change to people / process / approvals?

| Score | Range | What that means |
|---|---|---|
| 9-10 | Negligible | Internal only, no user-facing change |
| 7-8 | Low | Affects 1 team, training is light |
| 5-6 | Medium | Affects 2-3 teams, requires sponsor visibility |
| 3-4 | High | Cross-functional, retraining required |
| 1-2 | Major | Org change, role-redesign, layoffs adjacent |

### 5. Dependency depth (weight 0.20)

**Question:** Can this ship standalone, or does it need foundation work first?

| Score | Range | What that means |
|---|---|---|
| 9-10 | Standalone | No prerequisites, can start tomorrow |
| 7-8 | Light prereqs | Need 1-2 access approvals or minor data |
| 5-6 | Some prereqs | Need data clean-up phase before build |
| 3-4 | Heavy prereqs | Need foundation engagement first (separate SOW) |
| 1-2 | Blocked | Need major investment elsewhere first |

## Composite calculation

```
composite = 
  0.30 * financial +
  0.15 * time_to_ship +
  0.20 * ai_suitability +
  0.15 * change_mgmt +
  0.20 * dependency
```

## Confidence multiplier

Confidence is a separate 1-5 score (also called "evidence depth"). It does NOT scale the composite directly, but is shown alongside.

| Confidence | What it means |
|---|---|
| 5 (Very high) | ≥3 distinct contributors, ≥2 system signals, prior pattern match exists |
| 4 (High) | ≥2 contributors AND (system signal OR pattern match) |
| 3 (Medium) | Multiple contributors, no corroborating signal |
| 2 (Low) | Single contributor mention, no corroboration |
| 1 (Very low) | Inferred or weak signal — usually filtered out |

Opportunities with confidence ≤2 don't surface to the sponsor automatically. They live in a "weak signals" view for Twistag-side review.

## Auto-rationale generation

After scoring, generate a paragraph rationale that includes:

1. **One-sentence opportunity summary** (re-stated)
2. **Top 2-3 supporting captures** with role attribution
3. **System signals** if any
4. **Pattern matches** if any
5. **Main uncertainty** — what we don't know yet
6. **Recommended next step** — Approve / Defer / Foundation first

Prompt template:

```
You are summarizing the rationale for a discovered opportunity at {tenant_name}.

OPPORTUNITY: {title}
DESCRIPTION: {description}
SCORE: {composite} / 10, confidence {confidence}/5

SUPPORTING CAPTURES (top 5 by weight):
{captures_list}

SYSTEM SIGNALS:
{signals_list}

PATTERN MATCHES:
{patterns_list}

Write a 100-150 word rationale that:
1. Restates the opportunity in one sentence
2. Cites 2-3 captures (role + brief paraphrase, no individual names)
3. Mentions any corroborating signals or patterns
4. Names the single biggest uncertainty
5. Ends with a recommended next step (Approve for FDE / Defer / Foundation first / More investigation needed)

Tone: honest, not over-confident. The reader is a sponsor making a decision.
Avoid corporate language. No marketing-speak.
```

## Delivery path (build vs buy vs configure)

Pick the honest delivery path for each opportunity. Atlas is owned by a services
firm, so recommending **buy** or **configure** when that's right is a trust
signal — never manufacture build work.

- **build** — needs a custom FDE build; no mature off-the-shelf product fits.
- **buy** — a mature vendor product already solves this; the work is selection +
  integration, not building.
- **configure** — solvable by configuring/automating a system the client already
  owns (no new build, no new vendor).

Give a one-sentence `deliveryRationale` naming the deciding factor (e.g. "mature
CPQ vendors cover this end to end" → buy).

## Examples

### Example: High-confidence high-impact

> **Title:** Automate enterprise pricing pre-approval workflow
> **Composite:** 7.9 / Confidence 4
> **Rationale:** VP Sales is the gating decision-maker for all custom enterprise pricing. Quotes wait 2-4 days; when blocked, AEs ship list-price quotes that erode margin. 11 captures across 7 contributors corroborate the pattern. Salesforce data shows 38% of Q2 opportunities sat in 'Pending pricing approval' ≥48hrs. Industrial services portfolio comparable achieved -71% cycle time. Main uncertainty: exact share of cases auto-routable (likely 65-75%). **Recommended next step:** Approve for FDE engagement, 4 weeks, $72K + outcome bonus.

### Example: Lower-confidence opportunity

> **Title:** Centralize CS escalation playbook
> **Composite:** 5.4 / Confidence 2
> **Rationale:** Two CS managers mentioned that escalations go to different exec sponsors depending on customer tier and product. No formal escalation matrix. Limited corroboration — only 2 mentions in the sprint, no system signal yet. Could be high-impact for tier-1 churn risk but evidence is thin. **Recommended next step:** More investigation needed. Suggest a 1-week follow-up with CS lead before scoring further.
