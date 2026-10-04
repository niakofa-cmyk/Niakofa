import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page, type StorageState } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const expectedCommit = process.env.EXPECTED_COMMIT;
const ownerState = process.env.USER_A_STATE;
const otherState = process.env.USER_C_STATE;
const videoPath = process.env.UPLOADED_VIDEO_PATH;
const evidencePath = process.env.EVIDENCE_PATH;
const familyId = 3;
const isDeployed = !["127.0.0.1", "localhost", "::1"].includes(new URL(baseUrl).hostname);

test.use({
  storageState: ownerState,
  trace: "off",
  screenshot: "off",
  video: "off",
});

type StoredUser = {
  id: number;
  community_id: number;
  approval_status: string;
  is_suspended?: boolean;
};

type MomentRecord = {
  id: number;
  owner: "A" | "C";
  audience: "community" | "hub";
  hubId: number | null;
};
type StageUpdate = (stage: string, patch?: Record<string, unknown>) => void;

function storedUser(state: StorageState): StoredUser {
  const value = state.origins.flatMap((origin) => origin.localStorage ?? [])
    .find((item) => item.name === "niakofa_user")?.value;
  if (!value) throw new Error("The validated browser state has no Niakofa user profile.");
  const user = JSON.parse(value) as Partial<StoredUser>;
  const id = Number(user.id);
  const communityId = Number(user.community_id);
  if (!Number.isSafeInteger(id) || id < 1 || user.approval_status !== "approved" ||
      user.is_suspended === true || !Number.isSafeInteger(communityId) || communityId < 1) {
    throw new Error("Both browser states must belong to approved, active users with assigned Communities.");
  }
  return { id, community_id: communityId, approval_status: user.approval_status, is_suspended: user.is_suspended };
}

async function bearer(context: BrowserContext): Promise<Record<string, string>> {
  const state = await context.storageState();
  const token = state.origins.flatMap((origin) => origin.localStorage ?? [])
    .find((item) => item.name === "niakofa_token")?.value;
  if (!token) throw new Error("The validated browser state has no Niakofa token.");
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

async function apiGet(context: BrowserContext, path: string) {
  return context.request.get(new URL(path, baseUrl).toString(), { headers: await bearer(context) });
}

function recordEvidence(value: unknown) {
  if (!evidencePath) throw new Error("EVIDENCE_PATH is required before production acceptance.");
  writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(evidencePath, 0o600);
}

async function clickSparkContinue(page: Page, expectedLabel: "Next" | "Publish Spark") {
  const composer = page.getByRole("dialog", { name: "Create a Spark" });
  const button = composer.getByTestId("button-spark-continue");
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await expect(button).toBeEnabled({ timeout: 15_000 });
  await expect(button).toContainText(expectedLabel);
  await button.evaluate((element) => (element as HTMLButtonElement).click());
  if (expectedLabel === "Next") {
    await expect(button).toContainText("Publish Spark", { timeout: 30_000 });
  }
}

async function openStableMomentsComposer(page: Page, expectedHubId: number) {
  const hubResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/community/my-hub",
  { timeout: 30_000 });
  const scopedStoriesPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/community/stories"
      && url.searchParams.get("hubId") === String(expectedHubId);
  }, { timeout: 30_000 });

  await page.goto(new URL("/community/moments", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  const [hubResponse, scopedStoriesResponse] = await Promise.all([hubResponsePromise, scopedStoriesPromise]);
  expect(hubResponse.ok()).toBe(true);
  expect(Number((await hubResponse.json() as { hub_id?: unknown }).hub_id)).toBe(expectedHubId);
  expect(scopedStoriesResponse.ok()).toBe(true);
  await expect(page.getByRole("main")).toBeVisible({ timeout: 30_000 });

  await page.locator('button[aria-label="Create a Spark"]:visible').first().click();
  const cameraDialog = page.getByTestId("dialog-spark-camera");
  const composer = page.getByRole("dialog", { name: "Create a Spark" });
  await expect(cameraDialog).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Recovering your saved Spark/)).toBeHidden({ timeout: 30_000 });
  await expect(cameraDialog).toBeVisible({ timeout: 15_000 });
  return { cameraDialog, composer };
}

test("deployed Moment composer accepts the original video through destination without publishing", async ({ page }) => {
  test.setTimeout(120_000);
  if (!expectedCommit || !isDeployed || new URL(baseUrl).origin !== "https://niakofa.com") {
    throw new Error("The selector smoke test is restricted to the canonical production host and an exact served commit.");
  }
  if (!videoPath) throw new Error("The original uploaded video is required for the no-publish composer smoke test.");
  const version = await apiGet(page.context(), "/api/version");
  expect(version.status()).toBe(200);
  expect((await version.json() as { commit?: string }).commit).toBe(expectedCommit);
  const storyPostRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/community/stories") {
      storyPostRequests.push(request.url());
    }
  });
  const { cameraDialog, composer } = await openStableMomentsComposer(page, 1);
  await cameraDialog.getByTestId("button-spark-camera-text").click();
  await expect(cameraDialog).toBeHidden({ timeout: 15_000 });
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await expect(composer.getByText(/Draft saved on this device|Saving draft…|Local save unavailable/)).toBeVisible({ timeout: 30_000 });
  await composer.getByRole("button", { name: /^Media/ }).click();
  await expect(page.getByRole("button", { name: "Choose from device" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('input[aria-label="Choose Spark media"]')).toHaveCount(1, { timeout: 15_000 });
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15_000 });
  await page.getByRole("button", { name: "Choose from device" }).click();
  const chooser = await chooserPromise;
  console.log("No-publish smoke: device file chooser opened");
  await chooser.setFiles(videoPath, { timeout: 30_000 });
  console.log("No-publish smoke: original video selected");
  await expect(cameraDialog).toBeHidden();
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("input-spark-moment-alt")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("input-spark-moment-alt").fill("A short video clip.");
  await clickSparkContinue(page, "Next");
  console.log("No-publish smoke: destination settings opened");
  const audienceSelect = page.getByLabel("Spark audience");
  await expect(audienceSelect).toBeVisible({ timeout: 30_000 });
  await audienceSelect.selectOption("community");
  await expect(audienceSelect).toHaveValue("community");
  await expect(page.getByText(/Confirm: your approved community can see this Spark for 24 hours\./)).toBeVisible();
  const archive = page.getByTestId("input-archive-moment-setting");
  if (!(await archive.isChecked())) await archive.check();
  const responses = page.getByTestId("input-remix-moment-setting");
  if (await responses.isChecked()) await responses.uncheck();
  expect(storyPostRequests).toHaveLength(0);
});

async function createMoment(
  page: Page,
  owner: "A" | "C",
  audience: "community" | "hub",
  scopeHubId: number,
  hubId: number | null,
  videoFile: string,
  setStage: StageUpdate,
): Promise<MomentRecord> {
  const label = `${owner} ${audience} Moment`;
  setStage(`${label}: waiting for the account's Hub scope`);
  const { cameraDialog, composer } = await openStableMomentsComposer(page, scopeHubId);
  setStage(`${label}: camera opened`);
  await cameraDialog.getByTestId("button-spark-camera-text").click();
  await expect(cameraDialog).toBeHidden({ timeout: 15_000 });
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await expect(composer.getByText(/Draft saved on this device|Saving draft…|Local save unavailable/)).toBeVisible({ timeout: 30_000 });
  await composer.getByRole("button", { name: /^Media/ }).click();

  const picker = page.locator('input[aria-label="Choose Spark media"]');
  await expect(picker).toHaveCount(1, { timeout: 15_000 });
  setStage(`${label}: opening the original video`);
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15_000 });
  await page.getByRole("button", { name: "Choose from device" }).click();
  const chooser = await chooserPromise;
  setStage(`${label}: file chooser opened`);
  await chooser.setFiles(videoFile, { timeout: 45_000 });
  setStage(`${label}: original video selected`);
  await expect(cameraDialog).toBeHidden();
  await expect(composer).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("input-spark-moment-alt")).toBeVisible({ timeout: 30_000 });
  setStage(`${label}: accessibility description field visible`);
  await page.getByTestId("input-spark-moment-alt").fill("A short video clip.");
  await expect(page.getByTestId("button-spark-continue")).toBeEnabled({ timeout: 30_000 });
  setStage(`${label}: video editor ready`);
  await clickSparkContinue(page, "Next");
  setStage(`${label}: selecting destination and privacy settings`);

  const archive = page.getByTestId("input-archive-moment-setting");
  if (!(await archive.isChecked())) await archive.check();
  const responses = page.getByTestId("input-remix-moment-setting");
  if (await responses.isChecked()) await responses.uncheck();
  const audienceSelect = page.getByLabel("Spark audience");
  await expect(audienceSelect).toBeVisible({ timeout: 30_000 });
  await audienceSelect.selectOption(audience);
  await expect(audienceSelect).toHaveValue(audience);
  await expect(page.getByText(audience === "hub"
    ? /Confirm: this Hub's members can see this Spark for 24 hours\./
    : /Confirm: your approved community can see this Spark for 24 hours\./,
  )).toBeVisible();

  const exchangeListing = page.getByTestId("select-spark-exchange-listing");
  if (await exchangeListing.count()) await expect(exchangeListing).toHaveValue("");

  setStage(`${label}: waiting for the publish response`);
  const publishResponsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" &&
      new URL(response.url()).pathname === "/api/community/stories";
  }, { timeout: 240_000 });
  await clickSparkContinue(page, "Publish Spark");
  const publishResponse = await publishResponsePromise;
  setStage(`${label}: publish response received`);
  expect(publishResponse.status()).toBe(201);
  const payload = await publishResponse.json() as { story?: { id?: unknown } };
  const id = Number(payload.story?.id);
  expect(Number.isSafeInteger(id) && id > 0).toBe(true);
  const result = { id, owner, audience, hubId };
  setStage(`${label}: Moment published`, { lastPublishedMoment: result });
  return result;
}

async function playMomentCard(
  page: Page,
  storyId: number,
) {
  const card = page.getByTestId(`card-creator-moment-${storyId}`);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await playVideo(card.locator("video"));
}

async function playVideo(video: Locator) {
  await expect(video).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState), {
    timeout: 120_000,
    intervals: [1_000, 2_000, 3_000],
  }).toBeGreaterThanOrEqual(2);
  await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    media.muted = true;
    await media.play();
  });
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
    timeout: 15_000,
    intervals: [250, 500, 1_000],
  }).toBeGreaterThan(0);
  await video.evaluate((element) => (element as HTMLVideoElement).pause());
}

async function createFamilyStory(page: Page, context: BrowserContext, videoFile: string, setStage: StageUpdate) {
  setStage("A's Family Story: opening the existing Family Space");
  await page.goto(new URL(`/family/${familyId}`, baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /^memories$/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByRole("heading", { name: "Add a Memory" })).toBeVisible();
  await page.getByPlaceholder("e.g. Grandma's birthday 1985").fill("Family video");
  await page.locator("textarea").last().fill("Original uploaded video, preserved without edits.");
  await page.locator('input[type="file"][accept*="video/"]').setInputFiles(videoFile);
  setStage("A's Family Story: original video selected for a Family Memory");

  const memoryResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/api/family/${familyId}/memories`,
  );
  await page.getByRole("button", { name: "Save Memory", exact: true }).click();
  const memoryResponse = await memoryResponsePromise;
  expect(memoryResponse.ok()).toBe(true);
  const memoryPayload = await memoryResponse.json() as { memory?: { id?: unknown } };
  const memoryId = Number(memoryPayload.memory?.id);
  expect(Number.isSafeInteger(memoryId) && memoryId > 0).toBe(true);
  setStage("A's Family Story: Family Memory saved", { familyMemoryId: memoryId });

  setStage("A's Family Story: waiting for the Family video to be ready");
  await expect.poll(async () => {
    const response = await apiGet(context, `/api/family/${familyId}/memories`);
    if (!response.ok()) return false;
    const body = await response.json() as { memories?: Array<{ id: number; primary_asset?: { asset_type?: string } | null }> };
    const memory = body.memories?.find((item) => Number(item.id) === memoryId);
    return memory?.primary_asset?.asset_type === "video";
  }, { timeout: 120_000, intervals: [1_000, 2_000, 3_000] }).toBe(true);

  await expect(page.getByRole("heading", { name: "Add a Memory" })).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: /^stories$/i }).click();
  await page.getByTestId("button-write-story").click();
  await page.getByTestId("input-story-title").fill("Family video");
  await page.getByTestId("input-story-body").fill("The original video, preserved unchanged in this Family Space.");
  await page.locator('input[name="audience"][value="private"]').check();
  const linkedMemory = page.getByLabel("Linked memory");
  await expect(linkedMemory.locator(`option[value="${memoryId}"]`)).toBeAttached({ timeout: 30_000 });
  await linkedMemory.selectOption(String(memoryId));

  setStage("A's Family Story: saving the Only me Story linked to the Family Memory");
  const storyResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === `/api/family/${familyId}/stories`,
  );
  await page.getByRole("button", { name: "Preserve story", exact: true }).click();
  const storyResponse = await storyResponsePromise;
  expect(storyResponse.status()).toBe(201);
  const storyPayload = await storyResponse.json() as { story?: { id?: unknown } };
  const storyId = Number(storyPayload.story?.id);
  expect(Number.isSafeInteger(storyId) && storyId > 0).toBe(true);
  setStage("A's Family Story: Story saved", { familyStoryId: storyId });

  const familyStoriesResponse = await apiGet(context, `/api/family/${familyId}/stories`);
  expect(familyStoriesResponse.status()).toBe(200);
  const familyStories = await familyStoriesResponse.json() as {
    stories?: Array<{ id: number; audience?: string; memory_id?: number | null }>;
  };
  const savedStory = familyStories.stories?.find((story) => Number(story.id) === storyId);
  expect(savedStory?.audience).toBe("private");
  expect(Number(savedStory?.memory_id)).toBe(memoryId);

  await page.getByTestId(`button-open-story-${storyId}`).click();
  await playVideo(page.getByLabel("Private Family Story video"));
  setStage("A's Family Story: privacy, memory link, and playback verified");
  return { memoryId, storyId };
}

test("preserves the uploaded video in authorized Moments and A's private Family Story", async ({ page, browser }) => {
  test.setTimeout(18 * 60_000);
  if (isDeployed && (!ownerState || !otherState || !/^[a-f0-9]{40}$/i.test(expectedCommit ?? ""))) {
    throw new Error("Production acceptance requires both approved browser states and the exact served commit.");
  }
  if (isDeployed && new URL(baseUrl).origin !== "https://niakofa.com") {
    throw new Error("Production acceptance is restricted to canonical https://niakofa.com.");
  }
  if (isDeployed && process.env.ALLOW_MUTATING_E2E !== "1") {
    throw new Error("Set ALLOW_MUTATING_E2E=1 only for the explicitly authorized production write run.");
  }
  if (!videoPath || !evidencePath) throw new Error("The uploaded video and private evidence path are required.");
  if (existsSync(evidencePath)) throw new Error("Evidence path already exists; inspect it before considering another run.");

  const ownerContext = page.context();
  const otherContext = await browser.newContext({ storageState: otherState });
  const created: MomentRecord[] = [];
  const evidence: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    stage: "starting preflight",
    servedCommit: null,
    communitiesDiffer: false,
    hubs: {},
    moments: created,
    familyMemoryId: null,
    familyStoryId: null,
    checks: [],
  };
  recordEvidence(evidence);
  const markStage: StageUpdate = (stage, patch) => {
    if (patch) Object.assign(evidence, patch);
    evidence.stage = stage;
    recordEvidence(evidence);
    console.log(`Acceptance stage: ${stage}`);
  };

  try {
    const owner = storedUser(await ownerContext.storageState());
    const other = storedUser(await otherContext.storageState());
    expect(owner.community_id).not.toBe(other.community_id);
    evidence.communitiesDiffer = true;

    const [version, readiness, ownerProfile, otherProfile] = await Promise.all([
      apiGet(ownerContext, "/api/version"),
      apiGet(ownerContext, "/api/readiness"),
      apiGet(ownerContext, `/api/users/${owner.id}`),
      apiGet(otherContext, `/api/users/${other.id}`),
    ]);
    expect(version.status()).toBe(200);
    const versionBody = await version.json() as { commit?: string };
    expect(versionBody.commit).toBe(expectedCommit);
    evidence.servedCommit = versionBody.commit;

    expect(readiness.status()).toBe(200);
    const readinessBody = await readiness.json() as { ready?: boolean; status?: string };
    expect(readinessBody.ready).toBe(true);
    expect(readinessBody.status).toBe("ready");
    expect(ownerProfile.status()).toBe(200);
    expect(otherProfile.status()).toBe(200);
    const ownerProfileBody = await ownerProfile.json() as { approval_status?: string; community_id?: unknown; is_suspended?: boolean };
    const otherProfileBody = await otherProfile.json() as { approval_status?: string; community_id?: unknown; is_suspended?: boolean };
    expect(ownerProfileBody.approval_status).toBe("approved");
    expect(otherProfileBody.approval_status).toBe("approved");
    expect(ownerProfileBody.is_suspended).not.toBe(true);
    expect(otherProfileBody.is_suspended).not.toBe(true);
    expect(Number(ownerProfileBody.community_id)).toBe(owner.community_id);
    expect(Number(otherProfileBody.community_id)).toBe(other.community_id);
    expect(Number(ownerProfileBody.community_id)).not.toBe(Number(otherProfileBody.community_id));

    const [ownerHubResponse, otherHubResponse, ownerFeed, otherFeed, ownerFamiliesResponse, otherFamiliesResponse] = await Promise.all([
      apiGet(ownerContext, "/api/community/my-hub"),
      apiGet(otherContext, "/api/community/my-hub"),
      apiGet(ownerContext, "/api/community/stories?limit=1"),
      apiGet(otherContext, "/api/community/stories?limit=1"),
      apiGet(ownerContext, "/api/family/mine"),
      apiGet(otherContext, "/api/family/mine"),
    ]);
    expect(ownerHubResponse.status()).toBe(200);
    expect(otherHubResponse.status()).toBe(200);
    expect(ownerFeed.status()).toBe(200);
    expect(otherFeed.status()).toBe(200);
    expect(ownerFamiliesResponse.status()).toBe(200);
    expect(otherFamiliesResponse.status()).toBe(200);
    const ownerHub = Number((await ownerHubResponse.json() as { hub_id?: unknown }).hub_id);
    const otherHub = Number((await otherHubResponse.json() as { hub_id?: unknown }).hub_id);
    expect(ownerHub).toBe(1);
    expect(otherHub).toBe(18);
    const ownerFeedBody = await ownerFeed.json() as { viewer_user_id?: number; expires_after_hours?: number };
    const otherFeedBody = await otherFeed.json() as { viewer_user_id?: number };
    expect(ownerFeedBody.viewer_user_id).toBe(owner.id);
    expect(otherFeedBody.viewer_user_id).toBe(other.id);
    expect(ownerFeedBody.viewer_user_id).not.toBe(otherFeedBody.viewer_user_id);
    expect(ownerFeedBody.expires_after_hours).toBe(24);
    const ownerFamilies = (await ownerFamiliesResponse.json() as { families?: Array<{ id: number }> }).families ?? [];
    const otherFamilies = (await otherFamiliesResponse.json() as { families?: Array<{ id: number }> }).families ?? [];
    expect(ownerFamilies.some((family) => Number(family.id) === familyId)).toBe(true);
    expect(otherFamilies.some((family) => Number(family.id) === familyId)).toBe(false);
    evidence.hubs = { owner: ownerHub, other: otherHub };

    const familyAccess = await apiGet(ownerContext, `/api/family/${familyId}/stories`);
    expect(familyAccess.status()).toBe(200);
    const otherFamilyAccess = await apiGet(otherContext, `/api/family/${familyId}/stories`);
    expect([403, 404]).toContain(otherFamilyAccess.status());
    (evidence.checks as string[]).push("approved accounts, distinct Communities, assigned Hubs, readiness, and Family boundary preflight");
    recordEvidence(evidence);

    markStage("Preflight passed; starting A's Community Moment");
    const ownerCommunityMoment = await createMoment(page, "A", "community", ownerHub, null, videoPath, markStage);
    created.push(ownerCommunityMoment);
    recordEvidence(evidence);
    const ownerHubMoment = await createMoment(page, "A", "hub", ownerHub, ownerHub, videoPath, markStage);
    created.push(ownerHubMoment);
    recordEvidence(evidence);

    const otherPage = await otherContext.newPage();
    const otherCommunityMoment = await createMoment(otherPage, "C", "community", otherHub, null, videoPath, markStage);
    created.push(otherCommunityMoment);
    recordEvidence(evidence);
    const otherHubMoment = await createMoment(otherPage, "C", "hub", otherHub, otherHub, videoPath, markStage);
    created.push(otherHubMoment);
    recordEvidence(evidence);

    markStage("All four Moments published; verifying private archives and video playback");
    const archiveStories = async (context: BrowserContext, userId: number, ids: number[]) => {
      const response = await apiGet(context, `/api/community/stories/creator/${userId}?view=archive`);
      expect(response.status()).toBe(200);
      const body = await response.json() as { stories?: Array<Record<string, unknown>> };
      const found = (body.stories ?? []).filter((story) => ids.includes(Number(story.id)));
      expect(found).toHaveLength(ids.length);
      for (const story of found) {
        expect(story.archive_enabled).toBe(true);
        expect(story.remix_enabled).toBe(false);
        expect(Date.parse(String(story.expires_at))).toBeGreaterThan(Date.now());
        const media = (story.media as Array<{ media_type?: string }> | undefined) ?? [];
        expect(media.some((item) => item.media_type === "video")).toBe(true);
      }
      return found;
    };

    const ownerIds = created.filter((item) => item.owner === "A").map((item) => item.id);
    const otherIds = created.filter((item) => item.owner === "C").map((item) => item.id);
    const ownerArchive = await archiveStories(ownerContext, owner.id, ownerIds);
    const otherArchive = await archiveStories(otherContext, other.id, otherIds);

    const ownerArchivePage = new URL(`/community/creators/${owner.id}?view=archive`, baseUrl).toString();
    await page.goto(ownerArchivePage, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("page-community-creator-moments")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tab-creator-archive")).toHaveAttribute("aria-current", "page");
    for (const id of ownerIds) await playMomentCard(page, id);

    await otherPage.goto(new URL(`/community/creators/${other.id}?view=archive`, baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await expect(otherPage.getByTestId("page-community-creator-moments")).toBeVisible({ timeout: 30_000 });
    await expect(otherPage.getByTestId("tab-creator-archive")).toHaveAttribute("aria-current", "page");
    for (const id of otherIds) await playMomentCard(otherPage, id);

    const ownerCommunityFeed = await apiGet(ownerContext, `/api/community/stories?authorId=${owner.id}&limit=100`);
    const otherCommunityFeed = await apiGet(otherContext, `/api/community/stories?authorId=${other.id}&limit=100`);
    expect(ownerCommunityFeed.status()).toBe(200);
    expect(otherCommunityFeed.status()).toBe(200);
    const ownerVisibleIds = ((await ownerCommunityFeed.json()) as { stories: Array<{ id: number }> }).stories.map((item) => item.id);
    const otherVisibleIds = ((await otherCommunityFeed.json()) as { stories: Array<{ id: number }> }).stories.map((item) => item.id);
    expect(ownerVisibleIds).toEqual(expect.arrayContaining(ownerIds));
    expect(otherVisibleIds).toEqual(expect.arrayContaining(otherIds));

    const ownerInOtherCommunity = await apiGet(otherContext, `/api/community/stories?authorId=${owner.id}&limit=100`);
    const otherInOwnerCommunity = await apiGet(ownerContext, `/api/community/stories?authorId=${other.id}&limit=100`);
    expect(ownerInOtherCommunity.status()).toBe(200);
    expect(otherInOwnerCommunity.status()).toBe(200);
    const ownerIdsVisibleToOther = ((await ownerInOtherCommunity.json()) as { stories: Array<{ id: number }> }).stories.map((item) => item.id);
    const otherIdsVisibleToOwner = ((await otherInOwnerCommunity.json()) as { stories: Array<{ id: number }> }).stories.map((item) => item.id);
    expect(ownerIdsVisibleToOther.filter((id) => ownerIds.includes(id))).toHaveLength(0);
    expect(otherIdsVisibleToOwner.filter((id) => otherIds.includes(id))).toHaveLength(0);

    const wrongHubAsOther = await apiGet(otherContext, `/api/community/stories?hubId=${ownerHub}&limit=100`);
    const wrongHubAsOwner = await apiGet(ownerContext, `/api/community/stories?hubId=${otherHub}&limit=100`);
    expect([403, 404]).toContain(wrongHubAsOther.status());
    expect([403, 404]).toContain(wrongHubAsOwner.status());

    const privateArchiveToOther = await apiGet(otherContext, `/api/community/stories/creator/${owner.id}?view=archive`);
    expect(privateArchiveToOther.status()).toBe(404);
    for (const story of ownerArchive) {
      if (!ownerIds.includes(Number(story.id))) continue;
      const media = (story.media as Array<{ id?: number; media_type?: string }> | undefined)
        ?.find((item) => item.media_type === "video");
      expect(Number.isSafeInteger(media?.id)).toBe(true);
      const denied = await otherContext.request.post(
        new URL(`/api/community/stories/media/${media!.id}/playback-grant`, baseUrl).toString(),
        { headers: await bearer(otherContext) },
      );
      expect([403, 404]).toContain(denied.status());
    }
    for (const story of otherArchive) {
      if (!otherIds.includes(Number(story.id))) continue;
      const media = (story.media as Array<{ id?: number; media_type?: string }> | undefined)
        ?.find((item) => item.media_type === "video");
      expect(Number.isSafeInteger(media?.id)).toBe(true);
      const denied = await ownerContext.request.post(
        new URL(`/api/community/stories/media/${media!.id}/playback-grant`, baseUrl).toString(),
        { headers: await bearer(ownerContext) },
      );
      expect([403, 404]).toContain(denied.status());
    }
    const privateArchiveAsOther = await apiGet(otherContext, `/api/family/${familyId}/stories`);
    expect([403, 404]).toContain(privateArchiveAsOther.status());

    markStage("Moments privacy and archive playback verified; starting A's Family Story");
    const familyEntry = await createFamilyStory(page, ownerContext, videoPath, markStage);
    evidence.familyMemoryId = familyEntry.memoryId;
    evidence.familyStoryId = familyEntry.storyId;
    recordEvidence(evidence);
    const otherFamilyStories = await apiGet(otherContext, `/api/family/${familyId}/stories`);
    expect([403, 404]).toContain(otherFamilyStories.status());
    const otherFamilyMemory = await apiGet(otherContext, `/api/family/${familyId}/memories/${familyEntry.memoryId}`);
    expect([403, 404]).toContain(otherFamilyMemory.status());
    (evidence.checks as string[]).push(
      "four Community/Hub Moments were archived, private to their owners, and playable",
      "cross-Community and cross-Hub feeds and playback were denied",
      "A's linked Family Story remained private and playable; C could not read A's Family Space",
    );
    evidence.completedAt = new Date().toISOString();
    evidence.stage = "acceptance complete";
    recordEvidence(evidence);
  } finally {
    await otherContext.close();
  }
});