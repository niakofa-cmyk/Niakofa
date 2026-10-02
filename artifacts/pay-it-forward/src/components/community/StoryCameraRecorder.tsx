import { Flashlight, ImagePlus, Pause, Play, RotateCcw, SwitchCamera, Timer, Type, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  STORY_CAMERA_CLIP_MAX_MS,
  STORY_CAMERA_MAX_ITEMS,
  STORY_CAMERA_MAX_RECORDING_MS,
  storyCameraConstraints,
  storyCameraErrorMessage,
  storyCameraRecordingConstraints,
  chooseRecorderMimeType,
  type StoryCameraFacingMode,
} from "./story-camera-utils";

const MAX_RECORDING_MS = STORY_CAMERA_MAX_RECORDING_MS;
const CLIP_MAX_MS = STORY_CAMERA_CLIP_MAX_MS;
const MAX_ITEMS = STORY_CAMERA_MAX_ITEMS;

function recorderMimeType(hasAudio: boolean) {
  const probe = document.createElement("video");
  return chooseRecorderMimeType(
    hasAudio,
    (type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
    (type) => probe.canPlayType(type),
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function isDocumentHidden() {
  return document.visibilityState === "hidden";
}

export function StoryCameraRecorder({ onUse, onCancel, onGallery, onText, allowText }: {
  onUse: (files: File[]) => void;
  onCancel: () => void;
  onGallery: () => void;
  onText: () => void;
  allowText: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
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
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [error, setError] = useState("");
  const [facingMode, setFacingMode] = useState<StoryCameraFacingMode>("user");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recordedVideoMs, setRecordedVideoMs] = useState(0);
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [cameraRequesting, setCameraRequesting] = useState(false);
  const [captureMode, setCaptureMode] = useState<"video" | "photo">("video");
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
    if (recorder.state === "recording") {
      try { recorder.requestData(); } catch { /* The stop event still flushes the last chunk. */ }
    }
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
    const live = phase === "camera" || phase === "countdown" || phase === "recording" || phase === "paused";
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!live || !video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => {
      if (!disposedRef.current && phaseRef.current !== "preview") {
        setError("The camera preview could not be resumed. Try reopening the camera.");
      }
    });
  }, [phase]);

  const previewUrlRef = useRef("");
  useEffect(() => {
    if (!file) {
      previewUrlRef.current = "";
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    const previous = previewUrlRef.current;
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setError("");
    return () => {
      window.setTimeout(() => {
        if (previewUrlRef.current !== url) URL.revokeObjectURL(url);
      }, 1500);
      if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1500);
    };
  }, [file]);

  const activeElapsed = () => elapsedRef.current + (Date.now() - startedAtRef.current);
  const clipRoom = () => Math.min(CLIP_MAX_MS, Math.max(0, MAX_RECORDING_MS - recordedVideoMsRef.current));
  const tick = () => {
    const remaining = clipRoom();
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
    setCameraRequesting(true);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(storyCameraRecordingConstraints(facingMode));
      } catch (reason) {
        const name = reason && typeof reason === "object" && "name" in reason ? String((reason as { name?: string }).name) : "";
        if (name !== "NotAllowedError" && name !== "NotFoundError") throw reason;
        stream = await navigator.mediaDevices.getUserMedia(storyCameraConstraints(facingMode));
      }
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
        setError(storyCameraErrorMessage(reason));
      }
    } finally {
      if (!disposedRef.current && requestId === requestIdRef.current) setCameraRequesting(false);
    }
  };

  useEffect(() => {
    void startCamera();
    // Camera acquisition is intentionally started as soon as the choice mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginRecording = async () => {
    const stream = streamRef.current;
    const requestId = requestIdRef.current;
    if (clipsRef.current.length >= MAX_ITEMS) {
      setError("A Spark can contain up to six clips. Add the clips you have or remove one first.");
      return;
    }
    if (recordedVideoMsRef.current >= MAX_RECORDING_MS) {
      setError("A Spark can hold up to 3 minutes of video, in clips of 60 seconds. Add the clips you have or retake one.");
      return;
    }
    if (!stream || typeof MediaRecorder === "undefined") {
      setError("Video recording is not supported in this browser. You can still take a photo or choose a video.");
      return;
    }
    if (recordingStartingRef.current) return;
    recordingStartingRef.current = true;
    try {
      const recordingStream = stream;
      if (disposedRef.current || cancelledRef.current || isDocumentHidden() || requestId !== requestIdRef.current) return;
      const mimeType = recorderMimeType(recordingStream.getAudioTracks().length > 0);
      if (!mimeType) {
        setError("This browser cannot record a supported video format.");
        return;
      }
      chunksRef.current = [];
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
        const spent = Math.min(duration, clipRoom());
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
        setPreviewPlaying(false);
        setError("");
        stopTracks();
        setPhase("preview");
      };
      elapsedRef.current = 0;
      isPausedRef.current = false;
      stopDurationMsRef.current = null;
      recordingFailedRef.current = false;
      setElapsed(0);
      startedAtRef.current = Date.now();
      recorder.start();
      const preview = videoRef.current;
      if (preview && preview.srcObject === recordingStream) void preview.play().catch(() => undefined);
      setPhase("recording");
      startClock();
    } catch (reason) {
      stopRecordingAudio();
      if (!disposedRef.current && requestId === requestIdRef.current) {
        setPhase(streamRef.current ? "camera" : "idle");
        setError(storyCameraErrorMessage(reason));
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
    const updated = Math.min(elapsedRef.current + Date.now() - startedAtRef.current, clipRoom());
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
    if (elapsedRef.current >= CLIP_MAX_MS || recordedVideoMsRef.current + elapsedRef.current >= MAX_RECORDING_MS) {
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
    setError("");
    if (remaining.length) setPhase("preview");
    else if (streamRef.current) setPhase("camera");
    else {
      setPhase("idle");
      void startCamera();
    }
  };
  const recordAnother = () => {
    fileRef.current = null;
    setFile(null);
    setElapsed(0);
    elapsedRef.current = 0;
    setError("");
    if (streamRef.current) setPhase("camera");
    else {
      setPhase("idle");
      void startCamera();
    }
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
    const acquireCamera = (mode: StoryCameraFacingMode, exact: boolean) => navigator.mediaDevices.getUserMedia(storyCameraConstraints(mode, exact));
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

  const togglePreviewPlayback = () => {
    const video = previewVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.muted = false;
      void video.play().catch(() => setError("The recorded clip preview could not be loaded. Retake it or choose another video."));
      return;
    }
    video.pause();
  };

  const totalSeconds = Math.ceil((recordedVideoMs + elapsed) / 1000);
  const capSeconds = Math.ceil(MAX_RECORDING_MS / 1000);
  const remainingSeconds = Math.max(0, Math.ceil((MAX_RECORDING_MS - recordedVideoMs - elapsed) / 1000));
  const overFamilyStory = recordedVideoMs + elapsed > 60_000;
  const recordingStatus = `${totalSeconds} / ${capSeconds} video seconds recorded · ${remainingSeconds} seconds remaining`;
  const statusText = `${cameraSwitching ? "Switching cameras… " : ""}${error ? `${error} · ` : ""}${phase === "preview"
    ? `Preview ${clips.length} of ${MAX_ITEMS} clip${clips.length === 1 ? "" : "s"} · ${Math.ceil(recordedVideoMs / 1000)} / ${capSeconds} video seconds recorded · ${Math.max(0, Math.ceil((MAX_RECORDING_MS - recordedVideoMs) / 1000))} seconds remaining`
    : recordingStatus}`;

  return <div className={`nia-spark-camera fixed inset-0 z-[120] h-[100dvh] w-screen overflow-hidden bg-[#08182b] text-white ${phase === "preview" ? "nia-spark-camera--playback flex flex-col" : ""}`} role="dialog" aria-modal="true" aria-label="Spark camera" data-testid="dialog-spark-camera">
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#08182b]">
      <header className="nia-spark-camera__bar absolute inset-x-0 top-0 z-10 flex items-start justify-between px-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" onClick={cancel} aria-label="Cancel camera" className="nia-spark-camera__glass focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00cfff]" data-testid="button-cancel-spark-camera"><X aria-hidden="true" /></button>
        <div className="rounded-full bg-[#08182b]/70 px-3 py-1 text-sm font-semibold tabular-nums text-[#00cfff]">{totalSeconds}s / {capSeconds}s</div>
        {clips.length > 0 ? (
          <button type="button" onClick={() => onUse(clips)} className="rounded-full bg-[#00cfff] px-4 py-2 text-sm font-extrabold text-[#08182b]" data-testid="button-use-spark-camera">Next</button>
        ) : <span className="w-11" />}
      </header>

      <div className="nia-spark-camera__stage absolute inset-0 bg-black">
        {phase !== "preview" && <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" aria-label="Live Spark camera preview" />}
        {phase === "preview" && file && previewUrl && (file.type.startsWith("video/")
          ? <>
            <video ref={previewVideoRef} key={previewUrl} src={previewUrl} playsInline controls preload="auto" onPlay={() => { setError(""); setPreviewPlaying(true); }} onPause={() => setPreviewPlaying(false)} onEnded={() => setPreviewPlaying(false)} onError={(event) => { const video = event.currentTarget; if (video.error?.code === 1 || video.currentSrc !== previewUrlRef.current) return; setError("The recorded clip preview could not be loaded. Retake it or choose another video."); }} className="h-full w-full bg-black object-contain" aria-label="Recorded Spark video preview" data-testid="video-spark-recorded-preview" />
            {!previewPlaying && <button type="button" onClick={togglePreviewPlayback} aria-label="Play recording" className="absolute left-1/2 top-1/2 z-10 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#00cfff] text-[#08182b]" data-testid="button-play-spark-preview"><Play aria-hidden="true" className="h-7 w-7" /></button>}
          </>
          : <img src={previewUrl} alt="Captured Spark photo preview" className="h-full w-full object-contain" />)}
        {phase === "countdown" && <span className="absolute inset-0 z-10 grid place-items-center text-8xl font-bold text-[#00cfff]" aria-live="assertive">{countdown}</span>}
      </div>

      {overFamilyStory && <p className="nia-spark-camera__family" data-testid="status-spark-family-story-length">Family Story length — you can archive this</p>}

      {phase !== "preview" && <div className="nia-spark-camera__side">
        <button type="button" className="nia-spark-camera__glass" aria-label={`Switch to ${facingMode === "environment" ? "front" : "back"} camera`} disabled={cameraSwitching || phase !== "camera"} onClick={() => void flipCamera()} data-testid="button-flip-spark-camera"><SwitchCamera aria-hidden="true" className="h-5 w-5" /></button>
        {torchSupported && <button type="button" onClick={() => void toggleTorch()} disabled={cameraSwitching} aria-label={torchOn ? "Turn torch off" : "Turn torch on"} aria-pressed={torchOn} className="nia-spark-camera__glass" data-testid="button-toggle-spark-torch"><Flashlight aria-hidden="true" className="h-5 w-5" /></button>}
        <button type="button" className="nia-spark-camera__glass" aria-label="Countdown" aria-pressed={countdownEnabled} onClick={() => setCountdownEnabled((value) => !value)} data-testid="input-spark-countdown"><Timer aria-hidden="true" className="h-5 w-5" /></button>
        {allowText && <button type="button" className="nia-spark-camera__glass" onClick={onText} data-testid="button-spark-camera-text" aria-label="Start with text"><Type aria-hidden="true" className="h-5 w-5" /></button>}
      </div>}

      <div className="nia-spark-camera__dock absolute inset-x-0 bottom-0 z-10 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="sr-only" aria-live="polite" data-testid="status-spark-camera">{phase === "recording" ? "Recording · " : phase === "paused" ? "Recording paused · " : ""}{statusText}</p>
        {phase === "preview" && clips.length > 0 && <ol className="mb-3 flex gap-2 overflow-x-auto" aria-label="Recorded Spark clip sequence">
          {clips.map((clip, index) => <li key={`${clip.name}-${index}`} className={`shrink-0 rounded-lg border px-3 py-1 text-xs ${clip === file ? "border-[#00cfff] bg-[#00cfff]/15" : "border-white/20"}`} aria-current={clip === file ? "step" : undefined} data-testid={`item-spark-clip-${index}`}>
            {clip.type.startsWith("video/") ? "Video" : "Photo"} {index + 1}
          </li>)}
        </ol>}
        {error && <p className="mb-2 text-sm text-rose-300" role="alert" data-testid="error-spark-camera">{error}</p>}
        {phase === "idle" && (cameraRequesting
          ? <p role="status" aria-live="polite" className="mb-3 text-center text-sm text-white/80">Opening camera…</p>
          : <button type="button" onClick={() => void startCamera()} className="mb-3 rounded-full bg-[#00cfff] px-5 py-3 font-bold text-[#08182b]" data-testid="button-retry-spark-camera">Try camera again</button>)}
        {(phase === "camera" || phase === "idle") && (
          <div className="mb-4 flex justify-center gap-6 text-xs font-bold uppercase tracking-[0.16em]">
            <button type="button" onClick={() => setCaptureMode("video")} className={captureMode === "video" ? "text-[#00cfff]" : "text-white/55"}>Video</button>
            <button type="button" onClick={() => setCaptureMode("photo")} className={captureMode === "photo" ? "text-[#00cfff]" : "text-white/55"}>Photo</button>
          </div>
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <div className="flex items-center gap-2">
            <button type="button" className="nia-spark-camera__glass" onClick={onGallery} data-testid="button-spark-camera-gallery" aria-label="Open gallery"><ImagePlus aria-hidden="true" className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-col items-center gap-2">
            {phase === "camera" && captureMode === "photo" && <button type="button" onClick={capturePhoto} disabled={cameraSwitching || clips.length >= MAX_ITEMS} aria-label="Capture Spark photo" className="nia-spark-camera__record" data-testid="button-capture-spark-photo"><i /></button>}
            {phase === "camera" && captureMode === "video" && <button type="button" onClick={startRecording} disabled={cameraSwitching || recordedVideoMs >= MAX_RECORDING_MS || clips.length >= MAX_ITEMS} aria-label="Record Spark video" className="nia-spark-camera__record" data-testid="button-record-spark-video"><i /></button>}
            {(phase === "recording" || phase === "paused") && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={phase === "recording" ? pause : resume} aria-label={phase === "recording" ? "Pause recording" : "Resume recording"} className="nia-spark-camera__glass" data-testid={phase === "recording" ? "button-pause-spark-camera" : "button-resume-spark-camera"}>{phase === "recording" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
                <button type="button" onClick={finish} aria-label="Finish recording" className="nia-spark-camera__record nia-spark-camera__record--live" data-testid="button-finish-spark-camera"><i /></button>
              </div>
            )}
            {phase === "countdown" && <button type="button" onClick={() => { clearCountdown(); setPhase("camera"); }} className="rounded-full bg-[#08182b]/80 px-4 py-2 font-bold" data-testid="button-cancel-spark-countdown">Cancel countdown</button>}
            {phase === "preview" && file && (
              <div className="flex flex-wrap justify-center gap-2">
                {file.type.startsWith("video/") && <button type="button" onClick={togglePreviewPlayback} aria-label={previewPlaying ? "Pause recording" : "Play recording"} className="rounded-full bg-[#00cfff] px-4 py-2 text-sm font-extrabold text-[#08182b]" data-testid="button-play-spark-preview-dock">{previewPlaying ? <Pause aria-hidden="true" className="mr-1 inline h-4 w-4" /> : <Play aria-hidden="true" className="mr-1 inline h-4 w-4" />}{previewPlaying ? "Pause" : "Play"}</button>}
                <button type="button" onClick={retake} aria-label={`Retake Spark ${file.type.startsWith("video/") ? "video" : "photo"}`} className="rounded-full border border-white/30 px-4 py-2 text-sm font-bold" data-testid="button-retake-spark-camera"><RotateCcw aria-hidden="true" className="mr-1 inline h-4 w-4" /> Retake</button>
                {clips.length < MAX_ITEMS && recordedVideoMs < MAX_RECORDING_MS && <button type="button" onClick={recordAnother} className="rounded-full border border-[#00cfff] px-4 py-2 text-sm font-bold text-[#00cfff]" data-testid="button-record-another-spark-clip">Add another clip</button>}
              </div>
            )}
          </div>
          <div />
        </div>
      </div>
    </div>
  </div>;
}