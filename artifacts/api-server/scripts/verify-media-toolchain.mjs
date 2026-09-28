#!/usr/bin/env node
/**
 * Certify the production media toolchain without enabling MEDIA_PLATFORM_V21.
 *
 * This performs explicit FFmpeg and FFprobe executable checks followed by a
 * real synthetic media run: FFmpeg creates a tiny MP4 and FFprobe reads its
 * video metadata. Run it on the same image as the media worker.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH?.trim() || "ffprobe";

async function verifyExecutable(name, executable) {
  try {
    await execFileAsync(executable, ["-version"], { timeout: 10_000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${name} "${executable}" is not executable. Install the ffmpeg runtime package in the production image or set ${name === "FFmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"} to an executable binary. Original error: ${detail}`,
    );
  }
}

async function main() {
  await verifyExecutable("FFmpeg", ffmpeg);
  await verifyExecutable("FFprobe", ffprobe);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-media-toolchain-"));
  const output = path.join(tempDir, "probe.mp4");
  try {
    await execFileAsync(
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

    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          ffmpeg,
          ffprobe,
          executable_checks: "ffmpeg-and-ffprobe-version",
          smoke_test: "ffmpeg-generated-mp4-to-ffprobe",
          dimensions: `${stream.width}x${stream.height}`,
          media_platform_flag_unchanged: true,
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
