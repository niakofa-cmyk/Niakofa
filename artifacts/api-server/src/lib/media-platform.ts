import type { MediaJobType, StoryCompositionManifest } from "@workspace/db";

export const MEDIA_PLATFORM_FLAG = "MEDIA_PLATFORM_V21";

export type MomentMusicRightsInput = {
  confirmed: true;
  basis: "original" | "licensed";
  licenseReference?: string;
};

export function buildMomentMusicRightsMetadata(
  ownerUserId: number,
  rights: MomentMusicRightsInput,
  attestedAt = new Date(),
): Record<string, unknown> {
  return {
    moment_music_rights: {
      version: 1,
      basis: rights.basis,
      attested_by_user_id: ownerUserId,
      attested_at: attestedAt.toISOString(),
      license_reference: rights.licenseReference?.trim() || null,
    },
  };
}

export function isMomentMusicAsset(metadata: unknown, ownerUserId: number): boolean {
  if (!metadata || typeof metadata !== "object" || !Number.isSafeInteger(ownerUserId) || ownerUserId < 1) return false;
  const attestation = (metadata as Record<string, unknown>).moment_music_rights;
  if (!attestation || typeof attestation !== "object") return false;
  const value = attestation as Record<string, unknown>;
  const attestedAt = typeof value.attested_at === "string" ? Date.parse(value.attested_at) : NaN;
  const reference = value.license_reference;
  if (value.version !== 1 || value.attested_by_user_id !== ownerUserId
    || !Number.isFinite(attestedAt) || !["original", "licensed"].includes(String(value.basis))) return false;
  if (reference !== null) {
    if (typeof reference !== "string") return false;
    try {
      if (new URL(reference).protocol !== "https:") return false;
    } catch {
      return false;
    }
  }
  if (value.basis === "licensed" && typeof reference !== "string") return false;
  return reference === null || typeof reference === "string";
}

/** The foundation is opt-in until production storage and Redis are verified. */
export function isMediaPlatformV21Enabled(): boolean {
  return process.env[MEDIA_PLATFORM_FLAG] === "1";
}

export function mediaJobsForType(mediaType: string, manifest?: StoryCompositionManifest | null): MediaJobType[] {
  if (mediaType === "photo") return ["probe", "thumbnail"];
  if (mediaType === "video") {
    const jobs: MediaJobType[] = ["probe", "thumbnail", "transcode"];
    const trackAssetId = manifest?.music?.track_asset_id;
    if (typeof trackAssetId === "number" && Number.isSafeInteger(trackAssetId) && trackAssetId > 0) jobs.push("audio_mix");
    return jobs;
  }
  if (mediaType === "audio") return ["probe"];
  return ["probe"];
}

export function assertSupportedMediaJob(jobType: MediaJobType): void {
  if (jobType === "audio_mix") {
    // The worker resolves the asset ID against the database and verifies its
    // owner, story context, and server-recorded rights attestation.
    return;
  }
}