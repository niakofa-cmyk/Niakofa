import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { checkSafety } from "../lib/safety.js";
import {
  saveConversation,
  getRecentHistory,
  getScrollbackHistory,
  checkRateLimit,
  getActiveRequest,
  getUserMemory,
  upsertUserMemory,
  saveCheckinConversation,
  getFullMemory,
  getStructuredMemory,
  upsertStructuredMemory,
  type StructuredMemory,
} from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";
import {
  injectLocation,
  buildLocationPrefix,
  buildAppContextPrefix,
  LocationContext,
} from "../middleware/location.js";
import { pino } from "pino";
import { parseOptionalAuth } from "../lib/auth.js";

const logger = pino({ level: "info" });
const router = Router();

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error("FATAL: ANTHROPIC_API_KEY is not set — Nia will not be able to respond");
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const NIA_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Shared streaming helper — sends SSE deltas and returns the full response text.
// ─────────────────────────────────────────────────────────────────────────────
async function streamNiaResponse(
  res: Response,
  messages: Anthropic.MessageParam[],
  systemPrompt: string,
  abortSignal: AbortSignal
): Promise<string> {
  const WEB_SEARCH_TOOL: Anthropic.Tool = {
    name: "web_search",
    // @ts-expect-error — web_search_20250305 is a special Anthropic tool type
    type: "web_search_20250305",
  };

  const stream = await anthropic.messages.stream(
    {
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools: [WEB_SEARCH_TOOL],
    },
    { signal: abortSignal }
  );

  let fullResponse = "";
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      const text = chunk.delta.text;
      fullResponse += text;
      res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
    }
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "input_json_delta"
    ) {
      const delta = chunk.delta as { type: "input_json_delta"; partial_json?: string };
      if (typeof delta.partial_json === "string") {
        fullResponse += delta.partial_json;
      }
    }
  }

  return fullResponse;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /chat — main Nia conversation endpoint
// ─────────────────────────────────────────────────────────────────────────────
router.post("/chat", parseOptionalAuth, injectLocation, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const message = typeof body.message === "string" ? body.message : "";
  const sessionId =
    Array.isArray(body.sessionId)
      ? body.sessionId[0]
      : typeof body.sessionId === "string"
      ? body.sessionId
      : "";

  // HIGH-002: userId comes ONLY from a verified Bearer token, never from body
  const userId =
    (req as Request & { authenticatedUserId?: number }).authenticatedUserId ?? null;

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

  // Optional live context (open requests count, helpers online, etc.)
  // Injected by the API server when calling nia-service on behalf of the app
  const liveContext =
    typeof body.liveContext === "object" && body.liveContext !== null
      ? (body.liveContext as Record<string, unknown>)
      : null;

  // Phase 3: Language preference — from Accept-Language or explicit body field.
  // Only set when non-English. Injected into the system prompt prefix.
  const language =
    typeof body.language === "string" && body.language.trim() && body.language.trim() !== "en"
      ? body.language.trim()
      : null;

  // Phase 7a: Voice activation context
  // When user activated Nia via "Hey Nia" or cultural equivalent wake word
  const voiceActivated = body.voiceActivated === true;
  const wakeWordLanguage =
    typeof body.wakeWordLanguage === "string" ? body.wakeWordLanguage : undefined;

  if (!message.trim() || !sessionId) {
    return res.status(400).json({ error: "message and sessionId required" });
  }

  // Cap message length to bound token cost and prevent abuse via huge payloads.
  if (message.length > 4000) {
    return res.status(400).json({ error: "message is too long (max 4000 characters)" });
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
    const reset = new Date(rateLimit.resetAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
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
    res.write(
      `data: ${JSON.stringify({ type: "delta", text: safety.escalationMessage })}\n\n`
    );
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    await saveConversation(userId, sessionId, message, safety.escalationMessage!);
    return res.end();
  }

  const history = await getRecentHistory(sessionId);
  const { memory: userMemory, structured: structuredMemory } = userId
    ? await getFullMemory(userId).catch(() => ({ memory: null, structured: {} as StructuredMemory }))
    : { memory: null, structured: {} as StructuredMemory };

  const memoryPrefix = buildMemoryPrefix(userMemory, structuredMemory);

  const activeRequest =
    activeRequestId !== null && !Number.isNaN(activeRequestId)
      ? await getActiveRequest(activeRequestId, userId).catch(() => null)
      : null;

  const softPrefix = safety.soft
    ? "CARE DIRECTIVE: This person is showing signs of distress. Lead with warmth and acknowledgment. " +
      "Do not rush to solutions. Ask one gentle question to understand their situation better. Stay present.\n\n"
    : "";

  // Live community context prefix
  const liveContextPrefix = liveContext
    ? buildLiveContextPrefix(liveContext)
    : "";

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
    logger.warn({ userId, sessionId }, "nia: Anthropic stream timed out after 60s");
  }, NIA_TIMEOUT_MS);

  try {
    const voiceContextPrefix = buildVoiceContextPrefix(voiceActivated, wakeWordLanguage);
    const systemPrompt =
      buildLanguagePrefix(language) +
      memoryPrefix +
      softPrefix +
      voiceContextPrefix +
      liveContextPrefix +
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
      NIA_SYSTEM_PROMPT;

    const fullResponse = await streamNiaResponse(
      res,
      [...history, { role: "user", content: message }],
      systemPrompt,
      controller.signal
    );

    clearTimeout(timeoutHandle);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

    await saveConversation(userId, sessionId, message, fullResponse);

    if (userId) {
      extractAndUpdateMemory(userId, userMemory, message, fullResponse, anthropic).catch(() => {});
      extractAndUpdateStructuredMemory(userId, structuredMemory, message, fullResponse, language, anthropic).catch(() => {});
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.error({ err, userId, sessionId, isTimeout }, "nia: chat error");
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: isTimeout
            ? "Nia took too long to respond. Please try again."
            : "Nia is unavailable right now. Please try again.",
        })}\n\n`
      );
      res.end();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /checkin — Nia reaches back after a completed request (24h follow-up)
//
// Body: { userId, requestId, requestTitle, category, helperName, sessionId }
// Called by the scheduler (nia-checkin worker) — not by the client directly.
// Streams Nia's opening message and saves it to conversation history so the
// user can continue the conversation in-app.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/checkin", async (req: Request, res: Response) => {
  // Internal calls from the scheduler bypass Bearer auth but must supply the
  // shared INTERNAL_SECRET header to prevent abuse from outside.
  const secret = req.headers["x-internal-secret"];
  const expectedSecret = process.env.INTERNAL_SECRET ?? process.env.SESSION_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body as Record<string, unknown>;
  const userId = typeof body.userId === "number" ? body.userId : null;
  const requestId = typeof body.requestId === "number" ? body.requestId : null;
  const requestTitle = typeof body.requestTitle === "string" ? body.requestTitle : "your request";
  const category = typeof body.category === "string" ? body.category : null;
  const helperName = typeof body.helperName === "string" ? body.helperName : null;
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId : `checkin-${userId}-${requestId}`;

  if (!userId) return res.status(400).json({ error: "userId required" });

  const userMemory = await getUserMemory(userId).catch(() => null);
  const memoryPrefix = userMemory
    ? `MEMORY OF THIS USER:\n${userMemory}\n\nUse this memory naturally. Don't recite it.\n\n`
    : "";

  const checkinDirective = buildCheckinDirective({
    requestTitle,
    category,
    helperName,
  });

  const systemPrompt = memoryPrefix + checkinDirective + NIA_SYSTEM_PROMPT;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), NIA_TIMEOUT_MS);

  try {
    const openingPrompt = buildCheckinOpeningPrompt({ requestTitle, category, helperName });

    const fullResponse = await streamNiaResponse(
      res,
      [{ role: "user", content: openingPrompt }],
      systemPrompt,
      controller.signal
    );

    clearTimeout(timeoutHandle);
    res.write(`data: ${JSON.stringify({ type: "done", sessionId })}\n\n`);
    res.end();

    // Save so user can continue the conversation in-app
    await saveCheckinConversation(userId, sessionId, openingPrompt, fullResponse, requestId);

    // Update memory with any emotional context from request completion
    if (userMemory !== null || fullResponse.length > 50) {
      extractAndUpdateMemory(
        userId,
        userMemory,
        `[Niakofa check-in: ${requestTitle} completed]`,
        fullResponse,
        anthropic
      ).catch(() => {});
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    logger.error({ err, userId, requestId }, "nia: checkin error");
    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: "Nia couldn't send the check-in." })}\n\n`
      );
      res.end();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /analyze-image — one-shot vision analysis
// Body: { imageBase64: string, mediaType?: string, question?: string, context?: string }
// context: optional hint ("broken appliance", "street sign", "medication bottle")
// ─────────────────────────────────────────────────────────────────────────────
router.post("/analyze-image", parseOptionalAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const rawImage = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!rawImage) return res.status(400).json({ error: "imageBase64 is required" });

  const dataUrlMatch = rawImage.match(/^data:([^;]+);base64,(.+)$/s);
  const mediaType: string = dataUrlMatch
    ? dataUrlMatch[1]
    : typeof body.mediaType === "string"
    ? body.mediaType
    : "image/jpeg";
  const imageData: string = dataUrlMatch ? dataUrlMatch[2] : rawImage;

  const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!SUPPORTED_TYPES.includes(mediaType)) {
    return res
      .status(400)
      .json({ error: `Unsupported image type: ${mediaType}. Use JPEG, PNG, GIF, or WebP.` });
  }

  // ~5MB raw limit
  if (imageData.length > 6_800_000) {
    return res
      .status(413)
      .json({ error: "Image too large — please use an image under 5MB" });
  }

  const question =
    typeof body.question === "string" && body.question.trim()
      ? body.question.trim()
      : null;

  const imageContext =
    typeof body.context === "string" && body.context.trim()
      ? body.context.trim()
      : null;

  if (question) {
    const safety = checkSafety(question);
    if (safety.flagged) {
      return res.json({ analysis: safety.escalationMessage });
    }
  }

  const userPrompt = buildImagePrompt(question, imageContext);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system:
        "You are Nia, the Niakofa community assistant. " +
        "When analyzing images, be helpful and community-minded. " +
        "If the image shows something someone needs help with (broken appliance, medical situation, " +
        "navigation question, flooded area, prescription bottle), describe what you see clearly and " +
        "suggest how the community might help or what the person should do next. " +
        "If the image shows something concerning (injury, unsafe conditions, visible distress), respond with care first. " +
        "Be concise — 2–4 sentences unless more detail is genuinely needed. " +
        "Refer to yourself as Nia only. Never mention Claude or Anthropic.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: imageData,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const analysis =
      response.content[0].type === "text"
        ? response.content[0].text
        : "I couldn't analyze that image.";

    logger.info(
      { mediaType, questionLength: question?.length ?? 0, hasContext: !!imageContext },
      "nia: image analyzed"
    );
    return res.json({ analysis });
  } catch (err) {
    logger.error({ err }, "nia: image analysis error");
    return res
      .status(500)
      .json({ error: "Nia couldn't analyze the image right now. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /history/:sessionId
// BUG-21: Require authentication and verify the session belongs to the requesting user
// so that guessable session IDs cannot expose another user's conversation history.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/history/:sessionId", parseOptionalAuth, async (req: Request, res: Response) => {
  const authenticatedUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  if (!authenticatedUserId) {
    return res.status(401).json({ error: "Authentication required to access chat history" });
  }
  const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  const history = await getScrollbackHistory(sessionId, authenticatedUserId);
  return res.json(history);
});

// ── GET /memory/:userId — privacy-facing memory view (Phase 1) ───────────────
// Returns what Nia remembers about this user so they can review and delete it.
// Only the user themselves may read their memory (userId in URL is checked against
// the authenticated Bearer token).
router.get("/memory/:userId", parseOptionalAuth, async (req: Request, res: Response) => {
  const authenticatedUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  const requestedId = parseInt(req.params.userId, 10);
  if (isNaN(requestedId)) return res.status(400).json({ error: "Invalid userId" });
  if (!authenticatedUserId || authenticatedUserId !== requestedId) {
    return res.status(403).json({ error: "You may only view your own memory" });
  }
  const { memory, structured } = await getFullMemory(requestedId).catch(() => ({ memory: null, structured: {} as StructuredMemory }));
  return res.json({ memory, structured });
});

// ── DELETE /memory/:userId — clear user's Nia memory ────────────────────────
router.delete("/memory/:userId", parseOptionalAuth, async (req: Request, res: Response) => {
  const authenticatedUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  const requestedId = parseInt(req.params.userId, 10);
  if (isNaN(requestedId)) return res.status(400).json({ error: "Invalid userId" });
  if (!authenticatedUserId || authenticatedUserId !== requestedId) {
    return res.status(403).json({ error: "You may only clear your own memory" });
  }
  try {
    await upsertUserMemory(requestedId, "");
    await upsertStructuredMemory(requestedId, {
      recurring_needs: [],
      accessibility_notes: [],
      people_mentioned: [],
      corrections: [],
    });
    return res.json({ cleared: true });
  } catch (err) {
    logger.error({ err, userId: requestedId }, "nia: memory clear failed");
    return res.status(500).json({ error: "Failed to clear memory" });
  }
});

router.get("/health", (_req, res) => res.json({ status: "ok", service: "nia" }));

export default router;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build language/translation prefix if user has non-English preference
 * Phase 3: Language adaptation support
 */
function buildLanguagePrefix(language: string | null): string {
  if (!language || language === "en") {
    return "";
  }

  const langMap: Record<string, string> = {
    sw: "Swahili (East Africa)",
    ak: "Akan/Twi (Ghana)",
    zu: "Zulu (South Africa)",
    yo: "Yoruba (Nigeria)",
    lg: "Luganda (Uganda)",
  };

  const langName = langMap[language] || language;
  return `LANGUAGE PREFERENCE: This user prefers ${langName}. Respond in ${langName} unless they write to you in a different language first — then match theirs immediately without comment.\n\n`;
}

/**
 * Build memory prefix from user's persistent memory
 * Includes both freeform and structured memory
 */
function buildMemoryPrefix(
  freeformMemory: string | null,
  structuredMemory: StructuredMemory
): string {
  if (!freeformMemory && Object.keys(structuredMemory).length === 0) {
    return "";
  }

  const lines: string[] = ["USER MEMORY (treat as ground truth about this person):"];

  if (freeformMemory) {
    lines.push(freeformMemory);
  }

  if (structuredMemory.recurring_needs && structuredMemory.recurring_needs.length > 0) {
    lines.push(`Recurring needs: ${structuredMemory.recurring_needs.join(", ")}`);
  }

  if (structuredMemory.accessibility_notes && structuredMemory.accessibility_notes.length > 0) {
    lines.push(`Accessibility notes: ${structuredMemory.accessibility_notes.join(", ")}`);
  }

  if (structuredMemory.people_mentioned && structuredMemory.people_mentioned.length > 0) {
    lines.push(`Important people: ${structuredMemory.people_mentioned.join(", ")}`);
  }

  if (structuredMemory.resources_that_worked && structuredMemory.resources_that_worked.length > 0) {
    lines.push(`Resources that helped before: ${structuredMemory.resources_that_worked.join(", ")}`);
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Build voice context prefix if user activated Nia via voice wake-word
 * Phase 7a: Voice consciousness
 */
function buildVoiceContextPrefix(voiceActivated: boolean, wakeWordLanguage?: string): string {
  if (!voiceActivated) {
    return "";
  }

  const culturalGreetings: Record<string, string> = {
    en: "They greeted you in English — respond warmly and directly.",
    sw: "They greeted you in Swahili with 'Habari Nia' or 'Sawubona Nia' — they are speaking in their comfort language. Respond with Ubuntu warmth.",
    ak: "They greeted you in Akan with 'Ei Nia' — they are from a culture that shows care through asking about daily sustenance. Mirror that warmth.",
    zu: "They greeted you in Zulu with 'Sawubona Nia' — they are calling you as a neighbor. Respond with recognition and presence.",
    yo: "They greeted you in Yoruba — honor their dignity by using their name and showing you value them.",
    lg: "They greeted you in Luganda — they are asking 'how did you wake up?' Respond by asking how THEY woke up — mutual care.",
  };

  const greeting =
    (wakeWordLanguage && culturalGreetings[wakeWordLanguage]) ||
    culturalGreetings.en;

  return `VOICE ACTIVATION: This person spoke to you directly and used your name. ${greeting} Keep responses 2–4 sentences. Speak with breath and presence. End with an invitation for them to continue speaking.\n\n`;
}

/**
 * Extract memory facts from conversation (already implemented)
 * This was a missing function mentioned in Phase 4
 */
async function extractAndUpdateMemory(
  userId: number,
  existingMemory: string | null,
  userMessage: string,
  niaResponse: string,
  client: Anthropic
): Promise<void> {
  if (!userMessage.trim() || !niaResponse.trim()) {
    return;
  }

  const prompt = `You are Nia's memory system. Extract any meaningful, lasting facts about this user from the conversation below.

Existing memory:
${existingMemory ?? "None yet."}

New conversation:
User: ${userMessage}
Nia: ${niaResponse}

Rules:
- Only extract facts that would help Nia be more personal and helpful in FUTURE conversations
- Include: life situation, needs, family members, struggles, wins, goals, preferences, location details, skills they have or need
- Merge with existing memory — don't duplicate, update if changed
- Keep it under 400 words, written as clear bullet points
- If nothing new and meaningful to remember, return the existing memory unchanged
- If there is emotional context, capture that briefly

Return ONLY the updated memory, no preamble.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const newMemory =
      response.content[0].type === "text" ? response.content[0].text.trim() : null;
    if (newMemory && newMemory.length > 10) {
      await upsertUserMemory(userId, newMemory);
    }
  } catch (err) {
    logger.debug({ err, userId }, "nia: memory extraction skipped");
  }
}

/**
 * Extract and update structured memory from conversation
 * (Already called but implementation needed)
 */
async function extractAndUpdateStructuredMemory(
  userId: number,
  existing: StructuredMemory,
  userMessage: string,
  niaResponse: string,
  language: string | null,
  client: Anthropic
): Promise<void> {
  if (!userMessage.trim()) {
    return;
  }

  const prompt = `From this conversation, extract structured facts about the user:
User: ${userMessage}
Nia: ${niaResponse}

Return a JSON object with only the fields that have NEW information:
{
  "recurring_needs": ["array", "of", "needs"],
  "accessibility_notes": ["array", "of", "accessibility", "info"],
  "people_mentioned": ["family", "or", "important", "people"],
  "resources_that_worked": ["services", "or", "resources", "they", "mentioned"],
  "corrections": ["if", "any", "previous", "facts", "were", "corrected"]
}

Return ONLY valid JSON, no preamble. If no new structured facts, return {}.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text.trim() : "{}";
    const parsed = JSON.parse(text);

    // Merge with existing
    const updated: StructuredMemory = {
      recurring_needs: [
        ...(existing.recurring_needs ?? []),
        ...(parsed.recurring_needs ?? []),
      ],
      accessibility_notes: [
        ...(existing.accessibility_notes ?? []),
        ...(parsed.accessibility_notes ?? []),
      ],
      people_mentioned: [
        ...(existing.people_mentioned ?? []),
        ...(parsed.people_mentioned ?? []),
      ],
      resources_that_worked: [
        ...(existing.resources_that_worked ?? []),
        ...(parsed.resources_that_worked ?? []),
      ],
      corrections: parsed.corrections ?? [],
    };

    // Deduplicate
    Object.keys(updated).forEach((key) => {
      if (Array.isArray(updated[key as keyof StructuredMemory])) {
        const arr = updated[key as keyof StructuredMemory] as string[];
        updated[key as keyof StructuredMemory] = [
          ...new Set(arr),
        ] as typeof arr;
      }
    });

    await upsertStructuredMemory(userId, updated);
  } catch (err) {
    logger.debug({ err, userId }, "nia: structured memory extraction failed");
  }
}

function buildLiveContextPrefix(ctx: Record<string, unknown>): string {
  const lines: string[] = ["LIVE COMMUNITY CONTEXT (real-time data — use it):"];
  if (typeof ctx.openRequestsNearby === "number") {
    lines.push(`- Open requests within 2 miles: ${ctx.openRequestsNearby}`);
  }
  if (typeof ctx.helpersOnlineNearby === "number") {
    lines.push(`- Helpers currently online nearby: ${ctx.helpersOnlineNearby}`);
  }
  if (typeof ctx.topCategory === "string") {
    lines.push(`- Most common request type right now: ${ctx.topCategory}`);
  }
  if (typeof ctx.neighborhood === "string") {
    lines.push(`- User's neighborhood: ${ctx.neighborhood}`);
  }
  if (typeof ctx.estimatedResponseMinutes === "number") {
    lines.push(
      `- Estimated time to first helper response if they post now: ~${ctx.estimatedResponseMinutes} min`
    );
  }
  lines.push(
    "Use this context naturally if it's relevant. Never make up numbers that aren't here.\n"
  );
  return lines.join("\n") + "\n";
}

function buildCheckinDirective(opts: {
  requestTitle: string;
  category: string | null;
  helperName: string | null;
}): string {
  return (
    "CHECK-IN DIRECTIVE: You are reaching out to this person 24 hours after their request was completed. " +
    `The request was: "${opts.requestTitle}"${opts.category ? ` (category: ${opts.category})` : ""}. ` +
    (opts.helperName ? `Their helper was ${opts.helperName}. ` : "") +
    "Open warmly and naturally — like a neighbor checking in, not a support ticket. " +
    "Ask how things went. Show you care. Keep it short (2–3 sentences). " +
    "Do NOT open with 'I'm checking in' or 'I wanted to follow up.' Just ask.\n\n"
  );
}

function buildCheckinOpeningPrompt(opts: {
  requestTitle: string;
  category: string | null;
  helperName: string | null;
}): string {
  // This becomes the "user" turn that prompts Nia's opening check-in message.
  // It's an internal signal, not a real user message.
  return (
    `[INTERNAL: Generate Nia's check-in opening message for a completed "${opts.requestTitle}" request` +
    (opts.helperName ? ` helped by ${opts.helperName}` : "") +
    `. Warm, natural, 2–3 sentences. No preamble.]`
  );
}

function buildImagePrompt(question: string | null, context: string | null): string {
  if (question && context) {
    return `The user is sharing a photo of: ${context}. They ask: "${question}" — please help them.`;
  }
  if (question) {
    return `Please analyze this image. The user asks: "${question}"`;
  }
  if (context) {
    return (
      `The user shared a photo of: ${context}. ` +
      "Describe what you see and tell them anything that would help them understand the situation or get community support."
    );
  }
  return "Please describe what you see in this image and note anything relevant to community help or safety.";
}

// Note: extractAndUpdateMemory is now defined in the HELPERS section above
