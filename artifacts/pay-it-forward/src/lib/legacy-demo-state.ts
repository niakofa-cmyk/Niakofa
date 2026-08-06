export type DemoPhase =
  | "prologue"
  | "chapter1"
  | "chapter2"
  | "chapter3"
  | "chapter4"
  | "chapter5"
  | "chapter6"
  | "world-regen"
  | "coop-quest"
  | "finale";

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

export interface DemoState {
  phase: DemoPhase;
  placedArtifacts: string[];
  traits: Record<string, number>;
  completedQuests: string[];
  worldVersion: number;
  worldChanges: WorldChange[];
  coopTasks: CoopTaskState[];
  legacyPoints: number;
}

export const DEMO_STORAGE_KEY = "niakofa:demo:v2";

export const DEMO_PHASE_ORDER: readonly DemoPhase[] = [
  "prologue",
  "chapter1",
  "chapter2",
  "chapter3",
  "chapter4",
  "chapter5",
  "chapter6",
  "world-regen",
  "coop-quest",
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
};

function phaseAfter(phase: DemoPhase): DemoPhase {
  const index = DEMO_PHASE_ORDER.indexOf(phase);
  return DEMO_PHASE_ORDER[Math.min(index + 1, DEMO_PHASE_ORDER.length - 1)];
}

export function advanceDemo(state: DemoState): DemoState {
  const isRegen = state.phase === "world-regen";
  const allArtifactsPlaced = state.placedArtifacts.length >= DEMO_ARTIFACT_IDS.length;
  return {
    ...state,
    phase: phaseAfter(state.phase),
    worldVersion: isRegen && allArtifactsPlaced ? state.worldVersion + 1 : state.worldVersion,
  };
}

export function chooseDemoTrait(state: DemoState, trait: string, value: number): DemoState {
  return {
    ...state,
    traits: { ...state.traits, [trait]: (state.traits[trait] ?? 0) + value },
    phase: phaseAfter(state.phase),
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

export function resetDemo(): DemoState {
  return {
    ...DEFAULT_DEMO_STATE,
    traits: { ...DEFAULT_DEMO_STATE.traits },
    coopTasks: DEFAULT_DEMO_STATE.coopTasks.map(t => ({ ...t })),
    worldChanges: [],
  };
}

export function readDemoState(storage: Pick<Storage, "getItem">): DemoState {
  try {
    const raw = storage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return resetDemo();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    const phase = DEMO_PHASE_ORDER.includes(parsed.phase as DemoPhase)
      ? (parsed.phase as DemoPhase)
      : DEFAULT_DEMO_STATE.phase;
    return {
      ...resetDemo(),
      ...parsed,
      phase,
      placedArtifacts: Array.isArray(parsed.placedArtifacts)
        ? parsed.placedArtifacts.filter(item => typeof item === "string")
        : [],
      completedQuests: Array.isArray(parsed.completedQuests)
        ? parsed.completedQuests.filter(item => typeof item === "string")
        : [],
      traits: parsed.traits && typeof parsed.traits === "object"
        ? { ...DEFAULT_DEMO_STATE.traits, ...parsed.traits }
        : { ...DEFAULT_DEMO_STATE.traits },
      worldVersion: typeof parsed.worldVersion === "number" && Number.isFinite(parsed.worldVersion)
        ? Math.max(1, parsed.worldVersion)
        : DEFAULT_DEMO_STATE.worldVersion,
      worldChanges: Array.isArray(parsed.worldChanges)
        ? parsed.worldChanges.filter(c => c && typeof c.id === "string" && typeof c.artifactId === "string")
        : [],
      coopTasks: Array.isArray(parsed.coopTasks) && parsed.coopTasks.length === DEMO_COOP_QUEST_IDS.length
        ? parsed.coopTasks.map((t, i) => ({
            questId: DEMO_COOP_QUEST_IDS[i],
            status: (t.status === "completed" || t.status === "in-progress") ? t.status : "pending",
            assignedTo: DEMO_COOP_ASSIGNMENTS[DEMO_COOP_QUEST_IDS[i]] ?? "Family",
            completedAt: typeof t.completedAt === "number" ? t.completedAt : null,
          }))
        : DEFAULT_DEMO_STATE.coopTasks.map(t => ({ ...t })),
      legacyPoints: typeof parsed.legacyPoints === "number" && Number.isFinite(parsed.legacyPoints)
        ? Math.max(0, parsed.legacyPoints)
        : 0,
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
