/**
 * Server-side contract for characters created by Legacy world regeneration.
 *
 * This module deliberately emits asset IDs, never raw archive paths. A person
 * only receives a render-ready map appearance when the extraction includes
 * explicit age and gender metadata. Missing metadata remains visible as
 * "pending" rather than being guessed from a name or relationship. Face assets
 * remain catalog-only until their licensing is approved for runtime use.
 */

export type GeneratedCharacterAgeGroup = "adult" | "kid";
export type GeneratedCharacterGender = "male" | "female";
export type GeneratedCharacterLifeStage = "youth" | "adult" | "mature" | "elder";

export interface GeneratedCharacterAppearance {
  schemaVersion: 1;
  characterId: string;
  age: number;
  ageGroup: GeneratedCharacterAgeGroup;
  gender: GeneratedCharacterGender;
  lifeStage: GeneratedCharacterLifeStage;
  era: string;
  eraProfile: string;
  appearanceSeed: string;
  representation: "TV";
  layers: {
    body: string;
    clothing: string;
    rearHair: string;
    frontHair: string;
  };
  runtime: "approved";
}

export interface GeneratedCharacterPortrait {
  schemaVersion: 1;
  representation: "Face";
  runtime: "catalog-only";
  status: "catalog-only";
  catalogCategory: "Face";
  selectionSeed: string;
  candidateIndex: number;
}

export interface GeneratedCharacter {
  characterId: string;
  name: string;
  relationship: string | null;
  evidence: "family-reported";
  renderStatus: "ready" | "pending_verified_appearance";
  appearance: GeneratedCharacterAppearance | null;
  portrait: GeneratedCharacterPortrait;
}

interface ExtractedPerson {
  name?: string;
  relationship?: string;
  context?: string;
  age?: number | null;
  gender?: string | null;
  era?: string | null;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "unnamed";
}

function normalizeGender(value: string | null | undefined): GeneratedCharacterGender | null {
  const gender = value?.trim().toLowerCase();
  return gender === "male" || gender === "female" ? gender : null;
}

function normalizeAge(value: number | null | undefined): number | null {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 120
    ? value as number
    : null;
}

function lifeStageForAge(age: number): GeneratedCharacterLifeStage {
  if (age < 18) return "youth";
  if (age < 35) return "adult";
  if (age < 55) return "mature";
  return "elder";
}

/**
 * Era profiles are visual wardrobe labels only. They never establish or infer
 * a historical fact; the era is accepted only when the Family Vault/AI
 * extraction explicitly supplies it.
 */
function eraProfileFor(era: string | null | undefined): string {
  const normalized = era?.trim().toLowerCase() ?? "";
  if (/\b189\d|\b190\d/.test(normalized)) return "cape-coast-early-century";
  if (/\b191\d|\b192\d/.test(normalized)) return "golden-years";
  if (/\b193\d|\b194\d|\b195\d/.test(normalized)) return "migration-era";
  if (/\b196\d|\b197\d|\b198\d/.test(normalized)) return "mid-century-diaspora";
  if (/\b199\d|\b20\d\d|present|modern/.test(normalized)) return "present-day";
  return "unspecified";
}

const FACE_CATALOG_ASSET_COUNT = 1138;

export function buildCatalogPortraitReference(
  characterId: string,
  appearanceSeed: string,
): GeneratedCharacterPortrait {
  const selectionSeed = `${characterId}|portrait|${appearanceSeed}`;
  return {
    schemaVersion: 1,
    representation: "Face",
    runtime: "catalog-only",
    status: "catalog-only",
    catalogCategory: "Face",
    selectionSeed,
    candidateIndex: stableHash(selectionSeed) % FACE_CATALOG_ASSET_COUNT,
  };
}

export function buildAppearance(
  person: ExtractedPerson,
  characterId: string,
  appearanceSeed: string,
): GeneratedCharacterAppearance | null {
  const age = normalizeAge(person.age);
  const gender = normalizeGender(person.gender);
  if (age === null || gender === null) return null;

  const ageGroup: GeneratedCharacterAgeGroup = age < 18 ? "kid" : "adult";
  const lifeStage = lifeStageForAge(age);
  const suffix = ageGroup === "kid" ? "kid" : gender;
  // The curated kid runtime sample intentionally uses the approved base
  // layers only. Adult profiles have the reviewed p02–p04 variants.
  const variant = ageGroup === "kid"
    ? 1
    : 2 + stableHash(`${characterId}|${lifeStage}|${person.era ?? "unspecified"}|${appearanceSeed}`) % 3;

  return {
    schemaVersion: 1,
    characterId,
    age,
    ageGroup,
    gender,
    lifeStage,
    era: person.era?.trim() || "unspecified",
    eraProfile: eraProfileFor(person.era),
    appearanceSeed,
    representation: "TV",
    layers: {
      body: `tv_body_${suffix}_base`,
      clothing: `tv_clothing_${suffix}_${variant === 1 ? "default" : `p0${variant}`}`,
      rearHair: `tv_rear_hair_${suffix}_${variant === 1 ? "default" : `p0${variant}`}`,
      frontHair: `tv_front_hair_${suffix}_${variant === 1 ? "default" : `p0${variant}`}`,
    },
    runtime: "approved",
  };
}

export function buildGeneratedCharacters(input: {
  familyId: number;
  interviewId: number;
  people: ExtractedPerson[];
}): GeneratedCharacter[] {
  return input.people
    .filter((person) => typeof person.name === "string" && person.name.trim().length > 0)
    .slice(0, 8)
    .map((person) => {
      const name = person.name!.trim().slice(0, 120);
      const relationship = person.relationship?.trim() || null;
      // Interview IDs are provenance, not identity. Keeping them out of this
      // key prevents a later interview from creating a second NPC for the same
      // family-reported relative.
      const identitySeed = `${name}|${relationship ?? "unspecified"}`;
      const characterId = `npc-${input.familyId}-${slug(name)}-${stableHash(identitySeed).toString(36)}`;
      const appearanceSeed = `family:${input.familyId}:${slug(name)}:${slug(relationship ?? "unspecified")}`;
      const appearance = buildAppearance(person, characterId, appearanceSeed);
      return {
        characterId,
        name,
        relationship,
        evidence: "family-reported" as const,
        renderStatus: appearance ? "ready" as const : "pending_verified_appearance" as const,
        appearance,
        portrait: buildCatalogPortraitReference(characterId, appearanceSeed),
      };
    });
}

/**
 * Resolves a walking-character appearance for a chapter's actual ancestor
 * (a real family_members row), reusing the exact same buildAppearance logic
 * used for AI-extracted interview NPCs above.
 *
 * This intentionally mirrors buildGeneratedCharacters's "no guessing" rule:
 * gender must be explicitly set on the member (migration 0106 — nullable,
 * opt-in, never inferred from a name), and age is only computed when both
 * birth_year is known AND the chapter's era string contains a parseable
 * year. Either gap and this returns null — the caller (GET
 * /legacy/chapters/:id/scenes) surfaces that as "pending" and the chapter
 * runtime renders a neutral placeholder sprite rather than a guess.
 */
export interface FamilyMemberForAppearance {
  id: number;
  display_name: string;
  gender: string | null;
  birth_year: number | null;
  death_year: number | null;
}

function yearFromEra(era: string | null | undefined): number | null {
  const match = era?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

export function resolveFamilyMemberAppearance(
  familyId: number,
  member: FamilyMemberForAppearance,
  chapterEra: string | null | undefined,
): GeneratedCharacterAppearance | null {
  const eraYear = yearFromEra(chapterEra);
  const age = eraYear !== null && member.birth_year !== null
    ? eraYear - member.birth_year
    : null;

  const characterId = `ancestor-${familyId}-${member.id}`;
  const appearanceSeed = `family:${familyId}:member:${member.id}`;

  return buildAppearance(
    { name: member.display_name, age, gender: member.gender, era: chapterEra ?? null },
    characterId,
    appearanceSeed,
  );
}