# Discovery Rubric — the 4-arc framework

> The IP. Every session follows this structure. Adapted per role; never skipped.

---

## Master rubric

A discovery session = **4 arcs × (1 anchor + up to 2 probes)**.

```
ARC 1: WORKFLOW WALKTHROUGH
├── Anchor: "Walk me through what happens from [trigger] to [outcome]."
├── Probe A: missing step?
├── Probe B: hidden actor?
└── Outcome: structural map of the process

ARC 2: FRUSTRATION MINING
├── Anchor: "Where does this slow down or get frustrating in practice?"
├── Probe A: quantify (how often, how much time/money)
├── Probe B: concrete instance (last time it happened)
└── Outcome: pain map with measurable impact

ARC 3: EDGE CASES & EXCEPTIONS
├── Anchor: "What does the team do when the standard process doesn't apply?"
├── Probe A: workaround used (Excel, shadow tool, DM)
├── Probe B: tribal knowledge surface (who knows what)
└── Outcome: list of workarounds + risk areas

ARC 4: TOOLS & CONSTRAINTS
├── Anchor: "What tools do you use most? Which ones do you fight with?"
├── Probe A: counterfactual (what if X went away)
├── Probe B: missing connection (where do systems fail to talk)
└── Outcome: tooling gap map
```

## Probe budget

- 2 probes per arc max
- If user gives complete answer to anchor, advance without probing
- If user signals "let's move on", advance without using probe budget

## Closing message template

After Arc 4 completes:

> "Thanks {name}. That's helpful. I've captured {n_captures} things from this conversation — you can review them in your dashboard within the next 7 days if anything needs editing.
> Your next session — {next_topic_title} — opens {next_date}. ~{next_duration} minutes.
> See you then."

## When to abort gracefully

If any of these happen, end the session early and log:
- User explicitly says they want to stop ("not now", "can we do this another time")
- User shares sensitive PII unprompted (third-party data, legal matters, HR-confidential)
- User goes >3 turns off-topic without engaging the current arc

Closing message in those cases: short, no judgment, link to dashboard to resume or skip.
