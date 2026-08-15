/**
 * Legacy Quest System — Phase 1 vertical slice quests for House of Mensah.
 *
 * Design brief principles:
 * - Quests are driven by family discovery, not combat
 * - Each quest has objectives, rewards (traits/artifacts/knowledge), and NPC triggers
 * - Quests integrate with the World Regeneration loop
 * - "The primary enemy is forgetting"
 */

// ── Types ───────────────────────────────────────────────────────────────────────

export type QuestStatus = "locked" | "available" | "active" | "completed" | "failed";

export type QuestRewardType = "trait" | "artifact" | "knowledge" | "character" | "location" | "skill";

export interface QuestReward {
  type: QuestRewardType;
  id: string;
  label: string;
  value?: number;
}

export interface QuestObjective {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  /** Phase that must be active */
  requiresPhase?: string;
  /** NPC that must be talked to */
  requiresNpcInteraction?: string;
  /** Artifact that must be placed/found */
  requiresArtifact?: string;
  /** Trait minimum required */
  requiresTrait?: { name: string; min: number };
}

export interface QuestDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  era: string;
  /** Icon emoji */
  icon: string;
  /** Who gives this quest */
  giverNpcId?: string;
  /** Phases in which this quest is available */
  availablePhases: string[];
  /** Quests that must be complete before this unlocks */
  prerequisiteIds: string[];
  objectives: QuestObjective[];
  rewards: QuestReward[];
  /** Narrative outcome text shown on completion */
  completionNarrative: string;
  /** World change triggered on completion */
  worldChange?: string;
}

// ── Quest Definitions ────────────────────────────────────────────────────────────

const questFindJournal: QuestDefinition = {
  id: "find-kwame-journal",
  title: "The Ledger of Kwame Mensah",
  subtitle: "Recover the lost trading records",
  description:
    "Grandma Ama spoke of a journal hidden in the Family Vault — Kwame's own records from the trading house years. The journal reportedly contains a circled name: the person who brought down the Mensah business. Find it and the truth of 1912 will be revealed.",
  era: "1890–1912",
  icon: "📖",
  giverNpcId: "grandma-ama",
  availablePhases: ["chapter2", "chapter3", "mystery"],
  prerequisiteIds: [],
  objectives: [
    {
      id: "talk-grandma",
      label: "Hear Grandma Ama's story",
      description: "Speak with Grandma Ama and learn about the trading house betrayal.",
      completed: false,
      requiresNpcInteraction: "grandma-ama",
    },
    {
      id: "search-vault",
      label: "Search the Family Vault",
      description: "Look through the vault for the trading ledger.",
      completed: false,
      requiresPhase: "mystery",
    },
    {
      id: "identify-name",
      label: "Identify the circled name",
      description: "Find and read the name Grandma Ama mentioned.",
      completed: false,
      requiresTrait: { name: "Wisdom", min: 15 },
    },
    {
      id: "return-to-ama",
      label: "Return to Grandma Ama",
      description: "Share what you found with Grandma Ama.",
      completed: false,
      requiresNpcInteraction: "grandma-ama",
    },
  ],
  rewards: [
    { type: "artifact", id: "kwame-trading-ledger", label: "Kwame's Trading Ledger" },
    { type: "knowledge", id: "betrayal-1912", label: "Truth of the 1912 Betrayal" },
    { type: "trait", id: "Wisdom", label: "+8 Wisdom", value: 8 },
    { type: "character", id: "kwame-elder", label: "Kwame (elder) discovered" },
  ],
  completionNarrative:
    "The ledger tells the full story. The circled name is someone Kwame trusted completely — a man who used the family's financial records against them. But the ledger also reveals something else: Kwame knew. He had written a warning years before the betrayal came. He had seen it coming. He chose family trust over caution. That choice defined everything that followed.",
  worldChange: "betrayal-mystery-revealed",
};

const questMarketRoad: QuestDefinition = {
  id: "walk-market-road",
  title: "The Market Road",
  subtitle: "Walk the route Kwame walked every week",
  description:
    "For twenty years, Kwame Mensah walked from the family compound to the Cape Coast market every market day. The walk itself was part of his identity — the time he used to think, negotiate, remember. Walk the road and discover what he discovered.",
  era: "1890–1910",
  icon: "🛤️",
  giverNpcId: "kofi-trader",
  availablePhases: ["chapter1", "chapter2"],
  prerequisiteIds: [],
  objectives: [
    {
      id: "speak-kofi",
      label: "Speak with Kofi at the warehouse",
      description: "Find Kofi Asante at the trading warehouse and learn about the market.",
      completed: false,
      requiresNpcInteraction: "kofi-trader",
    },
    {
      id: "walk-to-market",
      label: "Walk to the market stalls",
      description: "Navigate from the compound to the market area.",
      completed: false,
    },
    {
      id: "inspect-trading-post",
      label: "Inspect the Mensah Trading Post",
      description: "Examine the family's main trading location.",
      completed: false,
      requiresArtifact: "landmark-trading-post",
    },
    {
      id: "talk-yaw",
      label: "Talk to Yaw about the farms",
      description: "Speak with Yaw Boateng about the cocoa harvest.",
      completed: false,
      requiresNpcInteraction: "yaw-farmer",
    },
  ],
  rewards: [
    { type: "knowledge", id: "market-road-1890", label: "The Market Road (1890)" },
    { type: "skill", id: "negotiation", label: "Negotiation skill unlocked" },
    { type: "trait", id: "Leadership", label: "+5 Leadership", value: 5 },
    { type: "location", id: "market-road-location", label: "Market Road added to map" },
  ],
  completionNarrative:
    "You've walked the road Kwame walked hundreds of times. The market smells the same — cocoa, dried fish, woodsmoke. The voices bargain in the same rhythm. But now you understand it differently: this road wasn't just commerce. It was the daily practice of building something. One transaction at a time. One relationship at a time.",
  worldChange: "market-road-discovered",
};

const questFirstHarvest: QuestDefinition = {
  id: "first-harvest",
  title: "The First Harvest",
  subtitle: "Help Yaw bring in the cocoa before sundown",
  description:
    "Yaw needs help with the cocoa harvest in the east grove before rain arrives. This is the same work Kwame's family did for generations — before the trading house, before the business, there was the farm. Understanding the farm means understanding where the Mensah wealth came from.",
  era: "1890",
  icon: "🌿",
  giverNpcId: "yaw-farmer",
  availablePhases: ["chapter1", "chapter2"],
  prerequisiteIds: ["walk-market-road"],
  objectives: [
    {
      id: "find-yaw",
      label: "Find Yaw in the east grove",
      description: "Locate Yaw working in the cocoa fields.",
      completed: false,
      requiresNpcInteraction: "yaw-farmer",
    },
    {
      id: "help-harvest",
      label: "Help with the harvest",
      description: "Assist with collecting cocoa pods from the grove.",
      completed: false,
    },
    {
      id: "learn-grading",
      label: "Learn to grade cocoa",
      description: "Let Yaw teach you the difference between good and bad beans.",
      completed: false,
      requiresNpcInteraction: "kofi-trader",
    },
    {
      id: "deliver-harvest",
      label: "Deliver the harvest to the warehouse",
      description: "Bring the harvest to the Mensah trading warehouse.",
      completed: false,
      requiresArtifact: "landmark-mensah-warehouse",
    },
  ],
  rewards: [
    { type: "skill", id: "farming", label: "Farming skill unlocked" },
    { type: "knowledge", id: "cocoa-grading", label: "Cocoa grading knowledge" },
    { type: "trait", id: "Compassion", label: "+6 Compassion", value: 6 },
    { type: "artifact", id: "harvest-ledger-1892", label: "1892 Harvest Ledger" },
  ],
  completionNarrative:
    "The harvest is in. Yaw thanks you and the warehouse fills with the smell of good cocoa. This work that feels small — grading beans, loading baskets, walking in the heat — this was the foundation of everything the Mensah family built. The trading house. The reputation. The wealth that educated the next generation. It started here. In the soil. In the hands.",
  worldChange: "first-harvest-complete",
};

const questRecoverDeed: QuestDefinition = {
  id: "recover-property-deed",
  title: "The Property Deed",
  subtitle: "Find the original title to the Mensah compound",
  description:
    "Grandma Ama believes there is an original property deed in the Family Vault — one that proves the Mensah family owns the land their compound stands on. If the deed is real and valid, the restoration of the family compound becomes legally possible. But the deed hasn't been seen in forty years.",
  era: "1892 · Present Day",
  icon: "📜",
  giverNpcId: "grandma-ama",
  availablePhases: ["chapter3", "chapter6", "mystery", "world-regen"],
  prerequisiteIds: ["find-kwame-journal"],
  objectives: [
    {
      id: "search-vault-deed",
      label: "Search the Family Vault for the deed",
      description: "Examine the Family Vault carefully for the original property deed.",
      completed: false,
      requiresPhase: "mystery",
    },
    {
      id: "verify-deed",
      label: "Verify the deed with Elder Nana",
      description: "Show the deed to Elder Nana to confirm its authenticity.",
      completed: false,
      requiresNpcInteraction: "elder-nana",
      requiresTrait: { name: "Wisdom", min: 20 },
    },
    {
      id: "restoration-plan",
      label: "Create a restoration plan",
      description: "Work with the family to plan the compound restoration.",
      completed: false,
      requiresTrait: { name: "Leadership", min: 15 },
    },
  ],
  rewards: [
    { type: "artifact", id: "mensah-property-deed", label: "Original Mensah Property Deed (1892)" },
    { type: "knowledge", id: "land-rights-mensah", label: "Mensah land rights confirmed" },
    { type: "trait", id: "Leadership", label: "+10 Leadership", value: 10 },
    { type: "location", id: "compound-restoration", label: "Compound restoration unlocked" },
  ],
  completionNarrative:
    "The deed is real. Signed by Kwame Mensah in 1892, witnessed by Elder Nana's grandfather, and registered with the colonial land office — which means it has legal standing even today. The compound hasn't been taken. The family never lost it. It was only forgotten. That distinction — forgotten versus taken — changes everything.",
  worldChange: "compound-restoration-possible",
};

const questFamilyPortrait: QuestDefinition = {
  id: "recover-family-portrait",
  title: "The Missing Portrait",
  subtitle: "Find the photograph of the Mensah family reunion",
  description:
    "There was a family reunion photograph taken in 1905 — all four generations of the Mensah family, standing in front of the trading house. The photo was lost in 1914. But Grandma Ama believes it was saved — that someone carried it during the migration. Recovering it would mean seeing the family complete, for the first time in generations.",
  era: "1905 · Present Day",
  icon: "🖼️",
  giverNpcId: "grandma-ama",
  availablePhases: ["reunion", "finale", "mystery"],
  prerequisiteIds: ["walk-market-road"],
  objectives: [
    {
      id: "ask-ama-photo",
      label: "Ask Grandma Ama about the photograph",
      description: "Learn from Grandma Ama what she remembers about the 1905 reunion photo.",
      completed: false,
      requiresNpcInteraction: "grandma-ama",
    },
    {
      id: "search-migration-items",
      label: "Search items brought during migration",
      description: "Look through belongings preserved from the migration era.",
      completed: false,
    },
    {
      id: "restore-photograph",
      label: "Restore the photograph",
      description: "The photograph was damaged. Work to preserve and restore it.",
      completed: false,
      requiresTrait: { name: "Compassion", min: 20 },
    },
    {
      id: "present-to-family",
      label: "Present the restored photo to the family",
      description: "Share the recovered photograph at the family reunion.",
      completed: false,
      requiresPhase: "reunion",
    },
  ],
  rewards: [
    { type: "artifact", id: "family-reunion-photo-1905", label: "1905 Family Reunion Photograph" },
    { type: "character", id: "all-four-generations", label: "All four generations revealed" },
    { type: "trait", id: "Compassion", label: "+12 Compassion", value: 12 },
    { type: "trait", id: "Wisdom", label: "+8 Wisdom", value: 8 },
    { type: "knowledge", id: "1905-reunion-story", label: "The 1905 Reunion Story" },
  ],
  completionNarrative:
    "The photograph shows them all. Kwame in the center — younger than you imagined, standing very straight. Abena beside him. The children in a row, smallest to tallest. And behind them, the trading house in its full prosperity, sun on the walls. Four generations visible in this one moment. This is what was almost lost. This is what was saved.",
  worldChange: "reunion-photo-recovered",
};

// ── Quest Registry ──────────────────────────────────────────────────────────────

export const QUEST_REGISTRY: Record<string, QuestDefinition> = {
  "find-kwame-journal": questFindJournal,
  "walk-market-road": questMarketRoad,
  "first-harvest": questFirstHarvest,
  "recover-property-deed": questRecoverDeed,
  "recover-family-portrait": questFamilyPortrait,
};

// ── Quest state model (stored in demo state) ────────────────────────────────────

export interface QuestProgress {
  questId: string;
  status: QuestStatus;
  /** Objectives keyed by id, true = complete */
  objectiveProgress: Record<string, boolean>;
  startedAt?: string;
  completedAt?: string;
}

export function createQuestProgress(questId: string): QuestProgress {
  const quest = QUEST_REGISTRY[questId];
  if (!quest) throw new Error(`Unknown quest: ${questId}`);
  return {
    questId,
    status: "available",
    objectiveProgress: Object.fromEntries(quest.objectives.map(o => [o.id, false])),
  };
}

export function getAvailableQuests(
  phase: string,
  completedQuestIds: string[],
): QuestDefinition[] {
  return Object.values(QUEST_REGISTRY).filter(q => {
    if (!q.availablePhases.includes(phase)) return false;
    if (q.prerequisiteIds.length > 0) {
      return q.prerequisiteIds.every(pid => completedQuestIds.includes(pid));
    }
    return true;
  });
}

export function completeObjective(
  progress: QuestProgress,
  objectiveId: string,
): QuestProgress {
  const updated = {
    ...progress,
    objectiveProgress: { ...progress.objectiveProgress, [objectiveId]: true },
  };
  const quest = QUEST_REGISTRY[progress.questId];
  if (!quest) return updated;
  const allDone = quest.objectives.every(o => updated.objectiveProgress[o.id]);
  if (allDone && updated.status === "active") {
    updated.status = "completed";
    updated.completedAt = new Date().toISOString();
  }
  return updated;
}

export function getActiveQuest(quests: QuestProgress[]): QuestDefinition | null {
  const active = quests.find(q => q.status === "active");
  return active ? (QUEST_REGISTRY[active.questId] ?? null) : null;
}

export function getTotalQuestRewards(
  completed: QuestProgress[],
): { traitBonuses: Record<string, number>; artifacts: string[]; knowledge: string[] } {
  const traitBonuses: Record<string, number> = {};
  const artifacts: string[] = [];
  const knowledge: string[] = [];

  for (const prog of completed) {
    if (prog.status !== "completed") continue;
    const quest = QUEST_REGISTRY[prog.questId];
    if (!quest) continue;
    for (const reward of quest.rewards) {
      if (reward.type === "trait" && reward.value) {
        traitBonuses[reward.id] = (traitBonuses[reward.id] ?? 0) + reward.value;
      } else if (reward.type === "artifact") {
        artifacts.push(reward.id);
      } else if (reward.type === "knowledge") {
        knowledge.push(reward.id);
      }
    }
  }
  return { traitBonuses, artifacts, knowledge };
}
