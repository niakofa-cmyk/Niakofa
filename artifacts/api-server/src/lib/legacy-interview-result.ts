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
  worldChanges: Array<{
    type: "character" | "place" | "event" | "dialogue" | "quest" | "chapter";
    title: string;
    description: string;
    evidence: "family-reported" | "gameplay-seed";
  }>;
  snapshot: LegacyWorldSnapshot;
}

export interface LegacyWorldSnapshot {
  schemaVersion: 1;
  familyId: number;
  worldVersion: number | null;
  source: "family-reported-interview";
  characters: GeneratedCharacter[];
  locations: Array<{
    id: string;
    label: string;
    evidence: "family-reported";
    status: "discovered";
  }>;
  events: Array<{
    id: string;
    title: string;
    date: string | null;
    evidence: "family-reported";
  }>;
  quests: Array<{
    id: string;
    title: string;
    status: "seeded";
  }>;
  chapters: Array<{
    id: string;
    title: string;
    status: "seeded";
  }>;
  dialogue: Array<{
    id: string;
    text: string;
    status: "unlocked";
  }>;
  discoveries: Array<{
    id: string;
    title: string;
    status: "discovered" | "seeded";
  }>;
  mapChanges: Array<{
    placeId: string;
    label: string;
    status: "revealed";
  }>;
}

function stableSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 56) || "memory";
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
  const firstEvent = extraction.events?.find((event) => event.title)?.title?.trim();
  const subject = firstPlace || firstPerson || firstEvent;
  const suffix = subject ? subject.slice(0, 72) : "the preserved family story";
  const seed = `${input.familyId}-${input.interviewId}-${stableSlug(subject ?? "memory")}`;
  const locations = (extraction.places ?? [])
    .filter((place) => typeof place.label === "string" && place.label.trim())
    .slice(0, 8)
    .map((place) => {
      const label = place.label!.trim().slice(0, 120);
      return {
        id: `place-${input.familyId}-${stableSlug(label)}`,
        label,
        evidence: "family-reported" as const,
        status: "discovered" as const,
      };
    });
  const events = (extraction.events ?? [])
    .filter((event) => typeof event.title === "string" && event.title.trim())
    .slice(0, 10)
    .map((event) => {
      const title = event.title!.trim().slice(0, 160);
      return {
        id: `event-${input.familyId}-${input.interviewId}-${stableSlug(title)}`,
        title,
        date: event.date ?? null,
        evidence: "family-reported" as const,
      };
    });
  const newQuest = subject
    ? {
        id: `interview-seed-${seed}`,
        title: firstPlace ? `Return to ${suffix}` : firstEvent ? `Investigate ${suffix}` : `Trace ${suffix}'s story`,
        reason: "Seeded from a family-reported interview discovery.",
        status: "seeded" as const,
      }
    : null;
  const chapterSeed = subject
    ? {
        id: `chapter-seed-${seed}`,
        title: firstPlace ? `The Place That Remembers: ${suffix}` : firstEvent ? `The Day That Changed the Family: ${suffix}` : `A Story About ${suffix}`,
        reason: "Available for review after the interview evidence is preserved.",
        status: "seeded" as const,
      }
    : null;
  const newDialogue = extraction.keyQuotes?.[0] ?? extraction.summary ?? "";
  const dialogue = newDialogue
    ? [{
        id: `dialogue-${seed}`,
        text: newDialogue,
        status: "unlocked" as const,
      }]
    : [];
  const worldChanges: InterviewWorldRegeneration["worldChanges"] = [
    ...newCharacters.map((character) => ({
      type: "character" as const,
      title: `New person: ${character.name}`,
      description: character.renderStatus === "ready"
        ? "A persistent visual identity is ready for the changed world."
        : "A family-reported person was preserved; appearance awaits explicit age and gender evidence.",
      evidence: "family-reported" as const,
    })),
    ...locations.map((place) => ({
      type: "place" as const,
      title: `New place: ${place.label}`,
      description: "A family-reported location is revealed for map and exploration content.",
      evidence: "family-reported" as const,
    })),
    ...events.map((event) => ({
      type: "event" as const,
      title: `Timeline: ${event.title}`,
      description: event.date ? `Family-reported event dated ${event.date}.` : "A family-reported event was added to the timeline.",
      evidence: "family-reported" as const,
    })),
    ...dialogue.map((line) => ({
      type: "dialogue" as const,
      title: "New dialogue unlocked",
      description: line.text.slice(0, 180),
      evidence: "family-reported" as const,
    })),
    ...(newQuest ? [{
      type: "quest" as const,
      title: newQuest.title,
      description: newQuest.reason,
      evidence: "gameplay-seed" as const,
    }] : []),
    ...(chapterSeed ? [{
      type: "chapter" as const,
      title: chapterSeed.title,
      description: chapterSeed.reason,
      evidence: "gameplay-seed" as const,
    }] : []),
  ];
  const snapshot: LegacyWorldSnapshot = {
    schemaVersion: 1,
    familyId: input.familyId,
    worldVersion: input.worldVersion ?? null,
    source: "family-reported-interview",
    characters: newCharacters,
    locations,
    events,
    quests: newQuest ? [{ id: newQuest.id, title: newQuest.title, status: newQuest.status }] : [],
    chapters: chapterSeed ? [{ id: chapterSeed.id, title: chapterSeed.title, status: chapterSeed.status }] : [],
    dialogue,
    discoveries: [
      ...locations.map((place) => ({ id: place.id, title: place.label, status: "discovered" as const })),
      ...(newQuest ? [{ id: newQuest.id, title: newQuest.title, status: "seeded" as const }] : []),
    ],
    mapChanges: locations.map((place) => ({ placeId: place.id, label: place.label, status: "revealed" as const })),
  };

  return {
    status: "ready",
    worldVersion: input.worldVersion ?? null,
    newCharacters,
    newQuest,
    chapterSeed,
    newDialogue,
    worldChanges,
    snapshot,
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
      worldChanges: [],
      snapshot: {
        schemaVersion: 1,
        familyId: 0,
        worldVersion: null,
        source: "family-reported-interview",
        characters: [],
        locations: [],
        events: [],
        quests: [],
        chapters: [],
        dialogue: [],
        discoveries: [],
        mapChanges: [],
      },
    },
  };
}