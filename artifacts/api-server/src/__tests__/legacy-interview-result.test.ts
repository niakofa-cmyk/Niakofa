import { describe, expect, it } from "@jest/globals";
import { normalizeQuestResult } from "../lib/legacy-interview-result";

describe("normalizeQuestResult", () => {
  it("keeps partial extraction data in the stable gameplay contract", () => {
    expect(normalizeQuestResult("Ama remembers Accra.", {
      people: [{ name: "Ama", relationship: "grandmother", context: "kept the story" }],
      places: [{ label: "Accra" }],
      events: [{ title: "The journey", date: null }],
      traditions: [{ name: "Story night", description: "every Sunday" }],
      keyQuotes: ["Remember where you came from."],
    })).toEqual({
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