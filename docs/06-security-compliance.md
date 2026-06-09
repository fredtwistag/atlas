# 06 — Security & Compliance

> Privacy roadmap, SOC2 prep, GDPR coverage, what to never do.

---

## 1. Compliance roadmap

| Milestone | Target | Status |
|---|---|---|
| DPA template finalized | Week 6 | TODO |
| GDPR Article 30 register | Week 8 | TODO |
| SOC2 vendor selected | Week 10 | TODO |
| Penetration test (informal) | Week 12 | TODO |
| SOC2 Type 1 kickoff | Week 14 | TODO |
| SOC2 Type 1 closed | Month 12 | TODO |
| SOC2 Type 2 closed | Month 18 | TODO |
| ISO 27001 (stretch) | Month 18 | Stretch |
| HIPAA-readiness | When healthcare client signs | Conditional |

## 2. Data handling principles

### Principle 1 — Data minimization
- Atlas collects what it needs to surface opportunities; nothing more
- No social graph collection
- No employee performance scoring
- No sentiment / emotional analysis
- No comm channel listening (Slack/Teams content)

### Principle 2 — Privacy by design at code level
- IC quotes are **never** displayed with the IC's name in the manager UI
- Quote → contributor link exists internally only for the IC's own edit window + Twistag debugging
- Conversation transcripts are NOT in general application logs
- LLM call logs may contain extracted captures but never PII like emails / phone numbers / IDs
- Cross-tenant queries are blocked at DB layer via RLS policies (ADR-001); enforced by adversarial CI tests on every PR

### Principle 3 — Defense in depth
- Stytch handles auth (no password storage)
- Tenant context enforced at middleware AND query layer
- Per-tenant rate limits
- Audit log on every mutation
- Encrypted at rest (Supabase default) + in transit (TLS 1.3)

### Principle 4 — User control
- IC can edit captures for 7 days after session
- IC can request export of their data (GDPR Article 15)
- IC can request deletion (GDPR Article 17) — soft-delete within 24h, hard-delete within 30d
- Sponsor can suspend a sprint, pause invitations, or end engagement
- Tenant admin can export full tenant data on demand

## 3. GDPR coverage

### Data controllers / processors
- **Client** is the data controller for their IC data
- **Twistag** is the data processor
- DPA template covers responsibilities, sub-processors, breach notification

### Data subject rights
| Right | How Atlas supports |
|---|---|
| Access (Art 15) | `/api/gdpr/export` returns ZIP of user data |
| Rectification (Art 16) | 7-day edit window on every capture |
| Erasure (Art 17) | `DELETE /api/gdpr/user` triggers soft-delete + 30d hard-delete cycle |
| Restriction (Art 18) | Opt-out granular controls in IC privacy settings |
| Portability (Art 20) | Export returns structured JSON |
| Object (Art 21) | Opt-out at sprint level (skip individual sessions) or workspace level |

### Article 88 (employee data special considerations)
- Works council notification required in DE / FR — pilot playbook includes this step
- Disclosure that data is for operational analysis, not performance review
- Right to skip questions without penalty
- Aggregation: manager UI never shows individual quotes with names

### Sub-processors (transparency requirement)
| Sub-processor | What they process | DPA in place |
|---|---|---|
| Supabase | DB hosting (EU region) | ✓ |
| Vercel | Web app hosting | ✓ |
| Stytch | Auth tokens (no content) | ✓ |
| Anthropic | LLM inference (transient) | ✓ |
| Resend | Email delivery | ✓ |
| Inngest | Job orchestration metadata | ✓ |

## 4. Authentication & authorization

### Auth
- **Mechanism:** Stytch magic links
- **Token type:** JWT, signed with rotating key (RS256)
- **Token contents:** `user_id`, `tenant_id`, `role`, `exp`, `iat`
- **Expiry:** 30-day sliding window for ICs; 7-day for Twistag-side
- **Refresh:** silent refresh on session.current() call

### Authorization model
- **Roles:** `ic`, `manager`, `sponsor`, `twistag_lead`, `twistag_account_manager`, `twistag_admin`
- **Tenant scoping:** every request scoped by tenant_id from JWT
- **Twistag users:** can switch tenant context via `?tenant=` param (issues new JWT)
- **Procedure-level guards:** tRPC middleware checks role + tenant ownership

### Bad-state defenses
- If JWT has no tenant_id → reject
- If user_id in JWT not in target tenant's users table → reject + audit
- If role doesn't permit action → 403 + audit

## 5. Threat model

### Threats considered

**T1 — Cross-tenant data leak**
- Mitigation: RLS policies enforced at DB layer + adversarial CI tests on every PR + 2-eng review required for policy changes + monthly policy audit. See ADR-001 for full rationale.

**T2 — LLM prompt injection**
- Mitigation: never pass user-generated text into prompts that have privileged tool access; treat conversation content as user data only

**T3 — Sensitive PII in captures**
- Mitigation: LLM extraction prompt instructed to skip PII; quarterly review of capture sample

**T4 — Account takeover**
- Mitigation: Stytch magic link (rotated single-use), no password attack surface

**T5 — Insider abuse (Twistag user reading client data)**
- Mitigation: audit log of all Twistag-side queries; quarterly review

**T6 — Backup compromise**
- Mitigation: Supabase encrypts backups; access requires 2 senior Twistag approvals

**T7 — Subprocessor compromise**
- Mitigation: minimal data sent to each (anonymize where possible); DPA terms include breach notification

### Threats accepted in MVP
- Limited DDoS protection (Vercel handles edge cases; sophisticated attacks would impair the service)
- No HSM-backed key storage (Supabase manages secrets; revisit at scale)

## 6. Incident response

### Severity levels
| Sev | Definition | Response time |
|---|---|---|
| Sev 1 | Active data breach or service outage | <15 min ack, <1h status |
| Sev 2 | Degraded service or partial outage | <1h ack, <4h fix |
| Sev 3 | Minor degradation, no user impact | <4h ack, <2d fix |
| Sev 4 | Documentation or polish | Next sprint |

### Sev 1 protocol
1. Page on-call (PagerDuty when ready; manual rotation in MVP)
2. Incident channel in Slack
3. Status page updated within 15 min
4. Affected tenants notified within 1h
5. Postmortem within 7d (public if affecting >1 client)

## 7. Logging

### What we log
- All API requests (sanitized of PII)
- All mutations to audit_log (with user, action, target)
- LLM calls (model, tokens, cost — no content unless debug mode enabled per-tenant)
- Auth events (sign-in, sign-out, failed attempts)
- Errors + warnings

### What we DO NOT log
- Conversation transcripts in general logs (queryable only in audit_log if explicitly enabled per-tenant)
- Passwords (we don't have any)
- API keys / tokens
- Customer document contents

### Retention
- API + auth logs: 90 days
- Audit log: 7 years (or per client DPA)
- LLM call logs: 1 year
- Backups: 30 days standard, 90 days cold storage

## 8. Operational security

### Access controls (Twistag-internal)
- Production DB access: 2-person approval (engineering lead + CTO)
- Tenant data access: role-bound + audit-logged
- Secrets rotation: every 90 days
- Dev → Prod promotion: requires PR approval + CI green

### Vendor security
- All third-party vendors must have SOC2 Type 2 or equivalent
- DPAs reviewed annually
- Subprocessor changes require 30-day client notification

## 9. Customer-facing security posture

### Security one-pager
Living doc at `/security` route. Includes:
- Compliance certs (SOC2 Type 1 → Type 2 progression)
- Encryption (at rest, in transit, key management)
- Hosting + data residency options (EU default, US optional)
- Sub-processor list
- DPA template link
- Vulnerability disclosure policy

### Trust center
At `atlas.twistag.com/trust`. Externally-accessible.
- Status page
- Compliance reports (gated by NDA)
- Pen test summaries (high-level only)

## 10. What we will never do

These are commitments to clients, baked into product principles:
- Sell client data
- Use client data to train Atlas's underlying models
- Permit cross-tenant pattern matching without explicit opt-in
- Score employees individually for client manager review
- Listen to private comm channels
- Surveil employee productivity
- Deploy clients' data outside the chosen region without consent

If a client asks us to do any of the above, decline politely. If it's in the contract, we don't sign.
