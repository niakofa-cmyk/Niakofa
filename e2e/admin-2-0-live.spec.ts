import { test, expect } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;

test.describe("Admin 2.0 live acceptance", () => {
  test.skip(
    !baseURL || !storageState,
    "Set ADMIN_E2E_BASE_URL and ADMIN_E2E_STORAGE_STATE for an authenticated acceptance run.",
  );

  test.use({
    baseURL,
    storageState,
  });

  test("admin operations renders without user chrome", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });

    // Stable chrome — always present once the page mounts
    await expect(page.getByRole("heading", { name: /Admin 2\.0 Operations/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: /Full Admin/i })).toBeVisible();
    await expect(page.getByText(/Attention-first/i)).toBeVisible();

    // Always-on ops cards (h2 titles via Card component)
    await expect(page.getByRole("heading", { name: /Community Pool/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /System & Workers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Nia & Connectivity/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i }),
    ).toBeVisible();

    // "Attention required" is conditional (only when pool/workers/queues/geo need action).
    // Assert it only when present so a healthy production day does not fail the suite.
    const attention = page.getByRole("heading", { name: /Attention required/i });
    if (await attention.count()) {
      await expect(attention).toBeVisible();
    }
  });

  test("boundary workflow keeps explicit safety gates", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/review.*verify.*promote/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ready to promote/i)).toBeVisible();
  });

  test("full admin navigation remains reachable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Full Admin/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
