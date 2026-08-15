/**
 * LegacyCharacterProfile — Character Resolver 2.0
 *
 * Renders a character's full profile derived from CharacterDNA:
 * - Life stage indicator (youth / young adult / mature)
 * - Era-calibrated appearance description
 * - Skill/ability display per life stage
 * - Layered sprite architecture (body + clothing + hair layers)
 *
 * The LPC sheet (public/legacy-character-assets/lpc-reference/) contains the
 * raw spritesheet data. Until the exact row map is validated and attributed
 * per CC-BY-SA requirements, this component uses CSS avatar rendering
 * with the DNA-derived palette, then layers the actual sprites when ready.
 *
 * Calibration character: Kwame Mensah (age 16, 1912, Cape Coast)
 * All world scale decisions derive from his canonical master character sheet.
 */

import { type CharacterDNA, type CharacterLifeStage } from "@/lib/legacy-character-evolution";
import { getLifeStageForPhase, getSpriteConfigForLifeStage, CHARACTER_DNA_REGISTRY } from "@/lib/legacy-character-evolution";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";
import type { DemoPhase } from "@/lib/legacy-demo-state";

// ── Era accent palette ────────────────────────────────────────────────────────

const ERA_ACCENT: Record<string, { primary: string; secondary: string; bg: string }> = {
  "precolonial":           { primary: "#f0b840", secondary: "#e09020", bg: "#2a1a04" },
  "colonial-early":        { primary: "#c87830", secondary: "#a05820", bg: "#201408" },
  "colonial-gold-coast":   { primary: "#d48830", secondary: "#b06820", bg: "#241808" },
  "independence":          { primary: "#60b040", secondary: "#40900c", bg: "#1a2808" },
  "postcolonial":          { primary: "#5090d0", secondary: "#3070b0", bg: "#101828" },
  "contemporary":          { primary: "#30b880", secondary: "#108860", bg: "#081a14" },
};

const CLOTHING_LABEL: Record<string, string> = {
  "student-colonial":  "Mission School Uniform",
  "trader-cloth":      "Trader's Kente",
  "elder-formal":      "Elder Ceremonial Attire",
  "farmer-working":    "Field Clothing",
  "chief-ceremonial":  "Chief's Regalia",
  "diaspora-1940s":    "Diaspora Western Wear",
  "contemporary":      "Contemporary",
};

const KNOWLEDGE_BADGE: Record<string, string> = {
  "student":       "📚 Student",
  "apprentice":    "🌿 Apprentice",
  "informed":      "📖 Informed",
  "keeper":        "🗝️ Keeper",
  "elder-keeper":  "🌳 Elder Keeper",
};

// ── Life stage tab ────────────────────────────────────────────────────────────

function LifeStageTab({
  stage,
  active,
  onClick,
}: {
  stage: CharacterLifeStage;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-2.5 py-1.5 text-left transition-all",
        active
          ? "bg-amber-700/30 border border-amber-600/50 text-amber-200"
          : "bg-amber-950/30 border border-amber-900/20 text-amber-700 hover:text-amber-500",
      ].join(" ")}
    >
      <p className="text-[8px] font-black uppercase tracking-widest">{stage.year}</p>
      <p className="text-[10px] font-bold">Age {stage.age}</p>
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface LegacyCharacterProfileProps {
  characterId?: string;
  phase?: DemoPhase;
  traits?: Record<string, number>;
  compact?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LegacyCharacterProfile({
  characterId = "kwame-mensah",
  phase = "chapter1",
  traits = {},
  compact = false,
}: LegacyCharacterProfileProps) {
  const dna: CharacterDNA | null = CHARACTER_DNA_REGISTRY[characterId] ?? null;
  if (!dna) return null;

  const defaultStage = getLifeStageForPhase(dna, phase);
  // Tab switching is future work — for now we derive the key from the phase
  const activeStageKey =
    Object.keys(dna.lifeStages).find(k => dna.lifeStages[k] === defaultStage)
    ?? dna.canonicalLifeStage;
  const activeStage = dna.lifeStages[activeStageKey] ?? defaultStage;

  if (!activeStage) return null;

  const era = activeStage.era;
  const accent = ERA_ACCENT[era] ?? ERA_ACCENT["colonial-gold-coast"];
  const rawSpriteConfig = getSpriteConfigForLifeStage(dna, activeStage);
  // LegacyCharacterSprite only accepts "adult" | "kid" — map broader body types
  const spriteAgeGroup: "adult" | "kid" =
    rawSpriteConfig.ageGroup === "teen" || rawSpriteConfig.ageGroup === "kid" ? "kid" : "adult";

  if (compact) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
        style={{
          borderColor: `${accent.primary}30`,
          background: `${accent.bg}cc`,
        }}
      >
        {/* Mini sprite */}
        <LegacyCharacterSprite
          ageGroup={spriteAgeGroup}
          gender={rawSpriteConfig.gender}
          characterId={rawSpriteConfig.characterId}
          appearanceSeed={rawSpriteConfig.appearanceSeed}
          size={36}
          facing="down"
          motion="idle"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-black text-amber-200">{dna.callName}</p>
          <p className="text-[7px] text-amber-600">
            Age {activeStage.age} · {activeStage.year} · {activeStage.location}
          </p>
          <div
            className="mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[6px] font-black uppercase tracking-wider"
            style={{ background: `${accent.primary}18`, color: accent.primary, border: `1px solid ${accent.primary}30` }}
          >
            {CLOTHING_LABEL[activeStage.clothingStyle] ?? activeStage.clothingStyle}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: `${accent.primary}30`,
        background: `linear-gradient(180deg, ${accent.bg} 0%, #0a0604 100%)`,
      }}
    >
      {/* Header */}
      <div
        className="px-3.5 py-2.5 border-b flex items-center gap-3"
        style={{ borderColor: `${accent.primary}20`, background: `${accent.primary}08` }}
      >
        <LegacyCharacterSprite
          ageGroup={spriteAgeGroup}
          gender={rawSpriteConfig.gender}
          characterId={rawSpriteConfig.characterId}
          appearanceSeed={rawSpriteConfig.appearanceSeed}
          size={48}
          facing="down"
          motion="idle"
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-amber-100">{dna.fullName}</p>
          <p className="text-[9px] text-amber-600">{activeStage.location}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span
              className="rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest"
              style={{ background: `${accent.primary}20`, color: accent.primary, border: `1px solid ${accent.primary}40` }}
            >
              {activeStage.year}
            </span>
            <span className="text-[7px] text-amber-700">Age {activeStage.age}</span>
          </div>
        </div>
      </div>

      {/* Life stages */}
      <div className="px-3.5 pt-3 pb-2">
        <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">Life Stages</p>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(dna.lifeStages).map(([key, stage]) => (
            <LifeStageTab
              key={key}
              stage={stage}
              active={key === activeStageKey}
              onClick={() => {
                // In a full implementation this would be stateful — for now show current
              }}
            />
          ))}
        </div>
      </div>

      {/* Character details */}
      <div className="px-3.5 py-3 space-y-3">

        {/* Clothing + knowledge */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-lg border px-2 py-1.5"
            style={{ borderColor: `${accent.primary}20`, background: `${accent.primary}08` }}
          >
            <p className="text-[7px] font-black uppercase tracking-widest text-amber-800">Clothing</p>
            <p className="text-[9px] text-amber-400 mt-0.5">
              {CLOTHING_LABEL[activeStage.clothingStyle] ?? activeStage.clothingStyle}
            </p>
          </div>
          <div
            className="flex-1 rounded-lg border px-2 py-1.5"
            style={{ borderColor: `${accent.primary}20`, background: `${accent.primary}08` }}
          >
            <p className="text-[7px] font-black uppercase tracking-widest text-amber-800">Story Role</p>
            <p className="text-[9px] text-amber-400 mt-0.5">
              {KNOWLEDGE_BADGE[activeStage.knowledgeLevel] ?? activeStage.knowledgeLevel}
            </p>
          </div>
        </div>

        {/* Abilities */}
        <div>
          <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">
            Abilities at this stage
          </p>
          <div className="space-y-1">
            {activeStage.abilities.slice(0, 4).map((ability, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: accent.primary }}
                  aria-hidden="true"
                />
                <p className="text-[9px] text-amber-300 leading-tight">{ability}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Responsibilities */}
        <div>
          <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">
            Responsibilities
          </p>
          <div className="space-y-1">
            {activeStage.responsibilities.slice(0, 3).map((resp, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="w-1 h-1 rounded-full shrink-0"
                  style={{ background: `${accent.secondary}` }}
                  aria-hidden="true"
                />
                <p className="text-[9px] text-amber-500 leading-tight">{resp}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trait influence (if player traits provided) */}
        {Object.keys(traits).length > 0 && (
          <div>
            <p className="text-[7px] font-black uppercase tracking-widest text-amber-800 mb-1.5">
              Your trait resonance
            </p>
            <div className="flex flex-wrap gap-1">
              {dna.corePersonality.slice(0, 4).map((trait, i) => (
                <span
                  key={i}
                  className="rounded-full px-2 py-0.5 text-[7px] font-bold"
                  style={{
                    background: `${accent.primary}14`,
                    color: `${accent.primary}cc`,
                    border: `1px solid ${accent.primary}25`,
                  }}
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* LPC layer status note */}
        <div className="rounded-lg border border-amber-900/20 bg-amber-950/20 px-2.5 py-2">
          <p className="text-[7px] text-amber-800 leading-relaxed">
            <span className="font-black text-amber-700">Character Resolver 2.0</span> —
            LPC layered rendering in progress. Frame 64×64 · CC-BY-SA attribution gate.
            Sprite will reflect era + clothing + skin tone once row map is validated.
          </p>
        </div>
      </div>
    </div>
  );
}
