import { test, expect, type Page } from "@playwright/test";

const baseUrl = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL;
const statePath = process.env.USER_A_STATE;
const enabled = process.env.ALLOW_MUTATING_E2E === "1" && process.env.CONFIRM_DISPOSABLE_ACCOUNT === "1";

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const storageState = await page.context().storageState();
  const token = storageState.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_token")?.value;
  expect(token).toBeTruthy();
  return { Authorization: `Bearer ${token}` };
}

test.describe("Diaspora live presence production acceptance", () => {
  test.skip(!baseUrl || !statePath || !enabled, "Requires BASE_URL, USER_A_STATE and explicit disposable-account E2E approval");

  test("authenticated GPS presence returns current hub and verified neighborhood aggregates", async ({ browser }) => {
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();

    const response = await page.request.get(new URL("/api/griot/live-presence", baseUrl).toString(), {
      headers: { Accept: "application/json", ...(await authHeaders(page)) },
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty("generated_at");
    expect(body).toHaveProperty("freshness_window_seconds", 600);
    expect(body).toHaveProperty("current_user");
    expect(body).toHaveProperty("hubs");
    expect(Array.isArray(body.hubs)).toBeTruthy();
    expect(body).not.toHaveProperty("users");
    expect(body).not.toHaveProperty("coordinates");

    if (Array.isArray(body.neighborhoods)) {
      for (const neighborhood of body.neighborhoods) {
        expect(neighborhood).toEqual(expect.objectContaining({
          neighborhood_id: expect.any(String),
          name: expect.any(String),
          live_user_count: expect.any(Number),
          gps_verified: true,
        }));
      }
    }

    await page.goto(new URL("/diaspora", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Diaspora Globe")).toBeVisible({ timeout: 15_000 });

    await page.goto(new URL("/diaspora/heritage/globe", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Live Diaspora Presence")).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
