import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  it("probes video from a private seekable file, tolerates stderr, and cleans it up", async () => {
    const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-validation-test-"));
    const fakeFfprobePath = path.join(fixtureDirectory, "ffprobe.cjs");
    const capturedInputPath = path.join(fixtureDirectory, "probe-input.txt");
    const previousFfprobePath = process.env["FFPROBE_PATH"];

    try {
      await writeFile(fakeFfprobePath, `#!${process.execPath}
const fs = require("node:fs");
const capturePath = ${JSON.stringify(capturedInputPath)};
const inputIndex = process.argv.indexOf("-i");
const inputPath = inputIndex < 0 ? "" : process.argv[inputIndex + 1];
if (!inputPath || inputPath === "pipe:0") process.exit(21);
const inputStat = fs.statSync(inputPath);
if (!inputStat.isFile()) process.exit(22);
const directoryStat = fs.statSync(require("node:path").dirname(inputPath));
fs.writeFileSync(capturePath, [
  inputPath,
  (inputStat.mode & 0o777).toString(8),
  (directoryStat.mode & 0o777).toString(8),
].join("\\n"));
process.stdout.write(JSON.stringify({
  streams: [{ codec_type: "video", width: 1280, height: 720, duration: "1.25" }],
  format: { duration: "1.25" },
}));
process.stderr.write("partial file\\n");
`, { flag: "wx", mode: 0o700 });
      process.env["FFPROBE_PATH"] = fakeFfprobePath;

      const mp4 = Buffer.alloc(16);
      Buffer.from("ftyp").copy(mp4, 4);
      await expect(validateMediaBuffer(mp4, "video", "video/mp4")).resolves.toEqual({
        width: 1280,
        height: 720,
        duration_ms: 1250,
      });

      const [probeInputPath, fileMode, directoryMode] = (await readFile(capturedInputPath, "utf8")).trim().split("\n");
      expect(probeInputPath).toContain("niakofa-media-probe-");
      expect(probeInputPath).not.toBe("pipe:0");
      expect(Number.parseInt(fileMode, 8) & 0o077).toBe(0);
      expect(Number.parseInt(directoryMode, 8) & 0o077).toBe(0);
      expect(existsSync(probeInputPath)).toBe(false);
      expect(existsSync(path.dirname(probeInputPath))).toBe(false);
    } finally {
      if (previousFfprobePath === undefined) delete process.env["FFPROBE_PATH"];
      else process.env["FFPROBE_PATH"] = previousFfprobePath;
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it("accepts valid WebP VP8L and VP8 dimension headers", async () => {
    const vp8l = Buffer.alloc(25);
    Buffer.from("RIFF").copy(vp8l, 0);
    Buffer.from("WEBP").copy(vp8l, 8);
    Buffer.from("VP8L").copy(vp8l, 12);
    vp8l[20] = 0x2f;
    const widthMinusOne = 319;
    const heightMinusOne = 239;
    vp8l[21] = widthMinusOne & 0xff;
    vp8l[22] = ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6);
    vp8l[23] = (heightMinusOne >> 2) & 0xff;
    vp8l[24] = (heightMinusOne >> 10) & 0x3f;

    await expect(validateMediaBuffer(vp8l, "photo", "image/WEBP")).resolves.toEqual({
      width: 320,
      height: 240,
      duration_ms: null,
    });

    const vp8 = Buffer.alloc(30);
    Buffer.from("RIFF").copy(vp8, 0);
    Buffer.from("WEBP").copy(vp8, 8);
    Buffer.from("VP8 ").copy(vp8, 12);
    vp8.set([0x9d, 0x01, 0x2a], 23);
    vp8.writeUInt16LE(640, 26);
    vp8.writeUInt16LE(480, 28);
    await expect(validateMediaBuffer(vp8, "photo", "image/webp")).resolves.toEqual({
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

  it("rejects unsupported media and malformed supported signatures", async () => {
    await expect(validateMediaBuffer(Buffer.from("%PDF-1.7"), "photo", "application/pdf"))
      .rejects.toThrow("MEDIA_TYPE_NOT_SUPPORTED");
    await expect(validateMediaBuffer(Buffer.from("RIFF"), "photo", "image/webp"))
      .rejects.toThrow("MEDIA_SIGNATURE_INVALID");
    await expect(validateMediaBuffer(Buffer.from("RIFFxxxxWEBPVP8L"), "photo", "image/webp"))
      .rejects.toThrow("MEDIA_METADATA_INVALID");
  });

  it("rejects image headers with invalid dimensions", async () => {
    const png = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
    await expect(validateMediaBuffer(png, "photo", "image/png"))
      .rejects.toThrow("MEDIA_DIMENSIONS_INVALID");
  });
});