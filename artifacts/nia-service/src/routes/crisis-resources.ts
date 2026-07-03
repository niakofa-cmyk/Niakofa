/**
 * Internal route: uses Claude to suggest real local emergency contacts for a
 * US region. Protected by X-Internal-Secret — same pattern as neighborhoods.
 *
 * IMPORTANT: output is SUGGESTIONS ONLY. api-server stores them as
 * nia_suggested=true and surfaces them to admins pre-filled in the edit form.
 * An admin must review, correct, and hit "Save & Verify" before users ever
 * see local contacts. Claude can hallucinate phone numbers — never auto-publish.
 */
import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { pino } from "pino";
import { timingSafeEqual } from "crypto";

const logger = pino({ level: "info" });
const router = Router();

// HIGH-003: INTERNAL_SECRET must be explicitly set — never fall back to SESSION_SECRET.
// If INTERNAL_SECRET is missing, the route returns 500 instead of silently using
// the session-signing secret (which would let a compromised session secret bypass
// internal-service auth). This is defense-in-depth: the two secrets must rotate
// independently.
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  logger.error(
    "FATAL: INTERNAL_SECRET is not set on nia-service. " +
    "Crisis resource suggestion endpoint will reject all requests. " +
    "Set INTERNAL_SECRET in Railway → nia-service → Variables. " +
    "It must be DIFFERENT from SESSION_SECRET."
  );
}

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface SuggestedResource {
  label: string;
  phone?: string;
  url?: string;
}

// HIGH-003: Constant-time comparison to prevent timing attacks.
// The previous implementation used `header !== INTERNAL_SECRET` which is
// vulnerable to timing analysis. We now use Node's timingSafeEqual with
// explicit length check — same pattern as nia-service/src/lib/auth.ts.
function requireInternalSecret(req: Request, res: Response, next: () => void): void {
  const header = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET || typeof header !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Length check first — timingSafeEqual throws if buffers differ in length.
  if (header.length !== INTERNAL_SECRET.length) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const headerBuf = Buffer.from(header, "utf8");
    const secretBuf = Buffer.from(INTERNAL_SECRET, "utf8");
    if (!timingSafeEqual(headerBuf, secretBuf)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.post("/suggest-crisis-resources", requireInternalSecret, async (req: Request, res: Response) => {
  const { region } = req.body as { region?: string };
  if (!region || typeof region !== "string" || region.trim().length < 2) {
    return res.status(400).json({ error: "region is required" });
  }
  if (!anthropic) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const prompt = `You are helping pre-fill an emergency contacts form for the region: "${region.trim()}".

List 4 to 6 real emergency and crisis resources for this region. Always include:
1. Emergency services (911)
2. The local United Way 211 line if it serves this area
3. SAMHSA National Helpline (1-800-662-4357)
4. 988 Suicide & Crisis Lifeline
5. Any county-specific emergency management office phone number you know for this region
6. Local Red Cross chapter URL if you know it

Use only resources you are confident exist. If you are not sure of a specific local number, omit it rather than guess — the national resources (911, 211, 988, SAMHSA) are always safe to include.

Return ONLY a JSON array, no markdown, no preamble:
[{"label":"Display Label","phone":"number or omit","url":"https://... or omit"}]

Rules:
- Every item needs a label
- Every item needs either phone or url (not both required)
- Phone numbers in format: 911, 211, 988, 1-800-XXX-XXXX, or XXX-XXX-XXXX
- Do not invent local numbers you are not confident about`;

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

    const resources: SuggestedResource[] = parsed
      .filter((r): r is SuggestedResource =>
        r && typeof r === "object" &&
        typeof (r as Record<string, unknown>).label === "string" &&
        ((r as Record<string, unknown>).phone !== undefined || (r as Record<string, unknown>).url !== undefined)
      )
      .slice(0, 8)
      .map((r) => ({
        label: r.label,
        ...(r.phone ? { phone: String(r.phone) } : {}),
        ...(r.url ? { url: String(r.url) } : {}),
      }));

    if (resources.length === 0) throw new Error("No valid resources parsed");

    logger.info({ region, count: resources.length }, "suggested crisis resources for region");
    return res.json({ resources, note: "Suggested by Nia — verify all contacts before publishing." });
  } catch (err) {
    logger.error({ err, region }, "crisis resource suggestion failed");
    return res.status(502).json({ error: "Suggestion failed" });
  }
});

export default router;
// cache bust Tue Jun 23 16:45:43 CDT 2026
// v1782252773
