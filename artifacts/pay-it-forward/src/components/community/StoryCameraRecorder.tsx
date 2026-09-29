import { Camera, Pause, Play, RotateCcw, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_RECORDING_MS = 60_000;
const recorderTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];

function recorderMimeType() {
  return recorderTypes.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

export function StoryCameraRecorder({ onUse, onCancel }: { onUse: (file: File) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingAudioRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<"idle" | "camera" | "recording" | "paused" | "preview">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recordingAudioRef.current?.getTracks().forEach((track) => track.stop());
    recordingAudioRef.current = null;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };
  useEffect(() => () => {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recordingAudioRef.current?.getTracks().forEach((track) => track.stop());
    recordingAudioRef.current = null;
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const url = URL.createObjectURL(file); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const tick = () => {
    const next = elapsedRef.current + (Date.now() - startedAtRef.current);
    setElapsed(Math.min(next, MAX_RECORDING_MS));
    if (next >= MAX_RECORDING_MS) {
      elapsedRef.current = MAX_RECORDING_MS;
      recorderRef.current?.stop();
    }
  };
  const startClock = () => { clearTimer(); timerRef.current = setInterval(tick, 250); };
  const startCamera = async () => {
    setError("");
    cancelledRef.current = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is not supported in this browser. Choose media from your device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (cancelledRef.current) {
        stopTracks();
        return;
      }
      setPhase("camera");
    } catch (reason) {
      stopTracks();
      if (!cancelledRef.current) setError(reason instanceof Error ? reason.message : "Camera permission was not granted.");
    }
  };
  const startRecording = async () => {
    const stream = streamRef.current;
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
      if (cancelledRef.current || streamRef.current !== stream) {
        audioStream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingAudioRef.current = audioStream;
      chunksRef.current = [];
      const recordingStream = new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);
      const recorder = new MediaRecorder(recordingStream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        cancelledRef.current = true;
        clearTimer();
        stopTracks();
        setPhase("idle");
        setError("Recording stopped because the camera reported an error. Try again.");
      };
      recorder.onstop = () => {
        clearTimer();
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (!blob.size) {
          setPhase("idle");
          setError("No video was recorded. Try again.");
          stopTracks();
          return;
        }
        const baseType = mimeType.split(";")[0];
        const recorded = new File([blob], `spark-${Date.now()}.${baseType === "video/mp4" ? "mp4" : "webm"}`, { type: baseType, lastModified: Date.now() });
        setFile(recorded);
        setPhase("preview");
        stopTracks();
      };
      elapsedRef.current = 0;
      setElapsed(0);
      startedAtRef.current = Date.now();
      recorder.start(250);
      setPhase("recording");
      startClock();
    } catch (reason) {
      recordingAudioRef.current?.getTracks().forEach((track) => track.stop());
      recordingAudioRef.current = null;
      if (!cancelledRef.current) setError(reason instanceof Error ? reason.message : "Video recording could not be started.");
    } finally {
      recordingStartingRef.current = false;
    }
  };
  const capturePhoto = () => {
    const video = videoRef.current;
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
    canvas.toBlob((blob) => {
      if (!blob) {
        setError("A photo could not be captured. Try again.");
        return;
      }
      if (cancelledRef.current) return;
      stopTracks();
      setFile(new File([blob], `spark-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      setPhase("preview");
    }, "image/jpeg", 0.92);
  };
  const pause = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause(); elapsedRef.current += Date.now() - startedAtRef.current; setElapsed(elapsedRef.current); clearTimer(); setPhase("paused");
  };
  const resume = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    startedAtRef.current = Date.now(); recorder.resume(); setPhase("recording"); startClock();
  };
  const finish = () => { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); };
  const retake = () => { setFile(null); setElapsed(0); elapsedRef.current = 0; setPhase("idle"); setError(""); };
  const cancel = () => {
    cancelledRef.current = true;
    clearTimer();
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    stopTracks();
    onCancel();
  };

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Spark camera" data-testid="dialog-spark-camera">
    <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-slate-900 text-white">
      <div className="relative aspect-[9/16] max-h-[70vh] bg-black">
        {phase !== "preview" && <video ref={videoRef} muted playsInline className="h-full w-full object-cover" aria-label="Live Spark camera preview" />}
        {phase === "preview" && file && (file.type.startsWith("video/")
          ? <video src={previewUrl} controls playsInline className="h-full w-full object-contain" aria-label="Recorded Spark video preview" />
          : <img src={previewUrl} alt="Captured Spark photo preview" className="h-full w-full object-contain" />)}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <span aria-live="polite" data-testid="status-spark-camera">{error || (phase === "preview" ? "Preview your Spark" : `${Math.ceil(elapsed / 1000)} / 60 seconds`)}</span>
        <button type="button" onClick={cancel} aria-label="Cancel camera" data-testid="button-cancel-spark-camera"><X /></button>
      </div>
      {error && <p className="px-4 text-sm text-rose-300" role="alert" data-testid="error-spark-camera">{error}</p>}
      <div className="flex justify-center gap-3 p-4">
        {phase === "idle" && <button type="button" onClick={() => void startCamera()} className="rounded-full bg-white px-5 py-3 font-bold text-slate-900" data-testid="button-start-spark-camera">Start camera</button>}
        {phase === "camera" && <>
          <button type="button" onClick={capturePhoto} aria-label="Capture Spark photo" data-testid="button-capture-spark-photo"><Camera /> Photo</button>
          <button type="button" onClick={() => void startRecording()} className="rounded-full bg-white px-5 py-3 font-bold text-slate-900" data-testid="button-record-spark-video">Record video</button>
        </>}
        {(phase === "recording" || phase === "paused") && <>
          <button type="button" onClick={phase === "recording" ? pause : resume} aria-label={phase === "recording" ? "Pause recording" : "Resume recording"} data-testid={phase === "recording" ? "button-pause-spark-camera" : "button-resume-spark-camera"}>{phase === "recording" ? <Pause /> : <Play />}</button>
          <button type="button" onClick={finish} aria-label="Finish recording" data-testid="button-finish-spark-camera"><Square /></button>
        </>}
        {phase === "preview" && file && <>
          <button type="button" onClick={retake} aria-label={`Retake Spark ${file.type.startsWith("video/") ? "video" : "photo"}`} data-testid="button-retake-spark-camera"><RotateCcw /> Retake</button>
          <button type="button" onClick={() => onUse(file)} className="rounded-xl bg-white px-4 py-2 font-bold text-slate-900" data-testid="button-use-spark-camera">Use {file.type.startsWith("video/") ? "video" : "photo"}</button>
        </>}
      </div>
    </div>
  </div>;
}