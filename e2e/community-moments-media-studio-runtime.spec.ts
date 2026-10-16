import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type MatrixStorageState = {
  cookies: unknown[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

type FixtureUser = {
  id: number;
  name: string;
  approval_status: string;
  community_id: number | null;
};

type MomentMedia = {
  id: number;
  media_type: "photo" | "video";
  mime_type: string;
  duration_ms: number | null;
};

type MomentStory = {
  id: number;
  caption: string;
  status: string;
  media: MomentMedia[];
};

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:18848";
const accountAState = process.env.MATRIX_USER_A_STATE;
const accountBState = process.env.MATRIX_USER_B_STATE;
const marker = process.env.MATRIX_STUDIO_FIXTURE_MARKER ?? "";
const jpegPath = process.env.MATRIX_STUDIO_JPEG_PATH ?? "";
const mp4Path = process.env.MATRIX_STUDIO_MP4_PATH ?? "";
// A harmless reserved-domain URL deterministically enters the real moderation
// queue. Ordinary captions are correctly auto-published and cannot prove the
// owner-only pending-review boundary.
const reviewSignal = "https://example.invalid/moments-runtime-review";

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

async function readFixtureUser(statePath: string): Promise<FixtureUser> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as MatrixStorageState;
  const storedUser = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((entry) => entry.name === "niakofa_user");
  if (!storedUser) throw new Error("The local Media Studio state is missing its approved fixture user.");
  return JSON.parse(storedUser.value) as FixtureUser;
}

type UploadedFile = { name: string; mimeType: string; buffer: Buffer };

async function openAccount(
  browser: Browser,
  statePath: string,
): Promise<{ context: BrowserContext; page: Page; user: FixtureUser }> {
  const user = await readFixtureUser(statePath);
  const context = await browser.newContext({ storageState: statePath });
  return { context, page: await context.newPage(), user };
}

async function enterStudio(page: Page): Promise<void> {
  await page.goto(new URL("/community/moments", baseUrl).toString());
  await expect(page.getByTestId("button-create-moment-fullbleed")).toBeVisible();
  await page.getByTestId("button-create-moment-fullbleed").click();
  await expect(page.getByTestId("media-studio")).toBeVisible({ timeout: 30_000 });
}

async function chooseFiles(page: Page, files: string | UploadedFile): Promise<void> {
  await page.getByLabel("Choose photos or videos").setInputFiles(files);
}

async function describeSelectedMedia(page: Page, description: string): Promise<void> {
  const detailsButton = page.getByRole("button", { name: /description \(required\)/i });
  await expect(detailsButton).toBeVisible();
  await detailsButton.click();
  const details = page.getByRole("group", { name: /^details for (photo|video) 1$/i });
  await expect(details).toBeVisible();
  await details.getByLabel(/description \(required\)/i).fill(description);
  await details.getByRole("button", { name: "Done" }).click();
}

async function publishCurrentMoment(page: Page, caption: string, description: string): Promise<number> {
  await page.getByLabel("Caption").fill(caption);
  await describeSelectedMedia(page, description);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share to" })).toBeVisible();
  await page.getByRole("button", { name: "Share Moment" }).click();
  await expect(page.getByTestId("media-studio")).toHaveCount(0, { timeout: 120_000 });
  await expect(page).toHaveURL(/\/community\/moments\?.*sparkId=\d+/);
  const storyId = Number(new URL(page.url()).searchParams.get("sparkId"));
  expect(Number.isSafeInteger(storyId)).toBe(true);
  expect(storyId).toBeGreaterThan(0);
  await expect(page.getByTestId(`card-moment-${storyId}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(`status-spark-pending-review-${storyId}`)).toContainText(
    "Only you can see this Spark while it is being reviewed.",
  );
  return storyId;
}

async function getStory(page: Page, caption: string): Promise<MomentStory> {
  return page.evaluate(async (wantedCaption) => {
    const token = localStorage.getItem("niakofa_token") ?? "";
    const response = await fetch("/api/community/stories", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Moment feed returned ${response.status}.`);
    const body = await response.json() as { stories?: MomentStory[] };
    const story = body.stories?.find((item) => item.caption === wantedCaption);
    if (!story) throw new Error(`The owner feed does not contain the expected Moment: ${wantedCaption}`);
    return story;
  }, caption);
}

async function expectPhotoDecoded(page: Page, storyId: number): Promise<void> {
  const photo = page.getByTestId(`card-moment-${storyId}`).locator("img").first();
  await expect(photo).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => (
    image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
  ))).toBe(true);
}

async function expectVideoAdvances(page: Page, storyId: number): Promise<void> {
  const video = page.getByTestId(`card-moment-${storyId}`).locator("video").first();
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => (
    element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && !element.paused
      && element.currentTime > 0.15
  )), { timeout: 30_000 }).toBe(true);
  const playback = await video.evaluate((element: HTMLVideoElement) => ({
    currentTime: element.currentTime,
    duration: element.duration,
    error: element.error?.message ?? null,
  }));
  expect(playback.error).toBeNull();
  expect(playback.duration).toBeGreaterThan(0);
}

async function createRecorderWebm(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer; duration: number }> {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The local browser cannot create a MediaRecorder canvas fixture.");
    const stream = canvas.captureStream(24);
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
    if (!mimeType) throw new Error("The local browser cannot encode a WebM MediaRecorder fixture.");

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 450_000 });
    const chunks: BlobPart[] = [];
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.addEventListener("error", (event) => reject(
        event instanceof ErrorEvent && event.error instanceof Error
          ? event.error
          : new Error("MediaRecorder failed."),
      ), { once: true });
    });
    recorder.start(80);
    const drawTimer = window.setInterval(() => {
      if (!context) return;
      context.fillStyle = `hsl(${Math.floor(performance.now() / 8) % 360} 75% 48%)`;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "white";
      context.font = "bold 34px sans-serif";
      context.fillText("RECORDER", 48, 100);
    }, 40);
    await new Promise((resolve) => window.setTimeout(resolve, 1_100));
    window.clearInterval(drawTimer);
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    const initialDuration = await new Promise<number>((resolve, reject) => {
      probe.onloadedmetadata = () => resolve(probe.duration);
      probe.onerror = () => reject(new Error("The generated MediaRecorder WebM could not be inspected."));
      probe.src = url;
    });
    URL.revokeObjectURL(url);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return {
      mimeType: blob.type.split(";")[0],
      base64: btoa(binary),
      duration: initialDuration,
    };
  });

  expect(result.mimeType).toBe("video/webm");
  expect(result.duration === Infinity || !Number.isFinite(result.duration)).toBe(true);
  return {
    name: `${marker}-mediarecorder.webm`,
    mimeType: result.mimeType,
    buffer: Buffer.from(result.base64, "base64"),
    duration: result.duration,
  };
}

const studioRuntimeSuite = process.env.MATRIX_STUDIO_RUNTIME_E2E === "1"
  && accountAState && accountBState && marker && jpegPath && mp4Path
  ? test.describe
  : test.describe.skip;

studioRuntimeSuite("real local Media Studio upload and playback regression", () => {

  test("uploads real JPEG, H.264 MP4, and headerless MediaRecorder WebM; keeps pending media private", async ({ browser }) => {
    test.setTimeout(300_000);
    if (!accountAState || !accountBState) throw new Error("The isolated A/B browser states are required.");
    const { context, page } = await openAccount(browser, accountAState);
    const captions = {
      mp4: `${marker} h264 ${reviewSignal}`,
      webm: `${marker} mediarecorder ${reviewSignal}`,
    };
    const createdStoryIds: number[] = [];

    try {
      await page.setViewportSize({ width: 402, height: 874 });
      const h264Capability = await page.evaluate(() => {
        const video = document.createElement("video");
        return video.canPlayType('video/mp4; codecs="avc1.42E01E"');
      });
      expect(h264Capability).not.toBe("");

      await enterStudio(page);
      await chooseFiles(page, jpegPath);
      await expect(page.getByAltText("Selected photo")).toBeVisible();
      await expect.poll(() => page.getByAltText("Selected photo").evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      )).toBe(true);
      const recoveredCaption = `${marker} draft survives invalid selection ${reviewSignal}`;
      await page.getByLabel("Caption").fill(recoveredCaption);
      await page.getByRole("button", { name: "Back to camera" }).click();
      let mediaUploadInitializations = 0;
      page.on("request", (browserRequest) => {
        const requestUrl = new URL(browserRequest.url());
        if (browserRequest.method() === "POST" && requestUrl.pathname === "/api/media-assets/uploads") {
          mediaUploadInitializations += 1;
        }
      });
      const uploadCountBeforeInvalidFile = mediaUploadInitializations;
      await chooseFiles(page, {
        name: `${marker}-invalid.png`,
        mimeType: "image/png",
        buffer: Buffer.from("not an image; renamed to PNG"),
      });
      await expect(page.getByTestId("media-studio").getByText(/contents don't match its media type/i)).toBeVisible();
      await page.waitForTimeout(300);
      expect(mediaUploadInitializations).toBe(uploadCountBeforeInvalidFile);
      await expect(page.getByRole("button", { name: /Next, review 1 items/ })).toBeVisible();
      await page.getByRole("button", { name: /Next, review 1 items/ }).click();
      await expect(page.getByLabel("Caption")).toHaveValue(recoveredCaption);
      await expect(page.getByRole("option", { name: "photo 1", exact: true })).toBeVisible();
      createdStoryIds.push(await publishCurrentMoment(page, recoveredCaption, "A bright JPEG photo uploaded through Media Studio."));
      await expectPhotoDecoded(page, createdStoryIds[0]);
      const photoStory = await getStory(page, recoveredCaption);
      expect(photoStory).toMatchObject({ id: createdStoryIds[0], status: "pending" });
      expect(photoStory.media[0]).toMatchObject({ media_type: "photo", mime_type: "image/jpeg" });

      await page.goto(new URL("/community/moments", baseUrl).toString());
      await enterStudio(page);
      await chooseFiles(page, mp4Path);
      await expect(page.getByLabel("Selected video")).toBeVisible();
      await expect.poll(() => page.getByLabel("Selected video").evaluate(
        (video: HTMLVideoElement) => video.duration,
      )).toBeGreaterThan(0);
      createdStoryIds.push(await publishCurrentMoment(page, captions.mp4, "A moving H.264 video uploaded through Media Studio."));
      await expectVideoAdvances(page, createdStoryIds[1]);
      const mp4Story = await getStory(page, captions.mp4);
      expect(mp4Story).toMatchObject({ id: createdStoryIds[1], status: "pending" });
      expect(mp4Story.media[0]).toMatchObject({ media_type: "video", mime_type: "video/mp4" });
      expect(mp4Story.media[0]?.duration_ms).toBeGreaterThan(0);

      await page.goto(new URL("/community/moments", baseUrl).toString());
      await enterStudio(page);
      const recorderFile = await createRecorderWebm(page);
      await chooseFiles(page, {
        name: recorderFile.name,
        mimeType: recorderFile.mimeType,
        buffer: recorderFile.buffer,
      });
      await expect(page.getByLabel("Selected video")).toBeVisible();
      const recorderItem = page.getByRole("option", { name: /^video 1,/i });
      await expect.poll(() => recorderItem.getAttribute("aria-label")).toMatch(/, 0:0[1-9]|, 0:[1-5]\d/);
      createdStoryIds.push(await publishCurrentMoment(
        page,
        captions.webm,
        "An animated MediaRecorder WebM video uploaded through Media Studio.",
      ));
      await expectVideoAdvances(page, createdStoryIds[2]);
      const webmStory = await getStory(page, captions.webm);
      expect(webmStory).toMatchObject({ id: createdStoryIds[2], status: "pending" });
      expect(webmStory.media[0]?.media_type).toBe("video");
      expect(webmStory.media[0]?.duration_ms).toBeGreaterThan(0);

      for (const storyId of [createdStoryIds[1], createdStoryIds[2]]) {
        await page.goto(new URL(`/community/moments?sparkId=${storyId}&audience=community`, baseUrl).toString());
        await expectVideoAdvances(page, storyId);
        await page.reload();
        await expectVideoAdvances(page, storyId);
        await page.goto(new URL("/community", baseUrl).toString());
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`sparkId=${storyId}`));
        await expectVideoAdvances(page, storyId);
      }
      await page.goto(new URL(`/community/moments?sparkId=${createdStoryIds[0]}&audience=community`, baseUrl).toString());
      await expectPhotoDecoded(page, createdStoryIds[0]);
      await page.reload();
      await expectPhotoDecoded(page, createdStoryIds[0]);

      const ownerToken = await page.evaluate(() => localStorage.getItem("niakofa_token") ?? "");
      const ownerFeedIds = await page.evaluate(async (token) => {
        const response = await fetch("/api/community/stories", { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json() as { stories?: Array<{ id: number; status: string }> };
        return (body.stories ?? []).filter((story) => story.id && story.status === "pending").map((story) => story.id);
      }, ownerToken);
      for (const storyId of createdStoryIds) expect(ownerFeedIds).toContain(storyId);

      const viewer = await openAccount(browser, accountBState);
      try {
        expect(viewer.user.approval_status).toBe("approved");
        await viewer.page.goto(new URL("/community/moments", baseUrl).toString());
        await expect(viewer.page.getByTestId("list-moments-feed")).toBeVisible();
        const viewerAccess = await viewer.page.evaluate(async ({ storyIds, mediaItems }) => {
          const token = localStorage.getItem("niakofa_token") ?? "";
          const headers = { Authorization: `Bearer ${token}` };
          const feedResponse = await fetch("/api/community/stories", { headers });
          const feedBody = await feedResponse.json() as { stories?: Array<{ id: number }> };
          const mediaChecks = await Promise.all(mediaItems.map(async (item) => {
            const media = await fetch(`/api/community/stories/media/${item.id}`, { headers });
            const grant = item.video
              ? await fetch(`/api/community/stories/media/${item.id}/playback-grant`, {
                method: "POST",
                headers,
              })
              : null;
            return { id: item.id, media: media.status, grant: grant?.status ?? null };
          }));
          return {
            missingFromFeed: storyIds.filter((id) => (feedBody.stories ?? []).some((story) => story.id === id)),
            mediaChecks,
          };
        }, {
          storyIds: createdStoryIds,
          mediaItems: [
            { id: photoStory.media[0]?.id, video: false },
            { id: mp4Story.media[0]?.id, video: true },
            { id: webmStory.media[0]?.id, video: true },
          ],
        });
        expect(viewerAccess.missingFromFeed).toEqual([]);
        expect(viewerAccess.mediaChecks).toEqual([
          { id: photoStory.media[0]?.id, media: 404, grant: null },
          { id: mp4Story.media[0]?.id, media: 404, grant: 404 },
          { id: webmStory.media[0]?.id, media: 404, grant: 404 },
        ]);
        for (const storyId of createdStoryIds) {
          await expect(viewer.page.getByTestId(`card-moment-${storyId}`)).toHaveCount(0);
        }
      } finally {
        await viewer.context.close();
      }
    } finally {
      await context.close();
    }
  });

  test("renders legacy audience colors and remains within a phone viewport", async ({ browser }) => {
    test.setTimeout(60_000);
    if (!accountAState) throw new Error("The isolated author browser state is required.");
    const legacyStoryId = Number(process.env.MATRIX_LEGACY_STORY_ID);
    expect(Number.isSafeInteger(legacyStoryId)).toBe(true);
    const { context, page } = await openAccount(browser, accountAState);
    try {
      await page.setViewportSize({ width: 402, height: 874 });
      await page.goto(new URL(`/community/moments?sparkId=${legacyStoryId}&audience=community`, baseUrl).toString());
      const card = page.getByTestId(`card-moment-${legacyStoryId}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveCSS("background-color", "rgb(18, 52, 86)");
      const legacyText = card.getByText("Legacy color compatibility check", { exact: true });
      await expect(legacyText).toBeVisible();
      await expect(legacyText).toHaveCSS("color", "rgb(254, 254, 254)");
      const mobileBounds = await page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        card: document.querySelector<HTMLElement>("[data-testid^='card-moment-']")?.getBoundingClientRect(),
      }));
      expect(mobileBounds.document).toBeLessThanOrEqual(mobileBounds.viewport);
      expect(mobileBounds.card).toBeTruthy();
      expect(mobileBounds.card!.left).toBeGreaterThanOrEqual(0);
      expect(mobileBounds.card!.right).toBeLessThanOrEqual(mobileBounds.viewport + 1);
    } finally {
      await context.close();
    }
  });
});
