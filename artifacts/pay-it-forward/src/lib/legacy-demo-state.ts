/**
 * legacy-demo-state.ts
 *
 * Shared state engine for the public Niakofa Legacy demo.
 * Persistence contract: "niakofa:demo:v2" in localStorage.
 *
 * Covers all systems from the House of Mensah demo specification:
 *   Prologue → Ch 1–6 → Kitchen → Business → Mystery → World-Regen → Co-op → Reunion → Finale
 */

import {
  getLegacyWorldLayout,
  getLegacyWorldSpawn,
  isLegacyWorldPositionWalkable,
} from "@/lib/legacy-world-layout";

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
export type DemoFacing = "down" | "left" | "right" | "up";

export interface DemoMapPosition {
  row: number;
  column: number;
}

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

export interface FishingJournal {
  castCount: number;
  catches: string[];
  lastCatch: string | null;
}

export interface DemoState {
  phase: DemoPhase;
  baobabEntered: boolean;
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
  mapPosition: DemoMapPosition;
  mapFacing: DemoFacing;
  fishing: FishingJournal;
  memoryEncounterCompleted: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEMO_STORAGE_KEY = "niakofa:demo:v2";
export const DEMO_STATE_EVENT = "niakofa:demo:updated";

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
export const DEMO_TRAITS = ["Leadership", "Wisdom", "Courage", "Compassion"] as const;

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

export const DEMO_WORLD_CHANGE_GROUPS = [
  { changeType: "ancestor", label: "Ancestor branch", detail: "Family Tree" },
  { changeType: "dialogue", label: "Dialogue thread", detail: "Living Kitchen" },
  { changeType: "chapter", label: "Chapter seed", detail: "Story archive" },
  { changeType: "migration", label: "Migration route", detail: "Family map" },
] as const satisfies ReadonlyArray<{
  changeType: WorldChange["changeType"];
  label: string;
  detail: string;
}>;

/**
 * Groups the concrete world mutations already earned by the player.
 * Keeping this summary in the state module makes the regeneration UI a
 * projection of canonical progress rather than a second set of game rules.
 */
export function summarizeDemoWorldChanges(worldChanges: readonly WorldChange[]) {
  return DEMO_WORLD_CHANGE_GROUPS
    .map(group => ({
      ...group,
      count: worldChanges.filter(change => change.changeType === group.changeType).length,
    }))
    .filter(group => group.count > 0);
}

export interface DemoMemoryChainNode {
  artifactId: (typeof DEMO_ARTIFACT_IDS)[number];
  title: string;
  source: string;
  outcome: string;
  changeType: WorldChange["changeType"];
}

/**
 * The Memory Chain is the player-facing explanation of regeneration:
 * a preserved object becomes a concrete change in the shared world.
 * It is intentionally declarative so the UI cannot invent a second mapping.
 */
export const DEMO_MEMORY_CHAIN: readonly DemoMemoryChainNode[] = [
  {
    artifactId: "photo",
    title: "Recognize an ancestor",
    source: "Old photograph",
    outcome: "Family Tree branch",
    changeType: "ancestor",
  },
  {
    artifactId: "recipe",
    title: "Recover a living voice",
    source: "Family recipe",
    outcome: "Kitchen dialogue",
    changeType: "dialogue",
  },
  {
    artifactId: "medal",
    title: "Open a chapter seed",
    source: "Military medal",
    outcome: "Rising Again",
    changeType: "chapter",
  },
  {
    artifactId: "certificate",
    title: "Trace the family route",
    source: "Marriage certificate",
    outcome: "Migration route",
    changeType: "migration",
  },
];

export function getDemoMemoryChain(
  placedArtifacts: readonly string[],
): Array<DemoMemoryChainNode & { placed: boolean }> {
  const placed = new Set(placedArtifacts);
  return DEMO_MEMORY_CHAIN.map(node => ({ ...node, placed: placed.has(node.artifactId) }));
}

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

export const DEMO_FISHING_CATCHES = [
  { id: "river-tilapia", name: "River tilapia", rarity: "common", points: 10 },
  { id: "golden-fish", name: "Golden river fish", rarity: "rare", points: 25 },
  { id: "river-spirit", name: "River spirit", rarity: "legendary", points: 60 },
] as const;

export const DEFAULT_DEMO_STATE: DemoState = {
  phase: "prologue",
  baobabEntered: false,
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
  mapPosition: { row: 5, column: 3 },
  mapFacing: "down",
  fishing: { castCount: 0, catches: [], lastCatch: null },
  memoryEncounterCompleted: false,
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

function sanitizeDemoMapPosition(
  worldVersion: number,
  position: DemoMapPosition,
): DemoMapPosition {
  const layout = getLegacyWorldLayout(worldVersion);
  const spawn = getLegacyWorldSpawn(worldVersion);
  const row = Number.isInteger(position.row)
    ? Math.min(Math.max(position.row, 0), layout.map.length - 1)
    : spawn.row;
  const column = Number.isInteger(position.column)
    ? Math.min(Math.max(position.column, 0), (layout.map[0]?.length ?? 1) - 1)
    : spawn.column;
  return isLegacyWorldPositionWalkable(layout, { row, column })
    ? { row, column }
    : spawn;
}

// ─── State transitions ────────────────────────────────────────────────────────

export function enterLivingBaobab(state: DemoState): DemoState {
  if (state.baobabEntered) return state;
  return { ...state, baobabEntered: true };
}

export function advanceDemo(state: DemoState): DemoState {
  const isRegen = state.phase === "world-regen";
  const allArtifactsPlaced = state.placedArtifacts.length >= DEMO_ARTIFACT_IDS.length;
  // World regeneration is the Golden Path gate: leaving this phase early
  // would create a new world version without the family's preserved facts.
  if (isRegen && !allArtifactsPlaced) return state;
  const nextPhase = phaseAfter(state.phase);
  return {
    ...state,
    phase: nextPhase,
    season: seasonForPhase(nextPhase),
    worldVersion: isRegen && allArtifactsPlaced ? state.worldVersion + 1 : state.worldVersion,
  };
}

export function chooseDemoTrait(state: DemoState, trait: string, value: number): DemoState {
  // Only accept known traits to prevent arbitrary state mutations
  if (!DEMO_TRAITS.includes(trait as (typeof DEMO_TRAITS)[number]) || !Number.isFinite(value)) return state;
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
  const task = state.coopTasks.find(candidate => candidate.questId === questId);
  // A family member must explicitly accept a co-op task before it can be
  // completed. This keeps the shared quest loop honest and idempotent.
  if (!task || task.status !== "in-progress") return state;

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

export function completeMemoryEncounter(state: DemoState): DemoState {
  if (state.memoryEncounterCompleted) return state;
  return {
    ...state,
    memoryEncounterCompleted: true,
    legacyPoints: state.legacyPoints + 20,
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

export function castFishing(state: DemoState, power: number): DemoState {
  if (!Number.isFinite(power)) return state;
  const safePower = Math.min(Math.max(Math.trunc(power), 0), 100);
  const catchData = safePower >= 85
    ? DEMO_FISHING_CATCHES[2]
    : safePower >= 55
      ? DEMO_FISHING_CATCHES[1]
      : DEMO_FISHING_CATCHES[0];
  const alreadyCaught = state.fishing.catches.includes(catchData.id);

  return {
    ...state,
    fishing: {
      castCount: state.fishing.castCount + 1,
      catches: alreadyCaught ? state.fishing.catches : [...state.fishing.catches, catchData.id],
      lastCatch: catchData.id,
    },
    legacyPoints: state.legacyPoints + catchData.points + (alreadyCaught ? 2 : 0),
  };
}

export function updateDemoMapPosition(
  state: DemoState,
  position: DemoMapPosition,
  facing: DemoFacing,
): DemoState {
  const nextPosition = sanitizeDemoMapPosition(state.worldVersion, position);
  return {
    ...state,
    mapPosition: nextPosition,
    mapFacing: facing,
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
    mapPosition: { row: 5, column: 3 },
    mapFacing: "down",
    fishing: { ...DEFAULT_DEMO_STATE.fishing, catches: [] },
  };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function readDemoState(storage: Pick<Storage, "getItem">): DemoState {
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return resetDemo();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const fresh = resetDemo();
    const savedPhase = DEMO_PHASE_ORDER.includes(parsed.phase as DemoPhase)
      ? (parsed.phase as DemoPhase)
      : fresh.phase;
    const savedPhaseIndex = DEMO_PHASE_ORDER.indexOf(savedPhase);
    const coopQuestIndex = DEMO_PHASE_ORDER.indexOf("coop-quest");
    const rawWorldVersion = typeof parsed.worldVersion === "number" && Number.isFinite(parsed.worldVersion)
      ? Math.trunc(parsed.worldVersion)
      : fresh.worldVersion;
    const savedArtifacts = Array.isArray(parsed.placedArtifacts)
      ? parsed.placedArtifacts.filter((item): item is string =>
          typeof item === "string"
          && DEMO_ARTIFACT_IDS.includes(item as (typeof DEMO_ARTIFACT_IDS)[number]),
        )
      : [];
    const placedArtifacts = [...new Set(savedArtifacts)];
    const savedCompletedQuests = Array.isArray(parsed.completedQuests)
      ? parsed.completedQuests.filter((item): item is string =>
          typeof item === "string"
          && DEMO_COOP_QUEST_IDS.includes(item as (typeof DEMO_COOP_QUEST_IDS)[number]),
        )
      : [];
    const taskCompletedQuests = Array.isArray(parsed.coopTasks)
      ? parsed.coopTasks
        .filter(task =>
          task
          && typeof task === "object"
          && typeof task.questId === "string"
          && task.status === "completed"
          && DEMO_COOP_QUEST_IDS.includes(task.questId as (typeof DEMO_COOP_QUEST_IDS)[number]),
        )
        .map(task => task.questId)
      : [];
    // Treat either persisted representation as evidence of completion. Older
    // demo saves recorded the task status but not completedQuests, so dropping
    // that signal would silently move a returning player backwards.
    const completedQuests = [...new Set([...savedCompletedQuests, ...taskCompletedQuests])];
    // A versioned world or a completed co-op task can only exist after the
    // regeneration gate. Prefer the later, recoverable state over rendering
    // contradictory progress from a stale or hand-edited localStorage value.
    const hasRegeneratedEvidence =
      rawWorldVersion >= 2
      || savedPhaseIndex >= coopQuestIndex
      || completedQuests.length > 0;
    const phase = hasRegeneratedEvidence && savedPhaseIndex < coopQuestIndex
      ? "coop-quest"
      : savedPhase;
    const worldVersion = hasRegeneratedEvidence ? 2 : 1;
    return {
      ...fresh,
      phase,
      baobabEntered: parsed.baobabEntered === true || phase !== "prologue" || placedArtifacts.length > 0,
      season: (["dry", "rain", "harvest", "celebration"] as DemoSeason[]).includes(parsed.season as DemoSeason)
        ? (parsed.season as DemoSeason)
        : seasonForPhase(phase),
      placedArtifacts,
      completedQuests,
      traits: parsed.traits && typeof parsed.traits === "object"
        ? DEMO_TRAITS.reduce<Record<string, number>>((traits, trait) => {
            const value = (parsed.traits as Record<string, unknown>)[trait];
            traits[trait] = typeof value === "number" && Number.isFinite(value)
              ? value
              : fresh.traits[trait];
            return traits;
          }, {})
        : { ...fresh.traits },
      worldVersion,
      worldChanges: Array.isArray(parsed.worldChanges)
        ? parsed.worldChanges.filter(c => c && typeof c.id === "string" && typeof c.artifactId === "string")
        : [],
      coopTasks: Array.isArray(parsed.coopTasks)
        ? DEMO_COOP_QUEST_IDS.map(qid => {
            const saved = (parsed.coopTasks as CoopTaskState[]).find(t => t.questId === qid);
            const isCompleted = completedQuests.includes(qid);
            return {
              questId: qid,
              status: isCompleted
                ? "completed" as const
                : saved && saved.status === "in-progress"
                ? saved.status
                : "pending" as const,
              assignedTo: DEMO_COOP_ASSIGNMENTS[qid] ?? "Family",
              completedAt: isCompleted && saved && typeof saved.completedAt === "number" ? saved.completedAt : null,
            };
          })
        : fresh.coopTasks.map(t => ({ ...t })),
      legacyPoints: typeof parsed.legacyPoints === "number" && Number.isFinite(parsed.legacyPoints)
        ? Math.max(0, parsed.legacyPoints)
        : 0,
      memoryEncounterCompleted: parsed.memoryEncounterCompleted === true,
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
      mapPosition: parsed.mapPosition && typeof parsed.mapPosition === "object"
        ? sanitizeDemoMapPosition(
            worldVersion,
            {
              row: typeof (parsed.mapPosition as DemoMapPosition).row === "number"
                ? Math.trunc((parsed.mapPosition as DemoMapPosition).row)
                : fresh.mapPosition.row,
              column: typeof (parsed.mapPosition as DemoMapPosition).column === "number"
                ? Math.trunc((parsed.mapPosition as DemoMapPosition).column)
                : fresh.mapPosition.column,
            },
          )
        : { ...fresh.mapPosition },
      mapFacing: (["down", "left", "right", "up"] as DemoFacing[]).includes(parsed.mapFacing as DemoFacing)
        ? (parsed.mapFacing as DemoFacing)
        : fresh.mapFacing,
      fishing: parsed.fishing && typeof parsed.fishing === "object"
        ? {
            castCount: typeof (parsed.fishing as FishingJournal).castCount === "number"
              ? Math.max(0, Math.trunc((parsed.fishing as FishingJournal).castCount))
              : 0,
            catches: Array.isArray((parsed.fishing as FishingJournal).catches)
              ? (parsed.fishing as FishingJournal).catches.filter((id): id is string =>
                  DEMO_FISHING_CATCHES.some(catchData => catchData.id === id),
                )
              : [],
            lastCatch: DEMO_FISHING_CATCHES.some(catchData =>
              catchData.id === (parsed.fishing as FishingJournal).lastCatch,
            )
              ? (parsed.fishing as FishingJournal).lastCatch
              : null,
          }
        : { ...fresh.fishing, catches: [] },
    };
  } catch {
    return resetDemo();
  }
}

export function writeDemoState(storage: Pick<Storage, "setItem">, state: DemoState): boolean {
  try {
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DEMO_STATE_EVENT));
    }
    return true;
  } catch {
    // The public demo remains playable when browser storage is unavailable, but
    // callers can surface the failure instead of silently losing progress.
    return false;
  }
}
