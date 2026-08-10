import { buildGeneratedCharacters, type GeneratedCharacter } from "./legacy-character-asset-engine";

export interface InterviewExtraction {
  people?: Array<{
    name?: string;
    relationship?: string;
    context?: string;
    age?: number | null;
    gender?: string | null;
    era?: string | null;
  }>;
  places?: Array<{ label?: string; country?: string; context?: string }>;
  events?: Array<{ title?: string; date?: string | null; description?: string }>;
  traditions?: Array<{ name?: string; description?: string }>;
  emotionalThemes?: string[];
  keyQuotes?: string[];
  summary?: string;
}

export interface InterviewWorldRegeneration {
  status: "ready";
  worldVersion: number | null;
  newCharacters: GeneratedCharacter[];
  newQuest: {
    id: string;
    title: string;
    reason: string;
    status: "seeded";
  } | null;
  chapterSeed: {
    id: string;
    title: string;
    reason: string;
    status: "seeded";
  } | null;
  newDialogue: string;
}

export function buildInterviewWorldRegeneration(input: {
  familyId: number;
  interviewId: number;
  extraction: InterviewExtraction | null | undefined;
  worldVersion?: number | null;
}): InterviewWorldRegeneration {
  const extraction = input.extraction ?? {};
  const newCharacters = buildGeneratedCharacters({
    familyId: input.familyId,
    interviewId: input.interviewId,
    people: extraction.people ?? [],
  });
  const firstPlace = extraction.places?.find((place) => place.label)?.label?.trim();
  const firstPerson = extraction.people?.find((person) => person.name)?.name?.trim();
  const subject = firstPlace || firstPerson;
  const suffix = subject ? subject.slice(0, 72) : "the preserved family story";
  const seed = `${input.familyId}-${input.interviewId}-${subject?.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "memory"}`;

  return {
    status: "ready",
    worldVersion: input.worldVersion ?? null,
    newCharacters,
    newQuest: subject
      ? {
          id: `interview-seed-${seed}`,
          title: firstPlace ? `Return to ${suffix}` : `Trace ${suffix}'s story`,
          reason: "Seeded from a family-reported interview discovery.",
          status: "seeded",
        }
      : null,
    chapterSeed: subject
      ? {
          id: `chapter-seed-${seed}`,
          title: firstPlace ? `The Place That Remembers: ${suffix}` : `A Story About ${suffix}`,
          reason: "Available for review after the interview evidence is preserved.",
          status: "seeded",
        }
      : null,
    newDialogue: extraction.keyQuotes?.[0] ?? extraction.summary ?? "",
  };
}

/**
 * Keep the UI contract stable even when AI extraction is partial or unavailable.
 * Family facts remain explicitly sourced from the transcript/extraction; this
 * function does not infer relationships, identity, or visual appearance.
 */
export function normalizeQuestResult(
  transcript: string | null,
  extraction: InterviewExtraction | null | undefined,
  worldRegeneration?: InterviewWorldRegeneration,
) {
  const people = extraction?.people ?? [];
  const places = extraction?.places ?? [];
  const events = extraction?.events ?? [];
  const quotes = extraction?.keyQuotes ?? [];

  return {
    transcript: transcript ?? "",
    extractedFacts: [
      ...people.filter((person) => person.name).map((person) => ({
        fact: `${person.name}${person.relationship ? ` · ${person.relationship}` : ""}${person.context ? ` — ${person.context}` : ""}`,
        type: "person",
        confidence: 0.8,
      })),
      ...(extraction?.traditions ?? []).filter((tradition) => tradition.name).map((tradition) => ({
        fact: `${tradition.name}${tradition.description ? ` — ${tradition.description}` : ""}`,
        type: "tradition",
        confidence: 0.75,
      })),
    ],
    newPlaces: places.filter((place) => place.label).map((place) => String(place.label)),
    newEvents: events.filter((event) => event.title).map((event) => ({
      title: String(event.title),
      date: event.date ?? null,
    })),
    newPeople: people.filter((person) => person.name).map((person) => String(person.name)),
    dialogueSnippet: quotes[0] ?? extraction?.summary ?? "",
    chapterUnlocked: false,
    achievementGenerated: null,
    worldRegeneration: worldRegeneration ?? {
      status: "ready",
      worldVersion: null,
      newCharacters: [],
      newQuest: null,
      chapterSeed: null,
      newDialogue: quotes[0] ?? extraction?.summary ?? "",
    },
  };
}