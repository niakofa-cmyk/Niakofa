/**
 * Internal route: generates plausible neighborhood content for a city using
 * Claude, so non-Fort-Worth deployments aren't stuck with empty or
 * hardcoded-wrong "Neighborhood Circles" content. Protected by a shared
 * secret (the same SESSION_SECRET api-server uses for auth tokens) rather
 * than left public — this calls the Anthropic API per miss, and an
 * unauthenticated public endpoint that triggers paid model calls is a cost
 * and abuse vector.
 *
 * IMPORTANT: this is flavor/orientation content, not verified local fact —
 * api-server stores everything generated here as unverified and surfaces it
 * to admins for review/correction before treating it as authoritative.
 */
import type { Request, Response } from "express";
import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { pino } from "pino";

const logger = pino({ level: "info" });
const router = Router();

// HIGH-003: INTERNAL_SECRET must be explicitly set — never fall back to SESSION_SECRET.
// If INTERNAL_SECRET is missing, the route fails closed (500) instead of using the
// session-signing secret, which would let a compromised session secret bypass
// internal-service auth. This aligns with crisis-resources.ts.
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  logger.error(
    "FATAL: INTERNAL_SECRET is not set on nia-service. " +
    "Generate-neighborhoods endpoint will reject all requests. " +
    "Set INTERNAL_SECRET in Railway → nia-service → Variables. " +
    "It must be DIFFERENT from SESSION_SECRET."
  );
}

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface GeneratedNeighborhood {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  const header = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET || header !== INTERNAL_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post("/generate-neighborhoods", requireInternalSecret, async (req: Request, res: Response) => {
  const { city } = req.body as { city?: string };
  if (!city || typeof city !== "string" || city.trim().length < 2) {
    return res.status(400).json({ error: "city is required" });
  }
  if (!anthropic) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const prompt = `List 6 to 9 real, well-known neighborhoods or districts of ${city.trim()}.
For each, give a short single-sentence description (under 100 characters) of its character or what it's known for, and one representative emoji.
Use your general knowledge of the city — these should be neighborhoods that actually exist, not invented ones.
Return ONLY a JSON array, no markdown fences, no preamble, in this exact shape:
[{"id": "snake_case_id", "name": "Display Name", "emoji": "🏙️", "description": "Short description."}]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed: unknown = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) throw new Error("Response was not an array");

    const neighborhoods: GeneratedNeighborhood[] = parsed
      .filter((n): n is GeneratedNeighborhood =>
        n && typeof n === "object" &&
        typeof (n as Record<string, unknown>).id === "string" &&
        typeof (n as Record<string, unknown>).name === "string" &&
        typeof (n as Record<string, unknown>).description === "string"
      )
      .slice(0, 9)
      .map((n) => ({
        id: n.id,
        name: n.name,
        emoji: typeof n.emoji === "string" && n.emoji ? n.emoji : "📍",
        description: n.description.slice(0, 150),
      }));

    if (neighborhoods.length === 0) throw new Error("No valid neighborhoods parsed");

    logger.info({ city, count: neighborhoods.length }, "generated neighborhoods for city");
    return res.json({ neighborhoods });
  } catch (err) {
    logger.error({ err, city }, "neighborhood generation failed");
    return res.status(502).json({ error: "Generation failed" });
  }
});

export default router;
