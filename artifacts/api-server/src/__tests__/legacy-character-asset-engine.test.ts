import { describe, expect, it } from "@jest/globals";
import { buildGeneratedCharacters } from "../lib/legacy-character-asset-engine";

describe("Legacy generated character asset engine", () => {
  it("is deterministic and emits only approved TV asset IDs", () => {
    const input = {
      familyId: 12,
      interviewId: 34,
      people: [{
        name: "Ama Mensah",
        relationship: "grandmother",
        context: "kept the Sunday stories",
        age: 72,
        gender: "female",
        era: "1970s",
      }],
    };

    const first = buildGeneratedCharacters(input);
    const second = buildGeneratedCharacters(input);

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      characterId: expect.stringMatching(/^npc-12-ama-mensah-/),
      evidence: "family-reported",
      renderStatus: "ready",
      appearance: {
        schemaVersion: 1,
        representation: "TV",
        runtime: "approved",
        ageGroup: "adult",
        gender: "female",
        lifeStage: "elder",
        layers: {
          body: "tv_body_female_base",
          clothing: expect.stringMatching(/^tv_clothing_female_p0[234]$/),
          rearHair: expect.stringMatching(/^tv_rear_hair_female_p0[234]$/),
          frontHair: expect.stringMatching(/^tv_front_hair_female_p0[234]$/),
        },
      },
    });
  });

  it("keeps appearance pending when age or gender is not explicit", () => {
    expect(buildGeneratedCharacters({
      familyId: 12,
      interviewId: 34,
      people: [{ name: "The ancestor", relationship: "ancestor" }],
    })).toMatchObject([{
      name: "The ancestor",
      evidence: "family-reported",
      renderStatus: "pending_verified_appearance",
      appearance: null,
    }]);
  });
});