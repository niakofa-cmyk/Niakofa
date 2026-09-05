export interface AudioCircleMediaCapabilities {
  microphone: boolean;
  camera: boolean;
  recording: boolean;
}

/**
 * Returns browser capability flags without prompting for permissions.
 *
 * This helper deliberately lives beside the active media-readiness code. The
 * production room transport is LiveKit; capability checks must not import or
 * accidentally revive the retired raw WebRTC mesh.
 */
export function getAudioCircleMediaCapabilities(): AudioCircleMediaCapabilities {
  const hasMediaDevices =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const hasRecorder = typeof MediaRecorder !== "undefined";
  const hasAudioContext = typeof AudioContext !== "undefined";

  return {
    microphone: hasMediaDevices,
    camera: hasMediaDevices,
    recording: hasRecorder && hasAudioContext,
  };
}