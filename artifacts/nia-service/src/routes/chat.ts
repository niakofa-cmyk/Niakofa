import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { checkSafety } from "../lib/safety.js";
import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit, getActiveRequest } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";
import { injectLocation, buildLocationPrefix, buildAppContextPrefix, LocationContext } from "../middleware/location.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

router.post("/chat", injectLocation, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message : "";
  const sessionId = Array.isArray(body.sessionId) ? body.sessionId[0] : typeof body.sessionId === "string" ? body.sessionId : "";
  const userId = typeof body.userId === "number" ? body.userId : null;
  const gpsLat = typeof body.lat === "number" ? body.lat : null;
  const gpsLon = typeof body.lon === "number" ? body.lon : null;
  const userName = typeof body.userName === "string" ? body.userName : null;
  const accountType = typeof body.accountType === "string" ? body.accountType : null;
  const helperModeActive = body.helperModeActive === true;
  const activeRequestId =
    typeof body.activeRequestId === "number"
      ? body.activeRequestId
      : typeof body.activeRequestId === "string" && body.activeRequestId.trim() !== ""
        ? Number(body.activeRequestId)
        : null;

  if (!message.trim() || !sessionId) {
    return res.status(400).json({ error: "message and sessionId required" });
  }

  // If GPS coords sent from browser, override IP-based location
  if (gpsLat !== null && gpsLon !== null) {
    (req as any).locationContext = {
      ...(req as any).locationContext,
      lat: gpsLat,
      lon: gpsLon,
      gpsAccurate: true,
    };
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

  // Best-effort: if the user has an active request open, pull its real details
  // so Nia can reference it specifically rather than just knowing an ID exists.
  const activeRequest =
    activeRequestId !== null && !Number.isNaN(activeRequestId)
      ? await getActiveRequest(activeRequestId, userId).catch(() => null)
      : null;

  // If soft distress detected, prepend a care directive to the system prompt
  // so Nia leads with empathy before pivoting to resources — not skipped, not clinical.
  const softPrefix = safety.soft
    ? "CARE DIRECTIVE: This person is showing signs of distress (struggling, overwhelmed, scared, or facing hardship). " +
      "Lead with warmth and acknowledgment before offering any resources. Do not rush to solutions. " +
      "Ask one gentle question to understand their situation better. Stay present.\n\n"
    : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    // Web search tool — lets Nia fetch live shelter availability, pantry hours,
    // emergency declarations, and breaking resource info for the user's location.
    const WEB_SEARCH_TOOL: Anthropic.Tool = {
      name: "web_search",
      // @ts-expect-error — web_search_20250305 is a special Anthropic tool type
      type: "web_search_20250305",
    };

    const stream = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        softPrefix +
        buildLocationPrefix((req as any).locationContext as LocationContext | undefined) +
        buildAppContextPrefix({
          userName,
          accountType,
          helperModeActive,
          activeRequest: activeRequest
            ? {
                title: activeRequest.title,
                description: activeRequest.description,
                category: activeRequest.category,
                urgency: activeRequest.urgency,
                status: activeRequest.status,
                neighborhood: activeRequest.neighborhood,
                viewerRole: activeRequest.viewerRole,
              }
            : null,
        }) +
        NIA_SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: message }],
      tools: [WEB_SEARCH_TOOL],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
      // Capture web search tool result text so fullResponse saved to DB is complete
      // even when Nia's reply is driven primarily by search results.
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "input_json_delta" &&
        typeof (chunk.delta as any).partial_json === "string"
      ) {
        fullResponse += (chunk.delta as any).partial_json;
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    await saveConversation(userId, sessionId, message, fullResponse);
  } catch (err) {
    console.error("nia: chat error", err);
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
