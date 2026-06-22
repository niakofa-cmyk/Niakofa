import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { checkSafety } from "../lib/safety.js";
import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

router.post("/chat", async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message : "";
  const sessionId = Array.isArray(body.sessionId) ? body.sessionId[0] : typeof body.sessionId === "string" ? body.sessionId : "";
  const userId = typeof body.userId === "number" ? body.userId : null;

  if (!message.trim() || !sessionId) {
    return res.status(400).json({ error: "message and sessionId required" });
  }

  // Rate limit check
  const rateLimit = await checkRateLimit(userId, sessionId);
  if (!rateLimit.allowed) {
    const reset = new Date(rateLimit.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return res.status(429).json({
      error: "Daily message limit reached",
      resetAt: rateLimit.resetAt,
      message: `You've reached your daily limit with Nia. Come back at ${reset}!`,
    });
  }

  // Safety check
  const safety = checkSafety(message);
  if (safety.flagged) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ type: "delta", text: safety.escalationMessage })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    await saveConversation(userId, sessionId, message, safety.escalationMessage!);
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
    await saveConversation(userId, sessionId, message, fullResponse);
  } catch {
    res.write(`data: ${JSON.stringify({ type: "error", message: "Nia is unavailable right now. Please try again." })}\n\n`);
    res.end();
  }
});

router.get("/history/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  return res.json(await getScrollbackHistory(Array.isArray(sessionId) ? sessionId[0] : sessionId));
});

router.get("/health", (_req, res) => res.json({ status: "ok", service: "nia" }));

export default router;
