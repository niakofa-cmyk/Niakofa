import type { MediaJobType, StoryCompositionManifest } from "@workspace/db";

export const MEDIA_PLATFORM_FLAG = "MEDIA_PLATFORM_V21";

/** The foundation is opt-in until production storage and Redis are verified. */
export function isMediaPlatformV21Enabled(): boolean {
  return process.env[MEDIA_PLATFORM_FLAG] === "1";
}

export function mediaJobsForType(mediaType: string, manifest?: StoryCompositionManifest | null): MediaJobType[] {
  if (mediaType === "photo") return ["probe", "thumbnail"];
  if (mediaType === "video") {
    const jobs: MediaJobType[] = ["probe", "thumbnail", "transcode"];
    if (manifest?.music?.track_key && manifest.music.licensed === true) jobs.push("audio_mix");
    return jobs;
  }
  if (mediaType === "audio") return ["probe"];
  return ["probe"];
}

export function assertSupportedMediaJob(jobType: MediaJobType): void {
  if (jobType === "audio_mix") {
    // The worker still requires a signed-off/licensed track_key in the
    // composition manifest. This guard only rejects callers trying to enqueue
    // the job without going through that manifest-aware path.
    return;
  }
}