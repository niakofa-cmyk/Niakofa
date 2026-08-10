export interface InterviewExtraction {
  people?: Array<{ name?: string; relationship?: string; context?: string }>;
  places?: Array<{ label?: string; country?: string; context?: string }>;
  events?: Array<{ title?: string; date?: string | null; description?: string }>;
  traditions?: Array<{ name?: string; description?: string }>;
  emotionalThemes?: string[];
  keyQuotes?: string[];
  summary?: string;
}

/**
 * Keep the UI contract stable even when AI extraction is partial or unavailable.
 * Family facts remain explicitly sourced from the transcript/extraction; this
 * function does not infer relationships, identity, or visual appearance.
 */
export function normalizeQuestResult(
  transcript: string | null,
  extraction: InterviewExtraction | null | undefined,
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
  };
}