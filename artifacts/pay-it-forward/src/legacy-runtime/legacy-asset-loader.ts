/**
 * Loads extracted PNG frames (Kwame's hand-drawn atlas frames, environment
 * tiles/buildings) into PixiJS Textures, and indexes character frames by
 * (animState, facing) so the renderer can look up "the current frame" in
 * one call from LegacyActorController/LegacyCombatController state.
 *
 * Expects the extracted asset folders to be served as static files (e.g.
 * copied into artifacts/pay-it-forward/public/legacy-character-assets/
 * hand-drawn/... per docs/ATLAS_INTEGRATION_GUIDE.md from the combat pack).
 */

import { Assets, Texture } from "pixi.js";
import type { LegacyFullAnimState } from "./legacy-combat-fsm";
import type { LegacyFacing } from "./legacy-animation-fsm";

export interface CharacterFrameSet {
  [key: string]: Texture[]; // key = `${animState}:${facing}`
}

export interface CharacterFrameManifestEntry {
  animState: LegacyFullAnimState;
  facing: LegacyFacing;
  /** Ordered frame file paths, relative to baseUrl, index 0..N in playback order. */
  frameFiles: string[];
}

export interface CharacterManifest {
  characterId: string;
  baseUrl: string; // e.g. "/legacy-character-assets/hand-drawn/kwame/"
  frames: CharacterFrameManifestEntry[];
}

const frameSetCache = new Map<string, CharacterFrameSet>();

export async function loadCharacterFrameSet(manifest: CharacterManifest): Promise<CharacterFrameSet> {
  const cached = frameSetCache.get(manifest.characterId);
  if (cached) return cached;

  const result: CharacterFrameSet = {};
  for (const entry of manifest.frames) {
    const urls = entry.frameFiles.map((f) => manifest.baseUrl + f);
    // eslint-disable-next-line no-await-in-loop -- Assets.load dedupes internally; sequential keeps load order deterministic for debugging
    const textures = (await Assets.load<Texture>(urls)) as Record<string, Texture> | Texture[];
    const ordered: Texture[] = Array.isArray(textures) ? textures : urls.map((u) => (textures as Record<string, Texture>)[u]);
    result[frameKey(entry.animState, entry.facing)] = ordered;
  }
  frameSetCache.set(manifest.characterId, result);
  return result;
}

export function frameKey(animState: LegacyFullAnimState, facing: LegacyFacing): string {
  return `${animState}:${facing}`;
}

/**
 * Resolves the best available frame array for a state/facing pair, with a
 * documented, visible fallback chain instead of a silent wrong-art swap --
 * mirrors the artTier enforcement philosophy from legacy-hand-drawn-assets.ts:
 * missing art should be obvious, never quietly substituted.
 */
export function resolveFrames(
  frameSet: CharacterFrameSet,
  animState: LegacyFullAnimState,
  facing: LegacyFacing
): { frames: Texture[]; isFallback: boolean } {
  const exact = frameSet[frameKey(animState, facing)];
  if (exact?.length) return { frames: exact, isFallback: false };

  // Fall back to "down" facing of the same state before falling back to idle --
  // a missing "attack:left" is more useful shown facing down than not shown at all.
  const downFallback = frameSet[frameKey(animState, "down")];
  if (downFallback?.length) return { frames: downFallback, isFallback: true };

  const idleFallback = frameSet[frameKey("idle", facing)] ?? frameSet[frameKey("idle", "down")];
  return { frames: idleFallback ?? [], isFallback: true };
}

// --- Environment tiles/buildings -------------------------------------------------

export interface EnvironmentManifestEntry {
  assetId: string;
  file: string; // relative to baseUrl
}

export async function loadEnvironmentTextures(
  baseUrl: string,
  entries: EnvironmentManifestEntry[]
): Promise<Map<string, Texture>> {
  const urls = entries.map((e) => baseUrl + e.file);
  const loaded = (await Assets.load<Texture>(urls)) as Record<string, Texture>;
  const byAssetId = new Map<string, Texture>();
  entries.forEach((e, i) => {
    byAssetId.set(e.assetId, loaded[urls[i]]);
  });
  return byAssetId;
}
