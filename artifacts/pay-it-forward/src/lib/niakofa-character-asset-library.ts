/**
 * NiakofaCharacterAssetLibrary — multi-representation character pipeline.
 *
 * Structural reference from the OCC Winner Pack character format (studied for
 * pipeline shape only; no OCC images are used in the Niakofa runtime, per
 * licensing guidance in the architecture recommendation document).
 *
 * OCC pipeline: BUST · FACE · TV (walk) · TVD (dash) · SV (side-view battle)
 *
 * Niakofa equivalent pipeline for every major character:
 *
 *   CHARACTER ID
 *     │
 *     ├── PORTRAIT         — 660×624 styled close-up (menu, credits)
 *     ├── DIALOGUE_BUST    — 500×624 upper-body (dialogue box)
 *     ├── DIALOGUE_FACE    — 144×144 small face chip (quick-reply, HUD)
 *     ├── EXPLORATION_WALK — 4-dir walk cycle atlas (field movement)
 *     ├── EXPLORATION_RUN  — 4-dir run cycle atlas
 *     ├── COMBAT_SV        — side-view battle animations
 *     ├── COMBAT_ACTION    — attack/skill frames
 *     ├── CINEMATIC        — high-res story stills
 *     └── VARIATIONS       — seasonal / age / costume alternates
 *
 * Art tier enforcement (per legacy-hand-drawn-assets.ts):
 *   - protagonist / antagonist → MUST be hand-drawn
 *   - supporting → hand-drawn preferred, prototypePixel allowed
 *   - background → any tier
 */

// ── Asset tier gate ────────────────────────────────────────────────────────────

export type ArtTier = "handDrawn" | "prototypePixel" | "placeholder";
export type CharacterRole = "protagonist" | "antagonist" | "supporting" | "background";

/** Throws a visible error if a protagonist/antagonist uses non-handDrawn art. */
export function enforceCharacterArtTier(
  characterId: string,
  role: CharacterRole,
  tier: ArtTier,
): void {
  if ((role === "protagonist" || role === "antagonist") && tier !== "handDrawn") {
    throw new Error(
      `[NiakofaCharacterAssetLibrary] Art tier violation: ${characterId} (${role}) must use "handDrawn" art, got "${tier}". ` +
      "Placeholder or prototypePixel art is not permitted for principal characters in production. " +
      "Commission the missing hand-drawn frames or mark the scene as prototype-only."
    );
  }
}

// ── Asset record ───────────────────────────────────────────────────────────────

export interface CharacterPortraitAsset {
  /** Path relative to /public/ */
  src: string;
  /** Pixel width of the source image */
  width: number;
  /** Pixel height of the source image */
  height: number;
  tier: ArtTier;
}

export interface CharacterAtlasAsset {
  /** Directory path relative to /public/ containing individual PNG frames */
  frameDir: string;
  /** Frame filenames in playback order */
  frames: readonly string[];
  /** Source frame width */
  frameWidth: number;
  /** Source frame height */
  frameHeight: number;
  fps: number;
  tier: ArtTier;
}

export interface CharacterAssetVariation {
  id: string;
  label: string;
  /** Overrides to apply from the base record */
  overrides: Partial<CharacterAssetRecord>;
}

/**
 * Complete asset record for one character, all representations.
 * Fields are optional — only the art that exists is populated.
 * Missing fields render the canonical placeholder for that representation.
 */
export interface CharacterAssetRecord {
  id: string;
  displayName: string;
  role: CharacterRole;
  /** Current production art tier (drives gate checks). */
  productionTier: ArtTier;

  /** 660×624 styled portrait — menu, credits, chapter openers */
  portrait?: CharacterPortraitAsset;
  /** 500×624 upper-body bust — dialogue box left side */
  dialogueBust?: CharacterPortraitAsset;
  /** 144×144 small face chip — HUD quick-reply, quick portrait */
  dialogueFace?: CharacterPortraitAsset;

  /** 4-direction walk cycle atlas */
  explorationWalk?: CharacterAtlasAsset;
  /** 4-direction run cycle atlas */
  explorationRun?: CharacterAtlasAsset;
  /** Side-view battle sprite */
  combatSideView?: CharacterAtlasAsset;
  /** Attack / skill animation atlas */
  combatAction?: CharacterAtlasAsset;
  /** High-resolution story stills (one per scene ID) */
  cinematicStills?: Record<string, CharacterPortraitAsset>;

  /** Seasonal / age / costume alternates */
  variations?: CharacterAssetVariation[];
}

// ── Character registry ─────────────────────────────────────────────────────────

const ATLAS_BASE = "/legacy-character-assets/kwame-mensah/atlas";
const KWAME_FPS = 12;

/**
 * Kwame Mensah — canonical protagonist asset record.
 *
 * Currently populated with the extracted atlas frames delivered in the
 * kwame-sprite-atlas.ts commit. Portrait and dialogue assets are pending
 * the hand-drawn production pipeline.
 */
const kwameMensah: CharacterAssetRecord = {
  id: "kwame-mensah",
  displayName: "Kwame Mensah",
  role: "protagonist",
  productionTier: "handDrawn",

  // Portrait and dialogue bust: pending hand-drawn production pipeline.
  // When commissioned, drop the files into public/legacy-character-assets/kwame-mensah/
  // and add the entries below:
  // portrait: { src: "/legacy-character-assets/kwame-mensah/portrait.png", width: 660, height: 624, tier: "handDrawn" },
  // dialogueBust: { src: "/legacy-character-assets/kwame-mensah/bust.png", width: 500, height: 624, tier: "handDrawn" },
  // dialogueFace: { src: "/legacy-character-assets/kwame-mensah/face.png", width: 144, height: 144, tier: "handDrawn" },

  explorationWalk: {
    frameDir: `${ATLAS_BASE}/Hand-Drawn_Base`,
    frames: [
      "idle-down-1.png","idle-down-2.png","idle-down-3.png","idle-down-4.png",
      "idle-down-5.png","idle-down-6.png","idle-down-7.png","idle-down-8.png",
    ],
    frameWidth: 256,
    frameHeight: 256,
    fps: KWAME_FPS,
    tier: "handDrawn",
  },

  combatAction: {
    frameDir: `${ATLAS_BASE}/HURT`,
    frames: [
      "hurt-down-1.png","hurt-down-2.png","hurt-down-3.png",
      "hurt-down-4.png","hurt-down-5.png","hurt-down-6.png",
    ],
    frameWidth: 256,
    frameHeight: 256,
    fps: KWAME_FPS,
    tier: "handDrawn",
  },
};

/** Central character registry keyed by character ID. */
export const CHARACTER_ASSET_REGISTRY: Record<string, CharacterAssetRecord> = {
  "kwame-mensah": kwameMensah,
};

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export function getCharacterAssets(characterId: string): CharacterAssetRecord | undefined {
  return CHARACTER_ASSET_REGISTRY[characterId];
}

/**
 * Returns the dialogue bust src for a character, or a placeholder path
 * if the asset hasn't been commissioned yet.
 */
export function getDialogueBustSrc(characterId: string): string {
  const record = CHARACTER_ASSET_REGISTRY[characterId];
  if (!record) return "/legacy-character-assets/placeholder-bust.png";
  return record.dialogueBust?.src ?? "/legacy-character-assets/placeholder-bust.png";
}

/**
 * Returns the dialogue face src for a character, or a placeholder path.
 */
export function getDialogueFaceSrc(characterId: string): string {
  const record = CHARACTER_ASSET_REGISTRY[characterId];
  if (!record) return "/legacy-character-assets/placeholder-face.png";
  return record.dialogueFace?.src ?? "/legacy-character-assets/placeholder-face.png";
}

/**
 * Returns the variation record for a given variation ID, merging
 * overrides into the base character record.
 */
export function getCharacterVariation(
  characterId: string,
  variationId: string,
): CharacterAssetRecord | undefined {
  const base = CHARACTER_ASSET_REGISTRY[characterId];
  if (!base) return undefined;
  const variation = base.variations?.find(v => v.id === variationId);
  if (!variation) return base;
  return { ...base, ...variation.overrides };
}

// ── Production checklist ───────────────────────────────────────────────────────

export interface AssetProductionStatus {
  characterId: string;
  displayName: string;
  missingAssets: string[];
  readyAssets: string[];
  overallReady: boolean;
}

/**
 * Audits the asset registry and returns a production readiness report.
 * Run this during development to track which characters still need
 * commissioned hand-drawn work.
 */
export function auditCharacterAssets(): AssetProductionStatus[] {
  const REQUIRED_ASSETS: (keyof CharacterAssetRecord)[] = [
    "portrait",
    "dialogueBust",
    "dialogueFace",
    "explorationWalk",
    "combatSideView",
  ];

  return Object.values(CHARACTER_ASSET_REGISTRY).map(record => {
    const missing: string[] = [];
    const ready: string[] = [];
    for (const key of REQUIRED_ASSETS) {
      if (record[key]) {
        ready.push(key);
      } else {
        missing.push(key);
      }
    }
    return {
      characterId: record.id,
      displayName: record.displayName,
      missingAssets: missing,
      readyAssets: ready,
      overallReady: missing.length === 0,
    };
  });
}
