/**
 * Controlled resolver for the Niakofa Legacy RPG character asset library.
 *
 * Family facts stay in the vault. This module only resolves a visual runtime
 * representation from an appearance definition and never infers history.
 */

export type LegacyAgeGroup = "adult" | "kid";
export type LegacyGender = "male" | "female" | "unspecified";

export interface LegacyAppearanceInput {
  ageGroup: LegacyAgeGroup;
  gender: LegacyGender;
}

export interface LegacyWalkingAsset {
  assetId: string;
  file: string;
  width: 144;
  height: 192;
}

const WALKING_ASSETS: Partial<Record<LegacyAgeGroup, Partial<Record<LegacyGender, LegacyWalkingAsset>>>> = {
  adult: {
    male: {
      assetId: "tv_body_male_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-male.png",
      width: 144,
      height: 192,
    },
    female: {
      assetId: "tv_body_female_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-female.png",
      width: 144,
      height: 192,
    },
  },
  kid: {
    unspecified: {
      assetId: "tv_body_kid_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-kid.png",
      width: 144,
      height: 192,
    },
  },
};

export function resolveWalkingAsset(input: LegacyAppearanceInput): LegacyWalkingAsset | null {
  return WALKING_ASSETS[input.ageGroup]?.[input.gender] ?? null;
}

export function inferAppearance(input: {
  role?: string | null;
  birthYear?: number | null;
  currentYear?: number;
}): LegacyAppearanceInput | null {
  const role = input.role?.toLowerCase() ?? "";
  const femaleRoles = /\b(aunt|daughter|grandmother|mother|sister|wife|woman|female)\b/;
  const maleRoles = /\b(brother|father|grandfather|husband|man|male|son|uncle)\b/;
  const age = input.birthYear == null
    ? null
    : (input.currentYear ?? new Date().getFullYear()) - input.birthYear;

  const ageGroup: LegacyAgeGroup = age !== null && age >= 0 && age < 18 ? "kid" : "adult";
  if (ageGroup === "kid") return { ageGroup, gender: "unspecified" };
  if (femaleRoles.test(role)) return { ageGroup, gender: "female" };
  if (maleRoles.test(role)) return { ageGroup, gender: "male" };
  return null;
}