# Probe Patterns Library

> The probe = the second turn after a vague answer. Quality of probes determines signal quality.

---

## Decision: when to probe

After every user message, run a quick LLM judge:

```
Is the user's response specific enough that I can extract:
- A measurable impact (numbers, time, frequency)? OR
- A concrete instance (named situation)? OR
- A clear structural pattern?

If YES → advance to next anchor question.
If NO → choose one probe pattern from the library below.
If user signals they want to move on → advance without probing.
```

---

## Pattern A — Quantify

**Trigger phrases:** "a lot", "sometimes", "kinda", "fairly often", "now and then", "you know..."

**Templates:**
- "When you say [vague]: roughly how many times a [week/month]?"
- "How much time would you say [issue] costs you personally over a typical month?"
- "Is that 'every deal' frequency, or 'every quarter' frequency?"

**Stop after 1 probe** — if they remain vague, accept it as soft signal and move on.

---

## Pattern B — Concrete instance

**Trigger:** generalization without an example. "We usually do X." "It typically goes like..."

**Templates:**
- "Can you walk me through a recent example? Maybe the last time this happened?"
- "What's a specific case you remember vividly?"
- "Could you tell me about the most painful version of this from the last quarter?"

**Why:** concrete examples produce much higher-quality captures than generalizations.

---

## Pattern C — Hidden actor

**Trigger:** passive voice. "Then it gets approved." "It goes to finance."

**Templates:**
- "Who's doing the approving at that step?"
- "When you say 'it goes to finance' — is that always the same person, or does it depend?"
- "Is there someone whose name comes up a lot at that stage?"

**Why:** decision dependencies live in named people, not in "the team."

---

## Pattern D — Workaround surfacing

**Trigger:** mention of friction without describing the unofficial fix. "This part always breaks." "We hate when X happens."

**Templates:**
- "When [standard process] doesn't work, what do you actually do? The unofficial fallback."
- "Is there a workaround the team has unofficially adopted for that?"
- "Where does the team rely on something outside the formal process to get through?"

**Why:** workarounds = where the highest-impact opportunities hide. People rarely volunteer them — they feel like confessions.

---

## Pattern E — Counterfactual

**Trigger:** complaint about a constraint or tool.

**Templates:**
- "If [constraint] weren't there, what would you do differently?"
- "Imagine [tool] just stopped working tomorrow — what would happen?"
- "If you had to convince the CEO to remove [constraint], what would your one-sentence pitch be?"

**Why:** counterfactuals separate real friction from venting.

---

## Pattern F — Tribal knowledge surface

**Trigger:** "You have to ask [person]." "It depends on context." "Bob knows that one."

**Templates:**
- "Is [thing/process] documented anywhere, or does it live in [person]'s head?"
- "If [person] left or was out for 3 weeks, what would happen?"
- "How does someone new on the team learn this?"

**Why:** flags single-point-of-failure knowledge that ages out → highest priority opportunities.

---

## Pattern G — Cross-functional friction

**Trigger:** mention of another department or role with frustration. "Finance always..." "Sales pushes us..."

**Templates:**
- "Where exactly does [other dept]'s process touch yours, and where does it break?"
- "Have you and [other dept lead] talked about this, or is it more of a silent annoyance?"

**Why:** opportunities at department boundaries are usually higher-impact and politically tractable than within-department ones.

---

## Pattern H — Magnitude sanity check

**Trigger:** user gives a number that seems implausible (very high or very low).

**Templates:**
- "Just to confirm — [number] [units]? That's a meaningful gap from what I'd expect; want to double-check the order of magnitude?"

**Why:** prevents LLM hallucination by giving the human a chance to correct. **Use sparingly** — not for every number, only when extreme.

---

## When NOT to probe

- User has given a complete answer (specifics + impact + structural clarity)
- User explicitly says "let's move on" or similar
- The conversation has been going more than 8 turns and we still have arcs to cover
- Probe budget for this arc is exhausted (2 probes used)
- User seems frustrated by previous probes — read the room

## Bad probes (avoid)

- "That's interesting — tell me more." (too open)
- "Why do you think that is?" (philosophical, time waster)
- "How does that make you feel?" (we're not therapists)
- Repeating their answer back as a question ("So you're saying X?") — wastes time

## Eval criteria for probes

A probe is "good" if:
1. It produces a measurably more specific answer in the next user turn
2. The user doesn't ask "what do you mean?" (signals unclear probe)
3. It doesn't introduce a new tangent (stays on the current arc)
4. The probe takes ≤25 tokens to express

Reviewed weekly on production samples; bad probes feed back into prompt refinements.
