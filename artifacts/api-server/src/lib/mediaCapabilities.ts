import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function verifyMediaToolchain(): Promise<void> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
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