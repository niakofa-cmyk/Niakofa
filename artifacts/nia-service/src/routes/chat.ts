import { Router, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { timingSafeEqual } from "node:crypto";
import { checkSafety } from "../lib/safety.js";
import { saveConversation, getRecentHistory, getScrollbackHistory, checkRateLimit, getActiveRequest, getUserMemory, upsertUserMemory, isNiaEnabled, logNiaCost, getDailyCostSummary } from "../lib/db.js";
import { NIA_SYSTEM_PROMPT } from "../prompts/nia.js";
import { injectLocation, buildLocationPrefix, buildAppContextPrefix } from "../middleware/location.js";
import { pino } from "pino";
import { parseOptionalAuth } from "../lib/auth.js";
import { getFreshKnowledge } from "../workers/continuous-learning-worker.js";
import { buildCommunityAwarenessPrefix } from "../lib/community-context.js";

const logger = pino({ level: "info" });
const router = Router();

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error("FATAL: ANTHROPIC_API_KEY is not set — Nia will not be able to respond");
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });

const NIA_TIMEOUT_MS = 60_000;

// ── Internal-secret guard ─────────────────────────────────────────────────────
// BUG-H06: The nia-service /chat and /analyze-image routes call Anthropic
// (expensive) and read/write user memory. If nia-service is publicly reachable
// on Railway, any caller can hit them directly — bypassing api-server's rate
// limiting, auth checks, and input sanitization. We require an x-internal-secret
// header on all routes that invoke Anthropic or write to user state. The
// api-server nia-proxy forwards this header; direct callers won't have it.
// Fail-closed: if INTERNAL_SECRET is not configured, reject all calls.
function requireInternalSecret(req: Request, res: Response): boolean {
  const configuredSecret = process.env.INTERNAL_SECRET ?? "";
  if (!configuredSecret) {
    logger.error("INTERNAL_SECRET is not configured — rejecting nia-service call to prevent unauthorized Anthropic access");
    res.status(503).json({ error: "Service not configured" });
    return false;
  }
  const callerSecret = req.headers["x-internal-secret"];
  const callerSecretStr = Array.isArray(callerSecret) ? callerSecret[0] : (callerSecret ?? "");
  const secretBuf = Buffer.from(configuredSecret, "utf8");
  const callerBuf = Buffer.from(callerSecretStr, "utf8");
  if (
    secretBuf.length !== callerBuf.length ||
    !timingSafeEqual(secretBuf, callerBuf)
  ) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

router.post("/chat", parseOptionalAuth, injectLocation, async (req: Request, res: Response) => {
  // BUG-H06: Require internal secret before doing any Anthropic work
  if (!requireInternalSecret(req, res)) return;

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

  // GPS-resolved place from client reverse geocode (more accurate than server IP)
  const clientCity = typeof body.city === "string" ? body.city.slice(0, 100) : null;
  const clientCounty = typeof body.county === "string" ? body.county.slice(0, 100) : null;
  const clientState = typeof body.state === "string" ? body.state.slice(0, 100) : null;

  // Phase 7c: food intent signal from client-side detection
  const foodSignal = typeof body.foodSignal === "string" ? body.foodSignal : null;
  const foodSignalCount = typeof body.foodSignalCount === "number" ? body.foodSignalCount : 0;

  if (!message.trim() || !sessionId) {
    return res.status(400).json({ error: "message and sessionId required" });
  }

  if (gpsLat !== null && gpsLon !== null) {
    req.locationContext = {
      ...req.locationContext,
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

  // Merge client GPS place into locationContext (overrides coarse IP geo)
  if (clientCity || clientCounty || clientState) {
    req.locationContext = {
      ...req.locationContext,
      ...(clientCity ? { city: clientCity } : {}),
      ...(clientCounty ? { county: clientCounty } : {}),
      ...(clientState ? { region: clientState } : {}),
      fromClientGPS: true,
    };
  }

  // Inject continuous learning knowledge from background worker
  const knowledgePrefix = await getFreshKnowledge().catch(() => "");
  const knowledgePrefixBlock = knowledgePrefix ? `${knowledgePrefix}\n\n` : "";

  // Inject live community awareness — open request count + online helpers.
  // Uses GPS coords if available, falls back to IP geo coords.
  const communityPrefix = await buildCommunityAwarenessPrefix({
    lat: gpsLat ?? req.locationContext?.lat ?? null,
    lon: gpsLon ?? req.locationContext?.lon ?? null,
  }).catch(() => "");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  // Capture start time BEFORE the try block so the catch block can compute
  // a meaningful elapsed duration. Previously streamStartTime was declared as
  // `let streamStartTime = 0` here and then re-declared as a block-scoped
  // `const` inside the try — the catch always read the outer zero, producing
  // a durationMs of "milliseconds since Unix epoch" on every error.
  const streamStartTime = Date.now();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
    logger.warn({ userId, sessionId }, "nia: Anthropic stream timed out after 60s");
  }, NIA_TIMEOUT_MS);

  // ── Nia real-action tools ──────────────────────────────────────────────────
  // These allow Nia to take concrete actions on behalf of the user:
  // 1. post_help_request — posts a community help request via the api-server
  // 2. get_hub_status    — fetches live hub pledge totals + open request count
  //
  // Both are surfaced as Anthropic tool definitions. When Claude emits a
  // tool_use block we execute the action server-side and feed the result back
  // as a tool_result message so Claude can respond with full context.
  //
  // Security: post_help_request requires an authenticated userId; if the
  // call arrives unauthenticated Nia explains the limitation instead of acting.

  const API_BASE = process.env.API_SERVER_URL ?? "http://localhost:8080";

  async function executePostHelpRequest(params: {
    title: string;
    description: string;
    category: string;
    neighborhood?: string;
    urgency?: string;
    payment_type?: string;
  }, forUserId: number | null, bearerToken: string | null): Promise<string> {
    if (!forUserId || !bearerToken) {
      return JSON.stringify({ error: "User must be logged in to post a request. Please log in and try again." });
    }
    try {
      const body = {
        title: params.title.slice(0, 100),
        description: params.description.slice(0, 500),
        category: params.category || "other",
        neighborhood: params.neighborhood ?? null,
        urgency: params.urgency ?? "normal",
        payment_type: params.payment_type ?? "goodwill",
      };
      const res = await fetch(`${API_BASE}/api/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        return JSON.stringify({ error: err.error ?? `Request creation failed (${res.status})` });
      }
      const created = await res.json() as { id?: number; title?: string };
      return JSON.stringify({
        ok: true,
        request_id: created.id,
        title: created.title ?? params.title,
        message: "Help request posted successfully! Nearby helpers will be notified.",
      });
    } catch (err) {
      logger.error({ err }, "nia-action: post_help_request failed");
      return JSON.stringify({ error: "Could not post request right now. Please try the + button in the app." });
    }
  }

  async function executeGetHubStatus(hubId: number | string, bearerToken: string | null): Promise<string> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
      const res = await fetch(`${API_BASE}/api/griot/hubs/${hubId}/summary`, { headers });
      if (!res.ok) {
        return JSON.stringify({ error: `Hub ${hubId} not found or unavailable.` });
      }
      const data = await res.json() as {
        hub?: { name?: string; is_crisis?: boolean; crisis_message?: string };
        reserved_balance?: number;
        open_request_count?: number;
        recent_pledges?: { amount: string | number }[];
      };
      const totalPledges = (data.recent_pledges ?? []).reduce((s, p) => s + Number(p.amount), 0);
      return JSON.stringify({
        hub_name: data.hub?.name ?? `Hub ${hubId}`,
        reserved_balance_usd: data.reserved_balance ?? 0,
        open_requests: data.open_request_count ?? 0,
        is_crisis: data.hub?.is_crisis ?? false,
        crisis_message: data.hub?.crisis_message ?? null,
        recent_pledges_total_usd: totalPledges,
        pledge_count: (data.recent_pledges ?? []).length,
      });
    } catch (err) {
      logger.error({ err, hubId }, "nia-action: get_hub_status failed");
      return JSON.stringify({ error: "Could not retrieve hub status right now." });
    }
  }

  // Extract bearer token from request for forwarding
  const bearerToken = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null;

  try {
    const WEB_SEARCH_TOOL: Anthropic.Tool = {
      name: "web_search",
      // @ts-expect-error — web_search_20250305 is a special Anthropic tool type
      type: "web_search_20250305",
    };

    const POST_REQUEST_TOOL: Anthropic.Tool = {
      name: "post_help_request",
      description: "Post a community help request on behalf of the user. Use this when the user says they need help and gives you enough detail (title, category). Always confirm the details with the user before calling this tool. If the user is not logged in this will fail gracefully.",
      input_schema: {
        type: "object" as const,
        properties: {
          title: { type: "string", description: "Short title for the request (max 100 chars)" },
          description: { type: "string", description: "Description of what help is needed (max 500 chars)" },
          category: {
            type: "string",
            description: "Category: grocery_run, ride, home_repair, medical, emergency, childcare, elder_care, tech_help, food, other",
          },
          neighborhood: { type: "string", description: "Neighborhood or area (optional)" },
          urgency: { type: "string", description: "Urgency level: low, normal, urgent, emergency" },
          payment_type: { type: "string", description: "Payment type: goodwill or pay_it_forward" },
        },
        required: ["title", "description", "category"],
      },
    };

    const GET_HUB_STATUS_TOOL: Anthropic.Tool = {
      name: "get_hub_status",
      description: "Fetch the live status of a diaspora hub: ring-fenced balance, open request count, crisis status, and recent pledge totals. Use when the user asks about a specific hub's status, funding, or activity.",
      input_schema: {
        type: "object" as const,
        properties: {
          hub_id: { type: "number", description: "The numeric ID of the hub to look up" },
        },
        required: ["hub_id"],
      },
    };

    const systemPrompt =
      memoryPrefix +
      softPrefix +
      knowledgePrefixBlock +
      communityPrefix +
      buildFoodIntentPrefix(foodSignal, foodSignalCount, gpsLat, gpsLon) +
      buildLocationPrefix(req.locationContext) +
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
      "\n\nACTION TOOLS AVAILABLE:\n" +
      "- post_help_request: You can post a help request for the user directly. Use it when they clearly want to post and give you enough detail. Confirm first.\n" +
      "- get_hub_status: You can look up live hub balance, open requests, and pledges. Use it when asked about a specific hub.\n\n" +
      NIA_SYSTEM_PROMPT;

    // Agentic tool loop: run Nia, handle tool calls, continue until done
    const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: message }];
    let inputTokens = 0;
    let outputTokens = 0;
    const MAX_TOOL_ROUNDS = 3; // safety limit

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const stream = await anthropic.messages.stream(
        {
          model: "claude-sonnet-5",
          max_tokens: 1024,
          system: systemPrompt,
          messages,
          tools: [WEB_SEARCH_TOOL, POST_REQUEST_TOOL, GET_HUB_STATUS_TOOL],
        },
        { signal: controller.signal }
      );

      let toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
      let currentTextContent = "";

      for await (const chunk of stream) {
        if (chunk.type === "content_block_start" && chunk.content_block?.type === "tool_use") {
          // tool_use block starting
        }
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          const text = chunk.delta.text;
          currentTextContent += text;
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
        }
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "input_json_delta" &&
          typeof (chunk.delta as { partial_json?: string }).partial_json === "string"
        ) {
          // accumulating tool input — no streaming needed
        }
        if (chunk.type === "message_start" && (chunk as { message?: { usage?: { input_tokens?: number } } }).message?.usage?.input_tokens) {
          inputTokens += (chunk as { message: { usage: { input_tokens: number } } }).message.usage.input_tokens;
        }
        if (chunk.type === "message_delta" && (chunk as { usage?: { output_tokens?: number } }).usage?.output_tokens) {
          outputTokens += (chunk as { usage: { output_tokens: number } }).usage.output_tokens;
        }
      }

      // Get the final message to check for tool_use
      const finalMsg = await stream.finalMessage();
      const stopReason = finalMsg.stop_reason;

      // Collect tool_use blocks from the final message content
      toolUseBlocks = (finalMsg.content ?? [])
        .filter((b: Anthropic.ContentBlock) => b.type === "tool_use")
        .map((b: Anthropic.ContentBlock) => {
          const tu = b as Anthropic.ToolUseBlock;
          return { id: tu.id, name: tu.name, input: (tu.input ?? {}) as Record<string, unknown> };
        });

      if (stopReason !== "tool_use" || toolUseBlocks.length === 0) {
        // No tools called or stream ended naturally — we're done
        break;
      }

      // Execute each tool call and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tool of toolUseBlocks) {
        let result: string;
        if (tool.name === "post_help_request") {
          result = await executePostHelpRequest(
            tool.input as Parameters<typeof executePostHelpRequest>[0],
            userId,
            bearerToken
          );
          // Stream a brief indicator so the user knows something is happening
          const parsed = JSON.parse(result) as { ok?: boolean; request_id?: number; error?: string };
          if (parsed.ok) {
            const indicator = `\n\n✅ Help request posted! (ID #${parsed.request_id ?? "?"}) `;
            fullResponse += indicator;
            res.write(`data: ${JSON.stringify({ type: "delta", text: indicator })}\n\n`);
          }
        } else if (tool.name === "get_hub_status") {
          result = await executeGetHubStatus(
            (tool.input as { hub_id: number }).hub_id,
            bearerToken
          );
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${tool.name}` });
        }
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }

      // Feed tool results back so Claude can compose its final response
      messages.push({ role: "assistant", content: finalMsg.content });
      messages.push({ role: "user", content: toolResults });
      // Continue loop for Claude to finish responding
    }

    const durationMs = Date.now() - streamStartTime;
    // Estimate cost: Claude Sonnet 4.5 = $3/1M input tokens, $15/1M output tokens
    const estimatedCostUsd = (inputTokens * 0.000003) + (outputTokens * 0.000015);

    clearTimeout(timeoutHandle);
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
    await saveConversation(userId, sessionId, message, fullResponse);

    // Log cost for monitoring
    await logNiaCost({
      userId,
      sessionId,
      model: "claude-sonnet-5",
      inputTokens,
      outputTokens,
      estimatedCostUsd,
      durationMs,
      success: true,
    });

    if (userId) {
      extractAndUpdateMemory(userId, userMemory, message, fullResponse, anthropic).catch(() => {});
    }
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.error({ err, userId, sessionId, isTimeout }, "nia: chat error");
    
    // Log failed cost attempt
    await logNiaCost({
      userId,
      sessionId,
      model: "claude-sonnet-5",
      success: false,
      errorType: isTimeout ? "timeout" : "stream_error",
      durationMs: Date.now() - streamStartTime,
    }).catch(() => {});
    
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
  // BUG-H06: Require internal secret before doing any Anthropic work
  if (!requireInternalSecret(req, res)) return;

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
      model: "claude-sonnet-5",
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

router.get("/history/:sessionId", parseOptionalAuth, async (req: Request, res: Response) => {
  // Kill-switch: respect admin toggle for history reads too
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }
  // HIGH-002 follow-up: sessionId alone used to be enough to read anyone's
  // conversation history — sessionIds are long random strings (low
  // probability of guessing) but that's not the same as actual access
  // control. Require a valid auth token and scope the lookup to that user,
  // matching how getScrollbackHistory already supports an optional userId
  // filter (added for exactly this use, previously unused by this route).
  const authedUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  if (!authedUserId) {
    return res.status(401).json({ error: "Unauthorized — valid Bearer token required to read conversation history." });
  }
  const sessionId = req.params.sessionId;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  return res.json(await getScrollbackHistory(Array.isArray(sessionId) ? sessionId[0] : sessionId, authedUserId));
});

router.get("/health", (_req, res) => res.json({ status: "ok", service: "nia" }));

// ── Admin Cost Monitoring Endpoints ───────────────────────────────────────────
// GET /admin/costs — internal only, requires x-internal-secret header
router.get("/admin/costs", async (req: Request, res: Response) => {
  const secret = req.headers["x-internal-secret"];
  if (!secret || secret !== (process.env.INTERNAL_SECRET ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "7"), 10) || 7, 1), 30);
  
  try {
    const summary = await getDailyCostSummary();
    // Filter to requested days
    const filtered = summary.slice(0, days);
    
    // Calculate totals
    const totalCalls = filtered.reduce((sum, d) => sum + d.totalCalls, 0);
    const totalInputTokens = filtered.reduce((sum, d) => sum + d.totalInputTokens, 0);
    const totalOutputTokens = filtered.reduce((sum, d) => sum + d.totalOutputTokens, 0);
    const totalCost = filtered.reduce((sum, d) => sum + d.estimatedCostUsd, 0);
    const totalFailed = filtered.reduce((sum, d) => sum + d.failedCalls, 0);
    
    return res.json({
      daily: filtered,
      summary: {
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: totalCost,
        totalFailed,
        averageCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
      },
      period: {
        days,
        startDate: filtered[filtered.length - 1]?.date ?? null,
        endDate: filtered[0]?.date ?? null,
      },
    });
  } catch (err) {
    logger.error({ err }, "nia: failed to get cost summary");
    return res.status(500).json({ error: "Failed to get cost summary" });
  }
});

// GET /admin/costs/user/:userId — internal only, per-user cost breakdown
router.get("/admin/costs/user/:userId", async (req: Request, res: Response) => {
  const secret = req.headers["x-internal-secret"];
  if (!secret || secret !== (process.env.INTERNAL_SECRET ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  
  const userId = parseInt(String(req.params.userId), 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Invalid userId" });
  }
  
  try {
    const summary = await getDailyCostSummary(userId);
    return res.json({ userId, daily: summary });
  } catch (err) {
    logger.error({ err, userId }, "nia: failed to get user cost summary");
    return res.status(500).json({ error: "Failed to get user cost summary" });
  }
});


// PHASE 7b's proactive check-in endpoint used to live here as a duplicate,
// looser POST /checkin (haiku-based, no strict payload validation). It has
// been removed: checkin.ts registers the same path with the actual
// production-integrated implementation (strict CheckinPayload validation,
// opus, proper upsert into nia_conversations) — see checkin.ts for details.
// Because chatRouter mounted before checkinRouter, this dead duplicate was
// silently winning on every real request; deleting it lets the correct
// handler take over.

// ── PHASE 7c: Voice story sharing ─────────────────────────────────────────
// Authenticated: user sends raw voice transcript, Nia crafts it into a
// warm community story and returns the polished text for posting.
router.post("/share-story", parseOptionalAuth, async (req: Request, res: Response) => {
  // BUG-H06: Require internal secret before doing any Anthropic work
  if (!requireInternalSecret(req, res)) return;

  const userId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId ?? null;
  const body = req.body as Record<string, unknown>;
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
  const userName   = typeof body.userName   === "string" ? body.userName.trim()   : "A neighbor";
  const helperName = typeof body.helperName === "string" ? body.helperName.trim() : null;
  const category   = typeof body.category   === "string" ? body.category.trim()   : "";

  if (!transcript || transcript.length < 10) {
    return res.status(400).json({ error: "transcript is required (min 10 chars)" });
  }
  if (transcript.length > 3000) {
    return res.status(400).json({ error: "transcript too long (max 3000 chars)" });
  }

  const helperLine = helperName ? ` with the help of ${helperName}` : "";
  const prompt = `You are Nia, a warm community AI for Niakofa — a mutual aid platform that serves communities across the United States.

${userName} just recorded a voice story about receiving community help${helperLine}. Here is their raw transcript:

"${transcript}"

Your job: Turn this into a warm, authentic 2–4 sentence community story in THEIR voice — not yours. 
Rules:
- Write in first person as ${userName}
- Keep their authentic words and emotion — just clean up speech-to-text artifacts
- Do NOT add emojis, hashtags, or formal language
- Do NOT mention Nia or the AI
- End with something that invites others ("If you need help, just ask" or similar)
- Max 80 words
- Return ONLY the polished story text, nothing else`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const story = response.content[0].type === "text"
      ? response.content[0].text.trim()
      : transcript;

    return res.json({ ok: true, story, userName, helperName, category });
  } catch (err) {
    logger.error({ err }, "share-story: failed to craft story");
    return res.status(500).json({ error: "Failed to craft story" });
  }
});

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

// ── Internal cache-flush endpoint ─────────────────────────────────────────
// Called by api-server's nia-toggle handler immediately after a toggle so the
// 10-second in-process TTL doesn't delay the kill-switch effect.
router.post("/internal/flush-nia-cache", (req: Request, res: Response) => {
  const secret = req.headers["x-internal-secret"];
  if (!secret || secret !== (process.env.INTERNAL_SECRET ?? "")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // Import the cache variables directly — reset them so the next isNiaEnabled()
  // call hits the DB instead of returning the stale cached value.
  // We re-export a resetNiaCache helper from db.ts (added separately)
  import("../lib/db.js").then(({ resetNiaCache }) => {
    if (typeof resetNiaCache === "function") resetNiaCache();
  }).catch(() => {});
  return res.json({ ok: true, flushed: true });
});

// cache-bust: 1782594200

/**
 * Build food intent prefix — tells Nia what food signal was detected client-side.
 * Phase 7c: Food Intelligence
 */
function buildFoodIntentPrefix(
  signal: string | null,
  signalCount: number,
  lat: number | null,
  lon: number | null
): string {
  if (!signal || signal === "none" || signal === "affirmative") return "";

  const locationHint = lat !== null && lon !== null
    ? `User coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}. Use these to recommend the nearest food resource. `
    : "";

  const signalInstructions: Record<string, string> = {
    explicit_no:
      "FOOD SIGNAL — EXPLICIT NO: The user said no when asked if they've eaten. " +
      "Do not ask follow-up questions. Lead immediately with the most accessible food resource. " +
      "Warm, fast, specific. One or two options max. " + locationHint,
    implicit_no:
      "FOOD SIGNAL — IMPLICIT: The user signaled they may not have food. " +
      "Acknowledge what they said first. Then offer a food resource naturally. " + locationHint,
    distress:
      "FOOD SIGNAL — DISTRESS: The user directly expressed hunger or no food. URGENT. " +
      "Lead with the fastest option (Text FOOD to 877-877 or Presbyterian Night Shelter if evening). " +
      "Do not pad. Help now. " + locationHint,
    deflection:
      "FOOD SIGNAL — DEFLECTION: User said they're fine after a care check but may not be. " +
      "Plant one seed gently then move on. " + locationHint,
  };

  const repeatNote = signalCount > 1
    ? "REPEAT FOOD SIGNAL: After addressing immediate need, mention Niakofa's recurring request feature.\n\n"
    : "";

  const instruction = signalInstructions[signal];
  if (!instruction) return "";
  return `${instruction}\n\n${repeatNote}`;
}
