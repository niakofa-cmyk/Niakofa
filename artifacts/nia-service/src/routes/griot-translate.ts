/**
 * Griot story translation-drafting endpoint
 *
 * Called by api-server's griot-transcription-worker once a story has
 * text_content (either typed directly, or produced by the worker's
 * transcribeAudio() step, which calls OpenAI Whisper — see that function
 * for details). This endpoint does NOT transcribe audio itself: Claude's
 * API takes text, image, and PDF input, not raw audio, so speech-to-text
 * is handled upstream by Whisper before this endpoint ever runs. What this
 * endpoint actually does is the part Claude is well-suited for: drafting a
 * translation into each target language once real text_content exists.
 *
 * Auth: x-internal-secret, same as /checkin — service-to-service only,
 * never called from the client.
 *
 * Flow:
 *  1. Validate payload
 *  2. For each target language, ask Claude for a faithful, warm translation
 *  3. Upsert into story_translations (nia_draft_text) — recorder_approved
 *     stays false; a human still has to approve before it's shown as final
 *     (existing PATCH /griot/stories/:id/translations/:lang/approve route)
 *  4. Return the drafts so the worker can log/verify
 */

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../lib/db.js";
import { pino } from "pino";

const logger = pino({ level: "info" });
const router = Router();

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;
if (!INTERNAL_SECRET) {
  logger.error(
    "FATAL: INTERNAL_SECRET is not set on nia-service. " +
    "/griot/translate will reject all requests until it is configured."
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

// Default target languages for a new draft batch when the caller doesn't
// specify a subset. Kept short — this is a draft pass, not a full localization
// pipeline, and every language here costs one Claude call.
const DEFAULT_TARGET_LANGUAGES = ["es", "fr", "pt", "ht"] as const;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  ht: "Haitian Creole", sw: "Swahili", yo: "Yoruba",
};

function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET || typeof secret !== "string") {
    logger.warn("griot/translate: INTERNAL_SECRET not configured or missing header — rejecting");
    res.status(500).json({ error: "Internal secret not configured" });
    return;
  }
  if (secret !== INTERNAL_SECRET) {
    logger.warn("griot/translate: invalid internal secret");
    res.status(403).json({ error: "Invalid internal secret" });
    return;
  }
  next();
}

interface TranslatePayload {
  storyId: number;
  textContent: string;
  sourceLanguage: string;
  targetLanguages?: string[];
}

router.post("/griot/translate", verifyInternalSecret, async (req: Request, res: Response) => {
  const body = req.body as unknown;
  if (typeof body !== "object" || !body) {
    return res.status(400).json({ error: "Invalid request body" });
  }
  const { storyId, textContent, sourceLanguage, targetLanguages } = body as TranslatePayload;

  if (
    typeof storyId !== "number" ||
    typeof textContent !== "string" ||
    !textContent.trim() ||
    typeof sourceLanguage !== "string"
  ) {
    return res.status(400).json({
      error: "Missing or invalid fields: storyId, textContent, sourceLanguage",
    });
  }

  const targets = (targetLanguages?.length ? targetLanguages : [...DEFAULT_TARGET_LANGUAGES])
    .filter((lang) => lang !== sourceLanguage);

  const drafts: { language: string; text: string | null; error?: string }[] = [];

  for (const lang of targets) {
    const langName = LANGUAGE_NAMES[lang] ?? lang;
    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system:
          "You translate oral-history story transcripts for Niakofa's Griot Stories archive. " +
          "Preserve voice, tone, and idiom as faithfully as possible rather than translating " +
          "literally word-for-word. Output ONLY the translated text — no preamble, no notes, " +
          "no quotation marks around the whole thing.",
        messages: [{
          role: "user",
          content: `Translate the following story into ${langName}:\n\n${textContent}`,
        }],
      });

      const draftText = message.content[0]?.type === "text" ? message.content[0].text : null;
      if (!draftText) throw new Error("empty translation response");

      // Upsert: one row per (story_id, language) — see UNIQUE(story_id, language)
      // on story_translations. Re-running a draft (e.g. worker retry) should
      // overwrite nia_draft_text, never touch a human's edited_text/approval.
      await pool.query(
        `INSERT INTO story_translations (story_id, language, nia_draft_text, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (story_id, language)
         DO UPDATE SET nia_draft_text = EXCLUDED.nia_draft_text, updated_at = NOW()
         WHERE story_translations.recorder_approved = FALSE`,
        [storyId, lang, draftText]
      );

      drafts.push({ language: lang, text: draftText });
      logger.info({ storyId, lang }, "griot/translate: draft saved");
    } catch (err) {
      logger.error({ err, storyId, lang }, "griot/translate: failed for language");
      drafts.push({ language: lang, text: null, error: "translation failed" });
      // Continue to the next language — one failure shouldn't sink the batch.
    }
  }

  const anyFailed = drafts.some((d) => d.error);
  return res.status(anyFailed ? 207 : 200).json({ storyId, drafts });
});

export default router;
