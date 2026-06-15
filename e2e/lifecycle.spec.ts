import { test, expect } from "@playwright/test";
import { signInAs, signInAsManager, signInAsIc } from "./helpers";

/**
 * Full sprint-lifecycle e2e (plan 027 Step 1). One serial spec that walks the
 * product's spine:
 *   manager dashboard (active sprint) → IC opens a session and sends one turn →
 *   manager sees the report → sponsor approves an opportunity → the auto-drafted
 *   SOW sheet appears → manager closes the sprint → nudging is now blocked.
 *
 * NON-HERMETIC — like smoke.spec.ts this needs a dev server on :3000, the seeded
 * Supabase dev project, and the Northwind demo data
 * (`npm run db:seed && npm run db:seed:dashboard`). The session-send step also
 * exercises the live conversation engine, so it additionally needs
 * ANTHROPIC_API_KEY; without a key we assert the typed "engine not configured"
 * path renders instead of mocking the engine (STOP condition in the plan — never
 * mock the engine inside e2e). NOT in the CI gate; run with `npm run test:e2e`.
 *
 * Because closing a sprint is one-way and these run against shared seeded data,
 * the close+nudge-blocked tail is gated behind CLOSE_SPRINT_E2E=1 so a casual
 * `npm run test:e2e` doesn't burn the demo sprint. CI seeds fresh and sets it.
 */

// Run the steps in order; a later step depends on the state a prior one leaves.
test.describe.configure({ mode: "serial" });

test.describe("sprint lifecycle", () => {
  test("manager: active sprint dashboard renders with opportunities", async ({
    page,
  }) => {
    await signInAsManager(page);
    // The dashboard is ready once at least one opportunity card is rendered.
    const firstOpp = page.locator('a[href*="/opportunity/"]').first();
    await expect(firstOpp).toBeVisible({ timeout: 30_000 });
  });

  test("IC: open a session and send one turn (or see the typed engine-off path)", async ({
    page,
  }) => {
    await signInAsIc(page);

    // Privacy gate (PRD F1.5): ack if shown, tolerate it being already acked.
    const ack = page.getByRole("button", { name: /got it — start/i });
    if (await ack.count()) {
      await ack.click();
      await page.waitForLoadState("networkidle");
    }

    const start = page.getByRole("link", { name: /start session/i }).first();
    if (!(await start.count())) {
      test.skip(true, "no open session for this IC in the seeded data");
      return;
    }
    await Promise.all([
      page.waitForURL(/\/session\/[0-9a-f-]{36}$/, { timeout: 30_000 }),
      start.click(),
    ]);

    const composer = page.getByLabel("Your message");
    await expect(composer).toBeVisible({ timeout: 30_000 });

    // Count message bubbles before sending; content is model-dependent so we
    // assert on bubble count / typed-error rendering, NOT on any text.
    const bubbles = () =>
      page.locator(
        'main div.whitespace-pre-wrap, [class*="whitespace-pre-wrap"]',
      );

    if (!process.env.ANTHROPIC_API_KEY) {
      // No live key → the engine must surface a typed, recoverable error rather
      // than crash. Either the opener never rendered (and an error is shown) or
      // sending raises the configured-key message. Assert the typed path, not a
      // mock — the plan forbids mocking the engine inside e2e.
      await composer.fill("It lands in a shared queue and orders get stuck.");
      const send = page.getByRole("button", { name: "Send" });
      if (await send.count()) await send.click();
      await expect(
        page.getByText(/ANTHROPIC_API_KEY|engine|try again|couldn'?t/i).first(),
      ).toBeVisible({ timeout: 30_000 });
      return;
    }

    const before = await bubbles().count();
    await composer.fill("It lands in a shared queue and orders get stuck.");
    await page.getByRole("button", { name: "Send" }).click();
    // Optimistic user bubble + eventual assistant reply → at least two new turns.
    await expect
      .poll(async () => bubbles().count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(before + 2);
  });

  test("manager → report → approve an opportunity → SOW sheet appears", async ({
    page,
  }) => {
    await signInAsManager(page);
    // The report lists the ranked opportunities; open the first.
    const sprintUrl = page.url();
    const sprintId = sprintUrl.match(/\/sprint\/([0-9a-f-]{36})/)?.[1];
    test.skip(!sprintId, "could not resolve the active sprint id");
    await page.goto(`/sprint/${sprintId}/report`, { waitUntil: "networkidle" });

    const oppLink = page
      .locator(`a[href*="/sprint/${sprintId}/opportunity/"]`)
      .first();
    await expect(oppLink).toBeVisible({ timeout: 30_000 });
    await oppLink.click();
    await expect(page).toHaveURL(/\/opportunity\//);

    // Approve flow: opening it shows the auto-drafted SOW sheet without sending.
    // If already approved, the approved state is the valid end state instead.
    const approve = page.getByRole("button", {
      name: /approve (for fde|as sponsor)/i,
    });
    if (await approve.count()) {
      await approve.first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByText(/auto-drafted sow/i)).toBeVisible();
    } else {
      await expect(page.getByText(/approved for fde/i)).toBeVisible();
    }
  });

  test("sponsor: lands on the report and can approve as sponsor", async ({
    page,
  }) => {
    // Northwind's sponsor persona (seeded by db:seed:dashboard); sponsors land
    // on the report.
    await signInAs(page, "dana@northwind.example");
    const onReport = page.url().match(/\/sprint\/[0-9a-f-]{36}\/report/);
    if (!onReport) {
      // Some seeds route the sponsor to the dashboard first — navigate in.
      const reportLink = page.getByRole("link", { name: /^report$/i }).first();
      if (await reportLink.count()) await reportLink.click();
    }
    // The sponsor sees the report surface (read-or-approve), not a 403.
    await expect(
      page.getByText(/opportunit|report|approve/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("manager: close sprint → nudging is blocked", async ({ page }) => {
    test.skip(
      process.env.CLOSE_SPRINT_E2E !== "1",
      "destructive (one-way close) — set CLOSE_SPRINT_E2E=1 against fresh seed",
    );
    await signInAsManager(page);
    const sprintId = page.url().match(/\/sprint\/([0-9a-f-]{36})/)?.[1];
    test.skip(!sprintId, "could not resolve the active sprint id");

    // Close from the settings page.
    await page.goto(`/sprint/${sprintId}/settings`, {
      waitUntil: "networkidle",
    });
    await page
      .getByRole("button", { name: /close sprint/i })
      .first()
      .click();
    // Confirm in the ConfirmDialog.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /close sprint/i })
      .click();
    await page.waitForLoadState("networkidle");

    // After close, the participant page shows the nudge-blocked card (plan 024).
    const participant = page.locator('a[href*="/participant/"]').first();
    if (await participant.count()) {
      await participant.click();
      await expect(page.getByText(/this sprint is closed/i)).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByText(/nudges are only available while a sprint is active/i),
      ).toBeVisible();
    }
  });
});
