/**
 * legacy-attributes.ts — Kwame's attribute and progression system.
 *
 * Architecture drawn from MMOCore's design (NOT its licensed code):
 *   • PlayerAttributes — multiple independent attribute tracks
 *   • PlayerExperienceGainEvent — typed XP events from world actions
 *   • PlayerLevelUpEvent — level-up triggers with consequences
 *   • Skill tree / professions concept → adapted as Life Skills
 *
 * Niakofa-native implementation: every meaningful in-world action produces
 * an AttributeEvent that this system processes into XP → levels → unlocks.
 *
 * Six core attributes (each is its own XP track, inspired by Ultima's
 * separated skill growth rather than MMOCore's flat class system):
 *
 *  STRENGTH     — combat damage, carry weight, fishing rod power
 *  ENDURANCE    — health pool, combat stamina, fishing duration
 *  WISDOM       — dialogue depth unlock, memory-echo clarity, quest insight
 *  LEGACY       — Family Vault contribution rate, knowledge graph richness
 *  KINSHIP      — relationship growth speed, NPC trust, community standing
 *  RIVER_LORE   — fishing XP rate, fish species unlocked, River Memory chance
 *
 * Levels run 1–10 per attribute. XP thresholds grow linearly (50 XP per level).
 * Gaining a level fires a callback so the game can unlock dialogue, animations,
 * or story events.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type AttributeId =
  | "strength"
  | "endurance"
  | "wisdom"
  | "legacy"
  | "kinship"
  | "river_lore";

export interface AttributeLevel {
  id: AttributeId;
  level: number;        // 1–10
  xp: number;          // Current XP within this level
  xpToNext: number;    // XP needed to reach next level (0 if maxed)
}

/** All typed events that generate attribute XP. Inspired by MMOCore's event types. */
export type AttributeEvent =
  | { type: "combat_hit";        damage: number }             // Strength + Endurance
  | { type: "combat_kill";       enemyLevel: number }         // Strength + Legacy
  | { type: "fish_caught";       fishRarity: number }         // River_lore + Endurance
  | { type: "river_memory";      depth: number }              // River_lore + Wisdom
  | { type: "quest_completed";   questLevel: number }         // Legacy + Wisdom
  | { type: "quest_objective";   objectiveType: string }      // Legacy
  | { type: "npc_talked";        npcId: string }              // Kinship
  | { type: "npc_helped";        npcId: string }              // Kinship + Legacy
  | { type: "memory_echo";       ancestorId: string }         // Wisdom + Legacy
  | { type: "vault_contribution"; importance: number }        // Legacy
  | { type: "journal_entry";     wordCount: number }          // Wisdom

export interface KwameAttributes {
  strength:   AttributeLevel;
  endurance:  AttributeLevel;
  wisdom:     AttributeLevel;
  legacy:     AttributeLevel;
  kinship:    AttributeLevel;
  river_lore: AttributeLevel;
}

/** Called when any attribute levels up. */
export type LevelUpCallback = (attr: AttributeId, newLevel: number) => void;

// ─── Constants ─────────────────────────────────────────────────────────────

const XP_PER_LEVEL = 50;     // Linear for now — can curve later
const MAX_LEVEL = 10;

const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  strength:   "Strength",
  endurance:  "Endurance",
  wisdom:     "Wisdom",
  legacy:     "Legacy",
  kinship:    "Kinship",
  river_lore: "River Lore",
};

const ATTRIBUTE_DESCRIPTIONS: Record<AttributeId, string> = {
  strength:   "Physical power — combat damage, carry weight, cast distance",
  endurance:  "Resilience — health pool, stamina, sustained activity",
  wisdom:     "Knowledge — dialogue depth, memory clarity, quest insight",
  legacy:     "Family connection — Vault contribution, knowledge graph richness",
  kinship:    "Community bonds — relationship growth, NPC trust, standing",
  river_lore: "River wisdom — fishing mastery, fish species, memory chance",
};

// ─── Factory ───────────────────────────────────────────────────────────────

function makeAttr(id: AttributeId): AttributeLevel {
  return { id, level: 1, xp: 0, xpToNext: XP_PER_LEVEL };
}

export function createKwameAttributes(): KwameAttributes {
  return {
    strength:   makeAttr("strength"),
    endurance:  makeAttr("endurance"),
    wisdom:     makeAttr("wisdom"),
    legacy:     makeAttr("legacy"),
    kinship:    makeAttr("kinship"),
    river_lore: makeAttr("river_lore"),
  };
}

// ─── Core system ──────────────────────────────────────────────────────────

export class KwameAttributeSystem {
  private attrs: KwameAttributes;
  private onLevelUp: LevelUpCallback;
  private totalXpEarned = 0;

  constructor(initial?: KwameAttributes, onLevelUp: LevelUpCallback = () => {}) {
    this.attrs = initial ?? createKwameAttributes();
    this.onLevelUp = onLevelUp;
  }

  get attributes(): Readonly<KwameAttributes> { return this.attrs; }
  get totalXp(): number { return this.totalXpEarned; }

  /** Returns a label and description for display. */
  static label(id: AttributeId): string { return ATTRIBUTE_LABELS[id]; }
  static description(id: AttributeId): string { return ATTRIBUTE_DESCRIPTIONS[id]; }

  /**
   * Process a world event into XP gains. Each event type maps to 1–2
   * attributes, mirroring MMOCore's event-driven XP model but adapted to
   * Niakofa's specific context.
   */
  processEvent(event: AttributeEvent) {
    switch (event.type) {
      case "combat_hit":
        this.addXp("strength",  Math.min(8, Math.ceil(event.damage * 0.4)));
        this.addXp("endurance", Math.min(5, Math.ceil(event.damage * 0.2)));
        break;
      case "combat_kill":
        this.addXp("strength", 10 + event.enemyLevel * 2);
        this.addXp("legacy",   5  + event.enemyLevel);
        break;
      case "fish_caught":
        this.addXp("river_lore", 8  + event.fishRarity * 4);
        this.addXp("endurance",  3  + event.fishRarity);
        break;
      case "river_memory":
        this.addXp("river_lore", 15 + event.depth * 5);
        this.addXp("wisdom",     10 + event.depth * 3);
        break;
      case "quest_completed":
        this.addXp("legacy", 20 + event.questLevel * 5);
        this.addXp("wisdom", 15 + event.questLevel * 3);
        break;
      case "quest_objective":
        this.addXp("legacy", 8);
        break;
      case "npc_talked":
        this.addXp("kinship", 5);
        break;
      case "npc_helped":
        this.addXp("kinship", 15);
        this.addXp("legacy",  8);
        break;
      case "memory_echo":
        this.addXp("wisdom", 12);
        this.addXp("legacy", 10);
        break;
      case "vault_contribution":
        this.addXp("legacy", 5 + event.importance * 3);
        break;
      case "journal_entry":
        this.addXp("wisdom", Math.min(10, Math.ceil(event.wordCount / 20)));
        break;
    }
  }

  /** Combat modifiers derived from current attribute levels. */
  getCombatModifiers() {
    const str = this.attrs.strength.level;
    const end = this.attrs.endurance.level;
    return {
      damageMultiplier: 1 + (str - 1) * 0.08,         // +8% per str level
      healthBonus:      (end - 1) * 10,                 // +10 HP per end level
      staminaBonus:     (end - 1) * 5,                  // +5 stamina per end level
      legacyBurstRate:  1 + (this.attrs.legacy.level - 1) * 0.05, // +5% burst charge
    };
  }

  /** Fishing modifiers derived from current attribute levels. */
  getFishingModifiers() {
    const rl  = this.attrs.river_lore.level;
    const end = this.attrs.endurance.level;
    const wis = this.attrs.wisdom.level;
    return {
      castDistance:       1 + (rl  - 1) * 0.12,   // +12% per river_lore
      rareChanceBonus:    (rl  - 1) * 0.03,         // +3% per level
      memoryChanceBonus:  (wis - 1) * 0.05,         // +5% per wisdom
      duration:           30000 + (end - 1) * 5000, // 30s base + 5s per endurance
      fishSpeciesUnlocked: Math.min(rl, 6),          // Unlocks more species with level
    };
  }

  /** Dialogue depth score — determines which NPC lines are accessible. */
  getDialogueDepth(): number {
    return Math.floor((this.attrs.wisdom.level + this.attrs.kinship.level) / 2);
  }

  private addXp(id: AttributeId, amount: number) {
    if (amount <= 0) return;
    const attr = this.attrs[id];
    if (attr.level >= MAX_LEVEL) return;
    this.totalXpEarned += amount;
    attr.xp += amount;
    while (attr.xp >= attr.xpToNext && attr.level < MAX_LEVEL) {
      attr.xp -= attr.xpToNext;
      attr.level++;
      attr.xpToNext = attr.level >= MAX_LEVEL ? 0 : XP_PER_LEVEL;
      this.onLevelUp(id, attr.level);
    }
  }

  /** Serialize for Family Vault / persistence. */
  serialize(): Record<string, { level: number; xp: number }> {
    const out: Record<string, { level: number; xp: number }> = {};
    for (const [k, v] of Object.entries(this.attrs)) {
      out[k] = { level: v.level, xp: v.xp };
    }
    return out;
  }

  /** Rehydrate from serialized data. */
  static deserialize(
    data: Record<string, { level: number; xp: number }>,
    onLevelUp?: LevelUpCallback
  ): KwameAttributeSystem {
    const attrs = createKwameAttributes();
    for (const [k, v] of Object.entries(data)) {
      if (k in attrs) {
        const a = attrs[k as AttributeId];
        a.level = Math.min(Math.max(v.level, 1), MAX_LEVEL);
        a.xp    = Math.max(v.xp, 0);
        a.xpToNext = a.level >= MAX_LEVEL ? 0 : XP_PER_LEVEL;
      }
    }
    return new KwameAttributeSystem(attrs, onLevelUp);
  }
}
