import { test, expect } from "@playwright/test";

const baseURL = process.env.ADMIN_E2E_BASE_URL;
const storageState = process.env.ADMIN_E2E_STORAGE_STATE;


test.describe("Admin 2.0 live acceptance", () => {
  test.skip(!baseURL || !storageState, "Set ADMIN_E2E_BASE_URL and ADMIN_E2E_STORAGE_STATE for an authenticated acceptance run.");

  test.use({
    baseURL,
    storageState,
  });

  test("admin operations renders without user chrome", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Admin 2\.0 Operations/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Full Admin/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Attention required/i })).toBeVisible();
    await expect(page.getByText(/Community Pool/i)).toBeVisible();
    await expect(page.getByText(/System & Workers/i)).toBeVisible();
    await expect(page.getByText(/Nia & Connectivity/i)).toBeVisible();
  });

  test("boundary workflow keeps explicit safety gates", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/review.*verify.*promote/i)).toBeVisible();
    await expect(page.getByText(/ready to promote/i)).toBeVisible();
  });

  test("full admin navigation remains reachable", async ({ page }) => {
    await page.goto("/admin/operations", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /Full Admin/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });
});
