/**
 * Niakofa — Legacy Mode: real-world historical context
 *
 * The Legacy Mode design docs call for THREE knowledge classifications, not
 * two — this module builds the one that was still missing:
 *
 *   VERIFIED FAMILY HISTORY     — a documented fact from this family's vault
 *   HISTORICAL CONTEXT          — real, general historical background for
 *                                 the place/era (this module)
 *   NARRATIVE INTERPRETATION    — AI-imagined texture for undocumented detail
 *
 * Before this, legacy-chapters.ts only ever emitted the first and third —
 * "historical context" existed in the design docs but nowhere in the code.
 *
 * Hard rule, same trust model as everywhere else in Legacy Mode: this must
 * NEVER assert anything about the specific family. It answers "what was
 * generally true of this place and time", not "what happened to your
 * ancestor" — that distinction is enforced in the prompt below and the
 * result is always rendered under its own clearly-labeled layer, never
 * merged into "verified".
 *
 * Historical facts about a place/decade don't change, so results are cached
 * for a long time (30 days) and — importantly — the cache key is NOT
 * per-family. "Detroit, 1950s" is the same lookup for every family whose
 * history passes through it, so this also means the very first family to
 * ask about a given place/era pays the AI cost and every family after
 * doesn't.
 */

import { cacheGet, cacheSet } from "./cache";
import { logger } from "./logger";

export interface HistoricalContext {
  /** 1-2 sentence grounding paragraph, safe to render directly under the chapter. */
  summary: string;
  /** 3-5 short factual topic tags (e.g. "Great Migration", "Textile mill closures"). */
  topics: string[];
}

const CONTEXT_TTL = 30 * 24 * 60 * 60; // 30 days — real history doesn't change

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const cacheKeyFor = (location: string, era: string) =>
  `legacy:historical-context:v1:${normalize(location)}:${normalize(era)}`;

/**
 * Looks up real-world historical context for a place + era. Returns null
 * (never throws) if location/era are unknown, the AI isn't configured, or
 * the lookup fails for any reason — this is enrichment, not a critical
 * path, and a chapter must still be fully playable without it.
 */
export async function getHistoricalContext(params: {
  location: string;
  era: string;
  country?: string | null;
}): Promise<HistoricalContext | null> {
  const { location, era, country } = params;

  if (!location || location === "Unknown" || !era || era === "Unknown") {
    return null;
  }

  const key = cacheKeyFor(location, era);
  const cached = await cacheGet<HistoricalContext>(key);
  if (cached) return cached;

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({ apiKey });

    const place = country ? `${location}, ${country}` : location;

    const message = await anthropic.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 500,
      system:
        "You are a historical reference tool for Niakofa's Legacy Mode, a family-history game. " +
        "Given a place and a year or decade, provide well-documented, general historical " +
        "context for that place and time — economic conditions, major social movements, " +
        "migration patterns, schools, transportation, or culture that were broadly true of " +
        "that place and era. " +
        "CRITICAL RULES: " +
        "(1) You know NOTHING about any specific family and must never invent or imply a " +
        "specific person's actions, decisions, or experiences. Write about the place and " +
        "era in general, the way a textbook or museum placard would — never 'your ancestor' " +
        "or 'the family'. " +
        "(2) Only include well-established historical facts. If you are not confident " +
        "something is accurate for this specific place and era, omit it rather than guess. " +
        "(3) Respond with ONLY a JSON object, no markdown fences, no preamble, in exactly " +
        "this shape: " +
        '{"summary": "1-2 sentence overview", "topics": ["short topic", "short topic", "short topic"]}',
      messages: [{ role: "user", content: `Place: ${place}\nEra: ${era}` }],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : null;
    if (!raw) return null;

    const parsed = JSON.parse(raw.trim()) as Partial<HistoricalContext>;
    if (!parsed.summary || !Array.isArray(parsed.topics)) return null;

    const result: HistoricalContext = {
      summary: String(parsed.summary).slice(0, 500),
      topics:  parsed.topics.slice(0, 5).map(t => String(t).slice(0, 60)),
    };

    await cacheSet(key, result, CONTEXT_TTL);
    return result;
  } catch (err) {
    logger.warn({ err, location, era }, "historical-context: lookup failed, omitting from scene");
    return null;
  }
}
