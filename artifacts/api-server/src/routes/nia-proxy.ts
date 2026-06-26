/**
 * Nia Service Proxy
 *
 * Proxies /api/nia/* requests to the standalone nia-service.
 * Benefits over direct frontend→nia-service calls:
 *   - No hardcoded external URL in frontend bundles
 *   - Auth validation at the api-server boundary before forwarding
 *   - Rate limiting applied here (crisisAwareChatLimiter)
 *   - Input sanitization (message length cap, session ID validation)
 *   - SSE streaming is piped through cleanly
 *   - Accept-Language is forwarded so Nia responds in the user's language
 *
 * The nia-service URL is configured via NIA_SERVICE_URL env var.
 * Falls back to localhost:3001 for local development.
 */
import { Router, type Request, type Response } from "express";
import { parseAuth } from "../middlewares/auth";
import { crisisAwareChatLimiter, niaChatHistoryLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

const getNiaUrl = () =>
  (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");

// ── Sanitize message input ────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 2000;
const SESSION_ID_PATTERN = /^[\w-]{6,128}$/;

function sanitizeMessage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
  return trimmed;
}

function sanitizeSessionId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!SESSION_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

// ── POST /api/nia/chat — main conversational endpoint (SSE streaming) ─────────
router.post(
  "/nia/chat",
  parseAuth,
  crisisAwareChatLimiter,
  async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;

    const message = sanitizeMessage(body.message);
    if (!message) {
      return res.status(400).json({ error: "message is required and must be under 2000 characters" });
    }

    const sessionId = sanitizeSessionId(body.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required (6–128 alphanumeric/dash characters)" });
    }

    // userId comes ONLY from the verified Bearer token — never from the body
    const userId = req.authenticatedUserId ?? null;

    // Phase 3: Detect language from Accept-Language header and pass to nia-service.
    // The nia-service injects this into the system prompt so Nia responds in the
    // user's language. Frontend may also pass an explicit language preference.
    const acceptLanguage = req.headers["accept-language"] ?? null;
    const explicitLanguage =
      typeof body.language === "string" && body.language.trim()
        ? body.language.trim()
        : null;
    const resolvedLanguage = explicitLanguage ?? parsePrimaryLanguage(acceptLanguage);

    const upstreamBody = JSON.stringify({
      message,
      sessionId,
      userId,
      userName: typeof body.userName === "string" ? body.userName.slice(0, 100) : null,
      accountType: typeof body.accountType === "string" ? body.accountType : null,
      helperModeActive: body.helperModeActive === true,
      activeRequestId:
        typeof body.activeRequestId === "number"
          ? body.activeRequestId
          : typeof body.activeRequestId === "string" && body.activeRequestId.trim()
          ? Number(body.activeRequestId)
          : null,
      lat: typeof body.lat === "number" ? body.lat : null,
      lon: typeof body.lon === "number" ? body.lon : null,
      language: resolvedLanguage,
      liveContext:
        typeof body.liveContext === "object" && body.liveContext !== null
          ? body.liveContext
          : null,
      // Phase 7a: voice wake word context — language and activation flag
      voiceActivated: body.voiceActivated === true,
      wakeWordLanguage:
        typeof body.wakeWordLanguage === "string" ? body.wakeWordLanguage : undefined,
      // Phase 7c: food intent signal — detected client-side, forwarded so
      // nia-service can inject the precision food directive into the system prompt
      foodSignal:
        typeof body.foodSignal === "string" ? body.foodSignal : undefined,
      foodSignalCount:
        typeof body.foodSignalCount === "number" ? body.foodSignalCount : undefined,
    });

    try {
      const upstream = await fetch(`${getNiaUrl()}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(req.headers.authorization
            ? { Authorization: req.headers.authorization }
            : {}),
        },
        body: upstreamBody,
        duplex: "half",
      } as RequestInit & { duplex: "half" });

      if (upstream.status === 429) {
        const body = await upstream.json().catch(() => ({}));
        return res.status(429).json(body);
      }

      if (!upstream.ok) {
        logger.warn({ status: upstream.status }, "nia-proxy: upstream error");
        return res
          .status(upstream.status)
          .json({ error: "Nia is unavailable right now. Please try again." });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (!upstream.body) return res.end();

      const reader = upstream.body.getReader();
      req.on("close", () => reader.cancel());

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!res.writableEnded) res.write(value);
      }
      if (!res.writableEnded) res.end();
      return;
    } catch (err) {
      logger.error({ err }, "nia-proxy: upstream fetch failed");
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
      }
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            message: "Nia is having trouble connecting. If this is an emergency, call 911 or text 988.",
          })}\n\n`
        );
        res.end();
      }
      return;
    }
  }
);

// ── GET /api/nia/history/:sessionId — conversation history ───────────────────
router.get("/nia/history/:sessionId", parseAuth, niaChatHistoryLimiter, async (req: Request, res: Response) => {
  const sessionId = sanitizeSessionId(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: "Invalid sessionId" });

  const userId = req.authenticatedUserId;
  if (userId !== undefined && !sessionId.startsWith(`${userId}-`) && !sessionId.startsWith(`anon-`)) {
    return res.status(403).json({ error: "You can only read your own conversation history" });
  }

  try {
    const upstream = await fetch(`${getNiaUrl()}/history/${encodeURIComponent(sessionId)}`, {
      headers: req.headers.authorization
        ? { authorization: req.headers.authorization }
        : {},
    });
    if (!upstream.ok) return res.json([]);
    return res.json(await upstream.json());
  } catch {
    return res.json([]);
  }
});

// ── GET /api/nia/memory — user's Nia memory (privacy-facing) ─────────────────
// Phase 1: Returns what Nia remembers about the authenticated user so they can
// review and understand their stored memory. Required for privacy/trust.
router.get("/nia/memory", parseAuth, async (req: Request, res: Response) => {
  const userId = req.authenticatedUserId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const upstream = await fetch(`${getNiaUrl()}/memory/${userId}`, {
      headers: req.headers.authorization
        ? { Authorization: req.headers.authorization }
        : {},
    });
    if (!upstream.ok) return res.json({ memory: null, structured: {} });
    return res.json(await upstream.json());
  } catch {
    return res.json({ memory: null, structured: {} });
  }
});

// ── DELETE /api/nia/memory — clear user's Nia memory ────────────────────────
// Privacy right: users can erase what Nia remembers about them at any time.
router.delete("/nia/memory", parseAuth, async (req: Request, res: Response) => {
  const userId = req.authenticatedUserId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const upstream = await fetch(`${getNiaUrl()}/memory/${userId}`, {
      method: "DELETE",
      headers: req.headers.authorization
        ? { Authorization: req.headers.authorization }
        : {},
    });
    if (!upstream.ok) return res.status(500).json({ error: "Failed to clear memory" });
    return res.json({ cleared: true });
  } catch {
    return res.status(500).json({ error: "Failed to clear memory" });
  }
});

export default router;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts the primary language code from an Accept-Language header.
 * "es-MX,es;q=0.9,en;q=0.8" → "es"
 * Returns null if the header is absent or malformed, or if the primary
 * language is English (no need to inject a directive for the default).
 */
function parsePrimaryLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  const primary = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
  if (!primary) return null;
  const lang = primary.split("-")[0]?.toLowerCase();
  if (!lang || lang === "en") return null;
  return lang;
}
