import { itemKind, type StudioItem } from "./studio-policy";

export const newItemId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `i${Date.now()}${Math.random().toString(16).slice(2)}`);

/** MediaRecorder WebM often reports duration=Infinity, so camera clips use measured time instead. */
export function readVideoDurationMs(file: File, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) && video.duration > 0 ? Math.ceil(video.duration * 1000) : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export async function itemFromFile(file: File, source: StudioItem["source"], measuredMs?: number): Promise<StudioItem> {
  const kind = itemKind(file);
  const durationMs = kind === "video" ? (measuredMs ?? await readVideoDurationMs(file)) : null;
  return { id: newItemId(), file, kind, durationMs, source, coverTimeMs: 0 };
}

export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** The item that replaces `source` after a trim. Keeps the first-ever capture so nothing is lost across repeated trims. */
export function trimmedItem(source: StudioItem, file: File, durationMs: number | null): StudioItem {
  return { ...source, id: newItemId(), file, durationMs, coverTimeMs: 0, captionsVtt: "", original: source.original ?? { file: source.file, durationMs: source.durationMs } };
}

/** Undo every trim: back to the original capture, as a fresh item. */
export function untrimmedItem(source: StudioItem): StudioItem {
  if (!source.original) return source;
  const { original, ...rest } = source;
  return { ...rest, id: newItemId(), file: original.file, durationMs: original.durationMs, coverTimeMs: 0, captionsVtt: "" };
}
