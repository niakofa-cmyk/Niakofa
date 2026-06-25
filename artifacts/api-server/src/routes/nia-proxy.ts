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
 *
 * The nia-service URL is configured via NIA_SERVICE_URL env var.
 * Falls back to localhost:3001 for local development.
 */
import { Router, type Request, type Response } from "express";
import { parseAuth } from "../middlewares/auth";
import { crisisAwareChatLimiter } from "../middlewares/rate-limit";
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

    const upstreamBody = JSON.stringify({
      message,
      sessionId,
      // Server-authoritative userId — overrides anything the client may have sent
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
      liveContext:
        typeof body.liveContext === "object" && body.liveContext !== null
          ? body.liveContext
          : null,
    });

    try {
      const upstream = await fetch(`${getNiaUrl()}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward auth token so nia-service can also verify it
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

      // Forward SSE headers and pipe the stream
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
router.get("/nia/history/:sessionId", parseAuth, async (req: Request, res: Response) => {
  const sessionId = sanitizeSessionId(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: "Invalid sessionId" });

  try {
    const upstream = await fetch(`${getNiaUrl()}/history/${encodeURIComponent(sessionId)}`);
    if (!upstream.ok) return res.json([]);
    return res.json(await upstream.json());
  } catch {
    return res.json([]);
  }
});

export default router;
