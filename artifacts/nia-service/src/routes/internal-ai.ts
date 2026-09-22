import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { pino } from "pino";
import { isNiaEnabled } from "../lib/db.js";

const router = Router();
const logger = pino({ level: "info" });
const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] ?? "" });

function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const configured = process.env["INTERNAL_SECRET"] ?? "";
  const supplied = req.headers["x-internal-secret"];
  const candidate = Array.isArray(supplied) ? supplied[0] : supplied ?? "";
  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(candidate, "utf8");

  if (!configured) {
    res.status(503).json({ error: "Service not configured" });
    return;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese (Brazilian)",
  ht: "Haitian Creole",
  sw: "Swahili",
  yo: "Yoruba",
  am: "Amharic",
  ar: "Arabic",
  ha: "Hausa",
  ig: "Igbo",
};

async function requireEnabled(res: Response): Promise<boolean> {
  try {
    if (await isNiaEnabled()) return true;
  } catch {
    // The kill switch is fail-closed.
  }
  res.status(503).json({ error: "Nia is temporarily unavailable." });
  return false;
}

router.post("/internal/translate", requireInternalSecret, async (req, res) => {
  if (!(await requireEnabled(res))) return;
  const body = req.body as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 8_000) : "";
  const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
  if (!text || !targetLanguage || !LANGUAGE_NAMES[targetLanguage]) {
    return res.status(400).json({ error: "text and a supported targetLanguage are required" });
  }

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system:
        "You are Nia, Niakofa's AI guide for Community, Diaspora, and Legacy. " +
        "Translate family oral history while preserving the speaker's voice, warmth, " +
        "cultural idioms, and emotional authenticity. Output only the translated text.",
      messages: [{
        role: "user",
        content: `Translate this oral history into ${LANGUAGE_NAMES[targetLanguage]}:\n\n${text}`,
      }],
    });
    const translated = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!translated) return res.status(502).json({ error: "Translation returned no text" });
    return res.json({ translated, targetLanguage, langName: LANGUAGE_NAMES[targetLanguage] });
  } catch (error) {
    logger.error({ err: error, targetLanguage }, "internal-ai: translation failed");
    return res.status(502).json({ error: "Translation failed" });
  }
});

const ALLOWED_LEGACY_MODELS = new Set([
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-7-sonnet-latest",
]);

router.post("/internal/legacy-generate", requireInternalSecret, async (req, res) => {
  if (!(await requireEnabled(res))) return;
  const body = req.body as Record<string, unknown>;
  const system = typeof body.system === "string" ? body.system.slice(0, 12_000) : "";
  const userPrompt = typeof body.userPrompt === "string" ? body.userPrompt.slice(0, 30_000) : "";
  const model = typeof body.model === "string" && ALLOWED_LEGACY_MODELS.has(body.model)
    ? body.model
    : "claude-3-5-haiku-20241022";
  const maxTokens = typeof body.maxTokens === "number" && Number.isInteger(body.maxTokens)
    ? Math.min(Math.max(body.maxTokens, 1), 4_000)
    : 400;
  if (!system || !userPrompt) return res.status(400).json({ error: "system and userPrompt are required" });

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return res.json({
      content,
      model,
      metadata: { stop_reason: response.stop_reason, usage: response.usage },
    });
  } catch (error) {
    logger.error({ err: error, model }, "internal-ai: legacy generation failed");
    return res.status(502).json({ error: "AI generation failed" });
  }
});

export default router;