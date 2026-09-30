/**
 * SparksCameraRecorder.tsx
 * In-app live camera capture for Niakofa Sparks (Reels / Shorts style).
 *
 * Features
 *  - Live vertical (9:16) preview via getUserMedia
 *  - Tap to start / stop, or press-and-hold to record
 *  - Multi-clip recording with a segmented progress bar and "delete last clip"
 *  - Max total duration (default 60s), auto-stop at the limit
 *  - Front/back camera flip, torch where supported
 *  - 3-2-1 countdown option
 *  - Safari/iOS-safe MIME negotiation (mp4 fallback when webm is unavailable)
 *  - Clean camera shutdown on unmount and on tab hide (avoids stuck camera light)
 *  - Returns clips to the parent; the parent uploads them to your existing
 *    media pipeline (ffmpeg concat/transcode happens server-side, see notes)
 *
 * Wire-up: <SparksCameraRecorder onComplete={(clips) => handOffToDraft(clips)} />
 * Requires HTTPS (or localhost) for camera access.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type RecordedClip = {
  id: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  facing: "user" | "environment";
  previewUrl: string;
};

type Props = {
  maxTotalMs?: number; // default 60_000
  minClipMs?: number; // clips shorter than this are discarded (accidental taps)
  countdownSeconds?: 0 | 3;
  onComplete: (clips: RecordedClip[]) => void;
  onCancel?: () => void;
};

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2", // Safari / iOS
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

function describeError(err: unknown): string {
  const name = (err as DOMException)?.name;
  switch (name) {
    case "NotAllowedError":
      return "Camera or microphone access was blocked. Allow access in your browser settings and try again.";
    case "NotFoundError":
      return "No camera was found on this device.";
    case "NotReadableError":
      return "Another app is using the camera. Close it and try again.";
    case "OverconstrainedError":
      return "This camera can't record in the requested format.";
    default:
      return "The camera couldn't start. Check permissions and try again.";
  }
}

export default function SparksCameraRecorder({
  maxTotalMs = 60_000,
  minClipMs = 500,
  countdownSeconds = 0,
  onComplete,
  onCancel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const clipStartRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdActiveRef = useRef(false);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [clips, setClips] = useState<RecordedClip[]>([]);
  const [recording, setRecording] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const mimeType = useMemo(pickMimeType, []);
  const recordedMs = clips.reduce((s, c) => s + c.durationMs, 0);
  const totalMs = recordedMs + (recording ? currentMs : 0);
  const remainingMs = Math.max(0, maxTotalMs - recordedMs);

  /* ---------- camera lifecycle ---------- */

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  const startStream = useCallback(
    async (face: "user" | "environment") => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("This browser can't record video. Try the latest Chrome, Safari, or Edge.");
        return;
      }
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: face },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
            aspectRatio: { ideal: 9 / 16 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorchSupported(Boolean(caps.torch));
        setTorchOn(false);
        setReady(true);
      } catch (err) {
        setError(describeError(err));
      }
    },
    [stopStream]
  );

  useEffect(() => {
    void startStream(facing);
    return stopStream;
  }, [facing, startStream, stopStream]);

  // Release the camera when the tab is hidden; resume when visible again.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        if (recorderRef.current?.state === "recording") stopClip();
        stopStream();
      } else if (!streamRef.current) {
        void startStream(facing);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, startStream, stopStream]);

  // Revoke object URLs on unmount.
  useEffect(
    () => () => {
      clips.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* ---------- recording ---------- */

  const clearTick = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const stopClip = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const beginClip = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || remainingMs <= 0) return;

    chunksRef.current = [];
    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 4_000_000,
      audioBitsPerSecond: 128_000,
    });
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      clearTick();
      const durationMs = Math.min(performance.now() - clipStartRef.current, remainingMs);
      setRecording(false);
      setCurrentMs(0);
      if (durationMs < minClipMs || chunksRef.current.length === 0) return;

      const type = rec.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      setClips((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          blob,
          mimeType: type,
          durationMs,
          facing,
          previewUrl: URL.createObjectURL(blob),
        },
      ]);
    };

    rec.onerror = () => {
      clearTick();
      setRecording(false);
      setError("Recording stopped unexpectedly. Your earlier clips are safe.");
    };

    clipStartRef.current = performance.now();
    rec.start(1000); // emit a chunk every second so a crash loses little
    setRecording(true);

    tickRef.current = window.setInterval(() => {
      const elapsed = performance.now() - clipStartRef.current;
      setCurrentMs(elapsed);
      if (elapsed >= remainingMs) stopClip(); // hard stop at the limit
    }, 100);
  }, [facing, minClipMs, mimeType, remainingMs, stopClip]);

  const runCountdownThenRecord = useCallback(() => {
    if (!countdownSeconds) return beginClip();
    let n: number = countdownSeconds;
    setCountdown(n);
    const id = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(id);
        setCountdown(null);
        beginClip();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, [beginClip, countdownSeconds]);

  /* Tap toggles; hold (>300ms) records while pressed. */
  const onPressStart = () => {
    if (!ready || countdown !== null) return;
    if (recording) return;
    holdActiveRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      holdActiveRef.current = true;
      beginClip();
    }, 300);
  };

  const onPressEnd = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (holdActiveRef.current) {
      holdActiveRef.current = false;
      stopClip(); // released after a hold
    } else if (recording) {
      stopClip(); // tap to stop
    } else if (ready && countdown === null) {
      runCountdownThenRecord(); // tap to start
    }
  };

  /* ---------- controls ---------- */

  const deleteLast = () =>
    setClips((prev) => {
      const last = prev[prev.length - 1];
      if (last) URL.revokeObjectURL(last.previewUrl);
      return prev.slice(0, -1);
    });

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as MediaTrackConstraintSet] });
      setTorchOn((v) => !v);
    } catch {
      setTorchSupported(false);
    }
  };

  const finish = () => {
    if (recording) stopClip();
    stopStream();
    onComplete(clips);
  };

  /* ---------- render ---------- */

  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const pct = (ms: number) => `${Math.min(100, (ms / maxTotalMs) * 100)}%`;

  return (
    <div className="sparks-cam" role="dialog" aria-label="Record a Spark">
      <style>{css}</style>

      <video
        ref={videoRef}
        className={`sparks-cam__video ${facing === "user" ? "is-mirrored" : ""}`}
        playsInline
        muted
        autoPlay
      />

      {/* segmented progress */}
      <div className="sparks-cam__bar" aria-hidden="true">
        {clips.map((c) => (
          <span key={c.id} className="seg" style={{ width: pct(c.durationMs) }} />
        ))}
        {recording && <span className="seg seg--live" style={{ width: pct(currentMs) }} />}
      </div>

      <div className="sparks-cam__top">
        <button className="ghost" onClick={() => { stopStream(); onCancel?.(); }} aria-label="Close camera">✕</button>
        <span className="time" aria-live="polite">{fmt(totalMs)} / {fmt(maxTotalMs)}</span>
        <div className="stack">
          <button className="ghost" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={recording} aria-label="Flip camera">⟲</button>
          {torchSupported && (
            <button className={`ghost ${torchOn ? "on" : ""}`} onClick={toggleTorch} aria-pressed={torchOn} aria-label="Toggle light">☀</button>
          )}
        </div>
      </div>

      {countdown !== null && <div className="sparks-cam__count" aria-live="assertive">{countdown}</div>}
      {error && <div className="sparks-cam__error" role="alert">{error}<button onClick={() => startStream(facing)}>Try again</button></div>}

      <div className="sparks-cam__bottom">
        <button className="ghost" onClick={deleteLast} disabled={!clips.length || recording}>
          Delete last clip
        </button>

        <button
          className={`rec ${recording ? "rec--live" : ""}`}
          onPointerDown={onPressStart}
          onPointerUp={onPressEnd}
          onPointerLeave={() => holdActiveRef.current && onPressEnd()}
          disabled={!ready || remainingMs <= 0}
          aria-label={recording ? "Stop recording" : "Start recording"}
        />

        <button className="next" onClick={finish} disabled={!clips.length && !recording}>
          Next
        </button>
      </div>
    </div>
  );
}

const css = `
.sparks-cam{position:relative;width:100%;max-width:440px;aspect-ratio:9/16;margin:0 auto;background:#0d0d10;color:#fff;overflow:hidden;border-radius:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none}
.sparks-cam__video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.is-mirrored{transform:scaleX(-1)}
.sparks-cam__bar{position:absolute;top:10px;left:12px;right:12px;height:4px;display:flex;gap:2px;background:rgba(255,255,255,.22);border-radius:2px;overflow:hidden}
.seg{display:block;height:100%;background:#fff}
.seg--live{background:#ff5a3c}
.sparks-cam__top{position:absolute;top:22px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-start}
.stack{display:flex;flex-direction:column;gap:10px}
.time{font-variant-numeric:tabular-nums;font-size:14px;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.45)}
.ghost{min-width:44px;min-height:44px;border:0;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font-size:16px;padding:0 12px;cursor:pointer}
.ghost.on{background:#ffc94d;color:#111}
.ghost:disabled{opacity:.4;cursor:default}
.ghost:focus-visible,.rec:focus-visible,.next:focus-visible{outline:3px solid #7cc4ff;outline-offset:2px}
.sparks-cam__bottom{position:absolute;left:0;right:0;bottom:0;padding:20px 16px 28px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;background:linear-gradient(transparent,rgba(0,0,0,.6))}
.sparks-cam__bottom .ghost{justify-self:start;font-size:13px}
.rec{width:76px;height:76px;border-radius:50%;border:4px solid #fff;background:#ff5a3c;cursor:pointer;transition:transform .15s,border-radius .15s}
.rec--live{transform:scale(.86);border-radius:22px}
.rec:disabled{opacity:.4}
.next{justify-self:end;min-height:44px;padding:0 20px;border:0;border-radius:999px;background:#1e90ff;color:#fff;font-weight:600;cursor:pointer}
.next:disabled{opacity:.4;cursor:default}
.sparks-cam__count{position:absolute;inset:0;display:grid;place-items:center;font-size:120px;font-weight:700;text-shadow:0 4px 30px rgba(0,0,0,.6)}
.sparks-cam__error{position:absolute;left:16px;right:16px;top:40%;padding:16px;border-radius:14px;background:rgba(20,20,24,.94);font-size:14px;line-height:1.4}
.sparks-cam__error button{display:block;margin-top:10px;min-height:40px;padding:0 16px;border:0;border-radius:999px;background:#fff;color:#111;font-weight:600}
@media (prefers-reduced-motion:reduce){.rec{transition:none}}
`;
