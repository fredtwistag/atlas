# Runbook — GDPR data-subject requests (manual, pilot)

> Internal operations runbook. NOT a public route. For the pilot, Atlas serves
> data-subject rights (GDPR Articles 15–21) by hand. The self-serve API is a
> post-launch fast-follow (see `plans/LAUNCH.md` → P2). The published promise to
> users lives in `app/(marketing)/privacy/page.tsx` §7: "email
> privacy@twistag.com; we respond within 30 days."

## Who runs this

A **Twistag admin** executes every request. No client-side self-service in the
pilot. All steps run in the **Supabase SQL editor** against the production
project, scoped to one user.

## The clock

- **Deadline: 30 days** from receipt of a verified request (GDPR allows up to
  one month; extendable to three for complex cases — tell the requester if you
  extend, and why).
- Track each request from intake to completion. Log completion in `audit_log`
  with action **`gdpr.request`** (see "Logging completion" below).

## Before you touch data — verify identity

1. Confirm the requester is the data subject (or an authorised
   representative). For a workplace context, confirm with the client's
   sprint sponsor/manager that the person is who they claim to be.
2. Find the user's `id`, `tenant_id`, and `email`. Everything downstream keys
   off these. Run, scoped by the email they contacted you from:

```sql
-- Identify the subject. Note the id + tenant_id for every later query.
select id, tenant_id, email, name, role
from users
where email = 'subject@example.com';
```

> Atlas is multi-tenant. A person may exist in more than one tenant (e.g. they
> moved between two client engagements). Treat each `(tenant_id, id)` pair as a
> separate subject record and repeat the procedure per tenant.

---

## Right of access (Art. 15) + portability (Art. 20) — export

Read-only. Produce a single JSON document and send it to the verified
requester. Run each query in the SQL editor with `:uid` / `:tid` set to the
values from the identity step, then collect the rows into one JSON file.

```sql
-- 1. Account record.
select id, email, name, role, department, title, opted_out,
       privacy_ack_at, created_at
from users
where id = :uid and tenant_id = :tid;

-- 2. Sessions the subject ran.
select id, sprint_id, topic_id, status, total_seconds,
       messages_count, capture_count, completed_at, created_at
from sessions
where user_id = :uid and tenant_id = :tid;

-- 3. Captures attributed to the subject (include removed ones in an export;
--    the subject is entitled to see what we hold, removed or not).
select id, session_id, kind, summary, source_quote, tags,
       is_edited, is_removed, created_at
from captures
where user_id = :uid and tenant_id = :tid;

-- 4. Conversation messages (plan 013). The session_messages table lands with
--    plan 013; until then there is nothing to export here. After 013:
--    select id, session_id, role, content, created_at
--    from session_messages
--    where session_id in (
--      select id from sessions where user_id = :uid and tenant_id = :tid
--    );

-- 5. Audit events about the subject.
select id, action, target_id, metadata, at
from audit_log
where user_id = :uid and tenant_id = :tid;
```

Package the result as structured JSON (one object per table above) — that
satisfies both access and portability. Deliver over a channel the requester
controls.

---

## Right to rectification (Art. 16)

Two paths:

1. **Self-service window.** Within 7 days of a session the subject can edit or
   remove their own captures in-product (`/me`). Point them there first if the
   window is open.
2. **Manual correction** after the window closes. Update the specific field the
   subject identifies, scoped to their rows only:

```sql
-- Example: correct a capture summary the subject says is inaccurate.
update captures
set summary = 'corrected text', is_edited = true
where id = :capture_id and user_id = :uid and tenant_id = :tid;
```

Never edit another user's rows. Always include `user_id = :uid and
tenant_id = :tid` in the WHERE clause.

---

## Right to erasure (Art. 17)

**We do not row-delete.** The FK graph (sessions → captures →
opportunity_evidence → opportunities) must stay intact so the client's
aggregate analysis is not silently corrupted. Erasure = remove the personal
content and anonymise the identity. This mirrors the in-product IC-edit
semantics (`is_removed` on captures).

Run all three steps in one transaction:

```sql
begin;

-- 1. Remove the subject's captures from analysis and blank the personal text.
update captures
set is_removed = true,
    source_quote = '',
    summary = '[removed at user request]'
where user_id = :uid and tenant_id = :tid;

-- 2. Null out conversation message content for the subject's sessions
--    (plan 013). Until session_messages exists this step is a no-op. After 013:
--    update session_messages
--    set content = '[removed at user request]'
--    where session_id in (
--      select id from sessions where user_id = :uid and tenant_id = :tid
--    );

-- 3. Anonymise the account itself — keep the row (FKs), drop the PII.
update users
set name = 'deleted-user-' || id,
    email = 'deleted-user-' || id || '@deleted.invalid',
    department = null,
    title = null,
    opted_out = true
where id = :uid and tenant_id = :tid;

commit;
```

After this, no quote, message, name, or email belonging to the subject remains,
but every foreign key still resolves and contributor counts stay consistent.

> Note: opportunity evidence references captures by `capture_id`, and the
> capture row survives (now flagged `is_removed` with blanked text), so no
> dangling references are created.

---

## Right to restriction (Art. 18) + objection (Art. 21)

The subject can opt out of further processing without erasing what exists:

```sql
update users
set opted_out = true
where id = :uid and tenant_id = :tid;
```

An opted-out user is excluded from new sessions and nudges. If they also want
existing data restricted from analysis, apply the erasure step 1 (capture
`is_removed = true`) without anonymising the account.

---

## Logging completion

Every request, on completion, gets one audit row. Use action `gdpr.request`
and record the right served + the deadline in metadata:

```sql
insert into audit_log (tenant_id, user_id, action, target_id, metadata)
values (
  :tid,
  :uid,                         -- the subject
  'gdpr.request',
  :uid::text,
  jsonb_build_object(
    'right', 'erasure',         -- access | rectification | erasure | restriction | objection
    'received_at', '2026-06-11',
    'completed_at', '2026-06-11',
    'executed_by', 'twistag-admin-email@twistag.com'
  )
);
```

## Checklist per request

- [ ] Identity verified; `id` + `tenant_id` recorded (per tenant if multiple).
- [ ] Right(s) requested identified (access / rectification / erasure /
      restriction / objection / portability).
- [ ] Action performed with the queries above, scoped to the subject's rows.
- [ ] Export delivered over a channel the requester controls (access/portability).
- [ ] `audit_log` row written with action `gdpr.request`.
- [ ] Requester told it's done, within 30 days of receipt.

## Related

- Published rights statement: `app/(marketing)/privacy/page.tsx` §7.
- DPA template the operator fills: `docs/legal/dpa-template.md` (placeholder —
  not yet created; operator/legal task).
- Schema source of truth for column names: `db/schema.ts`.
- Post-launch self-serve API: `plans/LAUNCH.md` → P2 ("GDPR self-serve API").
