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

function apiPath(response: { url(): string }): string {
  return new URL(response.url()).pathname;
}

test.describe("Diaspora live presence production acceptance", () => {
  test.skip(!baseUrl || !statePath || !enabled, "Requires BASE_URL, USER_A_STATE and explicit disposable-account E2E approval");

  test("authenticated GPS → village pulse → rendered Spiral experience", async ({ browser }) => {
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();

    const headers = await authHeaders(page);
    const presenceResponse = await page.request.get(new URL("/api/griot/live-presence", baseUrl).toString(), {
      headers: { Accept: "application/json", ...headers },
    });
    expect(presenceResponse.ok()).toBeTruthy();

    const presenceBody = await presenceResponse.json();
    expect(presenceBody).toHaveProperty("generated_at");
    expect(presenceBody).toHaveProperty("freshness_window_seconds", 600);
    expect(presenceBody).toHaveProperty("current_user");
    expect(presenceBody).toHaveProperty("hubs");
    expect(Array.isArray(presenceBody.hubs)).toBeTruthy();
    expect(presenceBody).not.toHaveProperty("users");
    expect(presenceBody).not.toHaveProperty("coordinates");

    if (Array.isArray(presenceBody.neighborhoods)) {
      for (const neighborhood of presenceBody.neighborhoods) {
        expect(neighborhood).toEqual(expect.objectContaining({
          neighborhood_id: expect.any(String),
          name: expect.any(String),
          live_user_count: expect.any(Number),
          gps_verified: true,
        }));
      }
    }

    const pulseResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET" && apiPath(response) === "/api/griot/village-pulse",
    );
    await page.goto(new URL("/diaspora/heritage/globe", baseUrl).toString(), { waitUntil: "domcontentloaded" });

    const pulseResponse = await pulseResponsePromise;
    expect(pulseResponse.ok()).toBeTruthy();
    expect(pulseResponse.headers()["content-type"]).toContain("application/json");
    expect(pulseResponse.headers()["x-niakofa-village-pulse"]).toBe("verified");
    expect(pulseResponse.headers()["cache-control"]).toContain("no-store");

    const pulseBody = await pulseResponse.json();
    expect(pulseBody).toEqual(expect.objectContaining({
      generated_at: expect.any(String),
      freshness_window_seconds: 600,
      current_user: expect.any(Object),
      totals: expect.objectContaining({
        members: expect.any(Number),
        live: expect.any(Number),
        active_neighborhoods: expect.any(Number),
      }),
      hubs: expect.any(Array),
      neighborhoods: expect.any(Array),
    }));
    expect(pulseBody).not.toHaveProperty("users");
    expect(pulseBody).not.toHaveProperty("coordinates");

    await expect(page.getByTestId("global-village-pulse")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Alive from member to Spiral.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("global-village-spirals-metrics")).toBeVisible({ timeout: 15_000 });

    const currentNeighborhood = pulseBody.current_user?.current_neighborhood;
    if (currentNeighborhood?.gps_verified === true) {
      const localCard = page.getByTestId("global-village-current-neighborhood");
      await expect(localCard).toBeVisible({ timeout: 15_000 });
      await expect(localCard).toContainText(`You are in ${currentNeighborhood.name}`);
      await expect(localCard).toContainText("GPS-verified neighborhood");
    }

    await expect(page.getByText("Live Diaspora Presence")).toBeVisible({ timeout: 15_000 });

    const spiralUrl = new URL("/audio-spirals", baseUrl);
    if (currentNeighborhood?.gps_verified === true) {
      spiralUrl.searchParams.set("neighborhood", currentNeighborhood.neighborhood_id);
    }
    await page.goto(spiralUrl.toString(), { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Spiral", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    await context.close();
  });
});
