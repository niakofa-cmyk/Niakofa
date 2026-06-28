/**
 * Check-in endpoint for Nia
 *
 * Called by api-server's nia-checkin-worker (every hour) to generate Nia's
 * warm 24-hour follow-up message after a request is completed.
 *
 * This is a sync point between the two services:
 * - api-server knows WHEN to check in (completed 23-25 hours ago)
 * - nia-service handles WHAT Nia says (AI-generated, personalized message)
 * - api-server sends the push notification after this returns
 *
 * Flow:
 *  1. Generate unique sessionId for this check-in
 *  2. Call Nia (Claude) to generate a warm follow-up message
 *  3. Save the message to nia_conversations
 *  4. Return 200 (api-server then sends push + marks sent)
 *
 * Auth: Requires x-internal-secret header matching INTERNAL_SECRET env var
 * (service-to-service auth between api-server and nia-service)
 */

import { Router, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";
import { pino } from "pino";

const logger = pino({ level: "info" });
const router = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "";

// BUG-15c FIX: Middleware to verify internal service-to-service secret
function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET) {
    logger.warn("INTERNAL_SECRET not configured — /checkin endpoint will reject all requests");
    return res.status(500).json({ error: "Internal secret not configured" });
  }
  if (secret !== INTERNAL_SECRET) {
    logger.warn({ headerSecret: secret?.toString().slice(0, 4) + "..." }, "checkin: invalid internal secret");
    return res.status(403).json({ error: "Invalid internal secret" });
  }
  next();
}

interface CheckinPayload {
  userId: number;
  requestId: number;
  requestTitle: string;
  category: string;
  helperName?: string | null;
  sessionId: string;
}

router.post("/checkin", verifyInternalSecret, async (req: Request, res: Response) => {
  const body = req.body as unknown;
  if (typeof body !== "object" || !body) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  const payload = body as CheckinPayload;

  // Validate required fields
  const { userId, requestId, requestTitle, category, helperName, sessionId } = payload;
  if (
    typeof userId !== "number" ||
    typeof requestId !== "number" ||
    typeof requestTitle !== "string" ||
    typeof category !== "string" ||
    typeof sessionId !== "string"
  ) {
    return res.status(400).json({
      error: "Missing or invalid fields: userId, requestId, requestTitle, category, sessionId",
    });
  }

  try {
    // 1. Generate Nia's warm check-in message using Claude
    const helperContext = helperName 
      ? `A helper named ${helperName} helped them complete this.` 
      : "No helper was assigned, but the request was completed.";
    
    const userPrompt = `A user just completed a request we posted on Niakofa 24 hours ago.
Request: "${requestTitle}" (category: ${category})
${helperContext}

Generate a warm, genuine 1-2 sentence check-in message. Ask how it went. Be brief and conversational.
No markdown, no emoji, just human warmth.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 150,
      system: NIA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const niaResponse =
      message.content[0]?.type === "text" ? message.content[0].text : "How did it go? I'd love to hear!";

    // 2. Save the message to nia_conversations
    // Use INSERT ... ON CONFLICT to handle any race conditions
    await pool.query(
      `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, is_crisis, created_at)
       VALUES ($1, $2, $3, $4, false, NOW())
       ON CONFLICT (user_id, session_id) DO UPDATE SET
         nia_response = $4,
         updated_at = NOW()`,
      [userId, sessionId, requestTitle, niaResponse]
    );

    logger.info(
      { userId, requestId, sessionId, category },
      "checkin: generated and saved Nia's check-in message"
    );

    return res.status(200).json({
      success: true,
      userId,
      requestId,
      sessionId,
      nia_response: niaResponse,
    });
  } catch (err) {
    logger.error({ err, userId, requestId, sessionId }, "checkin: failed to generate message");
    return res.status(500).json({
      error: "Failed to generate check-in message",
    });
  }
});

export default router;
