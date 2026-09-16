/**
 * Local browser regression coverage for the authenticated Globe → Hub → Action
 * doorway. The API boundary is mocked so this suite is deterministic and safe
 * to run against the managed preview without mutating application data.
 *
 * Run against the assigned preview port, for example:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:18848 \
 *   pnpm exec playwright test e2e/diaspora-globe-v3.spec.ts
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const isLocalTarget = ["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname);

const user = {
  id: 9001,
  name: "Globe QA User",
  email: "globe-qa@example.test",
  account_type: "user",
  approval_status: "approved",
};

const hubs = [
  {
    id: 101,
    name: "Ghana",
    display_name: "Ghana",
    region: "West Africa",
    lat: 7.95,
    lng: -1.02,
    tag: "country",
    hub_scope: "country",
    country_code: "GH",
    subdivision_code: null,
    story_count: 12,
    member_count: 12482,
    live_user_count: 126,
    neighborhood_count: 4,
    spiral_count: 3,
    open_requests: 2,
    reserved_balance: null,
    is_crisis: false,
    crisis_message: null,
    local_hubs: [],
  },
  {
    id: 102,
    name: "Brazil",
    display_name: "Brazil",
    region: "South America",
    lat: -10,
    lng: -51,
    tag: "country",
    hub_scope: "country",
    country_code: "BR",
    subdivision_code: null,
    story_count: 8,
    member_count: 9400,
    live_user_count: 0,
    neighborhood_count: 3,
    spiral_count: 2,
    open_requests: 1,
    reserved_balance: null,
    is_crisis: false,
    crisis_message: null,
    hero_image_url: "https://images.example.test/brazil-hub.jpg",
    local_hubs: [{ hub_id: 202, name: "Recife", member_count: 48, story_count: 2 }],
  },
  {
    id: 103,
    name: "Texas",
    display_name: "Texas",
    region: "United States",
    lat: 31,
    lng: -99.9,
    tag: "us-state",
    hub_scope: "us_state",
    country_code: "US",
    subdivision_code: "TX",
    story_count: 9,
    member_count: 321,
    live_user_count: 8,
    neighborhood_count: 2,
    spiral_count: 1,
    open_requests: 0,
    reserved_balance: null,
    is_crisis: false,
    crisis_message: null,
    local_hubs: [],
  },
  {
    id: 104,
    name: "California",
    display_name: "California",
    region: "United States",
    lat: 36.7,
    lng: -119.4,
    tag: "us-state",
    hub_scope: "us_state",
    country_code: "US",
    subdivision_code: "CA",
    story_count: 4,
    member_count: 210,
    live_user_count: 0,
    neighborhood_count: 1,
    spiral_count: 0,
    open_requests: 0,
    reserved_balance: null,
    is_crisis: false,
    crisis_message: null,
    local_hubs: [],
  },
];

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function mockAuthenticatedGlobe(page: Page) {
  await page.addInitScript(({ storedUser }) => {
    localStorage.setItem("niakofa_user", JSON.stringify(storedUser));
    localStorage.setItem("niakofa_token", "local-globe-qa-token");
  }, { storedUser: user });

  const fulfill = (route: Route, body: unknown) => route.fulfill(jsonResponse(body));
  await page.route("**/api/users/9001", (route) => fulfill(route, user));
  await page.route("**/api/griot/village-pulse", (route) => fulfill(route, { hubs }));
  await page.route("**/api/nia/context**", (route) => fulfill(route, {}));
  await page.route("**/api/admin/nia-status", (route) => fulfill(route, { enabled: false }));
}

test.describe("Diaspora Globe V3 browser regression", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isLocalTarget, "This deterministic API-mocked suite is for local preview validation.");
    await page.routeWebSocket("**/ws", (webSocket) => webSocket.close());
    await mockAuthenticatedGlobe(page);
    await page.goto("/diaspora", { waitUntil: "networkidle" });
    await expect(page.locator('[data-niakofa-surface="diaspora-globe"]')).toBeVisible();
  });

  test("search resolves country and local-city matches to the canonical Hub", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Find a Diaspora Hub" });
    await search.fill("Recife");
    await page.getByRole("button", { name: /Brazil/ }).last().click();
    const brazilDrawer = page.getByRole("complementary", { name: "Brazil Hub details" });
    await expect(brazilDrawer).toBeVisible();
    await expect(brazilDrawer).toHaveClass(/bottom-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/);
    await expect(brazilDrawer.locator('img[alt="Brazil community"]')).toHaveAttribute("src", "https://images.example.test/brazil-hub.jpg");
    await page.getByText("More from Brazil").click();
    await expect(brazilDrawer.getByRole("button", { name: "Family" })).toBeVisible();
    await expect(brazilDrawer.getByRole("button", { name: /Recife.*48 members/ })).toBeVisible();
    await page.getByRole("button", { name: "Reset Globe to worldwide view" }).click();
    await expect(brazilDrawer).toHaveCount(0);
    await expect(search).toHaveValue("");
  });

  test("live state, state siblings, actions, and Escape dismissal remain contextual", async ({ page }) => {
    const search = page.getByRole("textbox", { name: "Find a Diaspora Hub" });
    await search.fill("Ghana");
    await page.getByRole("button", { name: /Ghana/ }).last().click();
    const ghanaDrawer = page.getByRole("complementary", { name: "Ghana Hub details" });
    await expect(ghanaDrawer.locator('img[alt="Ghana community"]')).toHaveCount(0);
    await expect(ghanaDrawer).toContainText("126 active now");
    await page.getByRole("button", { name: "Message hub" }).click();
    await expect(page.getByRole("dialog", { name: "Message Ghana Hub" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Message Ghana Hub" })).toHaveCount(0);
    await expect(ghanaDrawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ghanaDrawer).toHaveCount(0);

    await search.fill("Texas");
    await page.getByRole("button", { name: /Texas/ }).last().click();
    const texasDrawer = page.getByRole("complementary", { name: "Texas Hub details" });
    await expect(texasDrawer).toContainText("8 active now");
    await expect(texasDrawer).toContainText("Other U.S. State Hubs");
    await expect(texasDrawer.getByRole("button", { name: "California" })).toBeVisible();
    await page.getByRole("button", { name: "Community" }).click();
    await expect(page).toHaveURL(/\/community\?hubId=103/);
  });

  for (const width of [320, 375, 430]) {
    test(`mobile ${width}px keeps controls accessible without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole("textbox", { name: "Find a Diaspora Hub" })).toBeVisible();
      await expect(page.locator('img[alt="Ghana community"]')).toHaveCount(0);
      await expect(page.locator(".mapboxgl-ctrl-bottom-right .mapboxgl-ctrl-group")).toBeVisible();
      await expect(page.locator(".mapboxgl-ctrl-top-right .mapboxgl-ctrl-group")).toHaveCount(0);
      const marker = page.getByRole("button", { name: "Open Ghana Hub" });
      const markerBox = await marker.boundingBox();
      expect(markerBox?.width).toBeGreaterThanOrEqual(44);
      expect(markerBox?.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});