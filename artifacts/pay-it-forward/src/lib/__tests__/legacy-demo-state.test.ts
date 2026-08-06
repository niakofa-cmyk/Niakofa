import { describe, it } from "node:test";
import { expect } from "expect";
import {
  advanceDemo,
  chooseDemoTrait,
  completeDemoQuest,
  DEFAULT_DEMO_STATE,
  DEMO_ARTIFACT_IDS,
  DEMO_COOP_QUEST_IDS,
  placeDemoArtifact,
  readDemoState,
  resetDemo,
  writeDemoState,
} from "../legacy-demo-state";

describe("Legacy public demo journey", () => {
  it("advances through every phase and regenerates the world once", () => {
    let state = resetDemo();
    expect(state.phase).toBe("prologue");

    state = advanceDemo(state);
    for (const trait of ["Wisdom", "Leadership", "Courage", "Compassion", "Community", "Memory"]) {
      state = chooseDemoTrait(state, trait, 5);
    }
    expect(state.phase).toBe("world-regen");

    for (const artifactId of DEMO_ARTIFACT_IDS) {
      state = placeDemoArtifact(state, artifactId);
    }
    expect(state.placedArtifacts).toEqual([...DEMO_ARTIFACT_IDS]);

    state = advanceDemo(state);
    for (const questId of DEMO_COOP_QUEST_IDS) {
      state = completeDemoQuest(state, questId);
    }
    expect(state.completedQuests).toEqual([...DEMO_COOP_QUEST_IDS]);

    state = advanceDemo(state);
    expect(state.phase).toBe("finale");
    expect(state.worldVersion).toBe(2);
    expect(state.traits.Wisdom).toBe(40);
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
