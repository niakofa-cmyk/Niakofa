import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "@jest/globals";
import { MAX_MEDIA_BYTES } from "../lib/media-validation";
import { getMediaToolPaths } from "../lib/mediaCapabilities";
import {
  momentClipNormalizeArgs,
  momentConcatArgs,
  withinMomentDurationLimit,
} from "../lib/moment-video-compose";

const execFileAsync = promisify(execFile);
const { ffmpeg, ffprobe } = getMediaToolPaths();
// Generic CI runners need not have FFmpeg installed. A release/toolchain
// certification can require this real-media test instead of silently skipping it.
const missingTool = [ffmpeg, ffprobe].find((tool) =>
  spawnSync(tool, ["-version"], { stdio: "ignore", timeout: 5_000 }).error?.code === "ENOENT");
const mediaIt = missingTool && process.env.REQUIRE_MEDIA_TOOLCHAIN_TEST !== "1" ? it.skip : it;

async function runTool(executable: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(executable, args, {
    timeout: 25_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

async function probe(filePath: string): Promise<{
  durationMs: number;
  streams: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
}> {
  const stdout = await runTool(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
    "-of", "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  return {
    durationMs: Math.round(Number(parsed.format?.duration) * 1000),
    streams: parsed.streams ?? [],
  };
}

describe("real FFmpeg Moment camera-clip composition", () => {
  mediaIt("normalizes silent and audio clips, concatenates them, probes output, and removes all temporary files", async () => {
    await runTool(ffmpeg, ["-version"]);
    await runTool(ffprobe, ["-version"]);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "niakofa-moment-compose-test-"));
    try {
      const silentSource = path.join(tempDir, "silent-source.mp4");
      const audioSource = path.join(tempDir, "audio-source.mp4");
      await runTool(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=320x240:r=24:d=0.6",
        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        silentSource,
      ]);
      await runTool(ffmpeg, [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=24:duration=0.7",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=0.7",
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-shortest",
        audioSource,
      ]);

      const inputFiles = [silentSource, audioSource];
      const inputProbes = await Promise.all(inputFiles.map(probe));
      expect(inputProbes[0]?.streams.some((stream) => stream.codec_type === "audio")).toBe(false);
      expect(inputProbes[1]?.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
      const durations = inputProbes.map((item) => item.durationMs);
      expect(withinMomentDurationLimit(durations)).toBe(true);

      const normalizedFiles: string[] = [];
      for (let index = 0; index < inputFiles.length; index++) {
        const source = inputFiles[index]!;
        const output = path.join(tempDir, `normalized-${index + 1}.mp4`);
        const sourceProbe = inputProbes[index]!;
        await runTool(ffmpeg, momentClipNormalizeArgs(
          source,
          output,
          sourceProbe.durationMs,
          sourceProbe.streams.some((stream) => stream.codec_type === "audio"),
        ));
        normalizedFiles.push(output);
      }

      const concatList = path.join(tempDir, "clips.txt");
      await writeFile(concatList, normalizedFiles.map((file) => `file ${file}`).join("\n") + "\n");
      const output = path.join(tempDir, "composed.mp4");
      await runTool(ffmpeg, momentConcatArgs(concatList, output, normalizedFiles.length));

      const outputInfo = await probe(output);
      const videoStreams = outputInfo.streams.filter((stream) => stream.codec_type === "video");
      const audioStreams = outputInfo.streams.filter((stream) => stream.codec_type === "audio");
      expect(videoStreams).toHaveLength(1);
      expect(audioStreams).toHaveLength(1);
      expect(videoStreams[0]).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
      expect(audioStreams[0]?.codec_name).toBe("aac");
      expect(Math.abs(outputInfo.durationMs - durations.reduce((sum, value) => sum + value, 0))).toBeLessThanOrEqual(200);
      const outputStat = await stat(output);
      expect(outputStat.size).toBeGreaterThan(0);
      expect(outputStat.size).toBeLessThanOrEqual(MAX_MEDIA_BYTES);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      expect(existsSync(tempDir)).toBe(false);
    }
  }, 90_000);
});