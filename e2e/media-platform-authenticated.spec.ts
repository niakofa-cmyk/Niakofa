import { test, expect } from "@playwright/test";

const enabled = process.env.MEDIA_PLATFORM_V21_BROWSER_SMOKE === "1";
const contextKind = process.env.MEDIA_SMOKE_CONTEXT_KIND;
const contextId = Number(process.env.MEDIA_SMOKE_CONTEXT_ID);

test.describe("authenticated universal media smoke", () => {
  test.skip(
    !enabled || !process.env.USER_A_STATE || !contextKind || !Number.isSafeInteger(contextId) || contextId < 1,
    "Set MEDIA_PLATFORM_V21_BROWSER_SMOKE=1, USER_A_STATE, MEDIA_SMOKE_CONTEXT_KIND, and MEDIA_SMOKE_CONTEXT_ID for an authenticated run.",
  );

  test("uploads, finalizes, processes, and plays a real object", async ({ request, baseURL }) => {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const init = await request.post("/api/media-assets/uploads", {
      data: {
        contextKind,
        contextId,
        mediaType: "photo",
        mimeType: "image/png",
        originalName: "browser-smoke.png",
        byteSize: png.length,
      },
    });
    expect(init.status()).toBe(201);
    const initialized = await init.json() as {
      media_asset_id: number;
      upload: { url: string; headers: Record<string, string> };
      complete_url: string;
    };

    const uploadUrl = new URL(initialized.upload.url, baseURL);
    const upload = await request.put(uploadUrl.toString(), {
      data: png,
      headers: initialized.upload.headers,
    });
    expect(upload.status()).toBeLessThan(300);

    const complete = await request.post(initialized.complete_url);
    expect(complete.status()).toBe(202);

    await expect.poll(async () => {
      const response = await request.get(`/api/media-assets/${initialized.media_asset_id}`);
      return response.status();
    }, { timeout: 60_000, intervals: [1_000, 2_000, 5_000] }).toBe(200);
  });
});