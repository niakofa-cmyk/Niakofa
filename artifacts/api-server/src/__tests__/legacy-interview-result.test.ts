import { describe, expect, it } from "@jest/globals";
import {
  buildInterviewWorldRegeneration,
  normalizeQuestResult,
} from "../lib/legacy-interview-result";

describe("normalizeQuestResult", () => {
  it("keeps partial extraction data in the stable gameplay contract", () => {
    expect(normalizeQuestResult("Ama remembers Accra.", {
      people: [{ name: "Ama", relationship: "grandmother", context: "kept the story" }],
      places: [{ label: "Accra" }],
      events: [{ title: "The journey", date: null }],
      traditions: [{ name: "Story night", description: "every Sunday" }],
      keyQuotes: ["Remember where you came from."],
    })).toMatchObject({
      transcript: "Ama remembers Accra.",
      extractedFacts: [
        { fact: "Ama · grandmother — kept the story", type: "person", confidence: 0.8 },
        { fact: "Story night — every Sunday", type: "tradition", confidence: 0.75 },
      ],
      newPlaces: ["Accra"],
      newEvents: [{ title: "The journey", date: null }],
      newPeople: ["Ama"],
      dialogueSnippet: "Remember where you came from.",
      chapterUnlocked: false,
      achievementGenerated: null,
    });
    const extraction = {
      people: [{ name: "Ama", relationship: "grandmother", context: "kept the story", age: 72, gender: "female", era: "present" }],
      places: [{ label: "Accra" }],
      keyQuotes: ["Remember where you came from."],
    };
    expect(normalizeQuestResult(
      "Ama remembers Accra.",
      extraction,
      buildInterviewWorldRegeneration({
        familyId: 7,
        interviewId: 19,
        extraction,
      }),
    ).worldRegeneration).toMatchObject({
      status: "ready",
      worldVersion: null,
      newCharacters: [{
        name: "Ama",
        renderStatus: "ready",
        appearance: {
          characterId: expect.stringContaining("npc-7-ama-"),
          layers: {
            body: "tv_body_female_base",
          },
        },
      }],
      newQuest: { status: "seeded" },
      chapterSeed: { status: "seeded" },
    });
  });

  it("falls back safely when AI extraction is unavailable", () => {
    expect(normalizeQuestResult("Typed transcript", null)).toMatchObject({
      transcript: "Typed transcript",
      extractedFacts: [],
      newPlaces: [],
      newEvents: [],
      newPeople: [],
      dialogueSnippet: "",
    });
  });
});