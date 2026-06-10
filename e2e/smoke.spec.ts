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
