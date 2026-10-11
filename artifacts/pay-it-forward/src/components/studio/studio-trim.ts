/**
 * Fast trim for Studio clips.
 *
 * The legacy trim (`trimVideoFile`) plays the clip back through a MediaRecorder,
 * so a 45 s trim costs 45 s. This engine remuxes with Mediabunny instead:
 *  - when the cut lands on (or within BOUNDARY_TOLERANCE_S of) a key frame, the encoded
 *    packets are copied: no quality loss, typically well under a second;
 *  - otherwise only the video is re-encoded with WebCodecs, still faster than real time.
 * The original File is never modified; the caller keeps it for Family originals and "Reset trim".
 */
import type * as Mediabunny from "mediabunny";

export const MIN_TRIM_MS = 1_000;
const BOUNDARY_TOLERANCE_S = 0.25;

export type TrimRange = { startMs: number; endMs: number };

export class TrimUnsupportedError extends Error {
  constructor(message = "Fast trimming is not supported on this device.") {
    super(message);
    this.name = "TrimUnsupportedError";
  }
}

/** Returns a user-facing reason the range is unusable, or null when it is fine. */
export function validateTrimRange(range: TrimRange, durationMs: number | null): string | null {
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) return "Choose a valid trim range.";
  if (range.startMs < 0) return "The trim cannot start before the video.";
  if (range.endMs - range.startMs < MIN_TRIM_MS) return "Keep at least 1 second.";
  if (durationMs !== null && range.endMs > durationMs + 50) return "The trim cannot end after the video.";
  return null;
}

export const trimmedDurationMs = (range: TrimRange) => Math.max(0, range.endMs - range.startMs);

/** True when the range already covers the whole clip, so applying it would be a no-op. */
export function isFullRange(range: TrimRange, durationMs: number | null): boolean {
  return range.startMs <= 50 && (durationMs === null || range.endMs >= durationMs - 50);
}

/** Keeps the handles in order and at least MIN_TRIM_MS apart when one is dragged past the other. */
export function moveTrimHandle(range: TrimRange, handle: "start" | "end", valueMs: number, durationMs: number): TrimRange {
  const clamped = Math.min(Math.max(0, valueMs), durationMs);
  if (handle === "start") return { startMs: Math.min(clamped, Math.max(0, range.endMs - MIN_TRIM_MS)), endMs: range.endMs };
  return { startMs: range.startMs, endMs: Math.max(clamped, Math.min(durationMs, range.startMs + MIN_TRIM_MS)) };
}

export const trimmedFileName = (name: string, extension: string) => `${name.replace(/\.[^.]+$/, "")}-trimmed.${extension}`;

export async function trimVideoFast(file: File, range: TrimRange, options: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {}): Promise<File> {
  const problem = validateTrimRange(range, null);
  if (problem) throw new Error(problem);
  if (!file.type.startsWith("video/")) throw new Error("Only videos can be trimmed.");

  let mb: typeof Mediabunny;
  try { mb = await import("mediabunny"); } catch { throw new TrimUnsupportedError("The trim tool could not be loaded."); }

  const wantsMp4 = /mp4|quicktime/.test(file.type);
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: wantsMp4 ? new mb.Mp4OutputFormat() : new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  let conversion: Awaited<ReturnType<typeof mb.Conversion.init>>;
  try {
    conversion = await mb.Conversion.init({
      input,
      output,
      trim: { start: range.startMs / 1000, end: range.endMs / 1000 },
      // Copy packets when the cut is (nearly) on a key frame; otherwise re-encode just enough to cut precisely.
      video: { forceTranscode: false },
      copy: { mode: "preferred", boundaryPolicy: "expand", boundaryTolerance: BOUNDARY_TOLERANCE_S },
    });
  } catch (reason) {
    input.dispose();
    throw new TrimUnsupportedError(reason instanceof Error ? reason.message : undefined);
  }
  if (!conversion.isValid) {
    input.dispose();
    throw new TrimUnsupportedError("This video format cannot be trimmed here.");
  }
  const onAbort = () => { void conversion.cancel(); };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  if (options.onProgress) conversion.onProgress = (fraction) => options.onProgress?.(fraction);
  try {
    await conversion.execute();
  } catch (reason) {
    if (options.signal?.aborted) throw Object.assign(new Error("Trim cancelled."), { name: "AbortError" });
    throw reason instanceof Error ? reason : new Error("The video could not be trimmed.");
  } finally {
    options.signal?.removeEventListener("abort", onAbort);
    input.dispose();
  }
  const buffer = (output.target as Mediabunny.BufferTarget).buffer;
  if (!buffer || buffer.byteLength === 0) throw new Error("Trimming produced no video.");
  const type = wantsMp4 ? "video/mp4" : "video/webm";
  return new File([buffer], trimmedFileName(file.name, wantsMp4 ? "mp4" : "webm"), { type, lastModified: Date.now() });
}
