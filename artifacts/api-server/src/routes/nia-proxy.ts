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
import { parseAuth, requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { crisisAwareChatLimiter, niaChatHistoryLimiter, adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendNiaEventToUser } from "../lib/ws-hub";

const router = Router();

const getNiaUrl = () =>
  (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");

// ── DB-backed Nia enabled check ───────────────────────────────────────────────
// Exported so a regression test can assert the fail-closed default directly,
// instead of only indirectly through route behavior.
export async function isNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    // Nia is disabled by default. Must be explicitly "true" — any other value
    // (row missing, "false", empty string) means disabled. This is a fail-closed
    // posture: a missing DB row never accidentally enables AI on all users.
    return row?.value === "true";
  } catch {
    return false; // fail-closed: DB error → Nia disabled
  }
}

export interface CircleSummaryRequest {
  title: string;
  topic: string | null;
  duration_minutes: number | null;
}

/**
 * Internal AI boundary for recording summaries. Keeping this request here
 * ensures it has the same kill-switch, secret forwarding, and timeout policy
 * as the rest of api-server's Nia traffic.
 * Returns null when policy/configuration makes a summary unavailable; callers
 * can safely mark recordings ready without treating that as a recording error.
 */
export async function requestCircleSummary(body: CircleSummaryRequest): Promise<globalThis.Response | null> {
  if (!(await isNiaEnabled())) return null;
  const internalSecret = process.env["INTERNAL_SECRET"];
  if (!internalSecret) {
    logger.error("nia-proxy: INTERNAL_SECRET missing; refusing circle-summary request");
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetch(`${getNiaUrl()}/internal/circle-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": internalSecret },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

// ── Sanitize message input ────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 2000;
const SESSION_ID_PATTERN = /^[\w-]{6,200}$/;

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

// ── POST /api/nia/chat ────────────────────────────────────────────────────────
router.post(
  "/nia/chat",
  requireAuth,
  crisisAwareChatLimiter,
  async (req: Request, res: Response) => {
    if (!(await isNiaEnabled())) {
      return res.status(503).json({ error: "Nia is temporarily unavailable." });
    }

    const body = req.body as Record<string, unknown>;

    const message = sanitizeMessage(body.message);
    if (!message) {
      return res.status(400).json({ error: "message is required and must be under 2000 characters" });
    }

    const sessionId = sanitizeSessionId(body.sessionId);
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required (6\u2013128 alphanumeric/dash characters)" });
    }

    const userId = req.authenticatedUserId ?? null;

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
      voiceActivated: body.voiceActivated === true,
      wakeWordLanguage:
        typeof body.wakeWordLanguage === "string" ? body.wakeWordLanguage : undefined,
      foodSignal:
        typeof body.foodSignal === "string" ? body.foodSignal : undefined,
      foodSignalCount:
        typeof body.foodSignalCount === "number" ? body.foodSignalCount : undefined,
      // GPS-resolved City/County/State from client reverse geocode — more accurate than server IP
      city: typeof body.city === "string" ? body.city.slice(0, 100) : undefined,
      county: typeof body.county === "string" ? body.county.slice(0, 100) : undefined,
      state: typeof body.state === "string" ? body.state.slice(0, 100) : undefined,
    });

    try {
      const abortCtrl = new AbortController();
      const abortTimer = setTimeout(() => abortCtrl.abort(), 30_000);
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(`${getNiaUrl()}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.authorization
              ? { Authorization: req.headers.authorization }
              : {}),
            // BUG-H06: Forward internal secret so nia-service can verify the
            // request came through api-server's auth/rate-limit layer.
            "x-internal-secret": process.env["INTERNAL_SECRET"] ?? "",
          },
          body: upstreamBody,
          duplex: "half",
          signal: abortCtrl.signal,
        } as RequestInit & { duplex: "half" });
      } finally {
        clearTimeout(abortTimer);
      }

      if (upstream.status === 429) {
        const body = await upstream.json().catch(() => ({}));
        return res.status(429).json(body);
      }

      if (!upstream.ok) {
        logger.warn({ status: upstream.status }, "nia-proxy: upstream error");
        // Emit nia_status event to inform client of NIA unavailability
        if (userId) {
          sendNiaEventToUser(userId, "nia_status", { status: "unavailable", reason: "upstream_error" });
        }
        return res
          .status(upstream.status)
          .json({ error: "Nia is unavailable right now. Please try again." });
      }

      // Emit nia_typing event to indicate NIA is processing
      if (userId) {
        sendNiaEventToUser(userId, "nia_typing", { status: "started", sessionId });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");

      if (!upstream.body) return res.end();

      const reader = upstream.body.getReader();
      // Track client disconnect so the read loop exits cleanly without
      // logging a spurious error when reader.cancel() throws.
      let clientClosed = false;
      const onClientClose = () => {
        clientClosed = true;
        reader.cancel().catch(() => { /* expected — reader already closed */ });
      };
      req.on("close", onClientClose);

      try {
        while (true) {
          // If the client already disconnected, stop reading from upstream.
          if (clientClosed || res.destroyed) break;
          const { done, value } = await reader.read();
          if (done) break;
          // Guard both conditions — res could be destroyed mid-read.
          if (!res.destroyed && !res.writableEnded) {
            try {
              res.write(value);
            } catch {
              // Write to a closed socket — treat as client disconnect.
              clientClosed = true;
              break;
            }
          }
        }
      } finally {
        req.off("close", onClientClose);
        reader.cancel().catch(() => { /* already cancelled */ });
      }

      if (!res.destroyed && !res.writableEnded) res.end();

      if (!clientClosed) {
        // Only fire "delivered" events when the stream completed normally
        // (not when the user navigated away mid-stream).
        if (userId) {
          sendNiaEventToUser(userId, "nia_typing", { status: "stopped", sessionId });
          sendNiaEventToUser(userId, "nia_message", { status: "delivered", sessionId });
        }
      }
      return;
    } catch (err) {
      logger.error({ err }, "nia-proxy: upstream fetch failed");
      // Emit nia_status error event to inform client
      if (userId) {
        sendNiaEventToUser(userId, "nia_status", { status: "error", reason: "fetch_failed", sessionId });
      }
      if (!res.headersSent) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
      }
      if (!res.writableEnded && !res.destroyed) {
        try {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              message: "Nia is having trouble connecting. In an emergency: 112 (global/Europe/Africa) · 999 (UK) · 911 (US/Canada). Crisis support: findahelpline.com",
            })}\n\n`
          );
          res.end();
        } catch {
          // Socket already closed mid-stream — swallow silently
        }
      }
      return;
    }
  }
);

// ── GET /api/nia/history/:sessionId ──────────────────────────────────────────
router.get("/nia/history/:sessionId", parseAuth, niaChatHistoryLimiter, async (req: Request, res: Response) => {
  if (!(await isNiaEnabled())) { return res.status(503).json({ error: "Nia is temporarily unavailable." }); }
  const sessionId = sanitizeSessionId(req.params.sessionId);
  if (!sessionId) return res.status(400).json({ error: "Invalid sessionId" });

  const userId = req.authenticatedUserId;
  if (userId === undefined) {
    if (!sessionId.startsWith("anon-")) {
      return res.status(403).json({ error: "Authentication required to read non-anonymous conversation history" });
    }
  } else if (!sessionId.startsWith(`${userId}-`) && !sessionId.startsWith("anon-")) {
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

// ── GET /api/nia/memory ───────────────────────────────────────────────────────
router.get("/nia/memory", requireAuth, async (req: Request, res: Response) => {
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }
  const userId = req.authenticatedUserId!

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

// ── DELETE /api/nia/memory ────────────────────────────────────────────────────
router.delete("/nia/memory", requireAuth, async (req: Request, res: Response) => {
  if (!(await isNiaEnabled())) {
    return res.status(503).json({ error: "Nia is temporarily unavailable." });
  }
  const userId = req.authenticatedUserId!

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

// ── POST /api/nia/analyze-image ──────────────────────────────────────────────
// Proxies to the nia-service /analyze-image endpoint.
// Body: { imageBase64: string (data URL or raw base64), mediaType?: string, question?: string }
// Returns: { analysis: string }
//
// This is the "snap a photo of what needs fixing, Nia will describe it" feature
// wired into the request-creation flow (request-new.tsx).
// Requires authentication to prevent unauthenticated LLM abuse.
router.post(
  "/nia/analyze-image",
  requireAuth,
  crisisAwareChatLimiter,
  async (req: Request, res: Response) => {
    if (!(await isNiaEnabled())) {
      return res.status(503).json({ error: "Nia is temporarily unavailable." });
    }

    const body = req.body as Record<string, unknown>;
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    // Size guard: base64 is ~4/3 the raw bytes; 6.8MB base64 ≈ 5MB raw
    const rawBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    if (rawBase64.length > 6_800_000) {
      return res.status(413).json({ error: "Image too large — please use an image under 5MB" });
    }

    const upstreamBody = JSON.stringify({
      imageBase64,
      mediaType: typeof body.mediaType === "string" ? body.mediaType : undefined,
      question: typeof body.question === "string" ? body.question.slice(0, 500) : undefined,
    });

    try {
      const abortCtrl = new AbortController();
      const abortTimer = setTimeout(() => abortCtrl.abort(), 30_000);
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(`${getNiaUrl()}/analyze-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env["INTERNAL_SECRET"] ?? "",
            ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          },
          body: upstreamBody,
          signal: abortCtrl.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      if (!upstream.ok) {
        const errBody = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json(errBody);
      }

      const result = await upstream.json();
      return res.json(result);
    } catch (err) {
      logger.error({ err }, "nia-proxy: analyze-image upstream fetch failed");
      return res.status(503).json({ error: "Nia image analysis is unavailable right now." });
    }
  }
);

// ── POST /api/nia/share-story ─────────────────────────────────────────────────
router.post("/nia/share-story", requireAuth, async (req: Request, res: Response) => {
  if (!(await isNiaEnabled())) return res.status(503).json({ error: "Nia is temporarily unavailable." });
  const userId = req.authenticatedUserId!

  const body = req.body as Record<string, unknown>;
  const transcript = typeof body.transcript === "string" ? body.transcript.slice(0, 3000) : "";
  if (!transcript || transcript.length < 10) {
    return res.status(400).json({ error: "transcript is required" });
  }

  try {
    const upstream = await fetch(`${getNiaUrl()}/share-story`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
        // BUG-H06: Forward internal secret so nia-service can verify call came through proxy
        "x-internal-secret": process.env["INTERNAL_SECRET"] ?? "",
      },
      body: JSON.stringify({
        transcript,
        userName: typeof body.userName === "string" ? body.userName.slice(0, 100) : "A neighbor",
        helperName: typeof body.helperName === "string" ? body.helperName.slice(0, 100) : null,
        category: typeof body.category === "string" ? body.category : "",
        userId,
      }),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Failed to craft story" });
    
    // Emit nia_memory_update event when story is successfully crafted
    const result = await upstream.json() as { story?: string; category?: string };
    sendNiaEventToUser(userId, "nia_memory_update", { 
      type: "story_crafted", 
      story: result.story,
      category: result.category 
    });
    
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "nia-proxy: share-story failed");
    return res.status(500).json({ error: "Failed to craft story" });
  }
});

// ── POST /api/nia/knowledge-refresh (admin only) ──────────────────────────────
// Triggers an immediate Nia learning cycle on the nia-service.
// Used by the admin panel to force-refresh Nia's knowledge without waiting 6h.
// The full cycle can take several minutes — the client should show a spinner.
//
// ── Kill-switch exemption (INTENTIONAL) ──────────────────────────────────────
// This route deliberately does NOT check isNiaEnabled() before proxying.
// Rationale: admins need to be able to refresh Nia's knowledge base WHILE the
// toggle is off — the typical workflow is "prep knowledge → verify → then enable."
// Gating this on isNiaEnabled() would break that workflow and force admins to
// enable Nia (exposing it to users) just to run a learning cycle. The route is
// already behind requireAuth + requireAdmin() + adminLimiter, so no end-user
// can reach it. This is the same documented reasoning used by crisis-followup-
// worker: safety/maintenance functions must not be blocked by the product toggle.
// ──────────────────────────────────────────────────────────────────────────────
router.post(
  "/nia/knowledge-refresh",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (_req: Request, res: Response) => {

    try {
      const abortCtrl = new AbortController();
      // 10-minute timeout — the full cycle takes ~5 minutes (30s gap × 7 topics)
      const abortTimer = setTimeout(() => abortCtrl.abort(), 10 * 60_000);
      let upstream: globalThis.Response;
      try {
        upstream = await fetch(`${getNiaUrl()}/knowledge-refresh`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": process.env["INTERNAL_SECRET"] ?? "",
          },
          signal: abortCtrl.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      if (!upstream.ok) {
        const body = await upstream.json().catch(() => ({}));
        return res.status(upstream.status).json(body);
      }

      const result = await upstream.json();
      logger.info({ result }, "nia-proxy: admin triggered knowledge refresh — cycle complete");
      return res.json(result);
    } catch (err) {
      logger.error({ err }, "nia-proxy: knowledge-refresh upstream failed");
      return res.status(503).json({ error: "Knowledge refresh failed — nia-service may be unavailable" });
    }
  }
);

export default router;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrimaryLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  const primary = acceptLanguage.split(",")[0]?.split(";")[0]?.trim();
  if (!primary) return null;
  const lang = primary.split("-")[0]?.toLowerCase();
  if (!lang || lang === "en") return null;
  return lang;
}
