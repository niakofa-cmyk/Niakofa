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

export interface DemoState {
  phase: DemoPhase;
  placedArtifacts: string[];
  traits: Record<string, number>;
  completedQuests: string[];
  worldVersion: number;
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

export const DEFAULT_DEMO_STATE: DemoState = {
  phase: "prologue",
  placedArtifacts: [],
  traits: { Leadership: 40, Wisdom: 35, Courage: 30, Compassion: 40 },
  completedQuests: [],
  worldVersion: 1,
};

function phaseAfter(phase: DemoPhase): DemoPhase {
  const index = DEMO_PHASE_ORDER.indexOf(phase);
  return DEMO_PHASE_ORDER[Math.min(index + 1, DEMO_PHASE_ORDER.length - 1)];
}

export function advanceDemo(state: DemoState): DemoState {
  return {
    ...state,
    phase: phaseAfter(state.phase),
    worldVersion: state.phase === "world-regen" ? state.worldVersion + 1 : state.worldVersion,
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
  return { ...state, placedArtifacts: [...state.placedArtifacts, artifactId] };
}

export function completeDemoQuest(state: DemoState, questId: string): DemoState {
  if (!DEMO_COOP_QUEST_IDS.includes(questId as (typeof DEMO_COOP_QUEST_IDS)[number])) return state;
  if (state.completedQuests.includes(questId)) return state;
  return { ...state, completedQuests: [...state.completedQuests, questId] };
}

export function resetDemo(): DemoState {
  return {
    ...DEFAULT_DEMO_STATE,
    traits: { ...DEFAULT_DEMO_STATE.traits },
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
