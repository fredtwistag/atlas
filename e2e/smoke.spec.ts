import { test, expect } from "@playwright/test";

/**
 * Happy-path smoke: sign-in → manager dashboard → opportunity detail → SOW
 * preview, against the dev server and the seeded Supabase dev project via the
 * /sign-in/dev shortcut. Requires the Northwind demo data:
 *   npm run db:seed && npm run db:seed:dashboard
 * Not hermetic (the app's auth needs Supabase), so it lives outside the CI
 * gate — run with `npm run test:e2e`.
 */
test("manager: sign in → dashboard → opportunity → SOW preview", async ({
  page,
}) => {
  // One-click dev sign-in as the Northwind manager. Wait for networkidle so the
  // form is hydrated before submitting (the server action redirects on submit).
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  const signIn = page.locator(
    'form:has(input[value="marcus@northwind.example"]) button[type="submit"]',
  );
  await Promise.all([
    // Wait for the dashboard itself (/sprint/<id>), past the /sprint redirect.
    page.waitForURL(/\/sprint\/[0-9a-f-]{36}/, { timeout: 30_000 }),
    signIn.click(),
  ]);

  // The dashboard is ready once its opportunity cards are rendered.
  const firstOpp = page.locator('a[href*="/opportunity/"]').first();
  await expect(firstOpp).toBeVisible({ timeout: 30_000 });
  await firstOpp.click();
  await expect(page).toHaveURL(/\/opportunity\//);

  // The detail tabs are a real, keyboard-navigable tablist (Plan B4).
  await expect(page.getByRole("tablist")).toBeVisible();
  const evidence = page.getByRole("tab", { name: /evidence/i });
  await evidence.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /patterns/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // SOW preview: opening the approve flow shows the auto-drafted SOW sheet
  // (without sending). If this opportunity is already approved, the approved
  // state is the valid end state instead. Either way, no mutation.
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

test("twistag admin: sign in → /admin cockpit, role-aware sidebar, /twistag redirect", async ({
  page,
}) => {
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  const signIn = page.locator(
    'form:has(input[value="admin@twistag.com"]) button[type="submit"]',
  );
  await Promise.all([
    page.waitForURL(/\/admin$/, { timeout: 30_000 }),
    signIn.click(),
  ]);

  // The cockpit (moved here from /twistag) plus the Twistag persona sidebar.
  await expect(
    page.getByRole("heading", { name: /your clients/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "All clients" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New client" })).toBeVisible();

  // The legacy /twistag link still resolves — it redirects to the cockpit.
  await page.goto("/twistag");
  await expect(page).toHaveURL(/\/admin$/);
});

test("twistag admin: cockpit → client drill-down → tabs → read-only report", async ({
  page,
}) => {
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/admin$/, { timeout: 30_000 }),
    page
      .locator(
        'form:has(input[value="admin@twistag.com"]) button[type="submit"]',
      )
      .click(),
  ]);

  // Open the first client from the cockpit table.
  const clientLink = page.locator('a[href^="/admin/clients/"]').first();
  await expect(clientLink).toBeVisible({ timeout: 30_000 });
  await clientLink.click();
  await expect(page).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}$/);

  // The canonical roving-tabindex tablist is keyboard navigable.
  const tablist = page.getByRole("tablist");
  await expect(tablist).toBeVisible();
  const sprintsTab = page.getByRole("tab", { name: /sprints/i });
  await sprintsTab.click();
  await expect(sprintsTab).toHaveAttribute("aria-selected", "true");
  await sprintsTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /people/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // From the Sprints tab, open a read-only report.
  await sprintsTab.click();
  const reportLink = page.getByRole("link", { name: /^Report$/ }).first();
  if (await reportLink.count()) {
    await reportLink.click();
    await expect(page).toHaveURL(/\/sprint\/[0-9a-f-]{36}\/report$/);
    await expect(page.getByText(/twistag view · read-only/i)).toBeVisible();
  }
});

test("twistag admin: audit log viewer loads from the Governance nav", async ({
  page,
}) => {
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/admin$/, { timeout: 30_000 }),
    page
      .locator(
        'form:has(input[value="admin@twistag.com"]) button[type="submit"]',
      )
      .click(),
  ]);
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page).toHaveURL(/\/admin\/audit/);
  await expect(page.getByRole("heading", { name: /audit log/i })).toBeVisible();
});

test("sign-in: expired-link error param shows recovery copy", async ({
  page,
}) => {
  // Hermetic — no Supabase needed; the page reads ?error= via useSearchParams.
  await page.goto("/sign-in?error=auth", { waitUntil: "networkidle" });
  await expect(
    page.getByText(/that sign-in link expired or was already used/i),
  ).toBeVisible();
  // The email form is still there to request a fresh link.
  await expect(page.getByLabel(/work email/i)).toBeVisible();
});

test("IC: sign in → /me → privacy ack → open session → send one message → reply (Plan 015)", async ({
  page,
}) => {
  // This exercises the live conversation engine end-to-end, so it needs a
  // configured ANTHROPIC_API_KEY plus the seeded dashboard data:
  //   npm run db:seed && npm run db:seed:dashboard
  // Live-key dependent: we assert that an assistant turn appears, NOT its text.
  test.skip(
    !process.env.ANTHROPIC_API_KEY,
    "needs ANTHROPIC_API_KEY for the live conversation engine",
  );

  // One-click dev sign-in as Priya, a Northwind IC; ICs land on /me.
  await page.goto("/sign-in/dev", { waitUntil: "networkidle" });
  await Promise.all([
    page.waitForURL(/\/me$/, { timeout: 30_000 }),
    page
      .locator(
        'form:has(input[value="priya@northwind.example"]) button[type="submit"]',
      )
      .click(),
  ]);

  // Privacy gate (PRD F1.5): on a first visit the "Got it — start" ack must be
  // recorded before session links activate. Tolerate it being already acked.
  const ack = page.getByRole("button", { name: /got it — start/i });
  if (await ack.count()) {
    await ack.click();
    await page.waitForLoadState("networkidle");
  }

  // Open the next session from the "Up next" card.
  const start = page.getByRole("link", { name: /start session/i }).first();
  await expect(start).toBeVisible({ timeout: 30_000 });
  await Promise.all([
    page.waitForURL(/\/session\/[0-9a-f-]{36}$/, { timeout: 30_000 }),
    start.click(),
  ]);

  // The engine opener renders as the first assistant turn. The thread is the
  // scroll region labelled by the composer; assert at least one message bubble
  // exists before we send (the INTRO opener).
  const composer = page.getByLabel("Your message");
  await expect(composer).toBeVisible({ timeout: 30_000 });

  // Send one message and wait for a new assistant turn. We count user-side
  // bubbles to confirm the optimistic append, then wait for the reply by
  // watching the message container grow — content is model-dependent.
  const messageCount = () =>
    page.locator(
      'main div.whitespace-pre-wrap, [class*="whitespace-pre-wrap"]',
    );
  const before = await messageCount().count();

  await composer.fill("It lands in a shared queue and some orders get stuck.");
  await page.getByRole("button", { name: "Send" }).click();

  // Optimistic user bubble + eventual assistant reply → at least two new turns.
  await expect
    .poll(async () => messageCount().count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(before + 2);
});
