# 05 — Pilot Playbook

> How to onboard, run, and learn from the first 3 pilots.

---

## 1. Pilot criteria

Each of the 3 pilots must satisfy:
- ✅ Sponsor with decision authority (CEO or direct delegate)
- ✅ Single department scope (no cross-functional v1)
- ✅ Manager + 8-20 IC contributors identified upfront
- ✅ Willingness to give feedback weekly
- ✅ Contract signed before kickoff (template in `legal/`)

### Recommended pilot mix
- **Pilot 1 — Mid-market operator** ($50-200M revenue, founder-led)
- **Pilot 2 — PE portco** (post-close, 100-day window, sponsor warm intro)
- **Pilot 3 — SaaS scale-up** (Series A-C, CTO buyer, product-building partnership angle)

## 2. Ground truth workshop (PRE-pilots, week 0)

Before pilots, before Sprint 01 of build — we need ground truth for the eval framework. Twistag's past consulting engagements weren't structured discovery sessions, so we build the dataset ourselves.

### Workshop format (1-2 days)
- 5-8 Twistag people split into pairs
- Each pair role-plays a discovery session:
  - One person plays the IC (a specific role: CFO, Sales Ops, Engineer, etc.)
  - The other plays Atlas (asks questions following the 4-arc rubric)
- Sessions recorded via Zoom
- Each session covers one topic (Quote-to-cash, Exception handling, Tools, One change)
- Target: 10 transcribed sessions covering all 4 roles × 4 topics (some overlap)

### After workshop
- Whisper transcribes each recording
- Senior Twistag (engagement lead) reviews each transcript and manually identifies:
  - What captures Atlas should have extracted (kind + summary + source quote)
  - Where the probes were good vs bad
  - Where the bot went off-arc
- Outputs become `evals/ground-truth/` files used by CI eval gate

### Outcome
- 10 ground-truth conversations
- 80-150 ground-truth captures
- Eval framework can run from week 2 of build

### Iteration
- After pilot 1, augment ground truth with 3 real session transcripts (manually reviewed + anonymized)
- After pilot 2, add 3 more
- By pilot 3, ground truth = 16+ sessions and is statistically meaningful

## 3. Pricing for pilots

| Item | Standard | Pilot | Notes |
|---|---|---|---|
| Sprint fee | $25-95K | **50% off** | 50% off list price, on the condition of 6-week feedback commitment |
| FDE engagement (if surfaced) | Standard | Standard with 10% discount | No deeper discount; outcome-bonus tied to ROI |
| Second sprint within 12 months | Standard | 20% off | Drives return rate metric |

**Why this structure:**
- Reduces friction to "yes" without giving away the product
- Forces real commitment from sponsor (feedback obligation)
- Keeps FDE engagement margin healthy
- Return discount drives second-sprint metric

## 4. Onboarding sequence (target 14 days from contract → sprint launch)

### Day -7 to 0 (Pre-kickoff)
- [ ] Contract signed (incl. DPA)
- [ ] Sponsor + manager identified
- [ ] Tenant created in Atlas
- [ ] Internal Slack channel set up with sponsor
- [ ] Twistag engagement lead assigned

### Day 0 — Kickoff
- [ ] 60-min kickoff call with sponsor + manager
- [ ] Walk through the product live
- [ ] Decide topic mix (default 4 vs custom)
- [ ] Confirm participant list (manager pulls together)
- [ ] Set timeline (3-4 weeks default)

### Day 0-3 — Sprint setup
- [ ] Manager runs through sprint setup wizard with engagement lead on Zoom
- [ ] Validate participants imported, privacy disclosure reviewed
- [ ] DPA review with client IT/security if required

### Day 3-5 — Soft launch
- [ ] Manager sends internal heads-up to the team (template provided)
- [ ] Sponsor sends executive endorsement message
- [ ] Atlas sends magic-link invites

### Day 5-7 — First sessions
- [ ] First sessions complete
- [ ] Engagement lead reviews initial transcripts manually
- [ ] If any issues, intervene immediately (prompt tuning, manager nudge, etc.)

### Day 7-21 — Sprint in progress
- [ ] Daily monitoring of WAC, completion rate, captures
- [ ] Weekly check-in with manager (30 min)
- [ ] Twistag-side reviews on signal quality

### Day 21-28 — Sprint completion
- [ ] All sessions complete
- [ ] Opportunities surfaced
- [ ] Sponsor reviews opportunities with engagement lead
- [ ] First SOW drafted for approved opportunity
- [ ] Final report delivered

### Day 28-45 — Conversion conversation
- [ ] Second-sprint and FDE engagement conversations
- [ ] Project kickoff for any approved FDE work
- [ ] Pilot retrospective with sponsor

## 5. Risk monitoring during pilot

### Critical metrics (intervene if hit)

| Metric | Threshold | Intervention |
|---|---|---|
| WAC (week 1) | <50% | Engagement lead joins next manager 1:1 |
| WAC (week 2-3) | <30% | Pause invitations; root-cause with sponsor |
| Completion rate at sprint end | <40% | Flag for product issue; do NOT bill full rate |
| Signal quality avg (manual review) | <3.5/5 | Prompt tuning sprint; freeze new pilots until fixed |
| Sponsor NPS | <20 | CEO-level conversation; recovery plan |

### Failure protocol
If a pilot looks like it will fail:
1. **Be honest fast.** Don't run out the clock.
2. Refund pro-rata if appropriate.
3. Postmortem inside Twistag within 7 days.
4. Don't repeat the same pattern in subsequent pilots.

## 6. Communication cadence per pilot

| Cadence | What | Who |
|---|---|---|
| Weekly | 30-min check-in with manager | Engagement lead |
| Bi-weekly | 20-min sync with sponsor | Engagement lead + Twistag account manager |
| Daily (first 2 weeks) | Async Slack status | Engagement lead |
| Mid-sprint | Internal Twistag review | Engagement lead + product lead |
| End of sprint | Sponsor presentation of opportunities | Engagement lead |

## 7. Onboarding templates

### Sponsor kickoff agenda (60 min)
1. Atlas overview — 5 min
2. What we'll do together in the next 3-4 weeks — 10 min
3. Pick scope + topics — 15 min
4. Participants confirmation — 10 min
5. Privacy + data handling Q&A — 10 min
6. Communications cadence + escalation — 5 min
7. Next steps — 5 min

### Manager kick-off message (template)

> Subject: Quick heads-up before you hear about Atlas
>
> Hi team,
>
> Over the next 3-4 weeks we're running an internal exercise to map how our {department} process actually works. The goal is to figure out where time is going so we can fix the parts that frustrate us most.
>
> You'll get an email tomorrow from "Atlas" with a magic link. It'll ask you 4 short questions over the next 3 weeks — each takes about 5 minutes.
>
> Your answers are aggregated and won't be used to evaluate you. I'll only see themes, not individual quotes attributed to you. You can edit anything you said within 7 days, or skip questions.
>
> If you have questions, ping me directly. The Twistag team running it is also available — their lead is {engagement_lead_name}.
>
> Thanks for the time — this should make our work better, not waste it.
>
> {Manager}

### Sponsor exec endorsement (template)

> Team,
>
> {Manager} is running a 3-4 week initiative I've signed off on, using a tool called Atlas to map how our {department} actually operates. The output will be a concrete plan for what to invest in next.
>
> Please give it the same care you'd give a customer-facing project. The whole thing takes you ~20 minutes total spread over 3 weeks.
>
> Thanks,
> {CEO}

## 8. Post-pilot debrief

### What we measure for each pilot
1. **Engagement metrics:** WAC, completion, time-per-session
2. **Quality metrics:** signal quality reviews, # opportunities surfaced (target 5-10), # approved
3. **Business metrics:** time-to-first-SOW, FDE conversion, expansion conversation triggered
4. **Sponsor sentiment:** NPS, renewal intent (likelihood of second sprint)
5. **Internal learnings:** what to change in product, prompts, GTM, onboarding

### Retrospective template (run within 7 days of sprint end)
1. Did the pilot meet the sponsor's expectations? (1-5)
2. What was the most useful capture?
3. What was the most painful moment of the engagement?
4. What surprised us about adoption?
5. What surprised us about signal quality?
6. What would we do differently in the next pilot?
7. Top 3 product / prompt / GTM changes to make
8. Decision: pursue second-sprint, end gracefully, or refund

## 9. Reference: typical pilot timeline

```
Week -1: contract + setup
Week 0:  kickoff + soft launch
Week 1:  first sessions, daily monitoring
Week 2:  mid-sprint check-in, first opportunities surfacing
Week 3:  sprint nearing complete, sponsor reviewing opportunities
Week 4:  final report, conversion conversation, SOW signed
Week 5-6: FDE engagement kicks off
```
