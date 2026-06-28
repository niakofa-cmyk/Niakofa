/**
 * Nia Memory System — Enhanced
 *
 * Changes from original:
 *  1. Location context injected into extraction prompt
 *  2. Extraction gated on message length + signal words (avoids wasting tokens on trivial exchanges)
 *  3. Deduplication: skips writing if same preference already stored (keyword overlap check)
 *  4. Memory stored with created_at + confidence score
 *  5. Memory reads sorted by recency (most recent wins on conflict)
 *  6. 90-day soft TTL: stale memories flagged but not deleted (user can review)
 */

import { db } from "../lib/db";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  key: string;          // e.g. "food_preference", "mobility_needs"
  value: string;        // e.g. "prefers vegetarian options"
  confidence: number;   // 0–1, from Nia's extraction prompt
  location_context: string | null;  // e.g. "Fort Worth, TX" or null
  created_at: string;
  updated_at: string;
}

export interface ExtractMemoryOptions {
  userId: number;
  userMessage: string;
  assistantMessage: string;
  locationContext?: string | null;  // city / neighborhood from user session
}

// ─── Signal detection — skip extraction for trivial messages ──────────────────

const SIGNAL_PATTERNS = [
  /\bi (prefer|like|love|hate|always|never|usually|need|want|don'?t|can'?t)\b/i,
  /\bmy (preference|diet|allergy|disability|schedule|budget|language)\b/i,
  /\bremember (that|me|this|when)\b/i,
  /\bi'?m (vegetarian|vegan|diabetic|deaf|blind|allergic|a senior)\b/i,
  /\bplease (always|never|don'?t)\b/i,
];

const MIN_MESSAGE_LENGTH = 60; // characters

function shouldExtract(userMessage: string): boolean {
  if (userMessage.length < MIN_MESSAGE_LENGTH) return false;
  return SIGNAL_PATTERNS.some((p) => p.test(userMessage));
}

// ─── Deduplication check ──────────────────────────────────────────────────────

function keywordOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(s.toLowerCase().match(/\b\w{4,}\b/g) ?? []);
  const wa = words(a);
  const wb = words(b);
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size, 1);
}

// ─── Core extraction ──────────────────────────────────────────────────────────

export async function extractAndUpdateMemory({
  userId,
  userMessage,
  assistantMessage,
  locationContext,
}: ExtractMemoryOptions): Promise<void> {
  // Gate: skip trivial exchanges
  if (!shouldExtract(userMessage)) {
    logger.debug({ userId }, "Memory extraction skipped — no signal detected");
    return;
  }

  // Load existing memories for dedup context
  const existingRows = await db.query<MemoryEntry>(
    `SELECT key, value, confidence, created_at
     FROM nia_user_memory
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 50`,
    [userId]
  );
  const existing = existingRows.rows;

  const locationLine = locationContext
    ? `The user's current location context is: ${locationContext}.`
    : "";

  const existingMemorySummary =
    existing.length > 0
      ? `Existing known preferences:\n${existing.map((m) => `- ${m.key}: ${m.value}`).join("\n")}`
      : "No existing preferences on file.";

  const extractionPrompt = `You are a memory extraction assistant for Nia, a community helper AI.

${locationLine}

${existingMemorySummary}

Analyze the conversation below and extract any durable user preferences, needs, or facts worth remembering.
Only extract things that are stable over time (not one-time requests).
Skip anything already covered in the existing preferences.
Return ONLY a JSON array. Each item: { "key": string, "value": string, "confidence": number (0.0–1.0) }
Return [] if nothing new is worth storing.

User message: """${userMessage}"""
Assistant response: """${assistantMessage.slice(0, 800)}"""

JSON array only, no markdown:`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // fast + cheap for extraction
        max_tokens: 512,
        messages: [{ role: "user", content: extractionPrompt }],
      }),
    });

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const raw = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    let entries: Array<{ key: string; value: string; confidence: number }> = [];
    try {
      entries = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      logger.warn({ userId, raw }, "Memory extraction — failed to parse JSON");
      return;
    }

    if (!Array.isArray(entries) || entries.length === 0) return;

    const now = new Date().toISOString();

    for (const entry of entries) {
      if (!entry.key || !entry.value || typeof entry.confidence !== "number") continue;
      if (entry.confidence < 0.5) continue; // skip low-confidence extractions

      // Dedup: check overlap with any existing memory for same key or value
      const duplicate = existing.find(
        (m) =>
          m.key === entry.key ||
          keywordOverlap(m.value, entry.value) > 0.7
      );
      if (duplicate) {
        // Only update if new confidence is higher
        if (entry.confidence <= (duplicate.confidence ?? 0)) {
          logger.debug({ userId, key: entry.key }, "Memory dedup — skipping lower-confidence repeat");
          continue;
        }
      }

      await db.query(
        `INSERT INTO nia_user_memory
           (user_id, key, value, confidence, location_context, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (user_id, key)
         DO UPDATE SET
           value = EXCLUDED.value,
           confidence = EXCLUDED.confidence,
           location_context = COALESCE(EXCLUDED.location_context, nia_user_memory.location_context),
           updated_at = EXCLUDED.updated_at`,
        [
          userId,
          entry.key,
          entry.value,
          entry.confidence,
          locationContext ?? null,
          now,
        ]
      );

      logger.info(
        { userId, key: entry.key, confidence: entry.confidence },
        "Memory updated"
      );
    }
  } catch (err) {
    // Memory extraction errors should never crash the main response
    logger.error({ err, userId }, "Memory extraction error — non-fatal");
  }
}

// ─── Memory read — for injecting into Nia context ────────────────────────────

const STALENESS_DAYS = 90;

export async function getUserMemory(userId: number): Promise<MemoryEntry[]> {
  const result = await db.query<MemoryEntry>(
    `SELECT key, value, confidence, location_context, created_at, updated_at
     FROM nia_user_memory
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );

  const cutoff = Date.now() - STALENESS_DAYS * 24 * 60 * 60 * 1000;

  return result.rows.map((row) => ({
    ...row,
    // Surface staleness so caller can decide whether to include in prompt
    _stale: new Date(row.updated_at).getTime() < cutoff,
  }));
}

// ─── Format memory for Nia system prompt ─────────────────────────────────────

export function formatMemoryForPrompt(
  memories: MemoryEntry[],
  locationContext?: string | null
): string {
  const fresh = memories.filter((m) => !(m as any)._stale);
  if (fresh.length === 0) return "";

  const locationLine = locationContext
    ? `User's current location: ${locationContext}\n`
    : "";

  const lines = fresh
    .map((m) => {
      const locHint =
        m.location_context && m.location_context !== locationContext
          ? ` (noted near ${m.location_context})`
          : "";
      return `- ${m.key}: ${m.value}${locHint}`;
    })
    .join("\n");

  return `${locationLine}Known user preferences:\n${lines}`;
}
