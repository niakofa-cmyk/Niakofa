/**
 * legacy-demo-state.ts
 *
 * Shared state engine for the public Niakofa Legacy demo.
 * Persistence contract: "niakofa:demo:v2" in localStorage.
 *
 * Covers all systems from the House of Mensah demo specification:
 *   Prologue → Ch 1–6 → Kitchen → Business → Mystery → World-Regen → Co-op → Reunion → Finale
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type DemoPhase =
  | "prologue"
  | "chapter1"
  | "chapter2"
  | "kitchen"   // Family Kitchen mechanic — recipes unlock ancestor stories
  | "chapter3"
  | "business"  // Business Legacy — House of Mensah Trading Company progression
  | "chapter4"
  | "chapter5"
  | "mystery"   // Secret Mysteries — long-term family secrets to uncover
  | "chapter6"
  | "world-regen"
  | "coop-quest"
  | "reunion"   // Interactive Family Reunion — talk to relatives, NPCs remember you
  | "finale";

export type DemoSeason = "dry" | "rain" | "harvest" | "celebration";

export interface WorldChange {
  id: string;
  changeType: "ancestor" | "migration" | "chapter" | "dialogue" | "location";
  description: string;
  artifactId: string;
}

export interface CoopTaskState {
  questId: string;
  status: "pending" | "in-progress" | "completed";
  assignedTo: string;
  completedAt: number | null;
}

export interface MysteryState {
  id: string;
  title: string;
  clue: string;
  revealed: boolean;
  solved: boolean;
}

export interface NpcMemoryEntry {
  npcName: string;
  remembers: string;
}

export interface KitchenRecipe {
  id: string;
  unlocked: boolean;
}

export interface ReunionDialogue {
  npcId: string;
  completed: boolean;
}

export interface DemoState {
  phase: DemoPhase;
  placedArtifacts: string[];
  traits: Record<string, number>;
  completedQuests: string[];
  worldVersion: number;
  worldChanges: WorldChange[];
  coopTasks: CoopTaskState[];
  legacyPoints: number;
  // ── New systems ──
  season: DemoSeason;
  mysteries: MysteryState[];
  businessLevel: number;          // 0 = farm, 1 = warehouse, 2 = market, 3 = factory, 4 = ships
  kitchenRecipes: KitchenRecipe[];
  npcMemory: NpcMemoryEntry[];
  reunionDialogues: ReunionDialogue[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEMO_STORAGE_KEY = "niakofa:demo:v2";

export const DEMO_PHASE_ORDER: readonly DemoPhase[] = [
  "prologue",
  "chapter1",
  "chapter2",
  "kitchen",
  "chapter3",
  "business",
  "chapter4",
  "chapter5",
  "mystery",
  "chapter6",
  "world-regen",
  "coop-quest",
  "reunion",
  "finale",
];

export const DEMO_ARTIFACT_IDS = ["photo", "recipe", "medal", "certificate"] as const;
export const DEMO_COOP_QUEST_IDS = ["photo-id", "elder-interview", "location-tag", "reconnect"] as const;

export const DEMO_WORLD_CHANGES: Record<string, WorldChange> = {
  photo: {
    id: "wc-photo",
    changeType: "ancestor",
    description: "A forgotten ancestor appeared in the Family Tree",
    artifactId: "photo",
  },
  recipe: {
    id: "wc-recipe",
    changeType: "dialogue",
    description: "New dialogue available from Grandma Ama about her kitchen",
    artifactId: "recipe",
  },
  medal: {
    id: "wc-medal",
    changeType: "chapter",
    description: 'Chapter 7 unlocked — "Rising Again" — the soldier returns home',
    artifactId: "medal",
  },
  certificate: {
    id: "wc-certificate",
    changeType: "migration",
    description: "A migration route was revealed on the family map",
    artifactId: "certificate",
  },
};

export const DEMO_COOP_ASSIGNMENTS: Record<string, string> = {
  "photo-id": "You",
  "elder-interview": "Akua",
  "location-tag": "Kojo",
  "reconnect": "Ama",
};

export const DEMO_MYSTERIES: MysteryState[] = [
  {
    id: "gold-watch",
    title: "The Missing Gold Watch",
    clue: "A pocket watch inscribed with initials no one recognises was sold in 1923. The buyer's name appears in a ledger — but the page is torn.",
    revealed: false,
    solved: false,
  },
  {
    id: "unlabeled-photo",
    title: "The Unlabelled Photograph",
    clue: "A formal portrait from 1907 shows a woman in fine dress standing beside your great-grandfather. No one knows who she is. The church registry has a gap that year.",
    revealed: false,
    solved: false,
  },
  {
    id: "lost-business",
    title: "The Lost Business Ledger",
    clue: 'The family traded successfully until 1919. A ledger titled "Mensah & Sons — Vol. III" is missing. Two cousins stopped speaking that same year and never explained why.',
    revealed: false,
    solved: false,
  },
];

export const DEMO_KITCHEN_RECIPES: KitchenRecipe[] = [
  { id: "groundnut-soup", unlocked: false },
  { id: "kontomire-stew", unlocked: false },
  { id: "kelewele", unlocked: false },
];

export const DEMO_REUNION_DIALOGUES: ReunionDialogue[] = [
  { npcId: "grandma", completed: false },
  { npcId: "uncle-kofi", completed: false },
  { npcId: "cousin-afia", completed: false },
  { npcId: "young-child", completed: false },
];

export const DEFAULT_DEMO_STATE: DemoState = {
  phase: "prologue",
  placedArtifacts: [],
  traits: { Leadership: 40, Wisdom: 35, Courage: 30, Compassion: 40 },
  completedQuests: [],
  worldVersion: 1,
  worldChanges: [],
  coopTasks: DEMO_COOP_QUEST_IDS.map(id => ({
    questId: id,
    status: "pending" as const,
    assignedTo: DEMO_COOP_ASSIGNMENTS[id] ?? "Family",
    completedAt: null,
  })),
  legacyPoints: 0,
  season: "dry",
  mysteries: DEMO_MYSTERIES.map(m => ({ ...m })),
  businessLevel: 0,
  kitchenRecipes: DEMO_KITCHEN_RECIPES.map(r => ({ ...r })),
  npcMemory: [],
  reunionDialogues: DEMO_REUNION_DIALOGUES.map(d => ({ ...d })),
};

// ─── Phase helpers ────────────────────────────────────────────────────────────

function phaseAfter(phase: DemoPhase): DemoPhase {
  const index = DEMO_PHASE_ORDER.indexOf(phase);
  return DEMO_PHASE_ORDER[Math.min(index + 1, DEMO_PHASE_ORDER.length - 1)];
}

function seasonForPhase(phase: DemoPhase): DemoSeason {
  if (phase === "prologue" || phase === "chapter1") return "dry";
  if (phase === "chapter2" || phase === "kitchen") return "harvest";
  if (phase === "chapter3" || phase === "business") return "rain";
  if (phase === "chapter4" || phase === "chapter5" || phase === "mystery") return "dry";
  return "celebration";
}

// ─── State transitions ────────────────────────────────────────────────────────

export function advanceDemo(state: DemoState): DemoState {
  const isRegen = state.phase === "world-regen";
  const allArtifactsPlaced = state.placedArtifacts.length >= DEMO_ARTIFACT_IDS.length;
  const nextPhase = phaseAfter(state.phase);
  return {
    ...state,
    phase: nextPhase,
    season: seasonForPhase(nextPhase),
    worldVersion: isRegen && allArtifactsPlaced ? state.worldVersion + 1 : state.worldVersion,
  };
}

const KNOWN_TRAITS = ["Leadership", "Wisdom", "Courage", "Compassion"] as const;

export function chooseDemoTrait(state: DemoState, trait: string, value: number): DemoState {
  // Only accept known traits to prevent arbitrary state mutations
  if (!KNOWN_TRAITS.includes(trait as (typeof KNOWN_TRAITS)[number])) return state;
  const nextPhase = phaseAfter(state.phase);
  // Record trait choice as NPC memory for reunion
  const memoryLabel = `You chose ${trait} in ${state.phase.replace("chapter", "Chapter ")}`;
  return {
    ...state,
    traits: { ...state.traits, [trait]: (state.traits[trait] ?? 0) + value },
    phase: nextPhase,
    season: seasonForPhase(nextPhase),
    npcMemory: state.npcMemory.some(m => m.remembers.includes(state.phase))
      ? state.npcMemory
      : [...state.npcMemory, { npcName: "Grandma", remembers: memoryLabel }],
  };
}

export function placeDemoArtifact(state: DemoState, artifactId: string): DemoState {
  if (!DEMO_ARTIFACT_IDS.includes(artifactId as (typeof DEMO_ARTIFACT_IDS)[number])) return state;
  if (state.placedArtifacts.includes(artifactId)) return state;

  const change = DEMO_WORLD_CHANGES[artifactId];
  const newChanges = change && !state.worldChanges.some(c => c.artifactId === artifactId)
    ? [...state.worldChanges, change]
    : state.worldChanges;

  return {
    ...state,
    placedArtifacts: [...state.placedArtifacts, artifactId],
    worldChanges: newChanges,
  };
}

export function startDemoQuest(state: DemoState, questId: string): DemoState {
  if (!DEMO_COOP_QUEST_IDS.includes(questId as (typeof DEMO_COOP_QUEST_IDS)[number])) return state;
  return {
    ...state,
    coopTasks: state.coopTasks.map(t =>
      t.questId === questId && t.status === "pending"
        ? { ...t, status: "in-progress" as const }
        : t,
    ),
  };
}

export function completeDemoQuest(state: DemoState, questId: string): DemoState {
  if (!DEMO_COOP_QUEST_IDS.includes(questId as (typeof DEMO_COOP_QUEST_IDS)[number])) return state;
  if (state.completedQuests.includes(questId)) return state;

  const allDone = [...state.completedQuests, questId].length >= DEMO_COOP_QUEST_IDS.length;
  return {
    ...state,
    completedQuests: [...state.completedQuests, questId],
    coopTasks: state.coopTasks.map(t =>
      t.questId === questId
        ? { ...t, status: "completed" as const, completedAt: Date.now() }
        : t,
    ),
    legacyPoints: state.legacyPoints + 100 + (allDone ? 100 : 0),
  };
}

export function unlockKitchenRecipe(state: DemoState, recipeId: string): DemoState {
  // Idempotent: no points awarded if the recipe is already unlocked
  const recipe = state.kitchenRecipes.find(r => r.id === recipeId);
  if (!recipe || recipe.unlocked) return state;
  return {
    ...state,
    kitchenRecipes: state.kitchenRecipes.map(r =>
      r.id === recipeId ? { ...r, unlocked: true } : r,
    ),
    legacyPoints: state.legacyPoints + 25,
    npcMemory: state.npcMemory.some(m => m.npcName === "Grandma Ama")
      ? state.npcMemory
      : [...state.npcMemory, { npcName: "Grandma Ama", remembers: "You cooked with her in the kitchen" }],
  };
}

export function advanceBusiness(state: DemoState): DemoState {
  // Idempotent: no points awarded if already at max level
  if (state.businessLevel >= 4) return state;
  return {
    ...state,
    businessLevel: state.businessLevel + 1,
    legacyPoints: state.legacyPoints + 50,
  };
}

export function revealMystery(state: DemoState, mysteryId: string): DemoState {
  // Idempotent: no points awarded if mystery is already revealed
  const mystery = state.mysteries.find(m => m.id === mysteryId);
  if (!mystery || mystery.revealed) return state;
  return {
    ...state,
    mysteries: state.mysteries.map(m =>
      m.id === mysteryId ? { ...m, revealed: true, solved: true } : m,
    ),
    legacyPoints: state.legacyPoints + 75,
  };
}

export function completeReunionDialogue(state: DemoState, npcId: string): DemoState {
  // Idempotent: no points awarded if dialogue is already completed
  const dialogue = state.reunionDialogues.find(d => d.npcId === npcId);
  if (!dialogue || dialogue.completed) return state;
  const allDone = state.reunionDialogues.filter(d => d.completed || d.npcId === npcId).length >= state.reunionDialogues.length;
  return {
    ...state,
    reunionDialogues: state.reunionDialogues.map(d =>
      d.npcId === npcId ? { ...d, completed: true } : d,
    ),
    legacyPoints: state.legacyPoints + 30 + (allDone ? 120 : 0),
  };
}

export function resetDemo(): DemoState {
  return {
    ...DEFAULT_DEMO_STATE,
    traits: { ...DEFAULT_DEMO_STATE.traits },
    coopTasks: DEFAULT_DEMO_STATE.coopTasks.map(t => ({ ...t })),
    worldChanges: [],
    mysteries: DEMO_MYSTERIES.map(m => ({ ...m })),
    kitchenRecipes: DEMO_KITCHEN_RECIPES.map(r => ({ ...r })),
    reunionDialogues: DEMO_REUNION_DIALOGUES.map(d => ({ ...d })),
    npcMemory: [],
    businessLevel: 0,
    season: "dry",
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function readDemoState(storage: Pick<Storage, "getItem">): DemoState {
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return resetDemo();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const fresh = resetDemo();
    const phase = DEMO_PHASE_ORDER.includes(parsed.phase as DemoPhase)
      ? (parsed.phase as DemoPhase)
      : fresh.phase;
    return {
      ...fresh,
      ...parsed,
      phase,
      season: (["dry", "rain", "harvest", "celebration"] as DemoSeason[]).includes(parsed.season as DemoSeason)
        ? (parsed.season as DemoSeason)
        : seasonForPhase(phase),
      placedArtifacts: Array.isArray(parsed.placedArtifacts)
        ? parsed.placedArtifacts.filter(item => typeof item === "string")
        : [],
      completedQuests: Array.isArray(parsed.completedQuests)
        ? parsed.completedQuests.filter(item => typeof item === "string")
        : [],
      traits: parsed.traits && typeof parsed.traits === "object"
        ? { ...fresh.traits, ...(parsed.traits as Record<string, number>) }
        : { ...fresh.traits },
      worldVersion: typeof parsed.worldVersion === "number" && Number.isFinite(parsed.worldVersion)
        ? Math.max(1, parsed.worldVersion)
        : fresh.worldVersion,
      worldChanges: Array.isArray(parsed.worldChanges)
        ? parsed.worldChanges.filter(c => c && typeof c.id === "string" && typeof c.artifactId === "string")
        : [],
      coopTasks: Array.isArray(parsed.coopTasks)
        ? DEMO_COOP_QUEST_IDS.map(qid => {
            const saved = (parsed.coopTasks as CoopTaskState[]).find(t => t.questId === qid);
            return {
              questId: qid,
              status: saved && (saved.status === "completed" || saved.status === "in-progress")
                ? saved.status
                : "pending" as const,
              assignedTo: DEMO_COOP_ASSIGNMENTS[qid] ?? "Family",
              completedAt: saved && typeof saved.completedAt === "number" ? saved.completedAt : null,
            };
          })
        : fresh.coopTasks.map(t => ({ ...t })),
      legacyPoints: typeof parsed.legacyPoints === "number" && Number.isFinite(parsed.legacyPoints)
        ? Math.max(0, parsed.legacyPoints)
        : 0,
      mysteries: Array.isArray(parsed.mysteries) && parsed.mysteries.length > 0
        ? DEMO_MYSTERIES.map(dm => {
            const saved = (parsed.mysteries as MysteryState[]).find(m => m.id === dm.id);
            return saved ? { ...dm, revealed: !!saved.revealed, solved: !!saved.solved } : dm;
          })
        : DEMO_MYSTERIES.map(m => ({ ...m })),
      businessLevel: typeof parsed.businessLevel === "number" && Number.isFinite(parsed.businessLevel)
        ? Math.min(Math.max(0, parsed.businessLevel), 4)
        : 0,
      kitchenRecipes: Array.isArray(parsed.kitchenRecipes) && parsed.kitchenRecipes.length > 0
        ? DEMO_KITCHEN_RECIPES.map(dk => {
            const saved = (parsed.kitchenRecipes as KitchenRecipe[]).find(r => r.id === dk.id);
            return saved ? { ...dk, unlocked: !!saved.unlocked } : dk;
          })
        : DEMO_KITCHEN_RECIPES.map(r => ({ ...r })),
      npcMemory: Array.isArray(parsed.npcMemory)
        ? (parsed.npcMemory as NpcMemoryEntry[]).filter(m => m && typeof m.npcName === "string")
        : [],
      reunionDialogues: Array.isArray(parsed.reunionDialogues) && parsed.reunionDialogues.length > 0
        ? DEMO_REUNION_DIALOGUES.map(dd => {
            const saved = (parsed.reunionDialogues as ReunionDialogue[]).find(d => d.npcId === dd.npcId);
            return saved ? { ...dd, completed: !!saved.completed } : dd;
          })
        : DEMO_REUNION_DIALOGUES.map(d => ({ ...d })),
    };
  } catch {
    return resetDemo();
  }
}

export function writeDemoState(storage: Pick<Storage, "setItem">, state: DemoState): void {
  try {
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The public demo remains playable when browser storage is unavailable.
  }
}
