import { expect, type Page } from "@playwright/test";

/**
 * Shared e2e helpers. These drive the app through the real /sign-in/dev
 * one-click personas (the same path smoke.spec.ts uses), so every spec that
 * imports them inherits the same non-hermetic requirements: a running dev
 * server on port 3000 + the seeded Supabase dev project + the Northwind demo
 * data (`npm run db:seed && npm run db:seed:dashboard`). Run with
 * `npm run test:e2e`; this suite is NOT in the CI gate (see playwright.config).
 */

/**
 * One-click dev sign-in as the given persona email, then wait for the
 * role-aware landing redirect to settle. The /sign-in/dev page renders one form
 * per seeded persona keyed by the email in a hidden input; we submit that
 * persona's form and wait for networkidle so the post-redirect page is hydrated.
 *
 * Pass `expectUrl` to additionally assert (and wait on) the landing route —
 * managers land on /sprint/<id>, ICs on /me, twistag admins on /admin.
 */
export async function signInAs(
  page: Page,
  email: string,
  expectUrl?: RegExp,
): Promise<void> {
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  const submit = page.locator(
    `form:has(input[value="${email}"]) button[type="submit"]`,
  );
  await expect(submit).toBeVisible({ timeout: 30_000 });

  if (expectUrl) {
    await Promise.all([
      page.waitForURL(expectUrl, { timeout: 30_000 }),
      submit.click(),
    ]);
  } else {
    await submit.click();
  }
  await page.waitForLoadState("networkidle");
}

/** Sign in as the Northwind manager (Marcus) and land on the dashboard. */
export function signInAsManager(page: Page): Promise<void> {
  return signInAs(page, "marcus@northwind.example", /\/sprint\/[0-9a-f-]{36}/);
}

/** Sign in as a Northwind IC (Priya); ICs land on /me. */
export function signInAsIc(page: Page): Promise<void> {
  return signInAs(page, "priya@northwind.example", /\/me$/);
}
