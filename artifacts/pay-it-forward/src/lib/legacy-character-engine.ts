/**
 * Controlled resolver for the Niakofa Legacy RPG character asset library.
 *
 * Family facts stay in the vault. This module only resolves a visual runtime
 * representation from an appearance definition and never infers history.
 *
 * ---------------------------------------------------------------------------
 * TWO SWAPPABLE LIBRARIES
 * ---------------------------------------------------------------------------
 * "niakofa-rpg-generator-v1"   — curated subset of the uploaded RPG Maker
 *                                 generator archive. Licensing status is
 *                                 "review-required" (see catalog.json).
 * "niakofa-original-art-demo-v1" — fully original procedurally-generated
 *                                 art created for this project. No
 *                                 third-party or RPG Maker content. Safe to
 *                                 ship without a license review.
 *
 * DEFAULT_LIBRARY_ID controls which one callers get when they don't specify
 * a library explicitly. It stays "niakofa-rpg-generator-v1" so this change
 * is non-breaking for every existing caller and test. Opt a call site into
 * the license-clean art by passing libraryId: "niakofa-original-art-demo-v1"
 * explicitly (or flip this constant once the generator library's licensing
 * review is resolved one way or the other).
 */

export type LegacyAgeGroup = "adult" | "kid";
export type LegacyGender = "male" | "female" | "unspecified";
export type LegacyRepresentation = "TV" | "Face" | "TVD" | "SV";
export type LegacyLifeStage = "youth" | "adult" | "mature" | "elder" | "unknown";
export type LegacyLayer =
  | "body"
  | "clothing"
  | "rearHair"
  | "frontHair"
  | "beard"
  | "accessoryA"
  | "accessoryB"
  | "glasses"
  | "facialMark";

export type LegacyLibraryId = "niakofa-rpg-generator-v1" | "niakofa-original-art-demo-v1";

/**
 * Original-art library only: named, non-derivative hairstyle silhouettes.
 * The generator library has no equivalent — its hair variants are only
 * numbered (p02/p03/p04), not named.
 */
export type LegacyHairStyle = "afro" | "coils" | "braids" | "bun" | "locs";

export const DEFAULT_LIBRARY_ID: LegacyLibraryId = "niakofa-rpg-generator-v1";
export const HAIR_STYLES: LegacyHairStyle[] = ["afro", "coils", "braids", "bun", "locs"];

export interface LegacyAppearanceInput {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  characterId?: string;
  lifeStage?: LegacyLifeStage;
  era?: string;
  appearanceSeed?: string | number;
  libraryId?: LegacyLibraryId;
  /** Original-art library only. Ignored by the generator library. */
  hairStyle?: LegacyHairStyle;
  /**
   * Appearance choices are explicit asset IDs. The engine never derives a
   * person's identity, history, or gender from an asset filename.
   */
  layers?: Partial<Record<LegacyLayer, string>>;
}

export interface LegacyAssetRecord {
  assetId: string;
  representation: LegacyRepresentation;
  layer: LegacyLayer;
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  file: string;
  source: string;
  width: number;
  height: number;
  runtime: "approved" | "catalog-only";
  hairStyle?: LegacyHairStyle;
}

export interface LegacyWalkingAsset {
  assetId: string;
  file: string;
  width: 144;
  height: 192;
  layer: "body";
}

export interface LegacyWalkingLayer {
  assetId: string;
  file: string;
  width: number;
  height: number;
  layer: LegacyLayer;
}

export interface LegacyWalkingAppearance {
  layers: LegacyWalkingLayer[];
  width: 144;
  height: 192;
  characterId?: string;
  lifeStage?: LegacyLifeStage;
  era?: string;
  appearanceSeed?: string | number;
  libraryId: LegacyLibraryId;
}

export interface LegacyLifeStageProfile {
  id: LegacyLifeStage;
  label: string;
  age: number | null;
  description: string;
}

/**
 * Life stages are presentation metadata, not facts about a person's identity.
 * A deceased person's appearance is evaluated at their recorded death year so
 * a historical profile does not keep aging after the life they represent.
 */
export function deriveLifeStage(input: {
  birthYear: number | null;
  deathYear?: number | null;
  currentYear?: number;
}): LegacyLifeStageProfile {
  const currentYear = input.currentYear ?? new Date().getFullYear();
  if (
    !Number.isInteger(input.birthYear) ||
    !Number.isInteger(currentYear) ||
    (input.birthYear as number) > currentYear
  ) {
    return {
      id: "unknown",
      label: "Life stage unknown",
      age: null,
      description: "Add a verified birth year to select a life-stage appearance.",
    };
  }

  const birthYear = input.birthYear as number;
  const deathYear = Number.isInteger(input.deathYear)
    && (input.deathYear as number) >= birthYear
    && (input.deathYear as number) <= currentYear
    ? (input.deathYear as number)
    : null;
  const referenceYear = deathYear ?? currentYear;
  const age = Math.max(0, referenceYear - birthYear);

  if (age < 18) {
    return { id: "youth", label: "Youth", age, description: "The character engine uses a curated youth walking profile." };
  }
  if (age < 35) {
    return { id: "adult", label: "Adult", age, description: "The character engine uses a curated adult walking profile." };
  }
  if (age < 55) {
    return { id: "mature", label: "Mature", age, description: "The character engine uses a mature curated walking profile." };
  }
  return { id: "elder", label: "Elder", age, description: "The character engine uses an elder curated walking profile." };
}

// ============================================================================
// Per-library asset tables
// ============================================================================

type BodyTable = Partial<Record<LegacyAgeGroup, Partial<Record<LegacyGender, LegacyWalkingAsset>>>>;
type LayerDefaults = Partial<Record<LegacyLayer, string>>;
type DefaultsTable = Partial<Record<LegacyAgeGroup, Partial<Record<LegacyGender, LayerDefaults>>>>;

interface LibraryTables {
  bodyAssets: BodyTable;
  layerAssets: Record<string, LegacyAssetRecord>;
  defaultLayers: DefaultsTable;
}

const LAYER_ORDER: LegacyLayer[] = ["clothing", "rearHair", "frontHair", "beard", "accessoryA", "accessoryB", "glasses", "facialMark"];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ---------------------------------------------------------------------------
// Library 1: "niakofa-rpg-generator-v1" (curated generator subset, unchanged)
// ---------------------------------------------------------------------------

const GENERATOR_BODY_ASSETS: BodyTable = {
  adult: {
    male: {
      assetId: "tv_body_male_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-male.png",
      width: 144,
      height: 192,
      layer: "body",
    },
    female: {
      assetId: "tv_body_female_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-female.png",
      width: 144,
      height: 192,
      layer: "body",
    },
  },
  kid: {
    unspecified: {
      assetId: "tv_body_kid_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-kid.png",
      width: 144,
      height: 192,
      layer: "body",
    },
  },
};

const GENERATOR_LAYER_ASSETS: Record<string, LegacyAssetRecord> = {
  tv_clothing_male_default: {
    assetId: "tv_clothing_male_default",
    representation: "TV",
    layer: "clothing",
    ageGroup: "adult",
    gender: "male",
    file: "/legacy-character-assets/tv/TV_Clothing2_p01-male.png",
    source: "generator/TV/Male/TV_Clothing2_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_clothing_female_default: {
    assetId: "tv_clothing_female_default",
    representation: "TV",
    layer: "clothing",
    ageGroup: "adult",
    gender: "female",
    file: "/legacy-character-assets/tv/TV_Clothing2_p01-female.png",
    source: "generator/TV/Female/TV_Clothing2_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_clothing_kid_default: {
    assetId: "tv_clothing_kid_default",
    representation: "TV",
    layer: "clothing",
    ageGroup: "kid",
    gender: "unspecified",
    file: "/legacy-character-assets/tv/TV_Clothing2_p01-kid.png",
    source: "generator/TV/Kid/TV_Clothing2_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_rear_hair_male_default: {
    assetId: "tv_rear_hair_male_default",
    representation: "TV",
    layer: "rearHair",
    ageGroup: "adult",
    gender: "male",
    file: "/legacy-character-assets/tv/TV_RearHair1_p01-male.png",
    source: "generator/TV/Male/TV_RearHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_rear_hair_female_default: {
    assetId: "tv_rear_hair_female_default",
    representation: "TV",
    layer: "rearHair",
    ageGroup: "adult",
    gender: "female",
    file: "/legacy-character-assets/tv/TV_RearHair1_p01-female.png",
    source: "generator/TV/Female/TV_RearHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_rear_hair_kid_default: {
    assetId: "tv_rear_hair_kid_default",
    representation: "TV",
    layer: "rearHair",
    ageGroup: "kid",
    gender: "unspecified",
    file: "/legacy-character-assets/tv/TV_RearHair1_p01-kid.png",
    source: "generator/TV/Kid/TV_RearHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_front_hair_male_default: {
    assetId: "tv_front_hair_male_default",
    representation: "TV",
    layer: "frontHair",
    ageGroup: "adult",
    gender: "male",
    file: "/legacy-character-assets/tv/TV_FrontHair1_p01-male.png",
    source: "generator/TV/Male/TV_FrontHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_front_hair_female_default: {
    assetId: "tv_front_hair_female_default",
    representation: "TV",
    layer: "frontHair",
    ageGroup: "adult",
    gender: "female",
    file: "/legacy-character-assets/tv/TV_FrontHair1_p01-female.png",
    source: "generator/TV/Female/TV_FrontHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
  tv_front_hair_kid_default: {
    assetId: "tv_front_hair_kid_default",
    representation: "TV",
    layer: "frontHair",
    ageGroup: "kid",
    gender: "unspecified",
    file: "/legacy-character-assets/tv/TV_FrontHair1_p01-kid.png",
    source: "generator/TV/Kid/TV_FrontHair1_p01.png",
    width: 144,
    height: 192,
    runtime: "approved",
  },
};

const GENERATOR_VARIANT_PROFILES = [
  { ageGroup: "adult", gender: "male", suffix: "male" },
  { ageGroup: "adult", gender: "female", suffix: "female" },
  { ageGroup: "kid", gender: "unspecified", suffix: "kid" },
] as const satisfies Array<{ ageGroup: LegacyAgeGroup; gender: LegacyGender; suffix: string }>;

const GENERATOR_VARIANT_LAYERS = [
  { layer: "clothing", filePrefix: "TV_Clothing2" },
  { layer: "rearHair", filePrefix: "TV_RearHair1" },
  { layer: "frontHair", filePrefix: "TV_FrontHair1" },
] as const satisfies Array<{ layer: LegacyLayer; filePrefix: string }>;

for (const profile of GENERATOR_VARIANT_PROFILES) {
  for (const variant of [2, 3, 4]) {
    for (const layer of GENERATOR_VARIANT_LAYERS) {
      const layerId = layer.layer === "rearHair" ? "rear_hair" : layer.layer === "frontHair" ? "front_hair" : layer.layer;
      const assetId = `tv_${layerId}_${profile.suffix}_p0${variant}`;
      GENERATOR_LAYER_ASSETS[assetId] = {
        assetId,
        representation: "TV",
        layer: layer.layer,
        ageGroup: profile.ageGroup,
        gender: profile.gender,
        file: `/legacy-character-assets/tv/${layer.filePrefix}_p0${variant}-${profile.suffix}.png`,
        source: `generator/TV/${profile.suffix === "male" ? "Male" : profile.suffix === "female" ? "Female" : "Kid"}/${layer.filePrefix}_p0${variant}.png`,
        width: 144,
        height: 192,
        runtime: "approved",
      };
    }
  }
}

const GENERATOR_DEFAULT_LAYERS: DefaultsTable = {
  adult: {
    male: {
      clothing: "tv_clothing_male_default",
      rearHair: "tv_rear_hair_male_default",
      frontHair: "tv_front_hair_male_default",
    },
    female: {
      clothing: "tv_clothing_female_default",
      rearHair: "tv_rear_hair_female_default",
      frontHair: "tv_front_hair_female_default",
    },
  },
  kid: {
    unspecified: {
      clothing: "tv_clothing_kid_default",
      rearHair: "tv_rear_hair_kid_default",
      frontHair: "tv_front_hair_kid_default",
    },
  },
};

// ---------------------------------------------------------------------------
// Library 2: "niakofa-original-art-demo-v1" (original, license-clean art)
// See /public/legacy-world-assets/catalog-original.json for the full
// generated manifest this table mirrors.
// ---------------------------------------------------------------------------

const ORIGINAL_GROUPS = [
  { ageGroup: "adult", gender: "male", suffix: "adult_male" },
  { ageGroup: "adult", gender: "female", suffix: "adult_female" },
  { ageGroup: "kid", gender: "unspecified", suffix: "kid" },
] as const satisfies Array<{ ageGroup: LegacyAgeGroup; gender: LegacyGender; suffix: string }>;

const ORIGINAL_ASSET_ROOT = "/legacy-world-assets/tv";

const ORIGINAL_BODY_ASSETS: BodyTable = {};
const ORIGINAL_LAYER_ASSETS: Record<string, LegacyAssetRecord> = {};
const ORIGINAL_DEFAULT_LAYERS: DefaultsTable = {};

for (const group of ORIGINAL_GROUPS) {
  const bodyAssetId = `tv_body_${group.suffix}_base`;
  const bodyEntry: LegacyWalkingAsset = {
    assetId: bodyAssetId,
    file: `${ORIGINAL_ASSET_ROOT}/TV_Body_p01-${group.suffix}.png`,
    width: 144,
    height: 192,
    layer: "body",
  };
  ORIGINAL_BODY_ASSETS[group.ageGroup] = {
    ...(ORIGINAL_BODY_ASSETS[group.ageGroup] ?? {}),
    [group.gender]: bodyEntry,
  };

  // clothing p01-p03
  for (let i = 1; i <= 3; i += 1) {
    const assetId = `tv_clothing_${group.suffix}_p0${i}`;
    ORIGINAL_LAYER_ASSETS[assetId] = {
      assetId,
      representation: "TV",
      layer: "clothing",
      ageGroup: group.ageGroup,
      gender: group.gender,
      file: `${ORIGINAL_ASSET_ROOT}/TV_Clothing_p0${i}-${group.suffix}.png`,
      source: "original-art (generated for this project)",
      width: 144,
      height: 192,
      runtime: "approved",
    };
  }

  // hair p01-p05, one named style per index
  HAIR_STYLES.forEach((style, index) => {
    const n = index + 1;
    const rearId = `tv_rear_hair_${group.suffix}_p0${n}_${style}`;
    const frontId = `tv_front_hair_${group.suffix}_p0${n}_${style}`;
    ORIGINAL_LAYER_ASSETS[rearId] = {
      assetId: rearId,
      representation: "TV",
      layer: "rearHair",
      ageGroup: group.ageGroup,
      gender: group.gender,
      file: `${ORIGINAL_ASSET_ROOT}/TV_RearHair_p0${n}-${group.suffix}.png`,
      source: "original-art (generated for this project)",
      width: 144,
      height: 192,
      runtime: "approved",
      hairStyle: style,
    };
    ORIGINAL_LAYER_ASSETS[frontId] = {
      assetId: frontId,
      representation: "TV",
      layer: "frontHair",
      ageGroup: group.ageGroup,
      gender: group.gender,
      file: `${ORIGINAL_ASSET_ROOT}/TV_FrontHair_p0${n}-${group.suffix}.png`,
      source: "original-art (generated for this project)",
      width: 144,
      height: 192,
      runtime: "approved",
      hairStyle: style,
    };
  });

  ORIGINAL_DEFAULT_LAYERS[group.ageGroup] = {
    ...(ORIGINAL_DEFAULT_LAYERS[group.ageGroup] ?? {}),
    [group.gender]: {
      clothing: `tv_clothing_${group.suffix}_p01`,
      rearHair: `tv_rear_hair_${group.suffix}_p01_afro`,
      frontHair: `tv_front_hair_${group.suffix}_p01_afro`,
    },
  };
}

// ---------------------------------------------------------------------------

const LIBRARIES: Record<LegacyLibraryId, LibraryTables> = {
  "niakofa-rpg-generator-v1": {
    bodyAssets: GENERATOR_BODY_ASSETS,
    layerAssets: GENERATOR_LAYER_ASSETS,
    defaultLayers: GENERATOR_DEFAULT_LAYERS,
  },
  "niakofa-original-art-demo-v1": {
    bodyAssets: ORIGINAL_BODY_ASSETS,
    layerAssets: ORIGINAL_LAYER_ASSETS,
    defaultLayers: ORIGINAL_DEFAULT_LAYERS,
  },
};

function resolveLibrary(libraryId?: LegacyLibraryId): { id: LegacyLibraryId; tables: LibraryTables } {
  const id = libraryId ?? DEFAULT_LIBRARY_ID;
  return { id, tables: LIBRARIES[id] };
}

function deterministicVariant(
  input: Pick<LegacyAppearanceInput, "characterId" | "lifeStage" | "era" | "appearanceSeed">,
  layer: "clothing" | "rearHair" | "frontHair",
  min: number,
  count: number,
): number {
  const identity = [
    input.characterId ?? "",
    input.lifeStage ?? "unknown",
    input.era ?? "unspecified",
    input.appearanceSeed ?? "",
    layer,
  ].join("|");
  return min + (stableHash(identity) % count);
}

function getDefaultLayers(input: LegacyAppearanceInput, libraryId: LegacyLibraryId, tables: LibraryTables): LayerDefaults {
  const defaults = tables.defaultLayers[input.ageGroup]?.[input.gender] ?? {};
  if (!input.characterId || !input.lifeStage || input.lifeStage === "unknown") {
    return defaults;
  }

  const legacySuffix = input.gender === "unspecified" ? "kid" : input.gender;

  if (libraryId === "niakofa-original-art-demo-v1") {
    // original-art library ships exactly 3 clothing variants (p01-p03)
    const suffix = input.gender === "unspecified" ? "kid" : `adult_${input.gender}`;
    const clothingN = deterministicVariant(input, "clothing", 1, 3);
    const style = input.hairStyle
      ?? HAIR_STYLES[stableHash([input.characterId, input.lifeStage, input.era ?? "", "hair"].join("|")) % HAIR_STYLES.length];
    const styleIndex = HAIR_STYLES.indexOf(style) + 1;
    return {
      ...defaults,
      clothing: `tv_clothing_${suffix}_p0${clothingN}`,
      rearHair: `tv_rear_hair_${suffix}_p0${styleIndex}_${style}`,
      frontHair: `tv_front_hair_${suffix}_p0${styleIndex}_${style}`,
    };
  }

  // generator library: numbered variants only (p02-p04), no named styles.
  // Same min/count as the original implementation - unchanged behavior.
  const variants = {
    clothing: `tv_clothing_${legacySuffix}_p0${deterministicVariant(input, "clothing", 2, 3)}`,
    rearHair: `tv_rear_hair_${legacySuffix}_p0${deterministicVariant(input, "rearHair", 2, 3)}`,
    frontHair: `tv_front_hair_${legacySuffix}_p0${deterministicVariant(input, "frontHair", 2, 3)}`,
  };
  return { ...defaults, ...variants };
}

export function resolveWalkingAsset(input: LegacyAppearanceInput): LegacyWalkingAsset | null {
  const { tables } = resolveLibrary(input.libraryId);
  return tables.bodyAssets[input.ageGroup]?.[input.gender] ?? null;
}

export function resolveWalkingAppearance(input: LegacyAppearanceInput): LegacyWalkingAppearance | null {
  const { id: libraryId, tables } = resolveLibrary(input.libraryId);
  const body = tables.bodyAssets[input.ageGroup]?.[input.gender] ?? null;
  if (!body) return null;

  const defaults = getDefaultLayers(input, libraryId, tables);
  const requestedLayers = { ...defaults, ...input.layers };
  const resolvedLayers: LegacyWalkingLayer[] = [];
  for (const layer of LAYER_ORDER) {
    const requested = requestedLayers[layer];
    const requestedAsset = requested ? tables.layerAssets[requested] : undefined;
    const isCompatible = requestedAsset
      && requestedAsset.ageGroup === input.ageGroup
      && requestedAsset.gender === input.gender;
    const fallbackId = defaults[layer];
    const asset = isCompatible
      ? requestedAsset
      : fallbackId
        ? tables.layerAssets[fallbackId]
        : undefined;
    if (asset?.runtime === "approved") {
      resolvedLayers.push({
        assetId: asset.assetId,
        file: asset.file,
        width: asset.width,
        height: asset.height,
        layer: asset.layer,
      });
    }
  }

  const appearance: LegacyWalkingAppearance = {
    layers: [
      {
        assetId: body.assetId,
        file: body.file,
        width: body.width,
        height: body.height,
        layer: body.layer,
      },
      ...resolvedLayers,
    ],
    width: body.width,
    height: body.height,
    libraryId,
  };
  if (input.characterId !== undefined) appearance.characterId = input.characterId;
  if (input.lifeStage !== undefined) appearance.lifeStage = input.lifeStage;
  if (input.era !== undefined) appearance.era = input.era;
  if (input.appearanceSeed !== undefined) appearance.appearanceSeed = input.appearanceSeed;
  return appearance;
}

/**
 * Named entry point for world regeneration and NPC creation. Callers must
 * provide an explicit identity and appearance seed; the engine never creates
 * a likeness from family facts that were not supplied.
 */
export function resolveCharacterAppearance(input: {
  characterId: string;
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  lifeStage: LegacyLifeStage;
  era: string;
  appearanceSeed?: string | number;
  libraryId?: LegacyLibraryId;
  hairStyle?: LegacyHairStyle;
  layers?: Partial<Record<LegacyLayer, string>>;
}): LegacyWalkingAppearance | null {
  return resolveWalkingAppearance(input);
}

export function getApprovedAsset(assetId: string, libraryId?: LegacyLibraryId): LegacyAssetRecord | null {
  const { tables } = resolveLibrary(libraryId);
  return tables.layerAssets[assetId] ?? null;
}

export function inferAppearance(input: {
  characterId?: string | number;
  role?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  currentYear?: number;
  era?: string;
  appearanceSeed?: string | number;
  libraryId?: LegacyLibraryId;
}): LegacyAppearanceInput | null {
  const role = input.role?.toLowerCase() ?? "";
  const femaleRoles = /\b(aunt|daughter|grandmother|mother|sister|wife|woman|female)\b/;
  const maleRoles = /\b(brother|father|grandfather|husband|man|male|son|uncle)\b/;
  const currentYear = input.currentYear ?? new Date().getFullYear();
  const hasBirthYear = Number.isInteger(input.birthYear)
    && Number.isInteger(currentYear)
    && (input.birthYear as number) <= currentYear;
  if (!Number.isInteger(currentYear) || (Number.isInteger(input.birthYear) && !hasBirthYear)) return null;
  const deathYear = hasBirthYear && Number.isInteger(input.deathYear)
    && (input.deathYear as number) >= (input.birthYear as number)
    && (input.deathYear as number) <= currentYear
    ? (input.deathYear as number)
    : null;
  const referenceYear = deathYear ?? currentYear;
  const age = !hasBirthYear
    ? null
    : referenceYear - (input.birthYear as number);

  const ageGroup: LegacyAgeGroup = age !== null && age >= 0 && age < 18 ? "kid" : "adult";
  const gender: LegacyGender = ageGroup === "kid"
    ? "unspecified"
    : femaleRoles.test(role)
      ? "female"
      : maleRoles.test(role)
        ? "male"
        : "unspecified";
  if (gender === "unspecified" && ageGroup === "adult") return null;
  const appearance: LegacyAppearanceInput = { ageGroup, gender };
  if (input.libraryId !== undefined) appearance.libraryId = input.libraryId;
  if (input.characterId !== undefined) appearance.characterId = String(input.characterId);
  if (input.era !== undefined) appearance.era = input.era;
  if (input.appearanceSeed !== undefined) appearance.appearanceSeed = input.appearanceSeed;
  if (input.characterId !== undefined || input.era !== undefined || input.appearanceSeed !== undefined) {
    appearance.lifeStage = ageGroup === "kid"
      ? "youth"
      : deriveLifeStage({ birthYear: input.birthYear ?? null, deathYear, currentYear }).id;
  }
  return appearance;
}