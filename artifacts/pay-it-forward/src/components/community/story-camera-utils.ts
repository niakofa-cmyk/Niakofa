export const STORY_CAMERA_MAX_RECORDING_MS = 180_000;
export const STORY_CAMERA_CLIP_MAX_MS = 60_000;
export const STORY_CAMERA_MAX_ITEMS = 6;

export type StoryCameraFacingMode = "environment" | "user";

export function storyCameraConstraints(facingMode: StoryCameraFacingMode, exact = false): MediaStreamConstraints {
  return {
    video: {
      facingMode: exact ? { exact: facingMode } : { ideal: facingMode },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
    audio: false,
  };
}

/** One capture session for a take. A second getUserMedia while the preview
 * is open restarts the phone camera and leaves the video black. */
export function storyCameraRecordingConstraints(facingMode: StoryCameraFacingMode): MediaStreamConstraints {
  return {
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
    audio: true,
  };
}

const AUDIO_RECORDER_TYPES = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
const SILENT_RECORDER_TYPES = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4"];

/** Record only a type this browser can also play. Chrome can record MP4 and
 * then fail the preview, so WebM wins whenever playback supports it. */
export function chooseRecorderMimeType(
  hasAudio: boolean,
  isTypeSupported: (type: string) => boolean,
  canPlayType: (type: string) => string,
): string {
  const supported = (hasAudio ? AUDIO_RECORDER_TYPES : SILENT_RECORDER_TYPES).filter((type) => isTypeSupported(type));
  return supported.find((type) => canPlayType(type.split(";")[0]) !== "") ?? "";
}

export function storyCameraErrorMessage(reason: unknown) {
  const name = reason && typeof reason === "object" && "name" in reason && typeof reason.name === "string"
    ? reason.name
    : "";
  if (name === "NotAllowedError") return "Camera or microphone permission was denied. Allow access in your browser settings and try again.";
  if (name === "NotFoundError") return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "The camera or microphone is in use by another app. Close it and try again.";
  if (name === "OverconstrainedError") return "This device cannot use the requested camera. Try another camera.";
  return reason instanceof Error ? reason.message : "Camera access could not be started. Try again.";
}