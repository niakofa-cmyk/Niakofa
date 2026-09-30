import { Camera, Flashlight, Pause, Play, RotateCcw, Square, SwitchCamera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_RECORDING_MS = 60_000;
const MAX_ITEMS = 6;
const recorderTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function recorderMimeType() {
  return recorderTypes.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function isDocumentHidden() {
  return document.visibilityState === "hidden";
}

function cameraErrorMessage(reason: unknown) {
  const name = reason instanceof DOMException ? reason.name : "";
  if (name === "NotAllowedError") return "Camera or microphone permission was denied. Allow access in your browser settings and try again.";
  if (name === "NotFoundError") return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "The camera or microphone is in use by another app. Close it and try again.";
  if (name === "OverconstrainedError") return "This device cannot use the requested camera. Try another camera.";
  return reason instanceof Error ? reason.message : "Camera access could not be started. Try again.";
}

export function StoryCameraRecorder({ onUse, onCancel }: { onUse: (files: File[]) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingAudioRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const isPausedRef = useRef(false);
  const stopDurationMsRef = useRef<number | null>(null);
  const recordingFailedRef = useRef(false);
  const recordedVideoMsRef = useRef(0);
  const videoDurationByFileRef = useRef(new Map<File, number>());
  const phaseRef = useRef<"idle" | "camera" | "countdown" | "recording" | "paused" | "preview">("idle");
  const photoCapturePendingRef = useRef(false);
  const clipsRef = useRef<File[]>([]);
  const fileRef = useRef<File | null>(null);
  const cancelledRef = useRef(false);
  const disposedRef = useRef(false);
  const requestIdRef = useRef(0);
  const stopForInterruptionRef = useRef<() => void>(() => {});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<"idle" | "camera" | "countdown" | "recording" | "paused" | "preview">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [clips, setClips] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recordedVideoMs, setRecordedVideoMs] = useState(0);
  const [cameraSwitching, setCameraSwitching] = useState(false);
  phaseRef.current = phase;
  clipsRef.current = clips;
  fileRef.current = file;

  const stopRecordingAudio = () => {
    stopStream(recordingAudioRef.current);
    recordingAudioRef.current = null;
  };
  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const clearCountdown = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    if (!disposedRef.current) setCountdown(0);
  };
  const stopTracks = () => {
    stopStream(streamRef.current);
    stopRecordingAudio();
    streamRef.current = null;
    setTorchSupported(false);
    setTorchOn(false);
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  const updateRecordedVideoMs = (amount: number) => {
    recordedVideoMsRef.current = Math.min(MAX_RECORDING_MS, recordedVideoMsRef.current + amount);
    setRecordedVideoMs(recordedVideoMsRef.current);
  };
  const requestRecorderStop = (recorder: MediaRecorder) => {
    if (recorder.state === "inactive") return;
    stopDurationMsRef.current = isPausedRef.current
      ? elapsedRef.current
      : elapsedRef.current + Math.max(0, Date.now() - startedAtRef.current);
    clearTimer();
    recorder.stop();
  };
  const stopForInterruption = () => {
    requestIdRef.current += 1;
    setCameraSwitching(false);
    clearTimer();
    clearCountdown();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") requestRecorderStop(recorder);
    stopTracks();
    if (!recorder || recorder.state === "inactive") {
      const savedClips = clipsRef.current;
      if (savedClips.length) {
        setFile(fileRef.current ?? savedClips.at(-1) ?? null);
        setPhase("preview");
      } else if (phaseRef.current !== "preview") {
        setPhase("idle");
      }
    }
  };
  stopForInterruptionRef.current = stopForInterruption;

  useEffect(() => {
    disposedRef.current = false;
    const video = videoRef.current;
    const onVisibilityChange = () => {
      if (isDocumentHidden()) stopForInterruptionRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposedRef.current = true;
      cancelledRef.current = true;
      requestIdRef.current += 1;
      clearTimer();
      clearCountdown();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopStream(streamRef.current);
      stopStream(recordingAudioRef.current);
      recordingAudioRef.current = null;
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, []);

  useEffect(() => {
    if (phase !== "camera" || !streamRef.current || !videoRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      if (!disposedRef.current) setError("The camera preview could not be resumed. Try reopening the camera.");
    });
    return () => {
      if (video.srcObject === streamRef.current) video.srcObject = null;
    };
  }, [phase]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const activeElapsed = () => elapsedRef.current + (Date.now() - startedAtRef.current);
  const tick = () => {
    const remaining = Math.max(0, MAX_RECORDING_MS - recordedVideoMsRef.current);
    const next = Math.min(activeElapsed(), remaining);
    setElapsed(next);
    if (next >= remaining) {
      if (recorderRef.current) requestRecorderStop(recorderRef.current);
    }
  };
  const startClock = () => {
    clearTimer();
    timerRef.current = setInterval(tick, 200);
  };

  const startCamera = async () => {
    setError("");
    cancelledRef.current = false;
    if (streamRef.current) {
      setPhase("camera");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported in this browser. Choose media from your device.");
      return;
    }
    const requestId = ++requestIdRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current) {
        stopStream(stream);
        return;
      }
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = typeof track?.getCapabilities === "function"
        ? track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
        : undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if (disposedRef.current || cancelledRef.current || requestId !== requestIdRef.current) {
        stopStream(stream);
        if (streamRef.current === stream) {
          streamRef.current = null;
          setTorchSupported(false);
          setTorchOn(false);
        }
        return;
      }
      setPhase("camera");
    } catch (reason) {
      if (requestId === requestIdRef.current) stopTracks();
      if (!disposedRef.current && !cancelledRef.current && requestId === requestIdRef.current) {
        setError(cameraErrorMessage(reason));
      }
    }
  };

  const beginRecording = async () => {
    const stream = streamRef.current;
    const requestId = requestIdRef.current;
    if (clipsRef.current.length >= MAX_ITEMS) {
      setError("A Spark can contain up to six clips. Add the clips you have or remove one first.");
      return;
    }
    if (recordedVideoMsRef.current >= MAX_RECORDING_MS) {
      setError("The 60-second video limit has been reached. Add the clips you have or retake a photo.");
      return;
    }
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Video recording is not supported in this browser. You can still take a photo or choose a video.");
      return;
    }
    if (recordingStartingRef.current) return;
    const mimeType = recorderMimeType();
    if (!mimeType) {
      setError("This browser cannot record a supported video format.");
      return;
    }
    recordingStartingRef.current = true;
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current || streamRef.current !== stream) {
        stopStream(audioStream);
        return;
      }
      recordingAudioRef.current = audioStream;
      chunksRef.current = [];
      const recordingStream = new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      const recorder = new MediaRecorder(recordingStream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recordingFailedRef.current = true;
        clearTimer();
        requestRecorderStop(recorder);
        stopTracks();
        if (!disposedRef.current) {
          setPhase("idle");
          setError("Recording stopped because the camera reported an error. Try again.");
        }
      };
      recorder.onstop = () => {
        clearTimer();
        if (disposedRef.current || cancelledRef.current) return;
        const duration = stopDurationMsRef.current ?? (isPausedRef.current ? elapsedRef.current : activeElapsed());
        stopDurationMsRef.current = null;
        const spent = Math.min(duration, MAX_RECORDING_MS - recordedVideoMsRef.current);
        elapsedRef.current = 0;
        isPausedRef.current = false;
        setElapsed(0);
        if (recordingFailedRef.current) {
          recordingFailedRef.current = false;
          const savedClips = clipsRef.current;
          if (savedClips.length) {
            setFile(fileRef.current ?? savedClips.at(-1) ?? null);
            setPhase("preview");
          } else {
            setPhase("idle");
          }
          stopRecordingAudio();
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (!blob.size) {
          const savedClips = clipsRef.current;
          if (savedClips.length && !streamRef.current) {
            setFile(fileRef.current ?? savedClips.at(-1) ?? null);
            setPhase("preview");
          } else {
            setPhase(streamRef.current ? "camera" : "idle");
          }
          setError("No video was recorded. Try again.");
          stopRecordingAudio();
          return;
        }
        updateRecordedVideoMs(spent);
        const baseType = mimeType.split(";")[0];
        const recorded = new File([blob], `spark-${Date.now()}.${baseType === "video/mp4" ? "mp4" : "webm"}`, {
          type: baseType,
          lastModified: Date.now(),
        });
        videoDurationByFileRef.current.set(recorded, spent);
        fileRef.current = recorded;
        setFile(recorded);
        const nextClips = [...clipsRef.current, recorded];
        clipsRef.current = nextClips;
        setClips(nextClips);
        setPhase("preview");
        stopRecordingAudio();
      };
      elapsedRef.current = 0;
      isPausedRef.current = false;
      stopDurationMsRef.current = null;
      recordingFailedRef.current = false;
      setElapsed(0);
      startedAtRef.current = Date.now();
      recorder.start(200);
      setPhase("recording");
      startClock();
    } catch (reason) {
      stopRecordingAudio();
      if (!disposedRef.current && requestId === requestIdRef.current) {
        setPhase(streamRef.current ? "camera" : "idle");
        setError(cameraErrorMessage(reason));
      }
    } finally {
      recordingStartingRef.current = false;
    }
  };

  const startRecording = () => {
    setError("");
    if (!countdownEnabled) {
      void beginRecording();
      return;
    }
    setPhase("countdown");
    setCountdown(3);
    let remaining = 3;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearCountdown();
        if (!disposedRef.current && !cancelledRef.current) void beginRecording();
      }
    }, 1000);
  };

  const capturePhoto = () => {
    if (clipsRef.current.length >= MAX_ITEMS) {
      setError("A Spark can contain up to six clips. Add the clips you have or remove one first.");
      return;
    }
    const video = videoRef.current;
    if (photoCapturePendingRef.current) return;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("The camera is not ready yet. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("A photo could not be captured in this browser.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    photoCapturePendingRef.current = true;
    canvas.toBlob((blob) => {
      photoCapturePendingRef.current = false;
      if (disposedRef.current || cancelledRef.current) return;
      if (!blob) {
        setError("A photo could not be captured. Try again.");
        return;
      }
      const photo = new File([blob], `spark-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      const nextClips = [...clipsRef.current, photo];
      clipsRef.current = nextClips;
      setClips(nextClips);
      fileRef.current = photo;
      setFile(photo);
      stopTracks();
      setPhase("preview");
    }, "image/jpeg", 0.92);
  };

  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    const updated = Math.min(elapsedRef.current + Date.now() - startedAtRef.current, MAX_RECORDING_MS - recordedVideoMsRef.current);
    elapsedRef.current = updated;
    isPausedRef.current = true;
    setElapsed(updated);
    recorder.pause();
    clearTimer();
    setPhase("paused");
  };
  const resume = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    if (recordedVideoMsRef.current + elapsedRef.current >= MAX_RECORDING_MS) {
      requestRecorderStop(recorder);
      return;
    }
    startedAtRef.current = Date.now();
    isPausedRef.current = false;
    recorder.resume();
    setPhase("recording");
    startClock();
  };
  const finish = () => {
    const recorder = recorderRef.current;
    if (recorder) requestRecorderStop(recorder);
  };
  const retake = () => {
    const currentClips = clipsRef.current;
    const remaining = currentClips.slice(0, -1);
    const removed = currentClips.at(-1);
    if (removed) {
      const reclaimedMs = videoDurationByFileRef.current.get(removed) ?? 0;
      videoDurationByFileRef.current.delete(removed);
      recordedVideoMsRef.current = Math.max(0, recordedVideoMsRef.current - reclaimedMs);
      setRecordedVideoMs(recordedVideoMsRef.current);
    }
    clipsRef.current = remaining;
    fileRef.current = remaining.at(-1) ?? null;
    setClips(remaining);
    setFile(fileRef.current);
    setElapsed(0);
    elapsedRef.current = 0;
    setPhase(remaining.length ? "preview" : streamRef.current ? "camera" : "idle");
    setError("");
  };
  const recordAnother = () => {
    fileRef.current = null;
    setFile(null);
    setElapsed(0);
    elapsedRef.current = 0;
    setError("");
    if (streamRef.current) setPhase("camera");
    else void startCamera();
  };
  const flipCamera = async () => {
    if (cameraSwitching || phaseRef.current !== "camera" || !streamRef.current || !navigator.mediaDevices?.getUserMedia) return;
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    const previousFacing = facingMode;
    const requestId = ++requestIdRef.current;
    setCameraSwitching(true);
    setError("");
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchSupported(false);
    setTorchOn(false);
    const acquireCamera = (mode: "environment" | "user", exact: boolean) => navigator.mediaDevices.getUserMedia({
      video: { facingMode: exact ? { exact: mode } : { ideal: mode }, width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: false,
    });
    try {
      const nextStream = await acquireCamera(nextFacing, true);
      if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current) {
        stopStream(nextStream);
        return;
      }
      streamRef.current = nextStream;
      const track = nextStream.getVideoTracks()[0];
      const capabilities = typeof track?.getCapabilities === "function"
        ? track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
        : undefined;
      setTorchSupported(Boolean(capabilities?.torch));
      if (videoRef.current) {
        videoRef.current.srcObject = nextStream;
        void videoRef.current.play().catch(() => {
          if (!disposedRef.current && streamRef.current === nextStream) setError("The camera preview could not be resumed. Try reopening the camera.");
        });
      }
      setFacingMode(nextFacing);
      setPhase("camera");
    } catch {
      if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current) return;
      stopStream(streamRef.current);
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      try {
        const restoredStream = await acquireCamera(previousFacing, false);
        if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current) {
          stopStream(restoredStream);
          return;
        }
        streamRef.current = restoredStream;
        const track = restoredStream.getVideoTracks()[0];
        const capabilities = typeof track?.getCapabilities === "function"
          ? track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }
          : undefined;
        setTorchSupported(Boolean(capabilities?.torch));
        if (videoRef.current) {
          videoRef.current.srcObject = restoredStream;
          void videoRef.current.play().catch(() => {
            if (!disposedRef.current && streamRef.current === restoredStream) setError("The camera preview could not be resumed. Try reopening the camera.");
          });
        }
        setFacingMode(previousFacing);
        setPhase("camera");
        setError("That camera could not be opened. The previous camera has been restored.");
      } catch (restoreError) {
        if (disposedRef.current || requestId !== requestIdRef.current) return;
        stopTracks();
        setPhase("idle");
        setError(restoreError instanceof Error
          ? `Could not switch cameras or restore the previous camera: ${restoreError.message}`
          : "Could not switch cameras or restore the previous camera. Start the camera to try again.");
      }
    } finally {
      if (!disposedRef.current && requestId === requestIdRef.current) setCameraSwitching(false);
    }
  };
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const nextTorch = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextTorch } as MediaTrackConstraintSet] });
      if (streamRef.current?.getVideoTracks()[0] === track && !disposedRef.current) {
        setTorchOn(nextTorch);
        setError("");
      }
    } catch {
      if (!disposedRef.current && streamRef.current?.getVideoTracks()[0] === track) {
        setTorchSupported(false);
        setTorchOn(false);
        setError("The torch could not be enabled on this camera.");
      }
    }
  };
  const cancel = () => {
    cancelledRef.current = true;
    requestIdRef.current += 1;
    clearTimer();
    clearCountdown();
    setCameraSwitching(false);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    stopTracks();
    onCancel();
  };

  const totalSeconds = Math.ceil((recordedVideoMs + elapsed) / 1000);
  const remainingSeconds = Math.max(0, Math.ceil((MAX_RECORDING_MS - recordedVideoMs - elapsed) / 1000));
  const recordingStatus = `${totalSeconds} / 60 video seconds recorded · ${remainingSeconds} seconds remaining`;
  const statusText = `${cameraSwitching ? "Switching cameras… " : ""}${error ? `${error} · ` : ""}${phase === "preview"
    ? `Preview ${clips.length} of ${MAX_ITEMS} clip${clips.length === 1 ? "" : "s"} · ${Math.ceil(recordedVideoMs / 1000)} / 60 video seconds recorded · ${Math.max(0, Math.ceil((MAX_RECORDING_MS - recordedVideoMs) / 1000))} seconds remaining`
    : recordingStatus}`;

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Spark camera" data-testid="dialog-spark-camera">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-900 text-white">
      <div className="relative aspect-[9/16] max-h-[70vh] bg-black">
        {phase !== "preview" && <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Live Spark camera preview" />}
        {phase === "preview" && file && (file.type.startsWith("video/")
          ? <video src={previewUrl} controls playsInline className="h-full w-full object-contain" aria-label="Recorded Spark video preview" />
          : <img src={previewUrl} alt="Captured Spark photo preview" className="h-full w-full object-contain" />)}
        {phase === "countdown" && <span className="absolute inset-0 grid place-items-center text-7xl font-bold" aria-live="assertive">{countdown}</span>}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <span aria-live="polite" data-testid="status-spark-camera">{statusText}</span>
        <button type="button" onClick={cancel} aria-label="Cancel camera" data-testid="button-cancel-spark-camera"><X /></button>
      </div>
      {phase === "preview" && clips.length > 0 && <ol className="flex gap-2 overflow-x-auto px-4 pb-2" aria-label="Recorded Spark clip sequence">
        {clips.map((clip, index) => <li key={`${clip.name}-${index}`} className={`shrink-0 rounded-lg border px-3 py-1 text-xs ${clip === file ? "border-white bg-white/15" : "border-white/20"}`} aria-current={clip === file ? "step" : undefined} data-testid={`item-spark-clip-${index}`}>
          {clip.type.startsWith("video/") ? "Video" : "Photo"} {index + 1}
        </li>)}
      </ol>}
      {error && <p className="px-4 text-sm text-rose-300" role="alert" data-testid="error-spark-camera">{error}</p>}
      <div className="flex justify-center gap-3 p-4">
        {phase === "idle" && <button type="button" onClick={() => void startCamera()} className="rounded-full bg-white px-5 py-3 font-bold text-slate-900" data-testid="button-start-spark-camera">Start camera</button>}
        {phase === "camera" && <>
          <button type="button" onClick={capturePhoto} disabled={cameraSwitching || clips.length >= MAX_ITEMS} aria-label="Capture Spark photo" data-testid="button-capture-spark-photo"><Camera /> Photo</button>
          <button type="button" onClick={startRecording} disabled={cameraSwitching || recordedVideoMs >= MAX_RECORDING_MS || clips.length >= MAX_ITEMS} className="rounded-full bg-white px-5 py-3 font-bold text-slate-900 disabled:opacity-50" data-testid="button-record-spark-video">Record video</button>
          <button type="button" onClick={() => void flipCamera()} disabled={cameraSwitching} aria-label={`Switch to ${facingMode === "environment" ? "front" : "back"} camera`} data-testid="button-flip-spark-camera"><SwitchCamera /></button>
          {torchSupported && <button type="button" onClick={() => void toggleTorch()} disabled={cameraSwitching} aria-label={torchOn ? "Turn torch off" : "Turn torch on"} aria-pressed={torchOn} data-testid="button-toggle-spark-torch"><Flashlight /></button>}
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={countdownEnabled} disabled={cameraSwitching} onChange={(event) => setCountdownEnabled(event.target.checked)} data-testid="input-spark-countdown" />
            3-second countdown
          </label>
        </>}
        {(phase === "recording" || phase === "paused") && <>
          <button type="button" onClick={phase === "recording" ? pause : resume} aria-label={phase === "recording" ? "Pause recording" : "Resume recording"} data-testid={phase === "recording" ? "button-pause-spark-camera" : "button-resume-spark-camera"}>{phase === "recording" ? <Pause /> : <Play />}</button>
          <button type="button" onClick={finish} aria-label="Finish recording" data-testid="button-finish-spark-camera"><Square /></button>
        </>}
        {phase === "countdown" && <button type="button" onClick={() => { clearCountdown(); setPhase("camera"); }} className="rounded-xl border border-white/30 px-4 py-2 font-bold" data-testid="button-cancel-spark-countdown">Cancel countdown</button>}
        {phase === "preview" && file && <>
          <button type="button" onClick={retake} aria-label={`Retake Spark ${file.type.startsWith("video/") ? "video" : "photo"}`} data-testid="button-retake-spark-camera"><RotateCcw /> Retake</button>
          {clips.length < MAX_ITEMS && <button type="button" onClick={recordAnother} className="rounded-xl border border-white/30 px-4 py-2 font-bold" data-testid="button-record-another-spark-clip">Add another clip</button>}
          <button type="button" onClick={() => onUse(clips)} className="rounded-xl bg-white px-4 py-2 font-bold text-slate-900" data-testid="button-use-spark-camera">Add {clips.length} to Spark</button>
        </>}
      </div>
    </div>
  </div>;
}