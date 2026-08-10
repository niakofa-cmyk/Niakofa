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
    return { id: "youth", label: "Youth", age, description: "The character engine uses the kid walking profile." };
  }
  if (age < 35) {
    return { id: "adult", label: "Adult", age, description: "The character engine uses the adult walking profile." };
  }
  if (age < 55) {
    return { id: "mature", label: "Mature", age, description: "The character engine uses the adult walking profile with mature life context." };
  }
  return { id: "elder", label: "Elder", age, description: "The character engine uses the adult walking profile with elder life context." };
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

export function resolveWalkingAsset(input: LegacyAppearanceInput): LegacyWalkingAsset | null {
  return BODY_ASSETS[input.ageGroup]?.[input.gender] ?? null;
}

export function resolveWalkingAppearance(input: LegacyAppearanceInput): LegacyWalkingAppearance | null {
  const body = resolveWalkingAsset(input);
  if (!body) return null;

  const defaults = DEFAULT_LAYERS[input.ageGroup]?.[input.gender] ?? {};
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

  return {
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
}

export function getApprovedAsset(assetId: string): LegacyAssetRecord | null {
  return APPROVED_LAYER_ASSETS[assetId] ?? null;
}

export function inferAppearance(input: {
  role?: string | null;
  birthYear?: number | null;
  deathYear?: number | null;
  currentYear?: number;
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
  if (ageGroup === "kid") return { ageGroup, gender: "unspecified" };
  if (femaleRoles.test(role)) return { ageGroup, gender: "female" };
  if (maleRoles.test(role)) return { ageGroup, gender: "male" };
  return null;
}