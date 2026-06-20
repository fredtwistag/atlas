# Per-Org Currency + Company Favicon Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each organization (tenant) its own currency (EUR/USD/GBP), chosen in the new/edit-org flow and used for both display and scoring; and personalize the app by rendering the company's favicon (from its website domain) wherever the company name appears, falling back to initials.

**Architecture:** Add a `currency` column to `tenants` (migration). A single `Currency` type + `moneyShort/moneyRange` formatter (already currency-parameterized) is threaded from `tenant.currency` → the `Sprint` read-model → the report/opportunity/dashboard components, and into the scorer prompt + a per-currency loaded-hourly-rate. For the logo, a `faviconUrl(domain)` helper builds a third-party favicon-service URL and a client `CompanyLogo` component renders it with an `<Avatar>` initials fallback on missing-domain or load error. The tenant `domain` is threaded the same way `currency` is.

**Tech Stack:** Next.js 15 App Router / React 19 / TypeScript, tRPC + Zod, Drizzle (Postgres), Vitest. Money formatting in `lib/format.ts`; scorer in `services/opportunity/`; org admin in `app/(app)/admin/clients/`.

**Conventions (from CLAUDE.md):** strict TS (no `any`), Zod on inputs, co-located tests, no barrel files, design tokens not ad-hoc colors. Do NOT touch RLS policies (none here). Work on a feature branch; never commit to `main` without being asked.

**Execution note:** A `next dev` preview server may be running. Implementers run only `npm run typecheck` and `npx vitest run …` — never `npm run build`/`dev`/`verify` (controller runs the full gate at the end). The controller runs the DB recompute (Task A7 step) and the browser verification.

---

## File Structure

- `db/schema.ts`, `db/migrations/0021_tenant_currency.sql` — `currency` column on `tenants`.
- `lib/format.ts` (+ `lib/format.test.ts`) — export `Currency` type; add `GBP`.
- `lib/types.ts` — `Sprint` gains `tenantCurrency: Currency` + `tenantDomain: string | null`.
- `lib/sprint-read.ts` — `loadSprint` returns the two new fields.
- `components/opportunity/OpportunityCard.tsx`, `OpportunityDetail.tsx`, `components/manager/PilotPortfolio.tsx`, `components/report/ReportArticle.tsx`, `app/(app)/sprint/[id]/page.tsx`, `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx` — accept/pass a `currency` prop.
- `lib/invitations.ts`, `app/(app)/admin/clients/new/page.tsx` + `actions.ts`, `components/admin/CompanyEditForm.tsx`, `app/(app)/admin/clients/[tenantId]/actions.ts`, `lib/twistag-admin.ts` — currency in create/edit org.
- `services/opportunity/score.ts` (+ `score.test.ts`), `services/opportunity/recompute.ts` — currency in scoring.
- `lib/favicon.ts` (+ `lib/favicon.test.ts`), `components/CompanyLogo.tsx` — favicon logo.
- Render sites for the logo: admin detail header, admin clients list, report cover, manager dashboard header, IC `/me`.

---

# PART A — Per-organization currency

## Task A1: Add `currency` column to tenants

**Files:**
- Modify: `db/schema.ts:17-29`
- Create: `db/migrations/0021_tenant_currency.sql`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `db/schema.ts`, add `currency` right after the `domain` line (line 24):

```typescript
  domain: text("domain"),
  // Org display + scoring currency (EUR/USD/GBP). Default EUR (Wave-1 pilots).
  currency: text("currency").notNull().default("EUR"),
```

- [ ] **Step 2: Create the migration**

Create `db/migrations/0021_tenant_currency.sql`:

```sql
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR';
```

- [ ] **Step 3: Apply it to the dev DB**

Run: `npm run db:migrate`
Expected: `migrations complete` (applies 0021).

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts db/migrations/0021_tenant_currency.sql
git commit -m "feat(db): per-tenant currency column (0021)"
```

---

## Task A2: Export `Currency` type and add GBP to the formatter

**Files:**
- Modify: `lib/format.ts`
- Test: `lib/format.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `lib/format.test.ts` (inside the existing file, add new cases):

```typescript
it("formats GBP", () => {
  expect(moneyShort(28_000, "GBP")).toBe("£28K");
  expect(moneyRange(28_000, 65_000, "GBP")).toBe("£28K–£65K");
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — GBP not in the symbol map (TS error or `undefined` symbol).

- [ ] **Step 3: Implement — export the type, add GBP**

In `lib/format.ts`, change the `Currency` type + `SYMBOL` map to be exported and include GBP:

```typescript
export type Currency = "EUR" | "USD" | "GBP";

const SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };
```

(The `moneyShort`/`moneyRange` signatures already take `currency: Currency = "EUR"` — no other change.)

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "feat(format): export Currency type, add GBP"
```

---

## Task A3: Thread `tenantCurrency` + `tenantDomain` into the Sprint read-model

**Files:**
- Modify: `lib/types.ts:246-263` (the `Sprint` interface)
- Modify: `lib/sprint-read.ts:162-166` (the `loadSprint` return)

This single task serves both features (currency display + favicon on the report/dashboard).

- [ ] **Step 1: Add fields to the `Sprint` type**

In `lib/types.ts`, add an import at the top (next to existing imports):

```typescript
import type { Currency } from "@/lib/format";
```

Then in the `Sprint` interface, after `tenantSegment: string;` add:

```typescript
  tenantCurrency: Currency;
  tenantDomain: string | null;
```

- [ ] **Step 2: Populate them in `loadSprint`**

In `lib/sprint-read.ts`, the function already loads the `tenant` row. In the `return {` object (around line 162-166) add the two fields after `tenantSegment`:

```typescript
    tenantName: tenant?.name ?? "",
    tenantSegment: tenant?.segment ?? "",
    tenantCurrency: (tenant?.currency as Currency) ?? "EUR",
    tenantDomain: tenant?.domain ?? null,
```

Add the import to `lib/sprint-read.ts` if not present:

```typescript
import type { Currency } from "@/lib/format";
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: exit 0. (Any place constructing a `Sprint` literal — e.g. a test fixture or `lib/data.ts` — must now include `tenantCurrency`/`tenantDomain`; if typecheck flags one, add `tenantCurrency: "EUR", tenantDomain: null` there.)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/sprint-read.ts
git commit -m "feat(sprint): carry tenantCurrency + tenantDomain in the Sprint read-model"
```

---

## Task A4: Currency-aware money display

**Files:**
- Modify: `components/opportunity/OpportunityCard.tsx:16-27,51-62`
- Modify: `components/opportunity/OpportunityDetail.tsx` (signature + the `moneyRange`/`moneyShort` calls)
- Modify: `components/manager/PilotPortfolio.tsx:11-15,55-57`
- Modify: `components/report/ReportArticle.tsx` (use `sprint.tenantCurrency`, pass to cards)
- Modify: `app/(app)/sprint/[id]/page.tsx:212,236` (pass `currency`)
- Modify: `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx:39-45` (pass `currency`)

- [ ] **Step 1: OpportunityCard — accept a `currency` prop**

In `components/opportunity/OpportunityCard.tsx`, add the import and a prop (default `"EUR"`):

```typescript
import { moneyRange, type Currency } from "@/lib/format";
```
Add `currency = "EUR"` to the destructured props and its type:

```typescript
export function OpportunityCard({
  opp,
  href,
  rank,
  meta = "voices",
  currency = "EUR",
}: {
  opp: Opportunity;
  href?: string;
  rank?: number;
  meta?: "voices" | "category";
  currency?: Currency;
}) {
```
Change the impact badge call (line ~53):

```typescript
              {moneyRange(opp.impactLow, opp.impactHigh, currency)}/yr
```

- [ ] **Step 2: PilotPortfolio — accept a `currency` prop**

In `components/manager/PilotPortfolio.tsx`:

```typescript
import { moneyRange, type Currency } from "@/lib/format";
```
```typescript
export function PilotPortfolio({
  portfolio,
  currency = "EUR",
}: {
  portfolio: SprintPortfolio | null;
  currency?: Currency;
}) {
```
Change the impact badge (around line 56):

```typescript
                    {moneyRange(it.impactLow, it.impactHigh, currency)}/yr
```

- [ ] **Step 3: OpportunityDetail — accept a `currency` prop**

In `components/opportunity/OpportunityDetail.tsx`, update the import and add `currency` to the props (find the props object that already has `sprintId`, `opp`, `sow`, `approverRole`, `onApprove`):

```typescript
import { moneyRange, moneyShort, type Currency } from "@/lib/format";
```
Add `currency,` to the destructured params and `currency: Currency;` to the prop type. Then update the two money calls: the impact range stat (`moneyRange(opp.impactLow, opp.impactHigh)` → add `, currency`) and the SOW price field (`moneyShort(sow.priceUsd)` → `moneyShort(sow.priceUsd, currency)`).

- [ ] **Step 4: ReportArticle — derive currency from the sprint, pass to cards**

In `components/report/ReportArticle.tsx`, add `type Currency` is not needed (it reads from `sprint`). After the existing `const topFive = …` lines, add:

```typescript
  const currency = sprint.tenantCurrency;
```
Replace the three `moneyShort(totalLow)` / `moneyShort(totalHigh)` / `moneyShort(topFive[0].impactLow)` / `moneyShort(topFive[0].impactHigh)` calls in the exec summary + stat card to pass `, currency` as the second arg (e.g. `moneyShort(totalLow, currency)`). Then pass currency to the ranked cards — in the `opps.map(...)` that renders `<OpportunityCard …/>`, add the prop:

```tsx
              <OpportunityCard
                key={o.id}
                opp={o}
                href={opportunityHref?.(o.id)}
                rank={i + 1}
                meta="category"
                currency={currency}
              />
```

- [ ] **Step 5: Manager dashboard — pass currency**

In `app/(app)/sprint/[id]/page.tsx`, the page already has `sprint` (with `tenantCurrency`). At the `<PilotPortfolio portfolio={portfolio} />` render (line ~212) add `currency={sprint.tenantCurrency}`. At each `<OpportunityCard … />` render (line ~236) add `currency={sprint.tenantCurrency}`.

- [ ] **Step 6: Opportunity detail page — pass currency**

In `app/(app)/sprint/[id]/opportunity/[oppId]/page.tsx`, the page already loads `sprint`. Add the prop to `<OpportunityDetail …>` (line 39-45):

```tsx
    <OpportunityDetail
      sprintId={id}
      opp={opp}
      sow={buildSowDraft(opp, sprint?.tenantName ?? "your organization")}
      approverRole={session.role}
      onApprove={approveOpportunity}
      currency={sprint?.tenantCurrency ?? "EUR"}
    />
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npx vitest run components`
Expected: exit 0, tests pass. (Controller verifies the rendered report/dashboard in the preview.)

- [ ] **Step 8: Commit**

```bash
git add components app/\(app\)/sprint
git commit -m "feat(ui): render impact figures in the org's currency"
```

---

## Task A5: Currency in the new-org flow

**Files:**
- Modify: `lib/invitations.ts:3-13` (`InviteOrgSchema`)
- Modify: `app/(app)/admin/clients/new/page.tsx:84-91` (add the select)
- Modify: `app/(app)/admin/clients/new/actions.ts:23-49` (parse + insert)

- [ ] **Step 1: Add `currency` to the Zod schema**

In `lib/invitations.ts`, add to `InviteOrgSchema` (after `orgDomain`):

```typescript
  currency: z.enum(["EUR", "USD", "GBP"]).default("EUR"),
```

- [ ] **Step 2: Add the picker to the form**

In `app/(app)/admin/clients/new/page.tsx`, after the `orgDomain` `<div>` (ends line 91) add:

```tsx
          <div>
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              name="currency"
              defaultValue="EUR"
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-md"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
```

- [ ] **Step 3: Parse + persist it**

In `app/(app)/admin/clients/new/actions.ts`: add `currency: formData.get("currency") ?? undefined,` to the `InviteOrgSchema.safeParse({...})` object (after `orgDomain`); add `currency` to the destructure `const { …, currency } = parsed.data;`; and add `currency,` to the `tx.insert(tenants).values({ … })` object (after `domain`).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npx vitest run lib`
Expected: exit 0, pass.

- [ ] **Step 5: Commit**

```bash
git add lib/invitations.ts app/\(app\)/admin/clients/new
git commit -m "feat(admin): choose currency when creating an organization"
```

---

## Task A6: Currency in the edit-org flow

**Files:**
- Modify: `components/admin/CompanyEditForm.tsx:10-20` + its form body + the submit handler
- Modify: `app/(app)/admin/clients/[tenantId]/actions.ts:107-114` (`updateTenantAction`)
- Modify: `app/(app)/admin/clients/[tenantId]/page.tsx:121-127` (pass `currency` into the form's `initial`)
- Modify: `lib/twistag-admin.ts` (`updateTenant` patch + validation)

- [ ] **Step 1: `updateTenant` accepts + validates currency**

In `lib/twistag-admin.ts`, `updateTenant`: add `currency?: string` to the `patch` parameter type and `currency?: string` to the `set` object type, then add validation before the update:

```typescript
  if (patch.currency !== undefined) {
    if (!["EUR", "USD", "GBP"].includes(patch.currency)) {
      throw new Error("invalid currency");
    }
    set.currency = patch.currency;
  }
```

- [ ] **Step 2: `updateTenantAction` forwards currency**

In `app/(app)/admin/clients/[tenantId]/actions.ts`, widen `updateTenantAction`'s `input` type to include `currency?: string` and it already spreads to `updateTenant(actor, tenantId, input)` — confirm `input` is passed through (add `currency` to the type on line 109):

```typescript
export async function updateTenantAction(
  tenantId: string,
  input: { name: string; segment: string; status: string; domain?: string; currency?: string },
): Promise<void> {
```

- [ ] **Step 3: `CompanyEditForm` renders + submits currency**

In `components/admin/CompanyEditForm.tsx`: add `currency: string` to both the `initial` prop type and the `action` input type; add `const [currency, setCurrency] = useState(initial.currency);` alongside the other `useState`s; include `currency` in the object passed to `action({...})` on submit; and add the select to the form body (mirror the new-org select from Task A5 Step 2, with `value={currency} onChange={(e) => setCurrency(e.target.value)}` and no `name`/`defaultValue`).

- [ ] **Step 4: Page passes the current currency into `initial`**

In `app/(app)/admin/clients/[tenantId]/page.tsx`, the `<CompanyEditForm initial={{ name, segment, status, domain }} … />` (line ~121-127) — add `currency: tenant.currency,` to the `initial` object.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run lib`
Expected: exit 0, pass.

- [ ] **Step 6: Commit**

```bash
git add components/admin/CompanyEditForm.tsx app/\(app\)/admin/clients/\[tenantId\] lib/twistag-admin.ts
git commit -m "feat(admin): edit an organization's currency"
```

---

## Task A7: Currency in the scorer + recompute

**Files:**
- Modify: `services/opportunity/score.ts` (`DEFAULT_LOADED_HOURLY`, `rateForRole`, `costBasisNote`, `scoringSystem`, `ScoreClusterOpts`, the per-capture symbol)
- Modify: `services/opportunity/score.test.ts` (update for the new signatures)
- Modify: `services/opportunity/recompute.ts:188-192,269-275` (load + pass currency)

- [ ] **Step 1: Per-currency loaded rate + currency-aware helpers**

In `services/opportunity/score.ts`:

Replace the single constant with a per-currency map (import the type):

```typescript
import { type Currency } from "@/lib/format";

/** Fallback loaded hourly rate per currency when a sprint has no cost basis. */
export const DEFAULT_LOADED_HOURLY: Record<Currency, number> = {
  EUR: 75,
  USD: 80,
  GBP: 65,
};

const CURRENCY_SYMBOL: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£" };
```

Change `rateForRole` to take a currency and use the map:

```typescript
export function rateForRole(
  role: string,
  costBasis: CostBasis | null | undefined,
  currency: Currency,
): number {
  return (
    costBasis?.[role] ?? costBasis?.["default"] ?? DEFAULT_LOADED_HOURLY[currency]
  );
}
```

Change `costBasisNote(costBasis)` → `costBasisNote(costBasis, currency)` and use `CURRENCY_SYMBOL[currency]` in place of the hardcoded `€`, and replace the words "EUR" in its strings with `currency`:

```typescript
function costBasisNote(costBasis: CostBasis | null | undefined, currency: Currency): string {
  const sym = CURRENCY_SYMBOL[currency];
  const hasRates = costBasis && Object.keys(costBasis).length > 0;
  const rates = hasRates
    ? Object.entries(costBasis).map(([role, rate]) => `${role} ${sym}${rate}/hr`).join(", ")
    : `none provided — assume ${sym}${DEFAULT_LOADED_HOURLY[currency]}/hr loaded`;
  return [
    `COST BASIS (loaded hourly rates, ${currency}): ` + rates + ".",
    `Where a capture shows \`quantified\` with an \`implied annual ≈ ${sym}X\`, that`,
    "figure was computed deterministically from the contributor's own numbers —",
    "anchor impactLow/impactHigh and the financial dimension to it, do not invent",
    "a different basis. Captures with no quantified line carry no measured figure.",
  ].join("\n");
}
```

- [ ] **Step 2: scoringSystem + ScoreClusterOpts take currency**

Change `scoringSystem()` → `scoringSystem(currency: Currency)` and change the impact line to use the currency:

```typescript
    `- impactLow / impactHigh: estimated annual ${currency} impact range (integers,`,
```

Add `currency: Currency;` to `ScoreClusterOpts`. In `scoreCluster`, pass `opts.currency` into `scoringSystem(opts.currency)` and `costBasisNote(opts.costBasis, opts.currency)`, and into `rateForRole(c.role, opts.costBasis, opts.currency)`. In the per-capture quantified block, replace the hardcoded `€${q.unitCostUsd}/occurrence` and `implied annual ≈ €${…}` with `${CURRENCY_SYMBOL[opts.currency]}`.

- [ ] **Step 3: recompute loads + passes currency**

In `services/opportunity/recompute.ts`, change the tenant select (line 188-191) to include currency:

```typescript
  const [tenant] = await tx
    .select({ name: tenants.name, currency: tenants.currency })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  const tenantName = tenant?.name ?? "your organization";
  const currency = (tenant?.currency as Currency) ?? "EUR";
```
Add `import { type Currency } from "@/lib/format";` to recompute.ts. Then add `currency,` to the `scoreCluster({ … })` call (line 269-275).

- [ ] **Step 4: Update score.test.ts for the new signatures**

In `services/opportunity/score.test.ts`: every `rateForRole(role, costBasis)` call now needs a third arg — add `, "EUR"`. Replace `DEFAULT_LOADED_HOURLY_EUR` with `DEFAULT_LOADED_HOURLY.EUR`. Every `scoreCluster({ … })` test input object needs `currency: "EUR"` added. Assertions that checked `€…`/"EUR" wording remain valid for the EUR default.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run services/opportunity`
Expected: exit 0, all pass.

- [ ] **Step 6: Commit**

```bash
git add services/opportunity/score.ts services/opportunity/score.test.ts services/opportunity/recompute.ts
git commit -m "feat(engine): score impacts in the org's currency (EUR/USD/GBP)"
```

- [ ] **Step 7: (Controller) re-anchor Vizta**

Controller runs, after clearing Vizta's opportunity-derived rows: `recompute("5ad70000-0000-4000-8000-000000000010", "currency-feature")`. (Vizta stays EUR, so numbers are unchanged in magnitude; this verifies the threaded path end-to-end.)

---

# PART B — Company favicon logo

## Task B1: `faviconUrl` helper

**Files:**
- Create: `lib/favicon.ts`
- Test: `lib/favicon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/favicon.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { faviconUrl } from "./favicon";

describe("faviconUrl", () => {
  it("builds a service URL from a bare domain", () => {
    expect(faviconUrl("vizta.com")).toBe(
      "https://www.google.com/s2/favicons?domain=vizta.com&sz=64",
    );
  });
  it("extracts the host from a full URL", () => {
    expect(faviconUrl("https://vizta.pt/about")).toBe(
      "https://www.google.com/s2/favicons?domain=vizta.pt&sz=64",
    );
  });
  it("returns null for missing or unparseable input", () => {
    expect(faviconUrl(null)).toBeNull();
    expect(faviconUrl(undefined)).toBeNull();
    expect(faviconUrl("")).toBeNull();
    expect(faviconUrl("not a domain")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run lib/favicon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/favicon.ts`:

```typescript
/**
 * Build a favicon URL for an org's website domain via a third-party favicon
 * service (Google s2). Accepts a bare domain ("vizta.com") or a full URL
 * ("https://vizta.pt/about") and normalizes to the hostname. Returns null when
 * there's no usable domain so callers can fall back to initials.
 */
export function faviconUrl(
  domain: string | null | undefined,
  size = 64,
): string | null {
  if (!domain || !domain.trim()) return null;
  let host: string;
  try {
    host = new URL(
      domain.startsWith("http") ? domain : `https://${domain}`,
    ).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run lib/favicon.test.ts`
Expected: PASS (4 cases). Note: `new URL("https://not a domain")` throws on the space → null ✓.

- [ ] **Step 5: Commit**

```bash
git add lib/favicon.ts lib/favicon.test.ts
git commit -m "feat(favicon): faviconUrl helper (domain → service URL)"
```

---

## Task B2: `CompanyLogo` component

**Files:**
- Create: `components/CompanyLogo.tsx`
- Reference (read for size keys/style): `components/ui/Avatar.tsx`

- [ ] **Step 1: Check Avatar's size keys**

Read `components/ui/Avatar.tsx` and note its `sizes` keys (e.g. `sm`/`md`/`lg`). `CompanyLogo`'s `size` prop must use the SAME keys so the fallback `<Avatar size={size} />` typechecks.

- [ ] **Step 2: Implement the component**

Create `components/CompanyLogo.tsx` (client component — it needs `onError` state):

```tsx
"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { faviconUrl } from "@/lib/favicon";
import { cn } from "@/lib/cn";

const sizes = { sm: "h-6 w-6", md: "h-8 w-8", lg: "h-10 w-10" } as const;

/**
 * Company logo from the org's website favicon, with an initials fallback when
 * there's no domain or the icon fails to load. `size` keys mirror Avatar's.
 */
export function CompanyLogo({
  domain,
  name,
  size = "md",
  className,
}: {
  domain: string | null | undefined;
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const url = faviconUrl(domain);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return <Avatar name={name} size={size} className={className} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny external favicon; next/image proxy is overkill
    <img
      src={url}
      alt=""
      width={64}
      height={64}
      className={cn(
        "shrink-0 rounded bg-surface object-contain",
        sizes[size],
        className,
      )}
      onError={() => setFailed(true)}
    />
  );
}
```

If Avatar's size keys differ from `sm`/`md`/`lg`, align `sizes` (and the prop type) to Avatar's keys.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add components/CompanyLogo.tsx
git commit -m "feat(ui): CompanyLogo — favicon with initials fallback"
```

---

## Task B3: Render CompanyLogo where the company name appears

**Files:**
- Modify: `app/(app)/admin/clients/[tenantId]/page.tsx:468-470` (header)
- Modify: `components/report/ReportArticle.tsx:49-51` (report cover)
- Modify: `app/(app)/sprint/[id]/page.tsx` (dashboard header, near `{sprint.tenantName}`)
- Modify: `app/(app)/admin/page.tsx` (clients list — add domain to its query + a logo per row)
- Modify: `server/trpc/routers/session.ts` (`myDashboard` returns `tenantDomain`) + `lib/types.ts` (`MyDashboard`) + `app/(app)/me/page.tsx` (header logo)

- [ ] **Step 1: Admin client detail header**

In `app/(app)/admin/clients/[tenantId]/page.tsx`, add `import { CompanyLogo } from "@/components/CompanyLogo";`. Replace the `<Building2 className="h-6 w-6 text-text-3" />` (line 468) with:

```tsx
            <CompanyLogo domain={tenant.domain} name={tenant.name} size="md" />
```
Remove `Building2` from the `lucide-react` import if it's now unused (typecheck/lint will tell you).

- [ ] **Step 2: Report cover**

In `components/report/ReportArticle.tsx`, add `import { CompanyLogo } from "@/components/CompanyLogo";`. Just before the `<h1>{sprint.tenantName}</h1>` (line ~49) add a logo:

```tsx
        <CompanyLogo
          domain={sprint.tenantDomain}
          name={sprint.tenantName}
          size="lg"
          className="mb-4"
        />
        <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">
          {sprint.tenantName}
        </h1>
```

- [ ] **Step 3: Manager dashboard header**

In `app/(app)/sprint/[id]/page.tsx`, add the import and render `<CompanyLogo domain={sprint.tenantDomain} name={sprint.tenantName} size="md" />` adjacent to where `{sprint.tenantName}` is shown (line ~103). Wrap the logo + name in a flex row (`<div className="flex items-center gap-2">…</div>`) if the existing markup is inline text.

- [ ] **Step 4: IC `/me` header — thread tenantDomain**

In `lib/types.ts`, the `MyDashboard` type has `tenantName: string`; add `tenantDomain: string | null;`. In `server/trpc/routers/session.ts` `myDashboard`, change the tenant select (currently `.select({ name: tenants.name })`, ~line 63) to `.select({ name: tenants.name, domain: tenants.domain })`, and in its `return {` object (which sets `tenantName: tenant?.name ?? ""`, ~line 92) add `tenantDomain: tenant?.domain ?? null,`. In `app/(app)/me/page.tsx`, add `import { CompanyLogo } from "@/components/CompanyLogo";` and render `<CompanyLogo domain={data.tenantDomain} name={data.tenantName} size="sm" />` next to the tenant name in the header (the line showing `{data.tenantName}`; wrap logo + name in `<span className="inline-flex items-center gap-2">`).

- [ ] **Step 5: Admin clients list — thread domain + logo per row**

The list is `api.twistag.clientList()` (called in `app/(app)/admin/page.tsx:21`). In `server/trpc/routers/twistag.ts` `clientList` (procedure at ~line 35): ensure the per-tenant `select` includes `domain: tenants.domain`, and add `domain: t.domain ?? null,` to the returned client object (the map that sets `name: t.name, segment: t.segment`, ~line 90-91). Then in `app/(app)/admin/page.tsx`, add `import { CompanyLogo } from "@/components/CompanyLogo";` and in the `clients.map((c) => …)` row (~line 141-151), put `<CompanyLogo domain={c.domain} name={c.name} size="sm" />` immediately before the `<Link>…{c.name}…</Link>`, wrapping the two in a `<div className="flex items-center gap-2">`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npx vitest run`
Expected: exit 0, all pass. (Controller verifies logos render in the preview for Vizta — favicon for `vizta.com`, initials fallback for a domainless tenant.)

- [ ] **Step 7: Commit**

```bash
git add app components server lib
git commit -m "feat(ui): show company favicon logo across report, dashboard, admin, /me"
```

---

## Self-review checklist (run before handing off)
- Currency type defined once in `lib/format.ts`, imported by `lib/types.ts`, `score.ts`, `recompute.ts`. ✓
- `tenantCurrency`/`tenantDomain` added to `Sprint` in A3 and consumed in A4/B3. ✓
- `rateForRole` 3-arg signature is consistent between `score.ts` and `score.test.ts` (A7 Step 4). ✓
- Favicon falls back to initials on null domain AND on load error. ✓
- No RLS changes; `currency` column is NOT NULL DEFAULT 'EUR' so existing tenants are valid. ✓

## Final verification (controller)
- `npm run verify` green.
- Preview as Vera (sponsor): report cover + opportunities show **€** and a Vizta favicon; create/edit-org flow shows the currency picker; switching a test org to USD/GBP flips the symbol after recompute.

## Out of scope (follow-ups)
- Migrating existing impact integers between currencies (we relabel + re-score, not FX-convert).
- Self-hosting favicons (we use a third-party service); revisit if privacy/uptime matters.
- `ReportExplainer` "multiple contributors" copy; `impliedAnnualUsd`/`unitCostUsd` identifier renames.
