/**
 * Resilient Legacy art loading for the hand-drawn Kwame and Cape Coast packs.
 *
 * The preferred runtime path loads one 32-frame atlas per animation and
 * creates Pixi sub-textures in memory. The older extracted-frame manifest is
 * still supported for migration and for callers with a custom asset pack.
 *
 * Asset failures are isolated: a transient 429 is retried with backoff,
 * optional animations are skipped, and the world always receives an
 * idle/down fallback so a single bad request cannot blank the game.
 */

import "pixi.js/unsafe-eval";

import { Assets, Rectangle, Texture } from "pixi.js";
import type { LegacyFullAnimState } from "@/lib/legacy-combat-fsm";
import type { LegacyFacing } from "@/lib/legacy-animation-fsm";

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
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 300;

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return status === 404 || /\b404\b|not found/i.test(message);
}

function isRateLimited(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error);
  return status === 429 || /\b429\b|too many requests|rate.?limit/i.test(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadTextureWithRetry(url: string): Promise<Texture | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await Assets.load<Texture>(url);
    } catch (error) {
      if (isNotFound(error)) {
        console.warn(`[legacy-asset-loader] missing optional asset (skip): ${url}`);
        return null;
      }

      const retryKind = isRateLimited(error) ? "429" : "transient error";
      if (attempt === MAX_RETRIES - 1) {
        console.warn(`[legacy-asset-loader] giving up after ${MAX_RETRIES} attempts (${retryKind}): ${url}`, error);
        return null;
      }

      const delay = RETRY_BASE_MS * 2 ** attempt;
      console.warn(
        `[legacy-asset-loader] retry ${attempt + 1}/${MAX_RETRIES - 1} in ${delay}ms (${retryKind}): ${url}`,
      );
      await wait(delay);
    }
  }

  return null;
}

async function loadIndividualTextures(urls: string[]): Promise<Texture[]> {
  const textures: Texture[] = [];
  for (const url of urls) {
    const texture = await loadTextureWithRetry(url);
    textures.push(texture ?? Texture.WHITE);
  }
  return textures;
}

export async function loadCharacterFrameSet(manifest: CharacterManifest): Promise<CharacterFrameSet> {
  const cacheKey = `${manifest.characterId}:individual`;
  const cached = frameSetCache.get(cacheKey);
  if (cached) return cached;

  const result: CharacterFrameSet = {};
  for (const entry of manifest.frames) {
    const urls = entry.frameFiles.map((f) => manifest.baseUrl + f);
    const ordered = await loadIndividualTextures(urls);
    const valid = ordered.filter((texture) => texture !== Texture.WHITE);
    if (valid.length > 0) {
      result[frameKey(entry.animState, entry.facing)] = valid;
    } else {
      console.warn(
        `[legacy-asset-loader] no usable frames for ${entry.animState}:${entry.facing}; runtime fallback will be used`,
      );
    }
  }

  if (!result["idle:down"]?.length) result["idle:down"] = [Texture.WHITE];
  frameSetCache.set(cacheKey, result);
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
  return { frames: idleFallback?.length ? idleFallback : [Texture.WHITE], isFallback: true };
}

// --- Atlas sheets -----------------------------------------------------------------

/**
 * Slice a uniform 256×256-style atlas cell grid in left-to-right,
 * top-to-bottom playback order. Kwame's supplied sheets are 8 columns ×
 * 4 rows, but the helper intentionally derives the column count from the
 * loaded texture so it also works with smaller production sheets.
 */
export function sliceSheet(
  sheet: Texture,
  frameWidth: number,
  frameHeight: number,
  frameCount: number,
  startFrame = 0,
): Texture[] {
  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    frameCount <= 0 ||
    startFrame < 0 ||
    sheet.width <= 0 ||
    sheet.height <= 0
  ) {
    return [];
  }

  const columns = Math.max(1, Math.floor(sheet.width / frameWidth));
  const frames: Texture[] = [];

  for (let index = startFrame; index < startFrame + frameCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * frameWidth;
    const y = row * frameHeight;

    if (x + frameWidth > sheet.width || y + frameHeight > sheet.height) break;

    frames.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(x, y, frameWidth, frameHeight),
      }),
    );
  }

  return frames;
}

export interface SheetManifestEntry {
  animState: LegacyFullAnimState;
  facing: LegacyFacing;
  /** Path relative to baseUrl, e.g. "Kwame_Mensah_PICK_UP_...png". */
  sheetFile: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  /** Zero-based cell offset within the sheet. */
  startFrame?: number;
}

export interface SheetBasedCharacterManifest {
  characterId: string;
  baseUrl: string;
  sheets: SheetManifestEntry[];
}

/**
 * Loads each source atlas once and slices its rows into animation frames.
 * This is the production path for the supplied hand-drawn ZIPs: it makes one
 * request per distinct sheet instead of one request per frame.
 */
export async function loadCharacterFrameSetFromSheets(
  manifest: SheetBasedCharacterManifest,
): Promise<CharacterFrameSet> {
  const cacheKey = `${manifest.characterId}:sheets`;
  const cached = frameSetCache.get(cacheKey);
  if (cached) return cached;

  const result: CharacterFrameSet = {};
  const sheetCache = new Map<string, Texture | null>();

  for (const entry of manifest.sheets) {
    const url = manifest.baseUrl + entry.sheetFile;
    let sheet = sheetCache.get(url);
    if (sheet === undefined) {
      sheet = await loadTextureWithRetry(url);
      sheetCache.set(url, sheet);
    }
    if (!sheet) continue;

    const frames = sliceSheet(
      sheet,
      entry.frameWidth,
      entry.frameHeight,
      entry.frameCount,
      entry.startFrame ?? 0,
    );
    if (frames.length > 0) {
      result[frameKey(entry.animState, entry.facing)] = frames;
    } else {
      console.warn(`[legacy-asset-loader] empty atlas slice for ${entry.animState}:${entry.facing}: ${url}`);
    }
  }

  if (!result["idle:down"]?.length) result["idle:down"] = [Texture.WHITE];
  frameSetCache.set(cacheKey, result);
  return result;
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
  const byAssetId = new Map<string, Texture>();

  // Keep requests sequential and isolated. The scene only needs a small
  // number of static textures, and a missing optional prop must not reject
  // the whole Pixi boot Promise.
  for (const entry of entries) {
    const texture = await loadTextureWithRetry(baseUrl + entry.file);
    byAssetId.set(entry.assetId, texture ?? Texture.WHITE);
  }

  return byAssetId;
}
