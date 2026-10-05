import { expect, test } from "@playwright/test";

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const configuredHost = new URL(baseUrl).hostname;
const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(configuredHost);

test.describe("authenticated Spark Studio source flow (local)", () => {
  test.skip(
    !isLoopback || !process.env.USER_A_STATE,
    "Requires a local preview and a pre-provisioned authenticated development account.",
  );

  test("starts with source choices, carries text into editing, and does not request camera access", async ({ page }) => {
    await page.setViewportSize({ width: 402, height: 874 });
    await page.addInitScript(() => {
      const browserWindow = window as Window & { __sparkMediaAccessCalls?: number };
      browserWindow.__sparkMediaAccessCalls = 0;
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) return;

      const getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        value: (...args: Parameters<MediaDevices["getUserMedia"]>) => {
          browserWindow.__sparkMediaAccessCalls = (browserWindow.__sparkMediaAccessCalls ?? 0) + 1;
          return getUserMedia(...args);
        },
      });
    });

    await page.goto(new URL("/community/moments?composer=1", baseUrl).toString());

    const composer = page.getByRole("dialog", { name: "Create a Spark" });
    await expect(composer).toBeVisible();
    await expect(page.getByTestId("button-spark-camera")).toBeVisible();
    await expect(page.getByTestId("button-spark-gallery")).toBeVisible();
    await expect(page.getByTestId("button-spark-text")).toBeVisible();
    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Start");
    await expect.poll(() => page.evaluate(() => (window as Window & { __sparkMediaAccessCalls?: number }).__sparkMediaAccessCalls ?? 0)).toBe(0);

    const sourceWords = "A quick note from the local browser check.";
    await page.locator("#spark-source-words").fill(sourceWords);
    await page.getByTestId("button-spark-start-with-words").click();

    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Make it yours");
    const previewSurface = page.locator(".nia-story-editor-surface");
    await expect(previewSurface.getByText(sourceWords, { exact: true })).toBeVisible();
    const previewGeometry = await previewSurface.evaluate((element) => {
      const surface = element.getBoundingClientRect();
      const text = element.querySelector("[aria-label='Edit text']")?.getBoundingClientRect();
      return {
        width: surface.width,
        height: surface.height,
        surfaceTop: surface.top,
        surfaceBottom: surface.bottom,
        captionTop: text?.top ?? surface.top - 1,
        captionBottom: text?.bottom ?? surface.bottom + 1,
      };
    });
    expect(previewGeometry.width).toBeGreaterThan(100);
    expect(previewGeometry.height).toBeGreaterThan(150);
    expect(previewGeometry.width / previewGeometry.height).toBeCloseTo(9 / 16, 1);
    expect(previewGeometry.captionTop).toBeGreaterThanOrEqual(previewGeometry.surfaceTop - 1);
    expect(previewGeometry.captionBottom).toBeLessThanOrEqual(previewGeometry.surfaceBottom + 1);
    await expect(page.getByTestId("button-spark-continue")).toBeEnabled();
    await expect(page.getByRole("navigation", { name: "Spark editing tools" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { __sparkMediaAccessCalls?: number }).__sparkMediaAccessCalls ?? 0)).toBe(0);

    await page.getByTestId("button-spark-continue").click();
    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Audience");
    await expect(page.getByLabel("Spark audience", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Go back to editing" }).click();
    await expect(page.locator(".nia-story-composer__step[aria-current='step']")).toContainText("Make it yours");
  });
});
