import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const configuredHost = new URL(baseUrl).hostname;
const isWorkspacePreview = configuredHost === process.env.REPLIT_DEV_DOMAIN;
const isLocal = ["127.0.0.1", "localhost", "::1"].includes(configuredHost) || isWorkspacePreview;

async function applyApiSecurityHeaders(page: Page) {
  const apiResponse = await page.request.get(new URL("/api/healthz", baseUrl).toString());
  expect(apiResponse.ok(), "the local API must serve its security headers").toBe(true);
  const apiHeaders = apiResponse.headers();
  const contentSecurityPolicy = apiHeaders["content-security-policy"];
  expect(contentSecurityPolicy).toContain("media-src 'self' blob:");

  await page.route("**/e2e-test/spark-camera.html", async (route) => {
    const response = await route.fetch();
    const headers = {
      ...response.headers(),
      "content-security-policy": contentSecurityPolicy,
      ...(apiHeaders["permissions-policy"]
        ? { "permissions-policy": apiHeaders["permissions-policy"] }
        : {}),
    };
    await route.fulfill({ response, headers });
  });
}

async function observeMediaRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const browserWindow = window as Window & { __sparkMediaConstraints?: MediaStreamConstraints[] };
    browserWindow.__sparkMediaConstraints = [];
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) return;

    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    Object.defineProperty(mediaDevices, "getUserMedia", {
      configurable: true,
      value: (constraints: MediaStreamConstraints) => {
        browserWindow.__sparkMediaConstraints?.push(constraints);
        return originalGetUserMedia(constraints);
      },
    });
  });
}

async function mediaRequests(page: Page): Promise<MediaStreamConstraints[]> {
  return page.evaluate(() => (
    (window as Window & { __sparkMediaConstraints?: MediaStreamConstraints[] }).__sparkMediaConstraints ?? []
  ));
}

async function confirmCameraChoice(page: Page): Promise<void> {
  await expect(page.getByTestId("status-spark-camera-off")).toBeVisible();
  expect(await mediaRequests(page), "mounting the composer must not request camera or microphone").toHaveLength(0);

  await page.getByTestId("button-setup-spark-camera").click();
  await expect(page.getByTestId("button-confirm-spark-camera")).toBeVisible();
  expect(await mediaRequests(page), "opening the consent sheet must not request camera or microphone").toHaveLength(0);

  await page.getByTestId("button-confirm-spark-camera").click();
  await expect.poll(async () => (await mediaRequests(page)).length).toBeGreaterThan(0);
}

test.describe("Spark camera browser capture", () => {
  test.skip(
    !isLocal || process.env.SPARK_CAMERA_BROWSER_E2E !== "1" || process.env.PLAYWRIGHT_FAKE_MEDIA !== "1",
    "Runs only against the local Vite preview with Chromium fake camera and microphone enabled.",
  );

  test("records a playable video and hands a non-empty browser file to the Spark composer", async ({ page }) => {
    await observeMediaRequests(page);
    await applyApiSecurityHeaders(page);
    await page.addInitScript(() => {
      const originalPlay = HTMLMediaElement.prototype.play;
      let interruptedPreviewOnce = false;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (!interruptedPreviewOnce && this.matches('[data-testid="video-spark-recorded-preview"]')) {
          interruptedPreviewOnce = true;
          HTMLMediaElement.prototype.play = originalPlay;
          return Promise.reject(new DOMException("Playback was interrupted by a source change.", "AbortError"));
        }
        return originalPlay.call(this);
      };
    });
    await page.goto(new URL("/e2e-test/spark-camera.html", baseUrl).toString());
    await expect(page.getByTestId("dialog-spark-camera")).toBeVisible();
    await confirmCameraChoice(page);
    expect(
      (await mediaRequests(page)).some((constraints) => constraints.audio === true),
      "video setup requests microphone access only after explicit confirmation",
    ).toBe(true);
    const record = page.getByTestId("button-record-spark-video");
    await expect(record).toBeVisible({ timeout: 15_000 });
    await record.click();
    const finish = page.getByTestId("button-finish-spark-camera");
    await expect(finish).toBeVisible();
    await page.waitForTimeout(1_500);
    await finish.click();

    const preview = page.getByTestId("video-spark-recorded-preview");
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((video: HTMLVideoElement) => video.readyState >= 1), {
      timeout: 10_000,
    }).toBe(true);
    await page.getByTestId("button-play-spark-preview").click();
    await expect(page.getByText(/recorded clip preview could not be loaded/i)).toHaveCount(0);
    const playbackStarted = await preview.evaluate(async (video: HTMLVideoElement) => {
      video.muted = true;
      const start = video.currentTime;
      await video.play();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
      return video.currentTime > start;
    });
    expect(playbackStarted, "the freshly recorded local clip should advance during playback").toBe(true);

    await page.getByTestId("button-use-spark-camera").click();
    const result = page.getByTestId("result-spark-camera");
    await expect(result).toContainText(/video\/(?:webm|mp4):[1-9]\d*/);
  });

  test("captures a camera photo and hands a non-empty image to the Spark composer", async ({ page }) => {
    await observeMediaRequests(page);
    await applyApiSecurityHeaders(page);
    await page.goto(new URL("/e2e-test/spark-camera.html", baseUrl).toString());
    await expect(page.getByTestId("dialog-spark-camera")).toBeVisible();
    await page.getByRole("button", { name: "Photo", exact: true }).click();
    await confirmCameraChoice(page);
    await expect(page.getByTestId("button-capture-spark-photo")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("button-capture-spark-photo").click();
    const preview = page.locator('img[alt="Captured Spark photo preview"]');
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth > 0), {
      timeout: 10_000,
    }).toBe(true);
    await page.getByTestId("button-use-spark-camera").click();
    await expect(page.getByTestId("result-spark-camera")).toContainText(/image\/(?:jpeg|png):[1-9]\d*/);
  });

  test("closing consent or choosing device media never requests camera access", async ({ page }) => {
    await observeMediaRequests(page);
    await applyApiSecurityHeaders(page);
    await page.goto(new URL("/e2e-test/spark-camera.html", baseUrl).toString());
    await expect(page.getByTestId("status-spark-camera-off")).toBeVisible();

    await page.getByTestId("button-setup-spark-camera").click();
    await page.getByRole("button", { name: "Close camera setup" }).click();
    await expect(page.getByTestId("button-confirm-spark-camera")).toHaveCount(0);
    expect(await mediaRequests(page)).toHaveLength(0);

    await page.getByTestId("button-setup-spark-camera").click();
    await page.getByTestId("button-choose-media-instead").click();
    await expect(page.getByTestId("result-spark-camera")).toHaveText("gallery");
    expect(await mediaRequests(page)).toHaveLength(0);
  });
});