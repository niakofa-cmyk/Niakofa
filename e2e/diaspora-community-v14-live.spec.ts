/**
 * Authenticated, non-mutating acceptance for the V14 Hub-scoped Community
 * feed and the unified Messages compatibility doorway.
 *
 * Run against an approved disposable account:
 *   PLAYWRIGHT_BASE_URL=https://... USER_A_STATE=/tmp/user-a-state.json \
 *   npx playwright test e2e/diaspora-community-v14-live.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

type Hub = {
  id: number;
  name: string;
  display_name?: string | null;
  primary_hub_id?: number | null;
};

type GratitudePost = {
  id: number;
  diaspora_hub_id?: number | null;
};

const base = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5000";
const state = process.env.USER_A_STATE;
const isDeployed = !["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname);

function authStateRequired() {
  if (isDeployed && !state) {
    throw new Error("USER_A_STATE is required for authenticated deployed Community acceptance.");
  }
}

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const storageState = await page.context().storageState();
  const token = storageState.origins
    .flatMap((origin) => origin.localStorage ?? [])
    .find((entry) => entry.name === "niakofa_token")?.value;
  if (!token) throw new Error("Authenticated storage state does not contain a Niakofa token.");
  return { Authorization: `Bearer ${token}` };
}

async function getJson(page: Page, pathname: string, headers: Record<string, string>) {
  const response = await page.request.get(new URL(pathname, base).toString(), { headers });
  expect(response.ok(), `${pathname} should return a successful response`).toBeTruthy();
  return response.json();
}

async function approvedCanonicalHubs(page: Page, headers: Record<string, string>): Promise<Hub[]> {
  const [options, pulse] = await Promise.all([
    getJson(page, "/api/diaspora/hub-messages/options", headers) as Promise<{ source_hubs?: Hub[] }>,
    getJson(page, "/api/griot/village-pulse", headers) as Promise<{ hubs?: Hub[] }>,
  ]);
  const sourceIds = new Set((options.source_hubs ?? []).map((hub) => Number(hub.id)));
  return (pulse.hubs ?? []).filter(
    (hub) => sourceIds.has(Number(hub.id)) && hub.primary_hub_id == null,
  );
}

async function openScopedCommunity(page: Page, hubId: number) {
  const feedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "GET"
      && url.pathname === "/api/gratitude"
      && url.searchParams.get("hub_id") === String(hubId);
  });

  await page.goto(new URL(`/community?hubId=${hubId}`, base).toString(), {
    waitUntil: "domcontentloaded",
  });

  const feedResponse = await feedResponsePromise;
  expect(feedResponse.ok()).toBeTruthy();
  return feedResponse.json() as Promise<GratitudePost[]>;
}

test.describe("Diaspora Community V14 — authenticated browser acceptance", () => {
  test.beforeAll(authStateRequired);
  test.use({ storageState: state });

  test("renders the selected canonical Hub context and filters the live feed response", async ({ page }) => {
    const headers = await authHeaders(page);
    const [hub] = await approvedCanonicalHubs(page, headers);
    expect(hub, "The approved test account needs a canonical Hub membership.").toBeTruthy();

    const posts = await openScopedCommunity(page, hub.id);
    expect(posts.every((post) => Number(post.diaspora_hub_id) === hub.id)).toBe(true);

    await expect(page.getByText("Hub context", { exact: true })).toBeVisible();
    await expect(page.getByText(`Selected Diaspora Hub #${hub.id}`, { exact: true })).toBeVisible();
    await expect(
      page.getByText("Showing approved gratitude from people assigned to this Hub.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Message Hub" })).toBeVisible();

    // This acceptance is intentionally non-mutating. An empty result is valid
    // live behavior, but remains distinct from populated-feed evidence.
  });

  test("changing the selected canonical Hub changes the scoped request", async ({ page }) => {
    const headers = await authHeaders(page);
    const canonicalHubs = await getJson(page, "/api/griot/village-pulse", headers) as { hubs?: Hub[] };
    const hubs = (canonicalHubs.hubs ?? []).filter((hub) => hub.primary_hub_id == null);
    expect(hubs.length).toBeGreaterThanOrEqual(2);

    const first = hubs[0];
    const second = hubs.find((hub) => hub.id !== first.id)!;
    const firstPosts = await openScopedCommunity(page, first.id);
    const secondPosts = await openScopedCommunity(page, second.id);

    expect(firstPosts.every((post) => Number(post.diaspora_hub_id) === first.id)).toBe(true);
    expect(secondPosts.every((post) => Number(post.diaspora_hub_id) === second.id)).toBe(true);
    await expect(page.getByText(`Selected Diaspora Hub #${second.id}`, { exact: true })).toBeVisible();
  });

  test("keeps /diaspora/messages on the canonical unified Messages surface", async ({ page }) => {
    await page.goto(new URL("/diaspora/messages", base).toString(), { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/diaspora\/messages$/);
    await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  });
});