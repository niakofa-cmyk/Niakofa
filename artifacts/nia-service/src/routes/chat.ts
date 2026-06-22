import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { checkSafety } from "../lib/safety.js";
import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

router.post("/chat", async (req: Request, res: Response) => {
  const { message, sessionId: rawSessionId, userId } = req.body as {
    message: string;
    sessionId: string | string[];
    userId?: number;
  };
  const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;

  if (!message?.trim() || !sessionId) {
    return res.status(400).json({ error: "message and sessionId required" });
  }

  // Rate limit check
  const rateLimit = await checkRateLimit(userId ?? null, sessionId);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: "Daily message limit reached",
      resetAt: rateLimit.resetAt,
      message: "You\'ve reached your daily limit with Nia. Come back tomorrow!",
    });
  }

  const safety = checkSafety(message);
  if (safety.flagged) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ type: "delta", text: safety.escalationMessage })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    await saveConversation(userId ?? null, sessionId, message, safety.escalationMessage!);
    return res.end();
  }

  const history = await getRecentHistory(sessionId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: NIA_SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: message }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    await saveConversation(userId ?? null, sessionId, message, fullResponse);
  } catch {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Nia is unavailable right now. Please try again." })}\n\n`);
    res.end();
  }
});

router.get("/history/:sessionId", async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  return res.json(await getScrollbackHistory(sessionId));
});

router.get("/health", (_req, res) => res.json({ status: "ok", service: "nia" }));

export default router;
