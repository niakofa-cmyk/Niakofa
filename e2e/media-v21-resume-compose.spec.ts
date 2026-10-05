import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Playwright } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const enabled = [
  "ALLOW_MEDIA_PRODUCTION_E2E",
  "CONFIRM_DISPOSABLE_ACCOUNT",
  "CONFIRM_MEDIA_PLATFORM_V21_PRODUCTION_GATE",
  "MEDIA_PLATFORM_V21_BROWSER_SMOKE",
].every((name) => process.env[name] === "1");
const userAState = process.env.USER_A_STATE;
const userBState = process.env.USER_B_STATE;
const sameCommunityNarrow = process.env.MEDIA_V21_SAME_COMMUNITY_NARROW === "1";
const retainProductionMedia =
  process.env.MEDIA_CERT_RETAIN_TEST_MEDIA === "1" &&
  process.env.CONFIRM_RETAIN_PRODUCTION_MEDIA === "1";
const expectedCommit = process.env.EXPECTED_COMMIT?.trim().toLowerCase();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const execFileAsync = promisify(execFile);
const MAX_SYNTHETIC_CLIP_BYTES = 12 * 1024 * 1024;

type StateIdentity = { token: string; userId: number; communityId: number | null };
type UploadInit = {
  media_asset_id: number;
  resumable: { chunk_size: number; status_url: string; chunk_url: string };
  complete_url: string;
};
type CompositionStatus = {
  composition?: {
    status: string;
    failure_code: string | null;
    duration_ms: number | null;
    playback_grant_url: string;
    source_count: number;
  };
};

function safeStateIdentity(statePath: string, expectedOrigin: string): StateIdentity {
  try {
    const absolutePath = path.resolve(statePath);
    const file = fs.lstatSync(absolutePath);
    const repositoryRoot = path.resolve(process.cwd());
    if (file.isSymbolicLink() || !file.isFile() || (file.mode & 0o777) !== 0o600
      || absolutePath === repositoryRoot || absolutePath.startsWith(`${repositoryRoot}${path.sep}`)
      || fs.realpathSync(absolutePath) !== absolutePath) {
      throw new Error("unsafe state file");
    }
    const state = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as {
      origins?: Array<{
        origin?: string;
        localStorage?: Array<{ name?: string; value?: string }>;
      }>;
    };
    const origins = state.origins ?? [];
    if (!origins.some((origin) => origin.origin === expectedOrigin)) throw new Error("wrong state origin");
    const entries = origins.flatMap((origin) => origin.localStorage ?? []);
    const token = entries.find((entry) => entry.name === "niakofa_token")?.value;
    const userValue = entries.find((entry) => entry.name === "niakofa_user")?.value;
    if (!token || token.split(".").length !== 4 || !userValue) throw new Error("invalid state contents");
    const user = JSON.parse(userValue) as {
      id?: unknown;
      community_id?: unknown;
      approval_status?: unknown;
    };
    const userId = Number(user.id);
    const communityId = user.community_id === null ? null : Number(user.community_id);
    if (!Number.isSafeInteger(userId) || userId < 1 || user.approval_status !== "approved") {
      throw new Error("invalid state identity");
    }
    if (user.community_id !== null && (!Number.isSafeInteger(communityId) || communityId! < 1)) {
      throw new Error("missing community identity");
    }
    return { token, userId, communityId };
  } catch {
    throw new Error("Both approved storage states must be valid, outside the repository, and mode 0600.");
  }
}

function safeOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/"
      || url.search || url.hash) throw new Error("invalid origin");
    return url.origin;
  } catch {
    throw new Error("Production BASE_URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }
}

async function generateSyntheticClip(directory: string, label: string): Promise<Buffer> {
  const output = path.join(directory, `${label}.mp4`);
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    "-f", "lavfi", "-i", "testsrc2=size=360x640:rate=30:duration=4",
    "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-b:v", "10M", "-minrate", "10M", "-maxrate", "10M", "-bufsize", "20M",
    "-x264-params", "nal-hrd=cbr", "-movflags", "+faststart", "-y", output,
  ], { timeout: 90_000, maxBuffer: 1024 * 1024 });
  fs.chmodSync(output, 0o600);
  const bytes = await readFile(output);
  if (!bytes.length || bytes.length > MAX_SYNTHETIC_CLIP_BYTES) {
    throw new Error("Generated synthetic video was outside the bounded fixture size.");
  }
  return bytes;
}

async function createPrivateFixtureDirectory(): Promise<string> {
  const repositoryRoot = fs.realpathSync(process.cwd());
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  if (temporaryRoot === repositoryRoot || temporaryRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("Synthetic media temporary files must be stored outside the repository.");
  }
  const directory = await mkdtemp(path.join(temporaryRoot, "niakofa-v21-resume-compose-"));
  fs.chmodSync(directory, 0o700);
  return directory;
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function expectSuccess(response: { status(): number }, description: string, statuses: number[]) {
  expect(statuses, description).toContain(response.status());
}

async function createAuthenticatedRequest(playwright: Playwright, token: string): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: baseUrl,
    extraHTTPHeaders: authorization(token),
    timeout: 30_000,
  });
}

async function uploadChunk(
  request: APIRequestContext,
  token: string,
  assetId: number,
  chunkUrl: string,
  offset: number,
  bytes: Buffer,
): Promise<void> {
  const response = await request.put(chunkUrl, {
    data: bytes,
    headers: {
      ...authorization(token),
      "Content-Type": "application/octet-stream",
      "Upload-Offset": String(offset),
      "X-Chunk-Sha256": createHash("sha256").update(bytes).digest("hex"),
      "X-Media-Mime-Type": "video/mp4",
    },
  });
  expect(response.status(), `Asset ${assetId} chunk at offset ${offset} should be acknowledged.`).toBe(204);
  expect(response.headers()["upload-offset"]).toBe(String(offset + bytes.length));
}

async function initializeUpload(
  request: APIRequestContext,
  token: string,
  ownerId: number,
  originalName: string,
  bytes: Buffer,
  markPossibleUntrackedUpload: (possible: boolean) => void,
): Promise<UploadInit> {
  markPossibleUntrackedUpload(true);
  const response = await request.post("/api/media-assets/uploads", {
    headers: authorization(token),
    data: {
      contextKind: "community_moment",
      contextId: ownerId,
      mediaType: "video",
      mimeType: "video/mp4",
      originalName,
      byteSize: bytes.length,
    },
  });
  expect(response.status(), "Moment upload initialization should succeed.").toBe(201);
  const initialized = await response.json() as UploadInit;
  expect(Number.isSafeInteger(initialized.media_asset_id)).toBeTruthy();
  expect(Number.isSafeInteger(initialized.resumable?.chunk_size)).toBeTruthy();
  markPossibleUntrackedUpload(false);
  return initialized;
}

async function uploadWholeClip(
  request: APIRequestContext,
  token: string,
  ownerId: number,
  name: string,
  bytes: Buffer,
  assetIds: number[],
  markPossibleUntrackedUpload: (possible: boolean) => void,
): Promise<number> {
  const initialized = await initializeUpload(request, token, ownerId, name, bytes, markPossibleUntrackedUpload);
  assetIds.push(initialized.media_asset_id);
  const chunkSize = initialized.resumable.chunk_size;
  expect(chunkSize).toBeGreaterThan(0);
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    await uploadChunk(
      request,
      token,
      initialized.media_asset_id,
      initialized.resumable.chunk_url,
      offset,
      bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
    );
  }
  const complete = await request.post(initialized.complete_url, { headers: authorization(token) });
  expect(complete.status(), "A fully acknowledged resumable upload should queue processing.").toBe(202);
  return initialized.media_asset_id;
}

async function locateStoriesByCaption(
  request: APIRequestContext,
  token: string,
  caption: string,
): Promise<number[]> {
  const response = await request.get("/api/community/stories?limit=100", {
    headers: authorization(token),
  });
  if (!response.ok()) throw new Error("Could not verify Story cleanup.");
  const payload = await response.json() as { stories?: Array<{ id?: number; caption?: string }> };
  return (payload.stories ?? [])
    .filter((story) => story.caption === caption && Number.isSafeInteger(story.id))
    .map((story) => story.id!);
}

async function guardMomentShareUiSideEffects(context: BrowserContext, storyId: number): Promise<void> {
  await context.addInitScript(() => {
    window.localStorage.setItem("niakofa_analytics_opt_out", "true");
  });
  const origin = safeOrigin(baseUrl);
  const acknowledged = {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  };
  await context.route(
    new URL(`/api/community/stories/${storyId}/view`, origin).toString(),
    (route) => route.fulfill(acknowledged),
  );
  await context.route(
    new URL(`/api/community/stories/${storyId}/share`, origin).toString(),
    (route) => route.fulfill({ ...acknowledged, status: 201 }),
  );
  await context.route(
    new URL(`/api/community/stories/${storyId}/moment-composition/playback-grant`, origin).toString(),
    (route) => route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found." }),
    }),
  );
}

async function verifyMomentShareLink(
  browser: Browser,
  storyId: number,
  caption: string,
  viewerToken: string,
): Promise<void> {
  const origin = safeOrigin(baseUrl);
  const ownerContext = await browser.newContext({ storageState: userAState! });
  let shareUrl = "";
  try {
    await guardMomentShareUiSideEffects(ownerContext, storyId);
    await ownerContext.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    const ownerPage = await ownerContext.newPage();
    const storyDeepLink = new URL("/community/moments", origin);
    storyDeepLink.searchParams.set("sparkId", String(storyId));
    storyDeepLink.searchParams.set("audience", "community");
    const momentsFeedResponse = ownerPage.waitForResponse((response) => {
      const requestedUrl = new URL(response.url());
      return requestedUrl.origin === origin
        && requestedUrl.pathname === "/api/community/stories"
        && requestedUrl.searchParams.get("limit") === "12";
    }, { timeout: 30_000 });
    await ownerPage.goto(storyDeepLink.toString(), { waitUntil: "domcontentloaded" });

    const feedResponse = await momentsFeedResponse;
    expect(feedResponse.status(), "The owner's authenticated Moments feed should load.").toBe(200);
    const feedPayload = await feedResponse.json() as {
      stories?: Array<{ id?: number; caption?: string | null }>;
    };
    const feedStory = (feedPayload.stories ?? []).find((story) => Number(story.id) === storyId);
    expect(feedStory, "The published Moment should be present in the owner's authenticated feed response.")
      .toBeDefined();
    expect(feedStory?.caption).toBe(caption);

    const storyCard = ownerPage.getByTestId(`card-moment-${storyId}`);
    await expect(ownerPage.getByTestId("status-loading-moments")).toHaveCount(0, { timeout: 30_000 });
    await expect(storyCard, "The owner should see the published Moment in the feed.")
      .toBeVisible({ timeout: 30_000 });
    await expect(storyCard).toContainText(caption);
    await storyCard.getByRole("button", { name: "Share Spark", exact: true }).click();

    const shareDialog = ownerPage.getByRole("dialog", { name: "Share Spark" });
    const shareInput = shareDialog.getByRole("textbox", { name: "Shareable Spark link" });
    shareUrl = await shareInput.inputValue();
    const parsedShareUrl = new URL(shareUrl);
    expect(parsedShareUrl.origin).toBe(origin);
    expect(parsedShareUrl.pathname).toBe("/community/moments");
    expect(parsedShareUrl.searchParams.getAll("sparkId")).toEqual([String(storyId)]);
    expect(parsedShareUrl.searchParams.getAll("audience")).toEqual(["community"]);
    expect(parsedShareUrl.searchParams.has("hubId")).toBe(false);

    await shareDialog.getByTestId("button-copy-spark-link").click();
    await expect(shareDialog.getByRole("status")).toHaveText("Spark link copied.");
    expect(await ownerPage.evaluate(() => navigator.clipboard.readText())).toBe(shareUrl);
  } finally {
    await ownerContext.close();
  }

  const viewerContext = await browser.newContext({ storageState: userBState! });
  try {
    await guardMomentShareUiSideEffects(viewerContext, storyId);
    const viewerPage = await viewerContext.newPage();
    await viewerPage.goto(shareUrl, { waitUntil: "domcontentloaded" });
    await expect(viewerPage.getByTestId("community-moments-experience")).toBeVisible();
    await expect(viewerPage.getByTestId("status-loading-moments")).toHaveCount(0, { timeout: 30_000 });
    await expect(viewerPage.getByTestId(`card-moment-${storyId}`)).toHaveCount(0);

    const feedResponse = await viewerPage.request.get(
      new URL("/api/community/stories?limit=100", origin).toString(),
      { headers: authorization(viewerToken) },
    );
    expect(feedResponse.status(), "The other Community's authenticated Moments feed should load.").toBe(200);
    const feed = await feedResponse.json() as { stories?: Array<{ id?: number }> };
    expect((feed.stories ?? []).some((story) => Number(story.id) === storyId)).toBe(false);
  } finally {
    await viewerContext.close();
  }
}

test.describe("V21 resumable upload and camera-clip composition acceptance", () => {
  test.skip(
    !enabled || !userAState || !userBState || !/^[0-9a-f]{40}$/.test(expectedCommit ?? ""),
    "Requires all four explicit production gates, both approved storage states, and the full expected commit.",
  );

  test(`${sameCommunityNarrow ? "narrow same-community" : "cross-community"}: resumes portrait 9:16 upload, publishes and composes a Moment, checks playback and item sharing, and ${retainProductionMedia ? "retains verified media" : "cleans up"}`, async ({ playwright, browser }) => {
    test.setTimeout(15 * 60_000);
    expect(
      process.env.MEDIA_CERT_RETAIN_TEST_MEDIA !== "1" ||
        process.env.CONFIRM_RETAIN_PRODUCTION_MEDIA === "1",
      "Retaining production test media requires explicit operator confirmation.",
    ).toBeTruthy();
    const origin = safeOrigin(baseUrl);
    const owner = safeStateIdentity(userAState!, origin);
    const otherUser = safeStateIdentity(userBState!, origin);
    expect(otherUser.userId, "The isolation state must belong to a distinct approved user.").not.toBe(owner.userId);
    if (sameCommunityNarrow) {
      expect(
        otherUser.communityId,
        "Narrow mode requires USER_B inside USER_A's Community; it cannot certify cross-community denial.",
      ).toBe(owner.communityId);
    } else {
      expect(
        otherUser.communityId,
        "USER_B must be outside USER_A's Story audience so isolation checks can validly require denial.",
      ).not.toBe(owner.communityId);
    }

    const preflight = await playwright.request.newContext({ baseURL: baseUrl, timeout: 30_000 });
    try {
      const health = await preflight.get("/api/healthz");
      expect(health.ok(), "Health endpoint must be healthy before any production write.").toBeTruthy();
      const healthBody = await health.json() as {
        storage_readiness?: {
          media_platform_flag?: boolean;
          cloud_configured?: boolean;
          credentials_present?: boolean;
        };
      };
      expect(healthBody.storage_readiness?.cloud_configured).toBe(true);
      expect(healthBody.storage_readiness?.credentials_present).toBe(true);
      expect(healthBody.storage_readiness?.media_platform_flag).toBe(true);

      const readiness = await preflight.get("/api/readiness");
      expect(readiness.ok(), "Readiness endpoint must be healthy before any production write.").toBeTruthy();
      const readinessBody = await readiness.json() as {
        ready?: boolean;
        dependencies?: { media_worker?: { required?: boolean; status?: string } };
        required?: { media_worker?: boolean };
      };
      expect(readinessBody.ready).toBe(true);
      expect(readinessBody.dependencies?.media_worker?.required, "V21 readiness must require the media worker before any production write.").toBe(true);
      expect(readinessBody.dependencies?.media_worker?.status, "The media worker's bounded BullMQ readiness check must pass before any production write.").toBe("ready");
      expect(readinessBody.required?.media_worker, "The aggregate readiness contract must mark the media worker required.").toBe(true);

      const version = await preflight.get("/api/version");
      expect(version.ok(), "Version endpoint must be available before any production write.").toBeTruthy();
      const servedCommit = String(((await version.json()) as { commit?: unknown }).commit ?? "").toLowerCase();
      expect(servedCommit, "The served commit must exactly match EXPECTED_COMMIT before any write.").toBe(expectedCommit);
    } finally {
      await preflight.dispose();
    }

    const temporaryDirectory = await createPrivateFixtureDirectory();
    const requests: APIRequestContext[] = [];
    const sourceAssetIds: number[] = [];
    let storyId: number | undefined;
    let cleanupOwnerRequest: APIRequestContext | undefined;
    let possibleUntrackedUpload = false;
    let possibleUntrackedStory = false;
    const caption = `V21 camera-clips certification ${randomUUID()}`;
    const clientPublishId = randomUUID();
    let cleanupError: string | undefined;
    let certificationSucceeded = false;
    let primaryError: unknown;
    let primaryTestFailed = false;

    const newOwnerRequest = async () => {
      const context = await createAuthenticatedRequest(playwright, owner.token);
      requests.push(context);
      cleanupOwnerRequest = context;
      return context;
    };

    try {
      const firstClip = await generateSyntheticClip(temporaryDirectory, "clip-one");
      const secondClip = await generateSyntheticClip(temporaryDirectory, "clip-two");
      let ownerRequest = await newOwnerRequest();
      const firstInit = await initializeUpload(
        ownerRequest,
        owner.token,
        owner.userId,
        "v21-camera-clip-one.mp4",
        firstClip,
        (possible) => { possibleUntrackedUpload = possible; },
      );
      sourceAssetIds.push(firstInit.media_asset_id);
      const chunkSize = firstInit.resumable.chunk_size;
      expect(chunkSize).toBeGreaterThan(0);
      expect(firstClip.length, "The first clip must span multiple acknowledged upload chunks.").toBeGreaterThan(chunkSize);

      const acknowledgedBytes = firstClip.subarray(0, chunkSize);
      await uploadChunk(
        ownerRequest,
        owner.token,
        firstInit.media_asset_id,
        firstInit.resumable.chunk_url,
        0,
        acknowledgedBytes,
      );

      // Dispose the original API context to emulate a client interruption. The
      // replacement context must reload offset state from the service.
      await ownerRequest.dispose();
      ownerRequest = await newOwnerRequest();
      const sessionResponse = await ownerRequest.get(firstInit.resumable.status_url, {
        headers: authorization(owner.token),
      });
      expect(sessionResponse.ok(), "The interrupted upload session should be reloadable.").toBeTruthy();
      const session = await sessionResponse.json() as { offset?: number; total_bytes?: number; finalized?: boolean };
      expect(session.offset).toBe(acknowledgedBytes.length);
      expect(session.total_bytes).toBe(firstClip.length);
      expect(session.finalized).toBe(false);

      for (let offset = session.offset!; offset < firstClip.length; offset += chunkSize) {
        await uploadChunk(
          ownerRequest,
          owner.token,
          firstInit.media_asset_id,
          firstInit.resumable.chunk_url,
          offset,
          firstClip.subarray(offset, Math.min(offset + chunkSize, firstClip.length)),
        );
      }
      const firstComplete = await ownerRequest.post(firstInit.complete_url, {
        headers: authorization(owner.token),
      });
      expect(firstComplete.status(), "The resumed clip should complete without restarting acknowledged bytes.").toBe(202);

      const secondAssetId = await uploadWholeClip(
        ownerRequest,
        owner.token,
        owner.userId,
        "v21-camera-clip-two.mp4",
        secondClip,
        sourceAssetIds,
        (possible) => { possibleUntrackedUpload = possible; },
      );
      const firstAssetId = firstInit.media_asset_id;

      await expect.poll(async () => {
        const response = await ownerRequest.get(
          `/api/community/stories/moment-media-status?contextKind=community_moment&contextId=${owner.userId}&ids=${firstAssetId},${secondAssetId}`,
          { headers: authorization(owner.token) },
        );
        if (!response.ok()) return "unavailable";
        const payload = await response.json() as {
          assets?: Array<{ id: number; status: string; media_type: string; variant_ready: boolean }>;
        };
        const assets = payload.assets ?? [];
        if (assets.length !== 2) return "missing";
        return assets
          .slice()
          .sort((left, right) => left.id - right.id)
          .map((asset) => `${asset.id}:${asset.status}:${asset.media_type}:${asset.variant_ready}`)
          .join("|");
      }, { timeout: 120_000, intervals: [1_000, 2_000, 5_000] })
        .toBe(`${Math.min(firstAssetId, secondAssetId)}:ready:video:true|${Math.max(firstAssetId, secondAssetId)}:ready:video:true`);

      const storyPayload = {
        client_publish_id: clientPublishId,
        caption,
        audience: "community",
        reply_enabled: false,
        media_asset_ids: [firstAssetId, secondAssetId],
        media_accessibility: [
          { media_asset_id: firstAssetId, alt_text: "A short portrait synthetic test pattern clip." },
          { media_asset_id: secondAssetId, alt_text: "A second short portrait synthetic test pattern clip." },
        ],
      };
      possibleUntrackedStory = true;
      const publish = await ownerRequest.post("/api/community/stories", {
        headers: authorization(owner.token),
        data: storyPayload,
      });
      if (publish.status() >= 400 && publish.status() < 500) possibleUntrackedStory = false;
      expect(publish.status(), "Publishing the accessible disposable Moment should succeed.").toBe(201);
      const published = await publish.json() as { story?: { id?: number; status?: string } };
      storyId = published.story?.id;
      expect(Number.isSafeInteger(storyId)).toBeTruthy();
      expect(published.story?.status).toBe("published");
      possibleUntrackedStory = false;

      const publishReplay = await ownerRequest.post("/api/community/stories", {
        headers: authorization(owner.token),
        data: storyPayload,
      });
      expect(publishReplay.status(), "The same client_publish_id and payload should be idempotent.").toBe(200);
      const replayed = await publishReplay.json() as { story?: { id?: number } };
      expect(replayed.story?.id).toBe(storyId);

      const compose = await ownerRequest.post(`/api/community/stories/${storyId}/moment-composition`, {
        headers: authorization(owner.token),
        data: { intent: "camera_clip_reel", media_asset_ids: [firstAssetId, secondAssetId] },
      });
      expect(compose.status(), "The camera-clip composition request should queue.").toBe(202);

      let composition: CompositionStatus["composition"];
      await expect.poll(async () => {
        const response = await ownerRequest.get(
          `/api/community/stories/${storyId}/moment-composition`,
          { headers: authorization(owner.token) },
        );
        if (!response.ok()) return "unavailable";
        composition = (await response.json() as CompositionStatus).composition;
        return composition?.status ?? "missing";
      }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).toBe("ready");
      expect(composition?.source_count).toBe(2);
      expect(composition?.duration_ms).toBeGreaterThan(0);

      const userBRequest = await createAuthenticatedRequest(playwright, otherUser.token);
      requests.push(userBRequest);
      const userBStatus = await userBRequest.get(
        `/api/community/stories/${storyId}/moment-composition`,
      );
       expect(userBStatus.status(), sameCommunityNarrow
         ? "A same-Community viewer may read the published Story composition."
         : "USER_B must not read the disposable Story composition.").toBe(sameCommunityNarrow ? 200 : 404);
      const userBGrant = await userBRequest.post(
        `/api/community/stories/${storyId}/moment-composition/playback-grant`,
      );
       expect(userBGrant.status(), sameCommunityNarrow
         ? "A same-Community viewer may obtain a private playback grant."
         : "USER_B must not receive a private playback grant.").toBe(sameCommunityNarrow ? 200 : 404);

      const anonymousRequest = await playwright.request.newContext({ baseURL: baseUrl, timeout: 30_000 });
      requests.push(anonymousRequest);
      const anonymousStatus = await anonymousRequest.get(
        `/api/community/stories/${storyId}/moment-composition`,
      );
      await expectSuccess(anonymousStatus, "Anonymous access to the composition must be denied.", [401, 403, 404]);
      const anonymousGrant = await anonymousRequest.post(
        `/api/community/stories/${storyId}/moment-composition/playback-grant`,
      );
      await expectSuccess(anonymousGrant, "Anonymous playback-grant requests must be denied.", [401, 403, 404]);

      const grant = await ownerRequest.post(composition!.playback_grant_url, {
        headers: authorization(owner.token),
      });
      expect(grant.ok(), "The owner should receive a private playback grant.").toBeTruthy();
      expect(grant.headers()["cache-control"]).toContain("private");
      const playback = await grant.json() as { playback_url?: string };
      expect(playback.playback_url).toBe(`/api/community/stories/${storyId}/moment-composition/play`);
      const cookieHeader = grant.headers()["set-cookie"];
      expect(cookieHeader, "The grant must be conveyed only by a private cookie.").toBeTruthy();
      const grantCookie = cookieHeader!.split(";")[0];
      const rangeResponse = await anonymousRequest.get(playback.playback_url!, {
        headers: { Cookie: grantCookie, Range: "bytes=0-31" },
      });
      expect(rangeResponse.status(), "The private playback grant should authorize a byte-range response.").toBe(206);
      expect(rangeResponse.headers()["content-type"]).toContain("video/mp4");
      expect(rangeResponse.headers()["content-range"]).toMatch(/^bytes 0-31\/\d+$/);
      expect((await rangeResponse.body()).length).toBe(32);

      const fullPlayback = await anonymousRequest.get(playback.playback_url!, {
        headers: { Cookie: grantCookie },
      });
      expect(fullPlayback.status(), "The granted portrait composition should stream completely.").toBe(200);
      const composedBytes = await fullPlayback.body();
      expect(composedBytes.length).toBeGreaterThan(0);
      expect(composedBytes.length).toBeLessThanOrEqual(64 * 1024 * 1024);
      const composedPath = path.join(temporaryDirectory, "portrait-composition.mp4");
      fs.writeFileSync(composedPath, composedBytes, { mode: 0o600 });
      fs.chmodSync(composedPath, 0o600);
      const portraitProbe = await execFileAsync("ffprobe", [
        "-hide_banner", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", composedPath,
      ], { timeout: 30_000, maxBuffer: 1024 * 1024 });
      expect(portraitProbe.stdout.trim().split("x").map(Number))
        .toEqual([1080, 1920]);

      const ungrantedPlayback = await anonymousRequest.get(playback.playback_url!);
      expect(ungrantedPlayback.status(), "Anonymous playback without the private grant must be denied.").toBe(404);

      if (!sameCommunityNarrow) {
        await verifyMomentShareLink(browser, storyId!, caption, otherUser.token);
      }
      certificationSucceeded = true;
    } catch (error) {
      primaryError = error;
      primaryTestFailed = true;
    } finally {
      const ownerRequest = cleanupOwnerRequest;
      if (retainProductionMedia) {
        try {
          if (ownerRequest && !storyId) {
            const discovered = await locateStoriesByCaption(ownerRequest, owner.token, caption);
            if (discovered.length > 1) throw new Error("multiple Stories matched the unique certification caption");
            if (discovered.length === 1) storyId = discovered[0];
          }
          if (certificationSucceeded) {
            if (!ownerRequest || !storyId || sourceAssetIds.length !== 2) {
              throw new Error("the completed Story and both source assets could not be identified");
            }
            const retainedStories = await locateStoriesByCaption(ownerRequest, owner.token, caption);
            if (!retainedStories.includes(storyId)) throw new Error("the retained Story is not visible to its owner");
            for (const assetId of new Set(sourceAssetIds)) {
              const retainedAsset = await ownerRequest.get(`/api/media-assets/${assetId}`, {
                headers: authorization(owner.token),
                timeout: 30_000,
              });
              if (!retainedAsset.ok()) throw new Error(`retained asset ${assetId} returned HTTP ${retainedAsset.status()}`);
            }
            process.stdout.write(
              `MEDIA_CERT_RETAINED story_id=${storyId} source_asset_ids=${sourceAssetIds.join(",")} caption=${caption}\n`,
            );
          } else {
            process.stderr.write(
              `MEDIA_CERT_PRESERVED_AFTER_FAILURE story_id=${storyId ?? "unknown"} source_asset_ids=${sourceAssetIds.join(",") || "unknown"} caption=${caption}\n`,
            );
          }
        } catch {
          process.stderr.write(
            `MEDIA_CERT_RETAIN_VERIFY_FAILED story_id=${storyId ?? "unknown"} source_asset_ids=${sourceAssetIds.join(",") || "unknown"} caption=${caption}\n`,
          );
          if (certificationSucceeded) cleanupError = "retained Story or media could not be verified";
        }
      } else {
        // A lost publish response is reconciled using the unique caption, then
        // every known staging asset is explicitly tombstoned after Story cleanup.
        try {
          if (ownerRequest) {
            if (!storyId) {
              const discovered = await locateStoriesByCaption(ownerRequest, owner.token, caption);
              if (discovered.length > 1) cleanupError = "multiple Stories matched the unique certification caption";
              if (discovered.length === 1) storyId = discovered[0];
            }
            if (possibleUntrackedStory && !storyId) {
              cleanupError = "a Story publish may have committed but its id could not be reconciled";
            }
            if (possibleUntrackedUpload) {
              cleanupError = "an upload initialization may have committed without returning a cleanable asset id";
            }

            let storyDeleted = !storyId && !possibleUntrackedStory;
            if (storyId) {
              try {
                const deletion = await ownerRequest.delete(`/api/community/stories/${storyId}`, {
                  headers: authorization(owner.token),
                  timeout: 30_000,
                });
                let body: { deleted?: boolean; error_code?: string } = {};
                try {
                  body = await deletion.json() as { deleted?: boolean; error_code?: string };
                } catch {
                  // Keep the exact HTTP status as the cleanup result.
                }
                if (deletion.status() === 200 && body.deleted === true) {
                  storyDeleted = true;
                } else if (deletion.status() === 429) {
                  const retryAfter = deletion.headers()["retry-after"];
                  const rateLimit = deletion.headers()["ratelimit"];
                  const retryHint = retryAfter
                    ? `; retry-after=${retryAfter}`
                    : rateLimit
                      ? `; rate-limit=${rateLimit}`
                      : "";
                  cleanupError = `Story cleanup was rate limited (HTTP 429${retryHint}); no automatic retry was sent`;
                } else if (deletion.status() === 409 && body.error_code === "STORY_MEDIA_PROCESSING") {
                  cleanupError = "Story cleanup is blocked by active media processing; no automatic retry was sent";
                } else {
                  cleanupError = `Story cleanup returned HTTP ${deletion.status()}${body.error_code ? ` (${body.error_code})` : ""}; no automatic retry was sent`;
                }
              } catch {
                cleanupError = "Story cleanup result is unknown; no automatic retry was sent";
              }
              if (storyDeleted) {
                try {
                  const afterDelete = await ownerRequest.get(`/api/community/stories/${storyId}/moment-composition`, {
                    headers: authorization(owner.token),
                  });
                  if (afterDelete.status() !== 404) cleanupError = "deleted Story composition did not return 404";
                } catch {
                  cleanupError = "deleted Story composition could not be verified";
                }
                try {
                  const remainingStories = await locateStoriesByCaption(ownerRequest, owner.token, caption);
                  if (remainingStories.includes(storyId)) {
                    cleanupError = "the certification Story remains visible after deletion";
                  }
                } catch {
                  cleanupError = "the certification Story feed could not be verified after deletion";
                }
              }
            }

            if (storyDeleted) {
              for (const assetId of new Set(sourceAssetIds)) {
                try {
                  const deletion = await ownerRequest.delete(`/api/media-assets/${assetId}`, {
                    headers: authorization(owner.token),
                    timeout: 30_000,
                  });
                  if (![204, 404].includes(deletion.status())) {
                    cleanupError = `asset ${assetId} deletion returned HTTP ${deletion.status()}`;
                    continue;
                  }
                  const absent = await ownerRequest.get(`/api/media-assets/${assetId}`, {
                    headers: authorization(owner.token),
                    timeout: 30_000,
                  });
                  if (absent.status() !== 404) cleanupError = `asset ${assetId} remained accessible after deletion`;
                  const session = await ownerRequest.get(`/api/media-assets/${assetId}/upload-session`, {
                    headers: authorization(owner.token),
                  });
                  if (session.status() !== 404) cleanupError = `asset ${assetId} upload session remained available after deletion`;
                } catch {
                  cleanupError = `asset ${assetId} cleanup could not be verified`;
                }
              }
              if (storyId) {
                const remainingStories = await locateStoriesByCaption(ownerRequest, owner.token, caption);
                if (remainingStories.length) cleanupError = "the certification Story remains visible after deletion";
              }
            }
          } else if (sourceAssetIds.length || storyId || possibleUntrackedUpload || possibleUntrackedStory) {
            cleanupError = "no authenticated request context remained available for fixture cleanup";
          }
        } catch {
          cleanupError = "fixture cleanup reconciliation failed";
        }
      }

      await Promise.allSettled(requests.map((request) => request.dispose()));
      try {
        await rm(temporaryDirectory, { recursive: true, force: true });
      } catch {
        cleanupError = "local synthetic fixture directory could not be removed";
      }
      if (cleanupError) {
        const fixtureReferences = `caption=${caption}; story_id=${storyId ?? "unknown"}; source_asset_ids=${sourceAssetIds.join(",") || "unknown"}`;
        const errorPrefix = retainProductionMedia ? "RETAINED MEDIA VERIFICATION FAILED" : "CLEANUP INCOMPLETE";
        const primaryFailure = primaryTestFailed
          ? ` Original acceptance failure: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}.`
          : "";
        throw new Error(`${errorPrefix}: ${cleanupError}. ${fixtureReferences}.${primaryFailure} Stop certification and arrange operator follow-up before retrying.`);
      }
    }
    if (primaryTestFailed) throw primaryError;
  });
});