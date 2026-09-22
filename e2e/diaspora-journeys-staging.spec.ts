/**
 * Playwright journey matrix for a deployed/staging environment.
 *
 * Example:
 *   BASE_URL=https://staging.example \
 *   USER_A_STATE=playwright/.auth/a.json \
 *   USER_B_STATE=playwright/.auth/b.json \
 *   npx playwright test e2e/diaspora-journeys-staging.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE_URL || "http://127.0.0.1:5000";
const isDeployed = !["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname);

function requireAuthenticatedState(name: "USER_A_STATE" | "USER_B_STATE") {
  if (isDeployed && !process.env[name]) {
    throw new Error(`${name} is required for deployed Chromium acceptance.`);
  }
}

async function goto(page: Page, path: string) {
  await page.goto(new URL(path, base).toString(), { waitUntil: "networkidle" });
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const storageState = await page.context().storageState();
  const token = storageState.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_token")?.value;
  if (!token) throw new Error("Authenticated storage state does not contain a Niakofa token.");
  return { Authorization: `Bearer ${token}` };
}

function hubLabel(hub: { name: string; display_name?: string | null }) {
  return hub.display_name?.trim() || hub.name;
}

test.describe("Diaspora journeys — User A", () => {
  test.beforeAll(() => requireAuthenticatedState("USER_A_STATE"));
  test.use({ storageState: process.env.USER_A_STATE });

  test("Dashboard loads aggregate stats", async ({ page }) => {
    await goto(page, "/diaspora");
    await expect(page.getByText(/Niakofa Diaspora|Welcome back|Family spaces/i).first()).toBeVisible();
  });

  test("Globe opens and shows living map chrome", async ({ page }) => {
    await goto(page, "/diaspora/heritage/globe");
    await expect(page.getByText(/Diaspora Globe|Globe needs a Mapbox token/i).first()).toBeVisible();
  });

  test("Globe Message Hub preserves source context and enforces approved membership", async ({ page }) => {
    const headers = await authHeaders(page);
    const optionsResponse = await page.request.get(new URL("/api/diaspora/hub-messages/options", base).toString(), { headers });
    expect(optionsResponse.ok()).toBeTruthy();
    const options = await optionsResponse.json() as {
      source_hubs?: Array<{ id: number; name: string; display_name?: string | null }>;
      target_hubs?: Array<{ id: number; name: string; display_name?: string | null }>;
    };
    const sourceHub = options.source_hubs?.[0];
    const targetHub = options.target_hubs?.find((hub) => hub.id !== sourceHub?.id);
    expect(sourceHub, "The approved test account needs at least one source Hub membership.").toBeTruthy();
    expect(targetHub, "The approved Hub catalog needs at least one different target Hub.").toBeTruthy();

    const sourceLabel = hubLabel(sourceHub!);
    await goto(page, "/diaspora");
    const marker = page.getByRole("button", { name: `Open ${sourceLabel} Hub` });
    if (await marker.count() === 0) {
      await page.getByRole("textbox", { name: "Find a Diaspora Hub" }).fill(sourceLabel);
    }
    await expect(marker).toBeVisible();
    await marker.click();

    const details = page.getByRole("complementary", { name: `${sourceLabel} Hub details` });
    await expect(details).toBeVisible();
    await details.getByRole("button", { name: "Message hub" }).click();

    await expect(page).toHaveURL(new RegExp(`/diaspora/messages\\?sourceHub=${sourceHub!.id}$`));
    await expect(page.getByText(`Speaking as ${sourceLabel}`, { exact: true })).toBeVisible();

    const unauthorizedSourceId = (options.target_hubs ?? [])
      .find((hub) => !(options.source_hubs ?? []).some((source) => source.id === hub.id) && hub.id !== targetHub!.id)?.id
      ?? Math.max(sourceHub!.id, targetHub!.id) + 1000000;
    const boundaryResponse = await page.request.post(
      new URL("/api/diaspora/hub-messages/conversations", base).toString(),
      {
        headers: { ...headers, "Content-Type": "application/json" },
        data: { source_hub_id: unauthorizedSourceId, target_hub_id: targetHub!.id },
      },
    );
    expect(boundaryResponse.status()).toBe(403);
    expect((await boundaryResponse.json()).code).toBe("HUB_MEMBERSHIP_REQUIRED");
  });

  test("Research workspace can open cases list", async ({ page }) => {
    await goto(page, "/diaspora/research");
    await expect(page.getByText(/Research workspace|Build the proof chain|Research/i).first()).toBeVisible();
  });

  test("DNA Connections shows consent gate", async ({ page }) => {
    await goto(page, "/diaspora/dna");
    await expect(page.getByText(/DNA Connections|Privacy|consent|Connections/i).first()).toBeVisible();
  });

  test("Preserve page loads cards or scan UI", async ({ page }) => {
    await goto(page, "/diaspora/preserve");
    await expect(page.getByText(/Preserve|Culture|QR|card/i).first()).toBeVisible();
  });

  test("Family spaces list", async ({ page }) => {
    await goto(page, "/diaspora/family");
    await expect(page.getByText(/Family|Space|Create/i).first()).toBeVisible();
  });

  test("Tree route reachable", async ({ page }) => {
    await goto(page, "/diaspora/tree");
    await expect(page.getByText(/Tree|Family|relation|people/i).first()).toBeVisible();
  });

  test("Timeline route reachable", async ({ page }) => {
    await goto(page, "/diaspora/timeline");
    await expect(page.getByText(/Timeline|Legacy|event/i).first()).toBeVisible();
  });
});

test.describe("DNA dual-user consent path", () => {
  test.beforeAll(() => {
    requireAuthenticatedState("USER_A_STATE");
  });

  test("User A consent surface is visible when engine is enabled", async ({ browser }) => {
    if (!process.env.USER_A_STATE) test.skip();
    const context = await browser.newContext({ storageState: process.env.USER_A_STATE });
    const page = await context.newPage();
    await goto(page, "/diaspora/dna");
    await expect(page.getByText(/Opt in|Revoke|Engine|Profile|Consent/i).first()).toBeVisible();
    await context.close();
  });

  test("User B has an independent consent surface", async ({ browser }) => {
    if (!process.env.USER_B_STATE) test.skip();
    const context = await browser.newContext({ storageState: process.env.USER_B_STATE });
    const page = await context.newPage();
    await goto(page, "/diaspora/dna");
    await expect(page.getByText(/DNA Connections|consent|Opt in/i).first()).toBeVisible();
    await context.close();
  });
});