/**
 * Controlled resolver for the Niakofa Legacy RPG character asset library.
 *
 * Family facts stay in the vault. This module only resolves a visual runtime
 * representation from an appearance definition and never infers history.
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

export interface LegacyAppearanceInput {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
  characterId?: string;
  lifeStage?: LegacyLifeStage;
  era?: string;
  appearanceSeed?: string | number;
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

const BODY_ASSETS: Partial<Record<LegacyAgeGroup, Partial<Record<LegacyGender, LegacyWalkingAsset>>>> = {
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

const APPROVED_LAYER_ASSETS: Record<string, LegacyAssetRecord> = {
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

const CURATED_VARIANT_PROFILES = [
  { ageGroup: "adult", gender: "male", suffix: "male" },
  { ageGroup: "adult", gender: "female", suffix: "female" },
  { ageGroup: "kid", gender: "unspecified", suffix: "kid" },
] as const satisfies Array<{ ageGroup: LegacyAgeGroup; gender: LegacyGender; suffix: string }>;

const CURATED_VARIANT_LAYERS = [
  { layer: "clothing", filePrefix: "TV_Clothing2" },
  { layer: "rearHair", filePrefix: "TV_RearHair1" },
  { layer: "frontHair", filePrefix: "TV_FrontHair1" },
] as const satisfies Array<{ layer: LegacyLayer; filePrefix: string }>;

/**
 * Only this small, explicit subset of the uploaded source library is shipped
 * to the browser. The rest of the archive stays catalog-only.
 */
const CURATED_VARIANT_ASSETS: Record<string, LegacyAssetRecord> = {};
for (const profile of CURATED_VARIANT_PROFILES) {
  for (const variant of [2, 3, 4]) {
    for (const layer of CURATED_VARIANT_LAYERS) {
      const layerId = layer.layer === "rearHair" ? "rear_hair" : layer.layer === "frontHair" ? "front_hair" : layer.layer;
      const assetId = `tv_${layerId}_${profile.suffix}_p0${variant}`;
      CURATED_VARIANT_ASSETS[assetId] = {
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

Object.assign(APPROVED_LAYER_ASSETS, CURATED_VARIANT_ASSETS);

type LegacyLayerDefaults = Partial<Record<LegacyLayer, string>>;

const DEFAULT_LAYERS: Partial<Record<LegacyAgeGroup, Partial<Record<LegacyGender, LegacyLayerDefaults>>>> = {
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

const LAYER_ORDER: LegacyLayer[] = ["clothing", "rearHair", "frontHair", "beard", "accessoryA", "accessoryB", "glasses", "facialMark"];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicVariant(
  input: Pick<LegacyAppearanceInput, "characterId" | "lifeStage" | "era" | "appearanceSeed">,
  layer: "clothing" | "rearHair" | "frontHair",
): number {
  const identity = [
    input.characterId ?? "",
    input.lifeStage ?? "unknown",
    input.era ?? "unspecified",
    input.appearanceSeed ?? "",
    layer,
  ].join("|");
  return 2 + (stableHash(identity) % 3);
}

function getDefaultLayers(input: LegacyAppearanceInput): LegacyLayerDefaults {
  const defaults = DEFAULT_LAYERS[input.ageGroup]?.[input.gender] ?? {};
  if (!input.characterId || !input.lifeStage || input.lifeStage === "unknown") {
    return defaults;
  }

  const variants = {
    clothing: `tv_clothing_${input.gender === "unspecified" ? "kid" : input.gender}_p0${deterministicVariant(input, "clothing")}`,
    rearHair: `tv_rear_hair_${input.gender === "unspecified" ? "kid" : input.gender}_p0${deterministicVariant(input, "rearHair")}`,
    frontHair: `tv_front_hair_${input.gender === "unspecified" ? "kid" : input.gender}_p0${deterministicVariant(input, "frontHair")}`,
  };
  return { ...defaults, ...variants };
}

export function resolveWalkingAsset(input: LegacyAppearanceInput): LegacyWalkingAsset | null {
  return BODY_ASSETS[input.ageGroup]?.[input.gender] ?? null;
}

export function resolveWalkingAppearance(input: LegacyAppearanceInput): LegacyWalkingAppearance | null {
  const body = resolveWalkingAsset(input);
  if (!body) return null;

  const defaults = getDefaultLayers(input);
  const requestedLayers = { ...defaults, ...input.layers };
  const resolvedLayers: LegacyWalkingLayer[] = [];
  for (const layer of LAYER_ORDER) {
    const requested = requestedLayers[layer];
    const requestedAsset = requested ? APPROVED_LAYER_ASSETS[requested] : undefined;
    const isCompatible = requestedAsset
      && requestedAsset.ageGroup === input.ageGroup
      && requestedAsset.gender === input.gender;
    const fallbackId = defaults[layer];
    const asset = isCompatible
      ? requestedAsset
      : fallbackId
        ? APPROVED_LAYER_ASSETS[fallbackId]
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
  layers?: Partial<Record<LegacyLayer, string>>;
}): LegacyWalkingAppearance | null {
  return resolveWalkingAppearance(input);
}

export function getApprovedAsset(assetId: string): LegacyAssetRecord | null {
  return APPROVED_LAYER_ASSETS[assetId] ?? null;
}

export function inferAppearance(input: {
  characterId?: string | number;
  role?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  currentYear?: number;
  era?: string;
  appearanceSeed?: string | number;
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