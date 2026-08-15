import { describe, it } from "node:test";
import { expect } from "expect";
import {
  advanceDemo,
  chooseDemoTrait,
  completeDemoQuest,
  DEFAULT_DEMO_STATE,
  DEMO_ARTIFACT_IDS,
  DEMO_COOP_QUEST_IDS,
  DEMO_MEMORY_CHAIN,
  DEMO_TRAITS,
  DEMO_WORLD_CHANGES,
  enterLivingBaobab,
  completeReunionDialogue,
  advanceBusiness,
  castFishing,
  completeMemoryEncounter,
  inspectDemoLandmark,
  revealMystery,
  unlockKitchenRecipe,
  placeDemoArtifact,
  readDemoState,
  resetDemo,
  startDemoQuest,
  summarizeDemoWorldChanges,
  updateDemoMapPosition,
  writeDemoState,
  getDemoMemoryChain,
} from "../legacy-demo-state";

describe("Legacy public demo journey", () => {
  it("awards the memory encounter points once and survives storage round trips", () => {
    const completed = completeMemoryEncounter(resetDemo());
    const repeated = completeMemoryEncounter(completed);

    expect(completed.memoryEncounterCompleted).toBe(true);
    expect(completed.legacyPoints).toBe(20);
    expect(repeated.legacyPoints).toBe(20);

    const stored: Record<string, string> = {};
    writeDemoState(
      {
        setItem(key, value) {
          stored[key] = value;
        },
      },
      completed,
    );
    expect(readDemoState({ getItem: key => stored[key] ?? null }).memoryEncounterCompleted).toBe(true);
  });

  it("persists the playable map position and facing in the shared demo state", () => {
    const moved = updateDemoMapPosition(resetDemo(), { row: 4, column: 3 }, "up");
    expect(moved.mapPosition).toEqual({ row: 4, column: 3 });
    expect(moved.mapFacing).toBe("up");

    const stored: Record<string, string> = {};
    writeDemoState(
      {
        setItem(key, value) {
          stored[key] = value;
        },
      },
      moved,
    );
    const restored = readDemoState({
      getItem: key => stored[key] ?? null,
    });
    expect(restored.mapPosition).toEqual({ row: 4, column: 3 });
    expect(restored.mapFacing).toBe("up");
  });

  it("records each restored map memory once and preserves it through storage", () => {
    const discovered = inspectDemoLandmark(placeDemoArtifact(resetDemo(), "photo"), "photo");
    const repeated = inspectDemoLandmark(discovered, "photo");

    expect(discovered.discoveredLandmarks).toEqual(["photo"]);
    expect(discovered.legacyPoints).toBe(10);
    expect(repeated).toBe(discovered);

    const stored: Record<string, string> = {};
    writeDemoState({ setItem: (key, value) => { stored[key] = value; } }, discovered);
    expect(readDemoState({ getItem: key => stored[key] ?? null }).discoveredLandmarks).toEqual(["photo"]);
  });

  it("persists the Living Baobab entry gate and reset returns to it", () => {
    const entered = enterLivingBaobab(resetDemo());
    expect(entered.baobabEntered).toBe(true);

    const stored: Record<string, string> = {};
    writeDemoState({ setItem: (key, value) => { stored[key] = value; } }, entered);
    expect(readDemoState({ getItem: key => stored[key] ?? null }).baobabEntered).toBe(true);
    expect(resetDemo().baobabEntered).toBe(false);
  });

  it("completes the House of Mensah golden path across every interactive system", () => {
    let state = resetDemo();
    expect(state.phase).toBe("prologue");

    // Move from prologue to chapter1, then choose Wisdom trait (chapter1 → chapter2)
    state = advanceDemo(state);
    state = chooseDemoTrait(state, "Wisdom", 5);
    expect(state.traits.Wisdom).toBe(40); // 35 + 5

    // Kitchen: each recipe unlocks an ancestor memory and awards points.
    state = advanceDemo(state); // chapter2 → kitchen
    for (const recipeId of ["groundnut-soup", "kontomire-stew", "kelewele"]) {
      state = unlockKitchenRecipe(state, recipeId);
    }
    expect(state.kitchenRecipes.every(recipe => recipe.unlocked)).toBe(true);
    expect(state.npcMemory.some(memory => memory.npcName === "Grandma Ama")).toBe(true);

    // Business: progress through the House of Mensah Trading Company.
    state = advanceDemo(state); // kitchen → chapter3
    state = advanceDemo(state); // chapter3 → business
    for (let level = 0; level < 4; level += 1) {
      state = advanceBusiness(state);
    }
    expect(state.businessLevel).toBe(4);

    // Mystery: reveal all long-term family secrets before the final chapter.
    state = advanceDemo(state); // business → chapter4
    state = advanceDemo(state); // chapter4 → chapter5
    state = advanceDemo(state); // chapter5 → mystery
    for (const mystery of state.mysteries) {
      state = revealMystery(state, mystery.id);
    }
    expect(state.mysteries.every(mystery => mystery.revealed && mystery.solved)).toBe(true);

    // Continue the chapter sequence to the world regeneration gate.
    state = advanceDemo(state); // mystery → chapter6
    state = advanceDemo(state); // chapter6 → world-regen
    expect(state.phase).toBe("world-regen");

    // Place all artifacts to unlock regeneration
    for (const artifactId of DEMO_ARTIFACT_IDS) {
      state = placeDemoArtifact(state, artifactId);
    }
    expect(state.placedArtifacts).toEqual([...DEMO_ARTIFACT_IDS]);

    // Advance from world-regen → coop-quest, incrementing worldVersion
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(2);

    for (const questId of DEMO_COOP_QUEST_IDS) {
      state = startDemoQuest(state, questId);
      state = completeDemoQuest(state, questId);
    }
    expect(state.completedQuests).toEqual([...DEMO_COOP_QUEST_IDS]);

    // Reunion: every relative remembers the player before the finale.
    state = advanceDemo(state); // coop-quest → reunion
    for (const dialogue of state.reunionDialogues) {
      state = completeReunionDialogue(state, dialogue.npcId);
    }
    expect(state.reunionDialogues.every(dialogue => dialogue.completed)).toBe(true);

    state = advanceDemo(state); // reunion → finale
    expect(state.phase).toBe("finale");
    expect(state.worldVersion).toBe(2);
    expect(state.legacyPoints).toBe(1240);

    // The completed journey can be restored without losing any progression.
    const savedValues = new Map<string, string>();
    const saved = {
      getItem: (key: string) => savedValues.get(key) ?? null,
      setItem: (key: string, value: string) => {
        savedValues.set(key, value);
      },
    };
    writeDemoState(saved, state);
    const restored = readDemoState(saved);
    expect(restored).toMatchObject({
      phase: "finale",
      worldVersion: 2,
      businessLevel: 4,
      legacyPoints: 1240,
    });
    expect(restored.placedArtifacts).toEqual([...DEMO_ARTIFACT_IDS]);
    expect(restored.completedQuests).toEqual([...DEMO_COOP_QUEST_IDS]);
    expect(restored.worldChanges).toHaveLength(4);
  });

  it("is idempotent for repeated artifact and quest clicks", () => {
    let state = resetDemo();
    state = placeDemoArtifact(state, "photo");
    state = placeDemoArtifact(state, "photo");
    state = completeDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    expect(state.placedArtifacts).toEqual(["photo"]);
    expect(state.completedQuests).toEqual([]);
  });

  it("rejects unknown persisted values and survives storage errors", () => {
    const values = new Map<string, string>([[
      "niakofa:demo:v2",
      JSON.stringify({ phase: "not-a-phase", worldVersion: -4, placedArtifacts: [1, "photo"] }),
    ]]);
    const state = readDemoState({ getItem: key => values.get(key) ?? null });
    expect(state.phase).toBe(DEFAULT_DEMO_STATE.phase);
    expect(state.worldVersion).toBe(1);
    expect(state.placedArtifacts).toEqual(["photo"]);

    expect(() => writeDemoState({ setItem: () => { throw new Error("blocked"); } }, state)).not.toThrow();
  });

  it("normalizes contradictory persisted world and quest progress", () => {
    const state = readDemoState({
      getItem: () => JSON.stringify({
        phase: "chapter2",
        worldVersion: 99.7,
        completedQuests: ["photo-id"],
        coopTasks: [{ questId: "photo-id", status: "pending", assignedTo: "Someone Else", completedAt: null }],
      }),
    });

    expect(state.phase).toBe("coop-quest");
    expect(state.worldVersion).toBe(2);
    expect(state.completedQuests).toEqual(["photo-id"]);
    expect(state.coopTasks.find(task => task.questId === "photo-id")).toMatchObject({
      status: "completed",
      assignedTo: "You",
    });
  });

  it("advances for every supported trait choice", () => {
    for (const trait of DEMO_TRAITS) {
      const state = chooseDemoTrait(resetDemo(), trait, 5);
      expect(state.phase).toBe("chapter1");
      expect(state.traits[trait]).toBe(DEFAULT_DEMO_STATE.traits[trait] + 5);
    }
  });

  it("does not award a chapter trait twice after revisiting the phase", () => {
    const firstChoice = chooseDemoTrait(advanceDemo(resetDemo()), "Wisdom", 5);
    const revisited = {
      ...firstChoice,
      phase: "chapter1" as const,
    };

    expect(chooseDemoTrait(revisited, "Leadership", 20)).toBe(revisited);
    expect(revisited.traits).toEqual({ ...DEFAULT_DEMO_STATE.traits, Wisdom: 40 });
  });

  it("ignores non-finite trait values without changing state", () => {
    const state = resetDemo();
    expect(chooseDemoTrait(state, "Wisdom", Number.NaN)).toBe(state);
    expect(chooseDemoTrait(state, "Wisdom", Number.POSITIVE_INFINITY)).toBe(state);
  });

  it("records fishing discoveries and awards repeat casts without duplicating the journal", () => {
    let state = resetDemo();
    state = castFishing(state, 90);
    expect(state.fishing).toEqual({
      castCount: 1,
      catches: ["river-spirit"],
      lastCatch: "river-spirit",
    });
    expect(state.legacyPoints).toBe(60);

    state = castFishing(state, 90);
    expect(state.fishing.catches).toEqual(["river-spirit"]);
    expect(state.fishing.castCount).toBe(2);
    expect(state.legacyPoints).toBe(122);
  });

  it("keeps saved map positions on walkable tiles", () => {
    const state = updateDemoMapPosition(resetDemo(), { row: 4, column: 4 }, "up");
    expect(state.mapPosition).toEqual({ row: 5, column: 3 });
  });

  it("removes unknown persisted traits and artifact IDs", () => {
    const values = new Map<string, string>([[
      "niakofa:demo:v2",
      JSON.stringify({
        traits: { Wisdom: 44, Curiosity: 999, Courage: "high" },
        placedArtifacts: ["photo", "not-real"],
        completedQuests: ["photo-id", "not-real"],
      }),
    ]]);
    const state = readDemoState({ getItem: key => values.get(key) ?? null });
    expect(state.traits).toEqual({ Leadership: 40, Wisdom: 44, Courage: 30, Compassion: 40 });
    expect(state.placedArtifacts).toEqual(["photo"]);
    expect(state.completedQuests).toEqual(["photo-id"]);
  });

  it("sanitizes unknown restored map memories", () => {
    const state = readDemoState({
      getItem: () => JSON.stringify({
        placedArtifacts: ["photo"],
        discoveredLandmarks: ["photo", "photo", "not-real", 4],
      }),
    });

    expect(state.discoveredLandmarks).toEqual(["photo"]);
  });
});

describe("World regeneration", () => {
  it("projects each preserved artifact into one explicit Memory Chain link", () => {
    const chain = getDemoMemoryChain(["photo", "not-real"]);
    expect(chain).toHaveLength(DEMO_MEMORY_CHAIN.length);
    expect(chain.filter(node => node.placed).map(node => node.artifactId)).toEqual(["photo"]);
    expect(chain.find(node => node.artifactId === "photo")).toMatchObject({
      title: "Recognize an ancestor",
      outcome: "Family Tree branch",
      changeType: "ancestor",
    });
    expect(chain.find(node => node.artifactId === "recipe")?.placed).toBe(false);
  });

  it("tracks a world change for each artifact placed", () => {
    let state = resetDemo();
    expect(state.worldChanges).toEqual([]);

    state = placeDemoArtifact(state, "photo");
    expect(state.worldChanges).toHaveLength(1);
    expect(state.worldChanges[0].changeType).toBe("ancestor");
    expect(state.worldChanges[0].description).toBe(
      DEMO_WORLD_CHANGES.photo.description,
    );

    state = placeDemoArtifact(state, "recipe");
    expect(state.worldChanges).toHaveLength(2);
    expect(state.worldChanges[1].changeType).toBe("dialogue");
  });

  it("does not duplicate world changes for repeated placements", () => {
    let state = resetDemo();
    state = placeDemoArtifact(state, "medal");
    state = placeDemoArtifact(state, "medal");
    expect(state.worldChanges).toHaveLength(1);
  });

  it("increments world version only when all artifacts are placed and advancing from world-regen", () => {
    // Advancing from world-regen WITHOUT all artifacts is blocked.
    let state = resetDemo();
    state = { ...state, phase: "world-regen" };
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(1);
    expect(state.phase).toBe("world-regen");

    // Once the missing facts are placed, the same transition succeeds.
    for (const id of DEMO_ARTIFACT_IDS) {
      state = placeDemoArtifact(state, id);
    }
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(2);
    expect(state.phase).toBe("coop-quest");

    // The correct trigger: place all artifacts THEN advance from world-regen
    let state2 = resetDemo();
    state2 = { ...state2, phase: "world-regen" };
    for (const id of DEMO_ARTIFACT_IDS) {
      state2 = placeDemoArtifact(state2, id);
    }
    state2 = advanceDemo(state2);
    expect(state2.worldVersion).toBe(2);
    expect(state2.phase).toBe("coop-quest");
  });

  it("does not increment world version when advancing from other phases", () => {
    let state = resetDemo();
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(1);

    state = advanceDemo(state);
    expect(state.worldVersion).toBe(1);
  });

  it("preserves all 4 world changes after regeneration", () => {
    let state = resetDemo();
    state = { ...state, phase: "world-regen" };
    for (const id of DEMO_ARTIFACT_IDS) {
      state = placeDemoArtifact(state, id);
    }
    state = advanceDemo(state);
    expect(state.worldChanges).toHaveLength(4);
    const types = state.worldChanges.map(c => c.changeType).sort();
    expect(types).toEqual(["ancestor", "chapter", "dialogue", "migration"]);
  });

  it("summarizes earned world changes without inventing missing categories", () => {
    let state = resetDemo();
    state = placeDemoArtifact(state, "photo");
    state = placeDemoArtifact(state, "recipe");

    expect(summarizeDemoWorldChanges(state.worldChanges)).toEqual([
      { changeType: "ancestor", label: "Ancestor branch", detail: "Family Tree", count: 1 },
      { changeType: "dialogue", label: "Dialogue thread", detail: "Living Kitchen", count: 1 },
    ]);
  });
});

describe("Co-op quest", () => {
  it("initializes all 4 tasks as pending with correct assignments", () => {
    const state = resetDemo();
    expect(state.coopTasks).toHaveLength(4);
    for (const task of state.coopTasks) {
      expect(task.status).toBe("pending");
      expect(task.completedAt).toBeNull();
    }
    expect(state.coopTasks[0].assignedTo).toBe("You");
    expect(state.coopTasks[1].assignedTo).toBe("Akua");
    expect(state.coopTasks[2].assignedTo).toBe("Kojo");
    expect(state.coopTasks[3].assignedTo).toBe("Ama");
  });

  it("transitions a task from pending to in-progress", () => {
    let state = resetDemo();
    state = startDemoQuest(state, "photo-id");
    expect(state.coopTasks[0].status).toBe("in-progress");
    expect(state.coopTasks[1].status).toBe("pending");
  });

  it("completes a task and awards legacy points", () => {
    let state = resetDemo();
    state = startDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    expect(state.coopTasks[0].status).toBe("completed");
    expect(state.coopTasks[0].completedAt).not.toBeNull();
    expect(state.completedQuests).toEqual(["photo-id"]);
    expect(state.legacyPoints).toBe(100);
  });

  it("awards bonus 100 points when all tasks are completed", () => {
    let state = resetDemo();
    for (let i = 0; i < DEMO_COOP_QUEST_IDS.length - 1; i++) {
      state = startDemoQuest(state, DEMO_COOP_QUEST_IDS[i]);
      state = completeDemoQuest(state, DEMO_COOP_QUEST_IDS[i]);
    }
    expect(state.legacyPoints).toBe(300);

    state = startDemoQuest(state, DEMO_COOP_QUEST_IDS[DEMO_COOP_QUEST_IDS.length - 1]);
    state = completeDemoQuest(state, DEMO_COOP_QUEST_IDS[DEMO_COOP_QUEST_IDS.length - 1]);
    expect(state.legacyPoints).toBe(500);
    expect(state.completedQuests).toHaveLength(4);
  });

  it("does not award points for duplicate quest completion", () => {
    let state = resetDemo();
    state = startDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    expect(state.legacyPoints).toBe(100);
  });

  it("turns preserved evidence and reunion dialogue into relationship memories", () => {
    let state = resetDemo();
    const grandmaBefore = state.relationships.find(relationship => relationship.npcId === "grandma");
    const afiaBefore = state.relationships.find(relationship => relationship.npcId === "cousin-afia");
    expect(grandmaBefore).toBeDefined();
    expect(afiaBefore).toBeDefined();

    state = placeDemoArtifact(state, "recipe");
    state = revealMystery(state, "unlabeled-photo");
    state = completeReunionDialogue(state, "grandma");

    const grandma = state.relationships.find(relationship => relationship.npcId === "grandma");
    const afia = state.relationships.find(relationship => relationship.npcId === "cousin-afia");
    expect(grandma?.trust).toBe((grandmaBefore?.trust ?? 0) + 9);
    expect(grandma?.sharedMemories).toContain("We preserved Grandma Ama's kitchen recipe");
    expect(afia?.trust).toBe((afiaBefore?.trust ?? 0) + 7);
    expect(afia?.sharedMemories).toContain("We gave the unlabelled photograph a name and a place");

    const repeated = completeReunionDialogue(state, "grandma");
    expect(repeated).toBe(state);
  });

  it("sanitizes relationship meters and memories when restoring a save", () => {
    const state = readDemoState({
      getItem: () => JSON.stringify({
        relationships: [
          {
            npcId: "grandma",
            trust: 999,
            respect: -20,
            love: 44.9,
            conflict: "high",
            sharedMemories: ["kept", "kept", 42, "x".repeat(121)],
          },
          { npcId: "not-a-family-member", trust: 100 },
        ],
      }),
    });
    const grandma = state.relationships.find(relationship => relationship.npcId === "grandma");
    expect(grandma).toMatchObject({ trust: 100, respect: 0, love: 44, conflict: 8 });
    expect(grandma?.sharedMemories).toEqual(["kept"]);
    expect(state.relationships).toHaveLength(4);
  });

  it("preserves completed task status when starting other tasks", () => {
    let state = resetDemo();
    state = startDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    state = startDemoQuest(state, "elder-interview");
    expect(state.coopTasks[0].status).toBe("completed");
    expect(state.coopTasks[1].status).toBe("in-progress");
  });

  it("does not complete a pending task or award points", () => {
    const state = resetDemo();
    expect(completeDemoQuest(state, "photo-id")).toBe(state);
  });

  it("sanitizes corrupted coopTasks from storage", () => {
    const values = new Map<string, string>([[
      "niakofa:demo:v2",
      JSON.stringify({
        phase: "coop-quest",
        coopTasks: [
          { questId: "photo-id", status: "completed", assignedTo: "You", completedAt: 123 },
          { questId: "bad", status: "invalid", assignedTo: "X" },
        ],
      }),
    ]]);
    const state = readDemoState({ getItem: key => values.get(key) ?? null });
    expect(state.coopTasks).toHaveLength(4);
    expect(state.coopTasks[0].status).toBe("completed");
    expect(state.coopTasks[0].completedAt).toBe(123);
    expect(state.coopTasks[1].status).toBe("pending");
    expect(state.coopTasks[1].questId).toBe("elder-interview");
  });
});

describe("Journal sanitizer resilience (Task 9)", () => {
  function makeEntry(type: "conversation" | "trait-gain" | "discovery", index: number) {
    return {
      type,
      tag: `${type}-${index}`,
      label: `${type} label ${index}`,
      source: `source-${index}`,
      timestamp: 1_000_000 + index,
    };
  }

  it("drops malformed journal entries (missing tag, bad type) and keeps valid ones", () => {
    const valid = makeEntry("conversation", 1);
    const stored: Record<string, string> = {};
    writeDemoState(
      { setItem: (k, v) => { stored[k] = v; } },
      { ...resetDemo(), journalEntries: [valid] },
    );
    const raw = JSON.parse(stored["niakofa:demo:v2"]);
    raw.journalEntries = [
      valid,
      { type: "bad-type", tag: "x", label: "y", source: "z", timestamp: 1 },
      { type: "conversation", tag: null, label: "y", source: "z", timestamp: 2 },
    ];
    stored["niakofa:demo:v2"] = JSON.stringify(raw);
    const result = readDemoState({ getItem: k => stored[k] ?? null });
    expect(result.journalEntries).toHaveLength(1);
    expect(result.journalEntries[0].tag).toBe(valid.tag);
  });

  it("caps at 200 entries total, preferring conversation over trait-gain", () => {
    // Build 250 entries: 100 trait-gain then 150 conversation (newest at end)
    const entries = [
      ...Array.from({ length: 100 }, (_, i) => makeEntry("trait-gain", i)),
      ...Array.from({ length: 150 }, (_, i) => makeEntry("conversation", 100 + i)),
    ];
    const stored: Record<string, string> = {};
    const state = { ...resetDemo(), journalEntries: [] as typeof entries };
    writeDemoState({ setItem: (k, v) => { stored[k] = v; } }, state);
    const raw = JSON.parse(stored["niakofa:demo:v2"]);
    raw.journalEntries = entries;
    stored["niakofa:demo:v2"] = JSON.stringify(raw);

    const result = readDemoState({ getItem: k => stored[k] ?? null });
    expect(result.journalEntries.length).toBeLessThanOrEqual(200);
    const convCount = result.journalEntries.filter(e => e.type === "conversation").length;
    const traitCount = result.journalEntries.filter(e => e.type === "trait-gain").length;
    // All 150 conversations must be kept; trait-gain fills remaining budget (50).
    expect(convCount).toBe(150);
    expect(traitCount).toBe(50);
  });

  it("preserves journal entries through a storage round-trip unchanged when under 200", () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry("conversation", i));
    const stored: Record<string, string> = {};
    writeDemoState(
      { setItem: (k, v) => { stored[k] = v; } },
      { ...resetDemo(), journalEntries: entries },
    );
    const result = readDemoState({ getItem: k => stored[k] ?? null });
    expect(result.journalEntries).toHaveLength(10);
    expect(result.journalEntries.map(e => e.tag)).toEqual(entries.map(e => e.tag));
  });
});
