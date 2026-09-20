#!/usr/bin/env node
/**
 * Certify the production media toolchain without enabling MEDIA_PLATFORM_V21.
 *
 * This performs a real synthetic media run: FFmpeg creates a tiny MP4 and
 * FFprobe reads its video metadata. Run it on the same image as the media
 * worker. It does not write to object storage or mutate application data.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH ?? "ffprobe";

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-toolchain-"));
  const output = path.join(tempDir, "probe.mp4");
  try {
    const ffmpegResult = await execFileAsync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=16x16:d=0.1",
        "-frames:v",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-y",
        output,
      ],
      { timeout: 15_000 },
    );
    const { stdout: probeOutput } = await execFileAsync(
      ffprobe,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        output,
      ],
      { timeout: 15_000 },
    );
    const parsed = JSON.parse(String(probeOutput));
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream.height) {
      throw new Error("FFprobe did not return a usable video stream.");
    }

    const [ffmpegVersion] = String(ffmpegResult.stderr || "").trim().split("\n");
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          ffmpeg,
          ffprobe,
          smoke_test: "ffmpeg-generated-mp4-to-ffprobe",
          dimensions: `${stream.width}x${stream.height}`,
          ffmpeg_stderr: ffmpegVersion || null,
          media_platform_should_still_be_off: true,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `verify-media-toolchain: FAIL — ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}