import { authHeaders } from "@/lib/auth";
import { uploadCommunityMomentMedia, validateCommunityMomentFile } from "@/lib/community-moments-upload";
import { buildMomentMediaAccessibility, type MomentMediaAccessibilityPayload } from "./moment-studio-accessibility";

export type StudioElement = {
  type: string;
  payload: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
  scale?: number;
  rotation?: number;
  z_index?: number;
};

export function selectedStudioFiles(files: File[], selection: number[]): File[] {
  return [...new Set(selection)].filter((index) => Number.isInteger(index) && index >= 0 && index < files.length).map((index) => files[index]);
}

export function chooseStudioFiles(files: File[]): { files: File[]; errors: string[] } {
  const errors: string[] = [];
  if (files.length > 6) errors.push("Choose up to six items for a Moment.");
  const accepted = files.filter((file) => {
    const error = !["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"].includes(file.type)
      ? "Choose a JPG, PNG, WebP, GIF, MP4, or WebM file."
      : validateCommunityMomentFile(file);
    if (error) errors.push(`${file.name}: ${error}`);
    return !error;
  });
  return { files: accepted.slice(0, 6), errors };
}

export async function validateStudioFiles(files: File[]): Promise<Array<number | null>> {
  const result = chooseStudioFiles(files);
  if (result.errors.length || result.files.length !== files.length) throw new Error(result.errors[0] || "Choose up to six media items.");
  const videoDurationsMs: Array<number | null> = [];
  for (const file of files) {
    if (!file.type.startsWith("video/")) {
      videoDurationsMs.push(null);
      continue;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    try {
      video.preload = "metadata";
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error(`${file.name}: Video could not be inspected.`));
      });
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 60) throw new Error(`${file.name}: Moment videos must be 60 seconds or shorter.`);
      videoDurationsMs.push(Math.round(video.duration * 1000));
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }
  return videoDurationsMs;
}

const validId = (id: number) => Number.isSafeInteger(id) && id > 0;

export function isCameraClipReelSelection(files: File[]): boolean {
  return files.length >= 2 && files.length <= 6 && files.every((file) => file.type.startsWith("video/"));
}

export function validateMomentCompositionPlaybackUrl(playbackUrl: string, storyId: number, origin: string): string {
  if (!validId(storyId)) throw new Error("The camera reel playback URL was invalid.");
  const playback = new URL(playbackUrl, origin);
  const expectedPath = `/api/community/stories/${storyId}/moment-composition/play`;
  if (playback.origin !== origin || playback.pathname !== expectedPath || playback.search || playback.hash
    || playback.username || playback.password) {
    throw new Error("The camera reel playback URL was invalid.");
  }
  return playback.pathname;
}

export class CameraClipReelPendingError extends Error {
  readonly storyId: number;

  constructor(storyId: number, message: string) {
    super(`Story posted, but stitching is pending. ${message}`);
    this.name = "CameraClipReelPendingError";
    this.storyId = storyId;
  }
}

export async function requestCameraClipReel(storyId: number, mediaAssetIds: number[], signal?: AbortSignal): Promise<string> {
  if (!validId(storyId) || mediaAssetIds.length < 2 || mediaAssetIds.length > 6
    || mediaAssetIds.some((id) => !validId(id)) || new Set(mediaAssetIds).size !== mediaAssetIds.length) {
    throw new Error("Camera stitching needs two to six unique video assets in camera order.");
  }
  const response = await fetch(`/api/community/stories/${storyId}/moment-composition`, {
    method: "POST",
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "camera_clip_reel", media_asset_ids: mediaAssetIds }),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    composition?: { status?: string; playback_grant_url?: string; status_url?: string };
  };
  if (!response.ok) throw new CameraClipReelPendingError(storyId, result.error || "Retry stitching from the saved Studio draft.");
  if (!result.composition || typeof result.composition.status !== "string"
    || result.composition.playback_grant_url !== `/api/community/stories/${storyId}/moment-composition/playback-grant`
    || result.composition.status_url !== `/api/community/stories/${storyId}/moment-composition`) {
    throw new CameraClipReelPendingError(storyId, "The server returned an invalid stitching response. Retry safely from the saved Studio draft.");
  }
  return result.composition.status;
}

export async function getCameraClipReelStatus(storyId: number, signal?: AbortSignal): Promise<{
  status: string;
  failureCode: string | null;
  durationMs: number | null;
  playbackGrantUrl: string;
}> {
  if (!validId(storyId)) throw new Error("Story not found.");
  const response = await fetch(`/api/community/stories/${storyId}/moment-composition`, {
    headers: authHeaders(),
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
  });
  const result = await response.json().catch(() => ({})) as {
    error?: string;
    composition?: { status?: string; failure_code?: string | null; duration_ms?: number | null; playback_grant_url?: string };
  };
  const composition = result.composition;
  if (!response.ok || !composition || typeof composition.status !== "string"
    || composition.playback_grant_url !== `/api/community/stories/${storyId}/moment-composition/playback-grant`) {
    throw new Error(result.error || "Camera reel status could not be confirmed.");
  }
  return {
    status: composition.status,
    failureCode: composition.failure_code ?? null,
    durationMs: composition.duration_ms ?? null,
    playbackGrantUrl: composition.playback_grant_url,
  };
}

export function validStudioMediaEdits(
  files: File[],
  ids: number[],
  edits: Array<{ index: number; coverTimeMs: number }> = [],
): Array<{ media_asset_id: number; cover_time_ms: number }> {
  return edits.flatMap((edit) => {
    const assetId = ids[edit.index];
    const file = files[edit.index];
    return validId(assetId) && file?.type.startsWith("video/") && Number.isFinite(edit.coverTimeMs) && edit.coverTimeMs >= 0
      ? [{ media_asset_id: assetId, cover_time_ms: Math.round(edit.coverTimeMs) }] : [];
  });
}

export async function publishStudioMoment(input: {
  userId: number;
  hubId: number | null;
  audience: "community" | "hub";
  clientPublishId: string;
  files: File[];
  caption: string;
  tags?: string[];
  mediaAccessibility?: MomentMediaAccessibilityPayload[];
  mediaAltTexts?: string[];
  mediaCaptionsVtt?: string[];
  elements: StudioElement[];
  effect: string;
  musicFile?: File | null;
  musicRightsBasis?: "original" | "licensed";
  musicLicenseReference?: string;
  musicRightsAccepted?: boolean;
  musicVolume?: number;
  uploadedMusicAssetId?: number | null;
  signal: AbortSignal;
  onStatus: (status: string, percent: number) => void;
  onAssetUploaded?: (index: number, id: number) => void;
  onMusicAssetUploaded?: (id: number) => void;
  /** Must commit the complete ordered asset list and publish identity to IDB before POST. */
  beforePublish: (orderedAssetIds: number[]) => Promise<void>;
  uploadedIds?: Array<number | null>;
  mediaEdits?: Array<{ index: number; coverTimeMs: number }>;
  cameraClipReel?: boolean;
}): Promise<number | null> {
  if (!validId(input.userId) || (input.hubId !== null && !validId(input.hubId))) throw new Error("Your account or Hub could not be confirmed.");
  if (input.audience === "hub" && input.hubId === null) throw new Error("Choose a Hub before sharing with Hub members.");
  if (!input.files.length && !input.caption.trim()) throw new Error("Add a photo, video, or a few words.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.clientPublishId)) {
    throw new Error("The draft's publish identity is missing. Reopen the Studio and try again.");
  }
  const musicFile = input.musicFile ?? null;
  if (input.files.length + (musicFile ? 1 : 0) > 6) {
    throw new Error("Choose up to five photos or videos when adding a music track.");
  }
  if (input.cameraClipReel && !isCameraClipReelSelection(input.files)) {
    throw new Error("A camera reel must contain only two to six camera-recorded videos.");
  }
  if (musicFile) {
    const musicError = validateCommunityMomentFile(musicFile);
    if (musicError || !musicFile.type.startsWith("audio/")) throw new Error(musicError || "Choose an MP3, OGG, or WAV music file.");
    if (!input.files.some((file) => file.type.startsWith("video/"))) throw new Error("Add a video before adding a background music track.");
    if (input.musicRightsAccepted !== true) throw new Error("Confirm that you created this recording or have rights to use and distribute it.");
    if (input.musicRightsBasis === "licensed"
      && !/^https:\/\/\S+$/i.test(input.musicLicenseReference?.trim() ?? "")) {
      throw new Error("Add an HTTPS link to the music license or source.");
    }
  }
  const contextKind = input.audience === "hub" ? "hub_moment" : "community_moment";
  const contextId = input.audience === "hub" ? input.hubId! : input.userId;
  const ids: number[] = [];
  for (let i = 0; i < input.files.length; i++) {
    if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    const cached = input.uploadedIds?.[i];
    if (cached && validId(cached)) {
      ids.push(cached);
      continue;
    }
    input.onStatus(`Uploading ${i + 1} of ${input.files.length}`, 0);
    const id = await uploadCommunityMomentMedia({
      contextKind, contextId, file: input.files[i], signal: input.signal,
      onProgress: (percent) => input.onStatus(`Uploading ${i + 1} of ${input.files.length}`, percent),
    });
    ids.push(id);
    input.onAssetUploaded?.(i, id);
  }
  const cachedMusicAssetId = input.uploadedMusicAssetId;
  let musicAssetId: number | null = null;
  if (musicFile && typeof cachedMusicAssetId === "number" && validId(cachedMusicAssetId)) {
    musicAssetId = cachedMusicAssetId;
  }
  if (musicFile && musicAssetId === null) {
    if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    input.onStatus("Uploading background music", 0);
    musicAssetId = await uploadCommunityMomentMedia({
      contextKind,
      contextId,
      file: musicFile,
      signal: input.signal,
      musicRights: {
        confirmed: true,
        basis: input.musicRightsBasis ?? "original",
        ...(input.musicRightsBasis === "licensed" ? { licenseReference: input.musicLicenseReference!.trim() } : {}),
      },
      onProgress: (percent) => input.onStatus("Uploading background music", percent),
    });
    input.onMusicAssetUploaded?.(musicAssetId);
  }
  if (musicAssetId !== null) ids.push(musicAssetId);
  if (ids.length) {
    const query = new URLSearchParams({ contextKind, contextId: String(contextId), ids: ids.join(",") });
    const retried = new Set<number>();
    let ready = false;
    for (let attempt = 0; attempt < 40 && !ready; attempt++) {
      if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
      input.onStatus("Processing your media", 100);
      const response = await fetch(`/api/community/stories/moment-media-status?${query}`, { headers: authHeaders(), credentials: "same-origin", signal: input.signal });
      const result = await response.json().catch(() => ({})) as { assets?: Array<{ id: number; status: string; media_type: string; variant_ready: boolean; failure_code?: string }>; error?: string };
      if (!response.ok || !Array.isArray(result.assets) || result.assets.length !== ids.length || result.assets.some((asset) => !ids.includes(asset.id))) throw new Error(result.error || "Media processing status could not be confirmed.");
      for (const asset of result.assets) {
        if (asset.status !== "failed") continue;
        if (retried.has(asset.id)) throw new Error(`Media processing failed (${asset.failure_code || "unknown"}). Your draft is saved.`);
        retried.add(asset.id);
        const retry = await fetch(`/api/media-assets/${asset.id}/complete`, {
          method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
          credentials: "same-origin", signal: input.signal, body: "{}",
        });
        const payload = await retry.json().catch(() => ({})) as { error?: string };
        if (!retry.ok) throw new Error(payload.error || "Media processing could not be retried.");
      }
      ready = result.assets.every((asset) => asset.status === "ready" && (asset.media_type !== "video" || asset.variant_ready));
      if (!ready) await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { input.signal.removeEventListener("abort", abort); resolve(); }, 1500);
        const abort = () => { clearTimeout(timer); reject(new DOMException("Upload cancelled", "AbortError")); };
        input.signal.addEventListener("abort", abort, { once: true });
      });
    }
    if (!ready) throw new Error("Media is still processing. Your draft is saved; try again shortly.");
  }
  if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
  await input.beforePublish(ids);
  if (input.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
  input.onStatus("Publishing your Spark", 100);
  // The source file is not transcoded with Studio preview filters. Keep the
  // publish manifest neutral until the Story player guarantees filter parity.
  const effects: string[] = [];
  const mediaEdits = validStudioMediaEdits(input.files, ids, input.mediaEdits);
  const mediaAccessibility = input.mediaAccessibility ?? buildMomentMediaAccessibility(
    input.files,
    input.files.map((_, index) => index),
    ids.slice(0, input.files.length),
    Object.fromEntries((input.mediaAltTexts ?? []).map((text, index) => [index, text])),
    Object.fromEntries((input.mediaCaptionsVtt ?? []).map((text, index) => [index, text])),
  );
  const response = await fetch("/api/community/stories", {
    method: "POST", credentials: "same-origin", signal: input.signal,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      caption: input.caption.trim(), hub_id: input.audience === "hub" ? input.hubId : null,
      audience: input.audience, media_asset_ids: ids, elements: input.elements,
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(mediaAccessibility.length ? { media_accessibility: mediaAccessibility } : {}),
      client_publish_id: input.clientPublishId,
      composition_manifest: {
        version: 1,
        canvas: { width: 1080, height: 1920, aspect: "9:16" },
        elements: input.elements,
        effects,
        music: musicAssetId === null ? null : {
          track_asset_id: musicAssetId,
          volume: Math.min(2, Math.max(0, input.musicVolume ?? 0.65)),
        },
      },
      ...(mediaEdits.length ? { media_edits: mediaEdits } : {}),
    }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string; story?: { id?: number } };
  if (!response.ok) throw new Error(result.error || "Could not publish your Spark. Your draft is saved.");
  const storyId = result.story?.id;
  if (input.cameraClipReel && !validId(storyId ?? 0)) {
    throw new Error("Story may have posted, but its ID could not be confirmed. Retry with the saved publish identity.");
  }
  if (input.cameraClipReel) {
    try {
      await requestCameraClipReel(storyId!, ids.slice(0, input.files.length), input.signal);
    } catch (reason) {
      if (reason instanceof CameraClipReelPendingError) throw reason;
      throw new CameraClipReelPendingError(storyId!, reason instanceof Error ? reason.message : "Retry stitching from the saved Studio draft.");
    }
  }
  return validId(storyId ?? 0) ? storyId! : null;
}