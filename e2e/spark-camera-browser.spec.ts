import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const configuredHost = new URL(baseUrl).hostname;
const isWorkspacePreview = configuredHost === process.env.REPLIT_DEV_DOMAIN;
const isLocal = ["127.0.0.1", "localhost", "::1"].includes(configuredHost) || isWorkspacePreview;

test.describe("Spark camera browser capture", () => {
  test.skip(
    !isLocal || process.env.SPARK_CAMERA_BROWSER_E2E !== "1" || process.env.PLAYWRIGHT_FAKE_MEDIA !== "1",
    "Runs only against the local Vite preview with Chromium fake camera and microphone enabled.",
  );

  test("records a playable video and hands a non-empty browser file to the Spark composer", async ({ page }) => {
    await page.goto(new URL("/e2e-test/spark-camera.html", baseUrl).toString());
    await expect(page.getByTestId("dialog-spark-camera")).toBeVisible();
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
    await page.goto(new URL("/e2e-test/spark-camera.html", baseUrl).toString());
    await expect(page.getByTestId("dialog-spark-camera")).toBeVisible();
    await page.getByRole("button", { name: "Photo", exact: true }).click();
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
});