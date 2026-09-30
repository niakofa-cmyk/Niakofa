/**
 * Read-only production acceptance for the Community/Moments entry point.
 * Authenticated states must be approved, disposable, and kept outside the checkout.
 * This does not certify camera hardware, upload, storage, or media processing.
 */
import { expect, test, type BrowserContext } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const expectedCommit = process.env.EXPECTED_COMMIT;
const ownerState = process.env.USER_A_STATE;
const helperState = process.env.USER_B_STATE;
const isDeployed = !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname);

async function bearer(context: BrowserContext): Promise<Record<string, string>> {
  const state = await context.storageState();
  const token = state.origins.flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => entry.name === "niakofa_token")?.value;
  if (!token) throw new Error("Approved test state does not contain a Niakofa token.");
  return { Authorization: `Bearer ${token}` };
}

test.describe("Community Moments — authenticated read-only acceptance", () => {
  test.beforeAll(() => {
    if (isDeployed && (!ownerState || !helperState || !/^[a-f0-9]{40}$/i.test(expectedCommit ?? ""))) {
      throw new Error("Deployed acceptance requires both approved states and an exact expected commit.");
    }
  });
  test.use({ storageState: ownerState });

  test("opens Moments and keeps each approved account's feed authenticated", async ({ page, browser }) => {
    const version = await page.request.get(new URL("/api/version", baseUrl).toString());
    expect(version.ok()).toBe(true);
    if (expectedCommit) expect((await version.json()).commit).toBe(expectedCommit);

    await page.goto(new URL("/community", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible();
    const moments = page.getByRole("button", { name: "Moments", exact: true });
    await expect(moments).toBeVisible();
    await moments.click();
    await expect(moments).toHaveAttribute("aria-current", "page");

    const feedUrl = new URL("/api/community/stories?limit=1", baseUrl).toString();
    const ownerFeed = await page.request.get(feedUrl, { headers: await bearer(page.context()) });
    expect(ownerFeed.status()).toBe(200);
    const ownerBody = await ownerFeed.json();
    expect(Array.isArray(ownerBody.stories)).toBe(true);
    expect(ownerBody.expires_after_hours).toBe(24);

    if (helperState) {
      const helper = await browser.newContext({ storageState: helperState });
      try {
        const helperPage = await helper.newPage();
        await helperPage.goto(new URL("/community", baseUrl).toString(), { waitUntil: "domcontentloaded" });
        await expect(helperPage.getByRole("main")).toBeVisible();
        const helperFeed = await helperPage.request.get(feedUrl, { headers: await bearer(helper) });
        expect(helperFeed.status()).toBe(200);
        const helperBody = await helperFeed.json();
        expect(Array.isArray(helperBody.stories)).toBe(true);
        expect(helperBody.viewer_user_id).not.toBe(ownerBody.viewer_user_id);
      } finally {
        await helper.close();
      }
    }

    const anonymous = await browser.newContext();
    try {
      const denied = await anonymous.request.get(feedUrl);
      expect(denied.status()).toBe(401);
    } finally {
      await anonymous.close();
    }
  });
});