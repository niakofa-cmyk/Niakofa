import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const getToolPaths = () => ({
  ffmpeg: process.env["FFMPEG_PATH"]?.trim() || "ffmpeg",
  ffprobe: process.env["FFPROBE_PATH"]?.trim() || "ffprobe",
});

async function verifyExecutable(name: "ffmpeg" | "ffprobe", executable: string): Promise<void> {
  try {
    await execFileAsync(executable, ["-version"], { timeout: 10_000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MEDIA_PLATFORM_V21 requires an executable FFmpeg/FFprobe toolchain. ${name} "${executable}" could not be executed. Install the ffmpeg runtime package in the production image or set ${name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"} to an executable binary. Original error: ${detail}`,
    );
  }
}

/**
 * Production media activation gate.
 *
 * This intentionally performs both binary checks and a real FFmpeg -> FFprobe
 * synthetic media smoke test. If either executable is missing or unusable,
 * startup throws before the HTTP server is created, so MEDIA_PLATFORM_V21
 * cannot activate against a broken production image.
 */
export async function verifyMediaToolchain(): Promise<void> {
  const { ffmpeg, ffprobe } = getToolPaths();
  await verifyExecutable("ffmpeg", ffmpeg);
  await verifyExecutable("ffprobe", ffprobe);

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
    const { stdout } = await execFileAsync(
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
    const parsed = JSON.parse(String(stdout)) as {
      streams?: Array<{ width?: number; height?: number }>;
    };
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream.height) {
      throw new Error("FFprobe did not return a usable video stream.");
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
