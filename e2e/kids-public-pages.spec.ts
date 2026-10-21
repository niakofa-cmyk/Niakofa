import { expect, test } from "@playwright/test";

test.describe("public Niakofa Kids pages", () => {
  test("Kids hub opens directly while signed out and survives refresh", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });

    const response = await page.goto("/kids/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: /big-hearted little worlds/i })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: /war for mars/i })).toBeVisible();
    await expect(page.getByTestId("section-kids-grownups")).toContainText("does not ask children to sign in");
    await expect(page.getByTestId("link-kids-feature-war-for-mars")).toHaveAttribute("href", "/kids/wfm");
    await expect(page).toHaveTitle(/Niakofa Kids/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /big-hearted little worlds/i })).toBeVisible();
    expect(apiRequests).toEqual([]);
  });

  test("War for Mars opens directly while signed out, gives parent information, and survives refresh", async ({ page }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
    });

    const response = await page.goto("/kids/wfm", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: /war for mars/i })).toBeVisible();
    await expect(page.getByTestId("status-mars-release")).toContainText("No verified public release");
    await expect(page.getByTestId("status-mars-web")).toContainText("No verified release");
    await expect(page.getByTestId("status-mars-ios")).toContainText("No verified release");
    await expect(page.getByTestId("status-mars-android")).toContainText("No verified release");
    await expect(page.getByTestId("section-mars-unpublished")).toContainText("age guidance have not yet been published");
    await expect(page.getByTestId("section-mars-parents")).toContainText("Multiplayer is not verified or advertised");
    await expect(page.getByTestId("link-mars-back-kids")).toHaveAttribute("href", "/kids/");
    await expect(page).toHaveTitle(/War for Mars/);
    await expect(page.locator('a[href*="play.google.com"], a[href*="apps.apple.com"], a[href*="store.steampowered.com"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: /play|download/i })).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /war for mars/i })).toBeVisible();
    expect(apiRequests).toEqual([]);
  });

  test("Kids pages fit a phone viewport and keep page navigation available", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/kids/wfm", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("link-mars-back-kids")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId("link-mars-back-kids").click();
    await expect(page).toHaveURL(/\/kids\/?$/);
    await expect(page.getByRole("heading", { level: 1, name: /big-hearted little worlds/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("the existing sign-in route remains available", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" }).first()).toBeVisible();
  });
});
