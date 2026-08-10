/**
 * Server-side contract for characters created by Legacy world regeneration.
 *
 * This module deliberately emits asset IDs, never raw archive paths. A person
 * only receives a render-ready appearance when the extraction includes explicit
 * age and gender metadata. Missing metadata remains visible as "pending" rather
 * than being guessed from a name or relationship.
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

export interface GeneratedCharacter {
  characterId: string;
  name: string;
  relationship: string | null;
  evidence: "family-reported";
  renderStatus: "ready" | "pending_verified_appearance";
  appearance: GeneratedCharacterAppearance | null;
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

function buildAppearance(
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
      const characterId = `npc-${input.familyId}-${slug(name)}-${stableHash(`${input.interviewId}|${name}|${person.context ?? ""}`).toString(36)}`;
      const appearanceSeed = `interview:${input.interviewId}:${slug(name)}`;
      const appearance = buildAppearance(person, characterId, appearanceSeed);
      return {
        characterId,
        name,
        relationship: person.relationship?.trim() || null,
        evidence: "family-reported" as const,
        renderStatus: appearance ? "ready" as const : "pending_verified_appearance" as const,
        appearance,
      };
    });
}