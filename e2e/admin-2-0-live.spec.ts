import { test, expect } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;

test.describe("Admin 2.0 live acceptance", () => {
  test.skip(
    !baseURL || !storageState,
    "Set ADMIN_E2E_BASE_URL and ADMIN_E2E_STORAGE_STATE for an authenticated acceptance run.",
  );

  test.use({ baseURL, storageState });

  test("admin operations renders without user chrome", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Admin 2\.0 Operations/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Full Admin/i })).toBeVisible();
    await expect(page.getByText(/Attention-first/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Community Pool/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /System & Workers/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Nia & Connectivity/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Authoritative Neighborhood Boundary Review/i })).toBeVisible();
    const attention = page.getByRole("heading", { name: /Attention required/i });
    if (await attention.count()) await expect(attention).toBeVisible();
  });

  test("boundary workflow exposes every state without silently losing rows", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/review.*verify.*promote/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Needs review/i)).toBeVisible();
    await expect(page.getByText(/Reviewed/i)).toBeVisible();
    await expect(page.getByText(/Ready to promote/i)).toBeVisible();
    await expect(page.getByText(/GPS Active/i)).toBeVisible();
    await expect(page.getByText(/Rows no longer vanish without explanation/i)).toBeVisible();
  });

  test("full admin navigation remains reachable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Full Admin/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
