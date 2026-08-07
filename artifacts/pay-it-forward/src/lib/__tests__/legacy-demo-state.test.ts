import { describe, it } from "node:test";
import { expect } from "expect";
import {
  advanceDemo,
  chooseDemoTrait,
  completeDemoQuest,
  DEFAULT_DEMO_STATE,
  DEMO_ARTIFACT_IDS,
  DEMO_COOP_QUEST_IDS,
  DEMO_WORLD_CHANGES,
  placeDemoArtifact,
  readDemoState,
  resetDemo,
  startDemoQuest,
  writeDemoState,
} from "../legacy-demo-state";

describe("Legacy public demo journey", () => {
  it("advances through every phase and regenerates the world once", () => {
    let state = resetDemo();
    expect(state.phase).toBe("prologue");

    // Move from prologue to chapter1, then choose Wisdom trait (chapter1 → chapter2)
    state = advanceDemo(state);
    state = chooseDemoTrait(state, "Wisdom", 5);
    expect(state.traits.Wisdom).toBe(40); // 35 + 5

    // Advance through remaining phases until world-regen using advanceDemo
    while (state.phase !== "world-regen") {
      state = advanceDemo(state);
    }
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
      state = completeDemoQuest(state, questId);
    }
    expect(state.completedQuests).toEqual([...DEMO_COOP_QUEST_IDS]);

    // Advance through reunion → finale
    state = advanceDemo(state);
    state = advanceDemo(state);
    expect(state.phase).toBe("finale");
    expect(state.worldVersion).toBe(2);
  });

  it("is idempotent for repeated artifact and quest clicks", () => {
    let state = resetDemo();
    state = placeDemoArtifact(state, "photo");
    state = placeDemoArtifact(state, "photo");
    state = completeDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    expect(state.placedArtifacts).toEqual(["photo"]);
    expect(state.completedQuests).toEqual(["photo-id"]);
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
});

describe("World regeneration", () => {
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
    // Advancing from world-regen WITHOUT all artifacts: no increment
    let state = resetDemo();
    state = { ...state, phase: "world-regen" };
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(1);
    expect(state.phase).toBe("coop-quest");

    // Placing artifacts AFTER leaving world-regen does not retroactively increment
    for (const id of DEMO_ARTIFACT_IDS) {
      state = placeDemoArtifact(state, id);
    }
    expect(state.worldVersion).toBe(1);

    // Advancing from coop-quest (not world-regen) also does not increment
    state = advanceDemo(state);
    expect(state.worldVersion).toBe(1);
    expect(state.phase).toBe("reunion");

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
    state = completeDemoQuest(state, "photo-id");
    expect(state.coopTasks[0].status).toBe("completed");
    expect(state.coopTasks[0].completedAt).not.toBeNull();
    expect(state.completedQuests).toEqual(["photo-id"]);
    expect(state.legacyPoints).toBe(100);
  });

  it("awards bonus 100 points when all tasks are completed", () => {
    let state = resetDemo();
    for (let i = 0; i < DEMO_COOP_QUEST_IDS.length - 1; i++) {
      state = completeDemoQuest(state, DEMO_COOP_QUEST_IDS[i]);
    }
    expect(state.legacyPoints).toBe(300);

    state = completeDemoQuest(state, DEMO_COOP_QUEST_IDS[DEMO_COOP_QUEST_IDS.length - 1]);
    expect(state.legacyPoints).toBe(500);
    expect(state.completedQuests).toHaveLength(4);
  });

  it("does not award points for duplicate quest completion", () => {
    let state = resetDemo();
    state = completeDemoQuest(state, "photo-id");
    state = completeDemoQuest(state, "photo-id");
    expect(state.legacyPoints).toBe(100);
  });

  it("preserves completed task status when starting other tasks", () => {
    let state = resetDemo();
    state = completeDemoQuest(state, "photo-id");
    state = startDemoQuest(state, "elder-interview");
    expect(state.coopTasks[0].status).toBe("completed");
    expect(state.coopTasks[1].status).toBe("in-progress");
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
