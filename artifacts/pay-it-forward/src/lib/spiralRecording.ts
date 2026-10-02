export function spiralRecordingMimeTypes(hasVideo: boolean): string[] {
  return hasVideo
    ? ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
}

export function chooseSpiralRecordingMimeType(
  hasVideo: boolean,
  isSupported?: (type: string) => boolean,
): string | undefined {
  const types = spiralRecordingMimeTypes(hasVideo);
  if (!isSupported) {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return types[0];
    return types.find((type) => MediaRecorder.isTypeSupported(type));
  }
  return types.find((type) => isSupported(type));
}

/** Audio graph input. Passing the camera stream itself into an AudioContext
 * blacks out the live preview on mobile browsers. */
export function audioTracksOnly(stream: MediaStream): MediaStream {
  return new MediaStream(stream.getAudioTracks());
}
