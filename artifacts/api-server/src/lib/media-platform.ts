import type { MediaJobType } from "@workspace/db";

export const MEDIA_PLATFORM_FLAG = "MEDIA_PLATFORM_V21";

/** The foundation is opt-in until production storage and Redis are verified. */
export function isMediaPlatformV21Enabled(): boolean {
  return process.env[MEDIA_PLATFORM_FLAG] === "1";
}

export function mediaJobsForType(mediaType: string): MediaJobType[] {
  if (mediaType === "photo") return ["probe", "thumbnail"];
  if (mediaType === "video") return ["probe", "thumbnail", "transcode"];
  if (mediaType === "audio") return ["probe"];
  return ["probe"];
}

export function assertSupportedMediaJob(jobType: MediaJobType): void {
  if (jobType === "audio_mix") {
    throw new Error("audio_mix is disabled until a licensed catalog and real mixer are configured.");
  }
}