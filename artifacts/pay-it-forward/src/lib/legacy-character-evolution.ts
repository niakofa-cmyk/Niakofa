/**
 * Legacy Character Evolution System
 *
 * Based on the Niakofa Canonical Resolution document (Aug 2026):
 *   "That is the Character Evolution System Niakofa should actually build."
 *
 * Architecture:
 *   Family Member → Character Identity → Character DNA → Visual Profile →
 *   Age Profile → Era Profile → Regional Profile → Clothing Profile →
 *   Animation Profile → Runtime Character
 *
 * Kwame Mensah is the calibration character. Every world scale decision
 * (doorways, furniture, NPC sizes, buildings, camera) derives from his
 * canonical master character sheet.
 */

// ── Life stage types ──────────────────────────────────────────────────────────

export type CharacterBodyType = "youth" | "adult" | "mature" | "elder";

export type CharacterEra =
  | "precolonial"   // Pre-1850
  | "colonial-early"  // 1850–1900
  | "colonial-gold-coast"  // 1900–1940 (Kwame's era)
  | "independence"  // 1940–1960
  | "postcolonial"  // 1960–1990
  | "contemporary"; // 1990–present

export type CharacterRegion =
  | "cape-coast"
  | "accra"
  | "kumasi"
  | "volta-region"
  | "northern-territories"
  | "diaspora-uk"
  | "diaspora-us"
  | "diaspora-caribbean";

export type ClothingStyle =
  | "student-colonial"   // Mission school uniform
  | "trader-cloth"       // Kente/working cloth
  | "elder-formal"       // Elder ceremonial attire
  | "farmer-working"     // Field clothing
  | "chief-ceremonial"   // Chief regalia
  | "diaspora-1940s"     // Western wear, 1940s diaspora
  | "contemporary";      // Modern clothing

// ── Character life stage ──────────────────────────────────────────────────────

export interface CharacterLifeStage {
  /** Age in years */
  age: number;
  /** Historical year */
  year: number;
  /** Primary location during this stage */
  location: string;
  region: CharacterRegion;
  era: CharacterEra;
  bodyType: CharacterBodyType;
  clothingStyle: ClothingStyle;
  /** What this character is responsible for at this stage */
  responsibilities: string[];
  /** Skills / knowledge available at this stage */
  abilities: string[];
  /** Key relationships at this stage */
  relationships: Record<string, string>;
  /**
   * Which sprite variant to use.
   * Format: "<libraryId>/<characterId>/<lifeStage>" — matches LegacyCharacterSprite lookups.
   */
  spriteVariant: string;
  /** Story knowledge — what this character knows about family history at this stage */
  knowledgeLevel: "student" | "apprentice" | "informed" | "keeper" | "elder-keeper";
}

// ── Character DNA ─────────────────────────────────────────────────────────────

export interface CharacterDNA {
  id: string;
  familyId: string;
  /** Canonical full name */
  fullName: string;
  /** How they are referred to in dialogue */
  callName: string;
  /** Family tree position */
  familyRole: string;
  /** Unique appearance seed — deterministic from familyId + characterId */
  appearanceSeed: string;
  /** Skin tone reference (from LPC/canonical palette) */
  skinTone: "tone-1" | "tone-2" | "tone-3" | "tone-4" | "tone-5" | "tone-6";
  /** Eye color */
  eyeColor: string;
  /** Personality traits that persist across all life stages */
  corePersonality: string[];
  /** Life stages this character exists in */
  lifeStages: Record<string, CharacterLifeStage>;
  /** Which life stage is the "canonical" display default */
  canonicalLifeStage: string;
}

// ── Kwame Mensah — Calibration Character ─────────────────────────────────────
//
// Kwame Mensah is the calibration character for all world scale decisions.
// Every environment asset is validated against: "Can Kwame walk behind it?
// Walk in front of it? Be partially occluded? Enter it? Collide with it?
// Interact with it? Cast a shadow near it?"
//
// World scale hierarchy derived from Kwame's canonical master character sheet:
//   Character height → Doorway height → Furniture scale → NPC scale →
//   Building scale → Street width → Camera framing → Map composition

export const KWAME_DNA: CharacterDNA = {
  id: "kwame-mensah",
  familyId: "mensah",
  fullName: "Kwame Mensah",
  callName: "Kwame",
  familyRole: "First known ancestor / patriarch",
  appearanceSeed: "kwame-mensah-1896",
  skinTone: "tone-3",
  eyeColor: "dark-brown",
  corePersonality: [
    "determined",
    "community-minded",
    "proud",
    "strategic",
    "culturally-rooted",
  ],
  canonicalLifeStage: "youth",
  lifeStages: {
    youth: {
      age: 16,
      year: 1912,
      location: "Cape Coast, Gold Coast Colony",
      region: "cape-coast",
      era: "colonial-gold-coast",
      bodyType: "youth",
      clothingStyle: "student-colonial",
      responsibilities: [
        "Attending the Mission School",
        "Learning English alongside Akan",
        "Assisting family trading operations",
      ],
      abilities: [
        "Reading and writing (English + Akan)",
        "Basic trade arithmetic",
        "Oral history from grandmother",
        "Cocoa grading basics",
      ],
      relationships: {
        "grandma-ama": "Grandmother — primary story keeper",
        "elder-nana": "Village elder — wisdom source",
        "kofi-trader": "Mentor in trading",
      },
      spriteVariant: "mensah/kwame/youth",
      knowledgeLevel: "student",
    },
    young_adult: {
      age: 25,
      year: 1921,
      location: "Cape Coast, Gold Coast Colony",
      region: "cape-coast",
      era: "colonial-gold-coast",
      bodyType: "adult",
      clothingStyle: "trader-cloth",
      responsibilities: [
        "Running the Mensah trading house",
        "Protecting family land from colonial encroachment",
        "Teaching younger family members",
      ],
      abilities: [
        "Full trading operations management",
        "Negotiation with colonial agents",
        "Cocoa grading — expert level",
        "Reading colonial contracts",
        "Community leadership",
      ],
      relationships: {
        "grandma-ama": "Grandmother — elder care",
        "elder-nana": "Village elder — counsel",
        "kofi-trader": "Business partner",
        "abena-mensah": "Wife",
      },
      spriteVariant: "mensah/kwame/young-adult",
      knowledgeLevel: "apprentice",
    },
    mature: {
      age: 50,
      year: 1946,
      location: "Cape Coast / Accra, Gold Coast Colony",
      region: "cape-coast",
      era: "colonial-gold-coast",
      bodyType: "mature",
      clothingStyle: "elder-formal",
      responsibilities: [
        "Head of the extended Mensah family",
        "Preserving family history",
        "Advocating for independence movement",
        "Training next generation of traders",
      ],
      abilities: [
        "Elder wisdom — full family knowledge",
        "Political connections",
        "Leadership of community council",
        "Deep cocoa farming knowledge",
        "Oral history of three generations",
      ],
      relationships: {
        "abena-mensah": "Wife of 25 years",
        "elder-nana": "Peer elder",
        "children": "Multiple children",
        "grandchildren": "First grandchildren",
      },
      spriteVariant: "mensah/kwame/mature",
      knowledgeLevel: "keeper",
    },
  },
};

// ── Character DNA registry ────────────────────────────────────────────────────

export const CHARACTER_DNA_REGISTRY: Record<string, CharacterDNA> = {
  "kwame-mensah": KWAME_DNA,
};

// ── Helper functions ──────────────────────────────────────────────────────────

/**
 * Get a character's life stage for a given demo phase.
 * Maps the narrative phase to the appropriate historical life stage.
 */
export function getLifeStageForPhase(
  dna: CharacterDNA,
  phase: string,
): CharacterLifeStage | null {
  const phaseToStage: Record<string, string> = {
    prologue:    "youth",
    chapter1:   "youth",
    chapter2:   "youth",
    chapter3:   "young_adult",
    chapter4:   "young_adult",
    chapter5:   "mature",
    chapter6:   "mature",
    mystery:    "youth",       // Flashback
    "world-regen": "mature",
    reunion:    "mature",
    finale:     "mature",
  };
  const stageKey = phaseToStage[phase] ?? dna.canonicalLifeStage;
  return dna.lifeStages[stageKey] ?? dna.lifeStages[dna.canonicalLifeStage] ?? null;
}

/**
 * Derive the sprite config for LegacyCharacterSprite from a life stage.
 * Ensures all character renders are deterministic from familyId + lifeStage.
 */
export function getSpriteConfigForLifeStage(
  dna: CharacterDNA,
  lifeStage: CharacterLifeStage,
): {
  ageGroup: "kid" | "teen" | "adult" | "elder";
  gender: "male" | "female" | "unspecified";
  characterId: string;
  lifeStage: string;
  era: string;
  appearanceSeed: string;
  libraryId: string;
} {
  const ageGroupMap: Record<CharacterBodyType, "kid" | "teen" | "adult" | "elder"> = {
    youth:  "teen",
    adult:  "adult",
    mature: "adult",
    elder:  "elder",
  };
  return {
    ageGroup:      ageGroupMap[lifeStage.bodyType],
    gender:        "male",
    characterId:   dna.id,
    lifeStage:     lifeStage.spriteVariant,
    era:           lifeStage.era,
    appearanceSeed: dna.appearanceSeed,
    libraryId:     `niakofa-${dna.familyId}`,
  };
}

// ── LPC Spritesheet reference ─────────────────────────────────────────────────
//
// The combined LPC spritesheets (male/female) are stored in:
//   public/legacy-character-assets/lpc-reference/lpc-male-combined-sheet.png
//   public/legacy-character-assets/lpc-reference/lpc-female-combined-sheet.png
//
// Dimensions: Male = 1280×33152, Female = 1280×34944
// Frame size: 64×64 pixels (standard LPC format)
// Frames per row: 1280 / 64 = 20 frames
// Animation rows: down(1), left(2), right(3), up(4) × N animation types
//
// Standard LPC row order:
//   Row 0-3:   Walk (9 frames each direction, then idle)
//   Row 4-7:   Run (8 frames each direction)
//   Row 8-11:  Thrust (8 frames each direction)  [skip — no combat]
//   Row 12-15: Slash (6 frames each direction)   [skip — no combat]
//   Row 16-19: Shoot bow (13 frames each direction) [skip]
//   Row 20-23: Hurt (6 frames each direction)
//   Row 24-27: Idle variants
//
// For Niakofa, extract only: Walk (rows 0-3) + Idle + Hurt rows
// License: CC-BY-SA (attribution required before production use)
//   See: https://lpc.opengameart.org/
//
// Niakofa adaptation: recolor skin tones to match West African palette
//   from the canonical character DNA skinTone field (tone-1 through tone-6).

export const LPC_SPRITESHEET_SPEC = {
  frameWidth: 64,
  frameHeight: 64,
  framesPerRow: 20,
  male: {
    path: "/legacy-character-assets/lpc-reference/lpc-male-combined-sheet.png",
    totalRows: Math.ceil(33152 / 64), // 518 rows
    license: "CC-BY-SA",
    attribution: "LPC Universal Spritesheet — https://lpc.opengameart.org/",
  },
  female: {
    path: "/legacy-character-assets/lpc-reference/lpc-female-combined-sheet.png",
    totalRows: Math.ceil(34944 / 64), // 546 rows
    license: "CC-BY-SA",
    attribution: "LPC Universal Spritesheet — https://lpc.opengameart.org/",
  },
  /** Rows to use for Niakofa (0-indexed) — non-combat animations only */
  niakofaRows: {
    walk_down:  0,
    walk_left:  1,
    walk_right: 2,
    walk_up:    3,
    idle_down:  0,  // Frame 0 of walk row = idle
    hurt_down:  20,
    hurt_left:  21,
    hurt_right: 22,
    hurt_up:    23,
  },
} as const;
