/**
 * Internal Nia check-in trigger endpoint.
 * Auth: requires x-internal-secret header matching INTERNAL_SECRET env var
 * (service-to-service auth, called by the nia-checkin-worker).
 */
import { Router, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger";

const router = Router();

function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SECRET;
  const provided = req.headers["x-internal-secret"];
  if (!expected || provided !== expected) {
    res.status(403).json({ error: "Unauthorized — invalid internal secret" });
    return;
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

router.post("/", verifyInternalSecret, async (req: Request, res: Response) => {
  const payload = req.body as CheckinPayload;
  const { userId, requestId, requestTitle, category, helperName, sessionId } = payload ?? {};
  if (
    typeof userId !== "number" ||
    typeof requestId !== "number" ||
    typeof requestTitle !== "string" ||
    typeof category !== "string" ||
    typeof sessionId !== "string"
  ) {
    res.status(400).json({ error: "Missing or invalid fields: userId, requestId, requestTitle, category, sessionId" });
    return;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
    const helperContext = helperName
      ? `A helper named ${helperName} helped them complete this.`
      : "No helper was assigned, but the request was completed.";

    const userPrompt = `A user just completed a request we posted on Niakofa 24 hours ago.
Request: "${requestTitle}" (category: ${category})
${helperContext}

Generate a warm, genuine 1-2 sentence check-in message. Ask how it went. Be brief and conversational.
No markdown, no emoji, just human warmth.`;

    // Hard timeout: haiku check-ins should complete in < 5s. Guard against
    // Anthropic API hangs to prevent stalling the response indefinitely.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 15_000);

    let message: Awaited<ReturnType<typeof anthropic.messages.create>>;
    try {
      message = await anthropic.messages.create(
        {
          // haiku is the right model for a short warm check-in message —
          // opus-4-8 was significantly over-spec (and over-budget) for 150 tokens.
          model: "claude-haiku-4-5-20251001",
          max_tokens: 150,
          messages: [{ role: "user", content: userPrompt }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeoutHandle);
    }

    const niaResponse =
      message.content[0]?.type === "text" ? message.content[0].text : "How did it go? I'd love to hear!";

    res.status(200).json({ success: true, userId, requestId, sessionId, nia_response: niaResponse });
  } catch (err) {
    logger.error({ err, userId, requestId, sessionId }, "checkin: failed to generate message");
    res.status(500).json({ error: "Failed to generate check-in message" });
  }
});

export default router;
