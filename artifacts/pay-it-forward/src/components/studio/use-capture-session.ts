import { useCallback, useEffect, useRef, useState } from "react";
import { chooseRecorderMimeType, recordedVideoMimeType, storyCameraErrorMessage } from "../community/story-camera-utils";

export type CaptureFacing = "user" | "environment";
export type CaptureStatus = "idle" | "starting" | "live" | "recording" | "error";

const IDLE_RELEASE_MS = 30_000;

const stop = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

/**
 * One persistent camera session for the whole Studio.
 *  - Audio + video are acquired once; recording many clips never calls
 *    getUserMedia again (a second call restarts phone cameras and blacks the preview).
 *  - Flipping camera swaps only the video track and keeps the mic track.
 *  - Leaving capture for review only disables tracks (instant return, no permission
 *    prompt, no black frame). The camera is fully released after IDLE_RELEASE_MS.
 */
export function useCaptureSession() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const limitRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const resolveClipRef = useRef<((file: File | null) => void) | null>(null);
  const disposedRef = useRef(false);
  const requestRef = useRef(0);

  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [facing, setFacing] = useState<CaptureFacing>("user");
  const [error, setError] = useState("");
  const [micAvailable, setMicAvailable] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [canFlip, setCanFlip] = useState(false);

  const clearTimers = () => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (limitRef.current) window.clearTimeout(limitRef.current);
    tickRef.current = limitRef.current = null;
  };

  const attach = (stream: MediaStream) => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    video.muted = true; // never echo the mic through the speaker
    video.playsInline = true;
    void video.play().catch(() => undefined);
  };

  const refreshCapabilities = (stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    setTorchSupported(Boolean(caps.torch));
    setTorchOn(false);
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      if (!disposedRef.current) setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
    }).catch(() => undefined);
  };

  const release = useCallback(() => {
    clearTimers();
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = null;
    stop(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (!disposedRef.current) { setStatus("idle"); setTorchOn(false); setTorchSupported(false); }
  }, []);

  const start = useCallback(async (nextFacing?: CaptureFacing) => {
    const wanted = nextFacing ?? facing;
    if (idleRef.current) { window.clearTimeout(idleRef.current); idleRef.current = null; }
    // Warm path: stream still open (suspended). Re-enable, no new permission prompt.
    const existing = streamRef.current;
    if (existing && existing.getTracks().every((t) => t.readyState === "live") && !nextFacing) {
      existing.getTracks().forEach((t) => { t.enabled = true; });
      attach(existing);
      setStatus("live");
      return;
    }
    const request = ++requestRef.current;
    setStatus("starting");
    setError("");
    try {
      let stream: MediaStream;
      const video = { facingMode: { ideal: wanted }, width: { ideal: 1080 }, height: { ideal: 1920 } };
      if (existing && nextFacing) {
        // Flip: new video track only; keep the live mic track.
        const fresh = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        existing.getVideoTracks().forEach((t) => { t.stop(); existing.removeTrack(t); });
        fresh.getVideoTracks().forEach((t) => existing.addTrack(t));
        stream = existing;
      } else {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
          setMicAvailable(true);
        } catch (reason) {
          if ((reason as { name?: string })?.name === "NotAllowedError" || (reason as { name?: string })?.name === "NotFoundError") {
            // Camera without mic is still a usable Studio; say so instead of failing.
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
            setMicAvailable(false);
          } else throw reason;
        }
      }
      if (disposedRef.current || request !== requestRef.current) { if (stream !== streamRef.current) stop(stream); return; }
      streamRef.current = stream;
      attach(stream);
      refreshCapabilities(stream);
      setFacing(wanted);
      setStatus("live");
    } catch (reason) {
      if (disposedRef.current || request !== requestRef.current) return;
      setError(storyCameraErrorMessage(reason));
      setStatus("error");
    }
  }, [facing]);

  /** Leave capture for review: keep the session warm, then release if the user lingers. */
  const suspend = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => { t.enabled = false; });
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(release, IDLE_RELEASE_MS);
    setStatus((current) => (current === "recording" ? current : "idle"));
  }, [release]);

  const flip = useCallback(async () => {
    if (status === "recording") return;
    await start(facing === "user" ? "environment" : "user");
  }, [facing, start, status]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { setTorchSupported(false); }
  }, [torchOn, torchSupported]);

  /** Start a clip; the promise resolves with the finished File when it stops (manual or at the budget). */
  const recordClip = useCallback((maxMs: number): Promise<File | null> => {
    const stream = streamRef.current;
    if (!stream || recorderRef.current || maxMs < 500) return Promise.resolve(null);
    const probe = document.createElement("video");
    const mimeType = chooseRecorderMimeType(
      stream.getAudioTracks().length > 0,
      (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
      (type) => probe.canPlayType(type),
    );
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 4_000_000 } : undefined); }
    catch { setError("This browser cannot record video here. Choose a video from your library instead."); return Promise.resolve(null); }
    chunksRef.current = [];
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    return new Promise<File | null>((resolve) => {
      resolveClipRef.current = resolve;
      recorder.onstop = () => {
        clearTimers();
        const elapsed = Date.now() - startedAtRef.current;
        const type = recordedVideoMimeType(chunksRef.current, recorder.mimeType, mimeType) || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        recorderRef.current = null;
        resolveClipRef.current = null;
        if (!disposedRef.current) { setStatus("live"); setElapsedMs(0); }
        if (!blob.size || elapsed < 400) { resolve(null); return; }
        const ext = type.includes("mp4") ? "mp4" : "webm";
        resolve(new File([blob], `studio-${Date.now()}.${ext}`, { type: type.split(";")[0], lastModified: Date.now() }));
      };
      recorder.onerror = () => { setError("Recording stopped unexpectedly. Your earlier clips are safe."); recorder.state !== "inactive" && recorder.stop(); };
      startedAtRef.current = Date.now();
      recorder.start(250);
      setStatus("recording");
      tickRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
      limitRef.current = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, maxMs);
    });
  }, []);

  const stopClip = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const capturePhoto = useCallback(async (): Promise<File | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (facing === "user") { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ? new File([blob], `studio-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }) : null;
  }, [facing]);

  // Phones kill the camera when the app is backgrounded. Finish the clip we have, then recover on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stopClip();
      else if (streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === "ended")) {
        streamRef.current = null;
        void start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [start, stopClip]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      resolveClipRef.current?.(null);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") { recorder.onstop = null; recorder.stop(); }
      clearTimers();
      if (idleRef.current) window.clearTimeout(idleRef.current);
      stop(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return { videoRef, status, facing, error, micAvailable, elapsedMs, torchSupported, torchOn, canFlip, start, suspend, release, flip, toggleTorch, recordClip, stopClip, capturePhoto };
}
