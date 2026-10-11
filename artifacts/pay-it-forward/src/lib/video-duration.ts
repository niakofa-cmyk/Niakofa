/**
 * Read a local video duration, including MediaRecorder WebM files whose
 * container omits the Duration element and initially reports Infinity.
 */
export function readVideoDurationSeconds(file: Blob, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    let metadataReady = false;
    let endSeekAttempted = false;
    const finish = (duration: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onseeked = null;
      video.ontimeupdate = null;
      video.onloadeddata = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const inspect = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        finish(video.duration);
        return true;
      }
      // Once a metadata read or seek has completed, a finite final seekable
      // point is a valid duration even when video.duration remains Infinity.
      if (metadataReady && endSeekAttempted) {
        try {
          const ranges = video.seekable;
          const end = ranges.length ? ranges.end(ranges.length - 1) : Number.NaN;
          if (Number.isFinite(end) && end > 0) {
            finish(end);
            return true;
          }
        } catch {
          // Metadata may not expose a seekable range yet; wait for another event.
        }
      }
      return false;
    };
    const seekToEnd = () => {
      if (endSeekAttempted) return;
      endSeekAttempted = true;
      try {
        // Chromium can discover the missing WebM duration after an end seek.
        video.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        inspect();
      }
    };

    video.preload = "auto";
    video.onloadedmetadata = () => {
      metadataReady = true;
      if (!inspect()) seekToEnd();
    };
    video.ondurationchange = () => { if (!inspect() && metadataReady) seekToEnd(); };
    video.onseeked = inspect;
    video.ontimeupdate = inspect;
    video.onloadeddata = inspect;
    video.onerror = () => finish(null);
    video.src = url;
    video.load();
  });
}
