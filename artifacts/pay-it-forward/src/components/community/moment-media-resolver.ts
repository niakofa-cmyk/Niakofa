import { validateMomentCompositionPlaybackUrl } from "./story-studio-publish";

export type VideoReference = { id: number; media_url: string; isMomentReel?: boolean };

export type VideoResolverDeps = {
  origin: string;
  fetchFn: typeof fetch;
  headers: () => HeadersInit;
  signal?: AbortSignal;
};

/**
 * Resolves a Moment video (single clip or stitched reel) to a short-lived,
 * same-origin, token-free playback URL. This is the exact validation the
 * Moments viewer did inline; it lives here so the visible card and the
 * prefetch of the NEXT card cannot drift apart.
 */
export async function resolveMomentVideoUrl(sparkId: number, media: VideoReference, deps: VideoResolverDeps): Promise<string> {
  const reference = new URL(media.media_url, deps.origin);
  if (media.isMomentReel) {
    const expectedGrant = `/api/community/stories/${sparkId}/moment-composition/playback-grant`;
    if (reference.origin !== deps.origin || reference.pathname !== expectedGrant
      || reference.search || reference.hash || reference.username || reference.password) {
      throw new Error("This Spark does not have a valid camera reel playback grant.");
    }
    const grantResponse = await deps.fetchFn(reference.pathname, { method: "POST", headers: deps.headers(), credentials: "same-origin", signal: deps.signal });
    const grant = await grantResponse.json().catch(() => ({})) as { playback_url?: string; error?: string };
    if (!grantResponse.ok || typeof grant.playback_url !== "string") {
      throw new Error(grant.error || "Secure camera reel playback could not be opened.");
    }
    return validateMomentCompositionPlaybackUrl(grant.playback_url, sparkId, deps.origin);
  }
  const match = reference.pathname.match(/^\/api\/community\/stories\/media\/(\d+)\/?$/);
  const mediaId = Number(match?.[1]);
  if (reference.origin !== deps.origin || reference.search || reference.hash
    || reference.username || reference.password || !Number.isSafeInteger(mediaId) || mediaId !== media.id) {
    throw new Error("This Spark does not have a valid authenticated media reference.");
  }
  const response = await deps.fetchFn(`${reference.pathname.replace(/\/$/, "")}/playback-grant`, { method: "POST", headers: deps.headers(), credentials: "same-origin", signal: deps.signal });
  const payload = await response.json().catch(() => ({})) as { playback_url?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "Secure Spark playback could not be opened.");
  if (typeof payload.playback_url !== "string" || !payload.playback_url) {
    throw new Error("The playback service returned no video URL.");
  }
  const playback = new URL(payload.playback_url, deps.origin);
  if (playback.origin !== deps.origin || playback.search || playback.hash || playback.username || playback.password) {
    throw new Error("The playback URL must remain on Niakofa and contain no URL token.");
  }
  return payload.playback_url;
}
