export async function trimVideoFile(file: File, start: number, end: number): Promise<File> {
  if (!file.type.startsWith("video/") || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error("Choose a valid video range.");
  if (typeof MediaRecorder === "undefined") throw new Error("Video trimming is not supported in this browser.");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  let capture: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let stopAtEnd: (() => void) | null = null;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("Video could not be inspected.")); });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || end > video.duration) throw new Error("Choose a trim range within the video.");
    const captureStream = (video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      webkitCaptureStream?: () => MediaStream;
    }).captureStream ?? (video as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream }).webkitCaptureStream;
    const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((item) => MediaRecorder.isTypeSupported(item));
    if (!captureStream || !type) throw new Error("Video trimming is not supported in this browser.");

    if (start > 0.02) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("The video could not seek to the trim start.")), 5000);
        const onSeeked = () => { window.clearTimeout(timeout); resolve(); };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.currentTime = start;
      });
    }

    capture = captureStream.call(video);
    const activeRecorder = new MediaRecorder(capture, { mimeType: type });
    recorder = activeRecorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const result = new Promise<Blob>((resolve, reject) => {
      activeRecorder.onerror = () => reject(new Error("Video trimming failed."));
      activeRecorder.onstop = () => resolve(new Blob(chunks, { type }));
    });
    activeRecorder.start(200);
    const stop = () => {
      video.pause();
      if (recorder?.state !== "inactive") recorder?.stop();
    };
    stopAtEnd = stop;
    video.ontimeupdate = () => { if (video.currentTime >= end) stop(); };
    video.onended = stop;
    try {
      await video.play();
    } catch {
      stop();
      await result.catch(() => {});
      throw new Error("Video playback was blocked, so the trim was not applied.");
    }
    const blob = await result;
    if (!blob.size) throw new Error("Video trimming produced no media.");
    const outputType = type.split(";")[0];
    const extension = outputType === "video/mp4" ? "mp4" : "webm";
    return new File([blob], file.name.replace(/\.[^.]+$/, `-trimmed.${extension}`), {
      type: outputType,
      lastModified: Date.now(),
    });
  } finally {
    video.ontimeupdate = null;
    video.onended = null;
    if (recorder?.state !== "inactive") {
      stopAtEnd?.();
    }
    capture?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}