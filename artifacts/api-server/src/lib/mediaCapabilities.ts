import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function verifyMediaToolchain(): Promise<void> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
  await execFileAsync(ffmpeg, ["-version"], { timeout: 5_000 });
  await execFileAsync(ffprobe, ["-version"], { timeout: 5_000 });
}