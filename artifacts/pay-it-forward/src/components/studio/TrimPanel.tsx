import { Loader2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { trimVideoFile } from "../community/story-media-tools";
import { formatClock, readVideoDurationMs } from "./studio-media";
import type { StudioItem } from "./studio-policy";
import { MIN_TRIM_MS, TrimUnsupportedError, isFullRange, moveTrimHandle, trimVideoFast, trimmedDurationMs, validateTrimRange, type TrimRange } from "./studio-trim";

type Props = {
  item: StudioItem;
  /** Move the preview to this point so the person sees the frame they are cutting at. */
  onSeek: (ms: number) => void;
  onApply: (file: File, durationMs: number | null) => void;
  onReset: () => void;
  onClose: () => void;
};

/** Start/end handles for one video. Fast remux first; real-time re-record only as a last resort. */
export function TrimPanel({ item, onSeek, onApply, onReset, onClose }: Props) {
  const durationMs = item.durationMs ?? 0;
  const [range, setRange] = useState<TrimRange>({ startMs: 0, endMs: durationMs });
  const [busy, setBusy] = useState<"" | "fast" | "realtime">("");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const move = (handle: "start" | "end", valueMs: number) => {
    const next = moveTrimHandle(range, handle, valueMs, durationMs);
    setRange(next);
    onSeek(handle === "start" ? next.startMs : Math.max(next.startMs, next.endMs - 300));
  };

  const apply = async () => {
    const problem = validateTrimRange(range, durationMs);
    if (problem) { setError(problem); return; }
    if (isFullRange(range, durationMs)) { onClose(); return; }
    setError("");
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy("fast");
    try {
      let file: File;
      try {
        file = await trimVideoFast(item.file, range, { signal: controller.signal });
      } catch (reason) {
        if (!(reason instanceof TrimUnsupportedError)) throw reason;
        // Older browsers: the previous real-time method still works, it is just slow.
        setBusy("realtime");
        file = await trimVideoFile(item.file, range.startMs / 1000, range.endMs / 1000);
      }
      onApply(file, (await readVideoDurationMs(file)) ?? trimmedDurationMs(range));
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "The video could not be trimmed. Your original is unchanged.");
    } finally {
      abortRef.current = null;
      setBusy("");
    }
  };

  if (!durationMs) return <p className="nk-studio__notice" role="status">This video's length could not be read, so it cannot be trimmed.</p>;

  return (
    <div className="nk-trim" role="group" aria-label="Trim video">
      <div className="nk-trim__times" aria-live="polite">
        <span>{formatClock(range.startMs)}</span>
        <b>{formatClock(trimmedDurationMs(range))} kept</b>
        <span>{formatClock(range.endMs)}</span>
      </div>
      <label className="nk-trim__row">
        <span>Start</span>
        <input type="range" min={0} max={durationMs} step={100} value={range.startMs} disabled={Boolean(busy)} aria-valuetext={formatClock(range.startMs)} onChange={(event) => move("start", Number(event.target.value))} />
      </label>
      <label className="nk-trim__row">
        <span>End</span>
        <input type="range" min={0} max={durationMs} step={100} value={range.endMs} disabled={Boolean(busy)} aria-valuetext={formatClock(range.endMs)} onChange={(event) => move("end", Number(event.target.value))} />
      </label>
      <p className="nk-trim__hint">Keeps at least {MIN_TRIM_MS / 1000} second. {item.original ? "Reset brings back your original recording." : "Your original recording is never changed."}</p>
      {busy && <p className="nk-studio__notice" role="status"><Loader2 className="inline h-4 w-4 animate-spin" aria-hidden="true" /> {busy === "fast" ? "Trimming…" : "This browser trims in real time, so it takes as long as the clip."}</p>}
      {error && <p className="nk-studio__notice" role="alert">{error}</p>}
      <div className="nk-studio__row">
        {item.original && <button type="button" className="nk-studio__pill" disabled={Boolean(busy)} onClick={onReset}><RotateCcw className="inline h-4 w-4" aria-hidden="true" /> Reset</button>}
        <button type="button" className="nk-studio__pill" disabled={busy === "realtime"} onClick={() => (busy ? abortRef.current?.abort() : onClose())}>Cancel</button>
        <button type="button" className="nk-studio__pill is-primary" disabled={Boolean(busy)} onClick={() => void apply()}>Apply trim</button>
      </div>
    </div>
  );
}
