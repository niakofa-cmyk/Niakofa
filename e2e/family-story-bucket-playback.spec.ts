import { expect, test, type Page, type StorageState } from "@playwright/test";
import fs from "node:fs";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const base = new URL(baseUrl);
const statePath = process.env.USER_A_STATE;
const familyIdFilter = parseOptionalId("FAMILY_ID");
const storyIdFilter = parseOptionalId("FAMILY_STORY_ID");

function parseOptionalId(name: "FAMILY_ID" | "FAMILY_STORY_ID") {
  const value = process.env[name];
  if (!value) return undefined;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return id;
}

function readState(): { state: StorageState; token: string; userId: number } {
  if (!statePath) throw new Error("USER_A_STATE is required.");
  const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as StorageState;
  if (!state.origins.some((origin) => new URL(origin.origin).origin === base.origin)) {
    throw new Error("The validated User A state must include the production site origin.");
  }
  const entries = state.origins.flatMap((origin) => origin.localStorage ?? []);
  const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
  const userValue = entries.find((entry) => entry.name === "niakofa_user")?.value;
  if (!token || !userValue) throw new Error("The User A state is missing the Niakofa session profile.");
  const user = JSON.parse(userValue) as { id?: unknown };
  const userId = Number(user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    throw new Error("The User A state does not contain a valid account id.");
  }
  return { state, token, userId };
}

type Family = { id: number; status?: string };
type FamilyStory = {
  id: number;
  audience: string;
  memory_id: number | null;
};
type FamilyAsset = {
  storage_key: string;
  asset_type: string;
  mime_type?: string;
};
type PlaybackTarget = {
  familyId: number;
  storyId: number;
  storyPage: number;
  memoryId: number;
  assetKey: string;
};

async function apiGet(page: Page, token: string, pathname: string) {
  return page.request.get(new URL(pathname, base).toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

function isVideo(asset: FamilyAsset) {
  return asset.asset_type === "video" || asset.mime_type?.startsWith("video/") === true;
}

async function findPrivateStoryVideo(page: Page, token: string): Promise<PlaybackTarget> {
  const familyResponse = await apiGet(page, token, "/api/family/mine");
  expect(familyResponse.status()).toBe(200);
  const familyPayload = await familyResponse.json() as { families?: Family[] };
  const families = (familyPayload.families ?? [])
    .filter((family) => family.status !== "invited")
    .filter((family) => familyIdFilter === undefined || Number(family.id) === familyIdFilter);
  if (familyIdFilter !== undefined && families.length === 0) {
    throw new Error("FAMILY_ID is not an active Family Space for this account.");
  }

  let requestedStorySeen = false;
  for (const family of families) {
    if (!Number.isSafeInteger(Number(family.id)) || Number(family.id) < 1) continue;
    for (let pageNumber = 1; pageNumber <= 20; pageNumber += 1) {
      const response = await apiGet(
        page,
        token,
        `/api/family/${family.id}/stories?page=${pageNumber}&limit=100`,
      );
      expect(response.status()).toBe(200);
      const payload = await response.json() as {
        stories?: FamilyStory[];
        page?: number;
        limit?: number;
        has_more?: boolean;
      };
      const pageStories = payload.stories ?? [];
      const apiPage = Number(payload.page) || pageNumber;
      const apiLimit = Number(payload.limit) || pageStories.length || 10;

      for (const [storyOffset, story] of pageStories.entries()) {
        if (storyIdFilter !== undefined && Number(story.id) !== storyIdFilter) continue;
        if (storyIdFilter !== undefined) requestedStorySeen = true;
        if (story.audience !== "private" || !story.memory_id) {
          if (storyIdFilter !== undefined) {
            throw new Error("FAMILY_STORY_ID must be an existing private Story linked to a Family Memory.");
          }
          continue;
        }

        const memoryResponse = await apiGet(
          page,
          token,
          `/api/family/${family.id}/memories/${story.memory_id}`,
        );
        if (!memoryResponse.ok()) {
          if (storyIdFilter !== undefined) {
            expect(memoryResponse.status()).toBe(200);
          }
          continue;
        }
        const memory = await memoryResponse.json() as { assets?: FamilyAsset[] };
        const video = (memory.assets ?? []).find(isVideo);
        if (video?.storage_key) {
          const storyIndex = (apiPage - 1) * apiLimit + storyOffset;
          return {
            familyId: Number(family.id),
            storyId: Number(story.id),
            storyPage: Math.floor(storyIndex / 10) + 1,
            memoryId: Number(story.memory_id),
            assetKey: video.storage_key,
          };
        }
        if (storyIdFilter !== undefined) {
          throw new Error("FAMILY_STORY_ID has no linked video to play.");
        }
      }
      if (!payload.has_more) break;
    }
  }

  if (storyIdFilter !== undefined && !requestedStorySeen) {
    throw new Error("FAMILY_STORY_ID was not returned to this approved account.");
  }
  throw new Error("No accessible private Family Story linked to a video was found.");
}

test.use({
  storageState: statePath,
  trace: "off",
  screenshot: "off",
  video: "off",
});

test("plays an existing private Family Story through the authenticated same-origin media route", async ({ page }) => {
  test.setTimeout(180_000);
  if (base.origin !== "https://niakofa.com") {
    throw new Error("This read-only production playback check is restricted to https://niakofa.com.");
  }
  if (process.env.ALLOW_FAMILY_STORY_READONLY_E2E !== "1"
    || process.env.CONFIRM_DISPOSABLE_ACCOUNT !== "1") {
    throw new Error("Set the read-only Family Story and approved-account confirmations before running.");
  }

  const { token, userId } = readState();
  const version = await apiGet(page, token, "/api/version");
  expect(version.status()).toBe(200);
  expect((await version.json() as { commit?: string }).commit).toBe(process.env.EXPECTED_COMMIT);

  const profile = await apiGet(page, token, `/api/users/${userId}`);
  expect(profile.status()).toBe(200);
  const profileBody = await profile.json() as {
    approval_status?: string;
    is_suspended?: boolean;
  };
  expect(profileBody.approval_status).toBe("approved");
  expect(profileBody.is_suspended).not.toBe(true);

  const target = await findPrivateStoryVideo(page, token);
  const expectedAssetPath = `/api/family/assets/${target.assetKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
  const blockedApiMutations: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "GET" || request.method() === "HEAD") {
      await route.continue();
      return;
    }
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === base.origin && requestUrl.pathname.startsWith("/api/")) {
      blockedApiMutations.push(requestUrl.pathname);
    }
    await route.abort("blockedbyclient");
  });

  const mediaResponsePromise = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return responseUrl.origin === base.origin && responseUrl.pathname === expectedAssetPath;
  });
  await page.goto(new URL(`/family/${target.familyId}`, base).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /^stories$/i })).toBeVisible({ timeout: 30_000 });
  const initialStoriesResponse = page.waitForResponse((response) => {
    const responseUrl = new URL(response.url());
    return responseUrl.origin === base.origin
      && responseUrl.pathname === `/api/family/${target.familyId}/stories`
      && responseUrl.searchParams.get("page") === "1";
  });
  await page.getByRole("button", { name: /^stories$/i }).click();
  expect((await initialStoriesResponse).status()).toBe(200);
  for (let pageNumber = 2; pageNumber <= target.storyPage; pageNumber += 1) {
    const responsePromise = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return responseUrl.origin === base.origin
        && responseUrl.pathname === `/api/family/${target.familyId}/stories`
        && responseUrl.searchParams.get("page") === String(pageNumber);
    });
    const nextPage = page.getByRole("button", { name: "Next", exact: true });
    await expect(nextPage).toBeEnabled();
    await nextPage.click();
    expect((await responsePromise).status()).toBe(200);
  }
  const storyCard = page.getByTestId(`button-open-story-${target.storyId}`);
  await expect(storyCard).toBeVisible({ timeout: 30_000 });
  await storyCard.click();
  await expect(page.getByText("Private story", { exact: true })).toBeVisible();

  const mediaResponse = await mediaResponsePromise;
  expect(mediaResponse.request().method()).toBe("GET");
  expect([200, 206]).toContain(mediaResponse.status());
  expect(mediaResponse.headers()["content-type"] ?? "").toMatch(/^video\//i);
  expect(mediaResponse.headers().location).toBeUndefined();
  expect(new URL(mediaResponse.url()).origin).toBe(base.origin);

  const video = page.getByLabel("Private Family Story video").first();
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect.poll(
    () => video.evaluate((element) => (element as HTMLVideoElement).readyState),
    { timeout: 90_000, intervals: [1_000, 2_000, 3_000] },
  ).toBeGreaterThanOrEqual(2);
  await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    media.muted = true;
    await media.play();
  });
  await expect.poll(
    () => video.evaluate((element) => (element as HTMLVideoElement).currentTime),
    { timeout: 15_000, intervals: [250, 500, 1_000] },
  ).toBeGreaterThan(0);
  await video.evaluate((element) => (element as HTMLVideoElement).pause());
  expect(blockedApiMutations).toEqual([]);
});
