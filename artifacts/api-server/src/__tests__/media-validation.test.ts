import { describe, expect, it } from "@jest/globals";
import { isAllowedMediaSize, MAX_MEDIA_BYTES, validateMediaBuffer } from "../lib/media-validation";

describe("universal media validation", () => {
  it("applies the shared inclusive 64 MiB upload and processing cap", () => {
    expect(MAX_MEDIA_BYTES).toBe(64 * 1024 * 1024);
    expect(isAllowedMediaSize(1)).toBe(true);
    expect(isAllowedMediaSize(MAX_MEDIA_BYTES)).toBe(true);
    expect(isAllowedMediaSize(MAX_MEDIA_BYTES + 1)).toBe(false);
    expect(isAllowedMediaSize(0)).toBe(false);
    expect(isAllowedMediaSize(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it("accepts a matching image signature and records dimensions", async () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);

    await expect(validateMediaBuffer(png, "photo", "image/png")).resolves.toEqual({
      width: 640,
      height: 480,
      duration_ms: null,
    });
  });

  it("rejects mismatched media types and client-declared MIME spoofing", async () => {
    const text = Buffer.from("not an image");
    await expect(validateMediaBuffer(text, "photo", "image/png"))
      .rejects.toThrow("MEDIA_SIGNATURE_INVALID");
    await expect(validateMediaBuffer(text, "document", "image/png"))
      .rejects.toThrow("MEDIA_TYPE_NOT_SUPPORTED");
  });

  it("rejects image headers with invalid dimensions", async () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    await expect(validateMediaBuffer(png, "photo", "image/png"))
      .rejects.toThrow("MEDIA_DIMENSIONS_INVALID");
  });
});