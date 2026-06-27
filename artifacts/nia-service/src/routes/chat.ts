import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { checkSafety } from "../lib/safety.js";
import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit, getActiveRequest, getUserMemory, upsertUserMemory, isNiaEnabled } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";
import { injectLocation, buildLocationPrefix, buildAppContextPrefix, LocationContext } from "../middleware/location.js";
import { pino } from "pino";
import { parseOptionalAuth } from "../lib/auth.js";

const logger = pino({ level: "info" });
const router = Router();

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error("FATAL: ANTHROPIC_API_KEY is not set — Nia will not be able to respond");
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const NIA_TIMEOUT_MS = 60_000;

router.post("/chat", parseOptionalAuth, injectLocation, async (req: Request, res: Response) => {
  // Defense-in-depth kill-switch check (primary block is in api-server nia-proxy)
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }

  const body = req.body as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message : "";
  const sessionId = Array.isArray(body.sessionId) ? body.sessionId[0] : typeof body.sessionId === "string" ? body.sessionId : "";
  // HIGH-002: userId now comes ONLY from a verified Bearer token, never from
  // the client-supplied body — a body.userId previously let any caller read
  // or write another user's memory, history, and rate-limit bucket.
  const userId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId ?? null;
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

  if (gpsLat !== null && gpsLon !== null) {
    (req as any).locationContext = {
      ...(req as any).locationContext,
      lat: gpsLat,
      lon: gpsLon,
      gpsAccurate: true,
    };
  }

  const rateLimit = await checkRateLimit(userId, sessionId);
  if (!rateLimit.allowed) {
    const reset = new Date(rateLimit.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return res.status(429).json({
      error: "Daily message limit reached",
      resetAt: rateLimit.resetAt,
      message: `You've reached your daily limit with Nia. Come back at ${reset}!`,
    });
  }

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

  const userMemory = userId ? await getUserMemory(userId).catch(() => null) : null;
  const memoryPrefix = userMemory
    ? `MEMORY OF THIS USER:\n${userMemory}\n\nUse this memory naturally — reference it when relevant, like a friend who remembers. Don't recite it robotically.\n\n`
    : "";

  const activeRequest =
    activeRequestId !== null && !Number.isNaN(activeRequestId)
      ? await getActiveRequest(activeRequestId, userId).catch(() => null)
      : null;

  const softPrefix = safety.soft
    ? "CARE DIRECTIVE: This person is showing signs of distress (struggling, overwhelmed, scared, or facing hardship). " +
      "Lead with warmth and acknowledgment before offering any resources. Do not rush to solutions. " +
      "Ask one gentle question to understand their situation better. Stay present.\n\n"
    : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
    logger.warn({ userId, sessionId }, "nia: Anthropic stream timed out after 60s");
  }, NIA_TIMEOUT_MS);

  try {
    const WEB_SEARCH_TOOL: Anthropic.Tool = {
      name: "web_search",
      // @ts-expect-error — web_search_20250305 is a special Anthropic tool type
      type: "web_search_20250305",
    };

    const stream = await anthropic.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system:
          memoryPrefix +
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
      },
      { signal: controller.signal }
    );

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const text = chunk.delta.text;
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
      }
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "input_json_delta" &&
        typeof (chunk.delta as any).partial_json === "string"
      ) {
        fullResponse += (chunk.delta as any).partial_json;
      }
    }

    clearTimeout(timeoutHandle);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    await saveConversation(userId, sessionId, message, fullResponse);

    if (userId) {
      extractAndUpdateMemory(userId, userMemory, message, fullResponse, anthropic).catch(() => {});
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.error({ err, userId, sessionId, isTimeout }, "nia: chat error");
    res.write(`data: ${JSON.stringify({ type: "error", message: isTimeout ? "Nia took too long to respond. Please try again." : "Nia is unavailable right now. Please try again." })}\n\n`);
    res.end();
  }
});


// POST /analyze-image
// One-shot vision analysis — no session history, no memory update.
// Body: { imageBase64: string (data URL or raw base64), mediaType?: string, question?: string }
// The image is passed directly to Claude vision; the optional question
// focuses the analysis. Safety check runs on the question text.
//
// Size guard: the base64 body is capped at ~5MB (raw bytes ~3.75MB image)
// which is well within Claude's image limits. The express.json() middleware
// defaults to 100kb — callers must ensure their server allows larger bodies,
// or this endpoint will 413 before reaching the handler.
router.post("/analyze-image", parseOptionalAuth, async (req: Request, res: Response) => {
  // Defense-in-depth kill-switch check
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }

  const body = req.body as Record<string, unknown>;

  // Accept either a full data URL ("data:image/jpeg;base64,....") or raw base64
  const rawImage = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!rawImage) return res.status(400).json({ error: "imageBase64 is required" });

  // Strip data-URL prefix if present
  const dataUrlMatch = rawImage.match(/^data:([^;]+);base64,(.+)$/s);
  const mediaType: string = dataUrlMatch
    ? dataUrlMatch[1]
    : typeof body.mediaType === "string"
      ? body.mediaType
      : "image/jpeg";
  const imageData: string = dataUrlMatch ? dataUrlMatch[2] : rawImage;

  const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!SUPPORTED_TYPES.includes(mediaType)) {
    return res.status(400).json({ error: `Unsupported image type: ${mediaType}. Use JPEG, PNG, GIF, or WebP.` });
  }

  // Rough size check — base64 is ~4/3 the raw bytes; 6.8MB base64 ≈ 5MB raw
  if (imageData.length > 6_800_000) {
    return res.status(413).json({ error: "Image too large — please use an image under 5MB" });
  }

  const question = typeof body.question === "string" && body.question.trim()
    ? body.question.trim()
    : null;

  // Safety check on the question text
  if (question) {
    const safety = checkSafety(question);
    if (safety.flagged) {
      return res.json({ analysis: safety.escalationMessage });
    }
  }

  const userPrompt = question
    ? `Please analyze this image. The user asks: "${question}"`
    : "Please describe what you see in this image and note anything that might be relevant to community help or safety.";

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are Nia, the Niakofa community assistant. When analyzing images, be helpful and community-minded. " +
        "If the image shows a help request (e.g. broken appliance, medical situation, navigation question), " +
        "describe what you see and suggest how the community might help. " +
        "If the image shows something concerning (injury, unsafe conditions, distress), respond with care. " +
        "Be concise — 2-4 sentences unless detail is clearly needed. Refer to yourself as Nia only.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: imageData,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const analysis = response.content[0].type === "text" ? response.content[0].text : "I couldn't analyze that image.";
    logger.info({ mediaType, questionLength: question?.length ?? 0 }, "nia: image analyzed");
    return res.json({ analysis });
  } catch (err) {
    logger.error({ err }, "nia: image analysis error");
    return res.status(500).json({ error: "Nia couldn't analyze the image right now. Please try again." });
  }
});

router.get("/history/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  return res.json(await getScrollbackHistory(Array.isArray(sessionId) ? sessionId[0] : sessionId));
});

router.get("/health", (_req, res) => res.json({ status: "ok", service: "nia" }));

export default router;

async function extractAndUpdateMemory(
  userId: number,
  existingMemory: string | null,
  userMessage: string,
  niaResponse: string,
  anthropic: Anthropic
): Promise<void> {
  const prompt = `You are Nia's memory system. Extract any meaningful, lasting facts about this user from the conversation below.

Existing memory:
${existingMemory ?? "None yet."}

New conversation:
User: ${userMessage}
Nia: ${niaResponse}

Rules:
- Only extract facts that would help Nia be more personal and helpful in FUTURE conversations
- Include: life situation, needs, family, struggles, wins, goals, preferences, location details
- Merge with existing memory — don't duplicate, update if changed
- Keep it under 400 words, written as bullet points
- If nothing meaningful to remember, return the existing memory unchanged
- Return ONLY the updated memory bullets, no preamble

Updated memory:`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const newMemory = response.content[0].type === "text" ? response.content[0].text.trim() : null;
  if (newMemory && newMemory.length > 10) {
    await upsertUserMemory(userId, newMemory);
  }
}
