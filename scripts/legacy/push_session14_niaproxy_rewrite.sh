#!/usr/bin/env bash
# Session 14 — Complete rewrite of nia-proxy.ts + force Railway rebuild
set -e
cd ~/niakofa
git pull origin main

echo "── Writing complete nia-proxy.ts from scratch ──"
cat > artifacts/api-server/src/routes/nia-proxy.ts << 'TSEOF'
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
import { niaEnabled } from "./admin-analytics";

const router = Router();

const getNiaUrl = () =>
  (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");

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
  parseAuth,
  crisisAwareChatLimiter,
  async (req: Request, res: Response) => {
    if (!niaEnabled) {
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
    });

    try {
      const abortCtrl = new AbortController();
      const abortTimer = setTimeout(() => abortCtrl.abort(), 30_000);
      let upstream: Response;
      try {
        upstream = await fetch(`${getNiaUrl()}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(req.headers.authorization
              ? { Authorization: req.headers.authorization }
              : {}),
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

// ── GET /api/nia/history/:sessionId ──────────────────────────────────────────
router.get("/nia/history/:sessionId", parseAuth, niaChatHistoryLimiter, async (req: Request, res: Response) => {
  if (!niaEnabled) { return res.status(503).json({ error: "Nia is temporarily unavailable." }); }
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

// ── DELETE /api/nia/memory ────────────────────────────────────────────────────
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

// ── POST /api/nia/share-story ─────────────────────────────────────────────────
router.post("/nia/share-story", parseAuth, async (req: Request, res: Response) => {
  if (!niaEnabled) return res.status(503).json({ error: "Nia is temporarily unavailable." });
  const userId = req.authenticatedUserId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

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
    return res.json(await upstream.json());
  } catch (err) {
    logger.error({ err }, "nia-proxy: share-story failed");
    return res.status(500).json({ error: "Failed to craft story" });
  }
});

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
TSEOF

echo "✓ nia-proxy.ts rewritten"

echo ""
echo "── Verifying all 5 routes present ──"
python3 - << 'PYEOF'
content = open("artifacts/api-server/src/routes/nia-proxy.ts").read()
routes = [
    ('POST /nia/chat',         'router.post(\n  "/nia/chat"' in content or '"/nia/chat"' in content),
    ('GET  /nia/history/:id',  'router.get("/nia/history/:sessionId"' in content),
    ('GET  /nia/memory',       'router.get("/nia/memory"' in content),
    ('DELETE /nia/memory',     'router.delete("/nia/memory"' in content),
    ('POST /nia/share-story',  'router.post("/nia/share-story"' in content),
    ('export default router',  'export default router' in content),
    ('share-story before export', content.index('router.post("/nia/share-story"') < content.index('export default router')),
]
all_ok = True
for name, ok in routes:
    print(f"{'✓' if ok else '✗ ERROR'} {name}")
    if not ok: all_ok = False
if not all_ok:
    import sys; sys.exit(1)
print("\nAll routes verified ✓")
PYEOF

echo ""
echo "── Confirm index.ts is clean (no niaShareStoryRouter) ──"
python3 - << 'PYEOF'
c = open("artifacts/api-server/src/routes/index.ts").read()
assert "niaShareStoryRouter" not in c, "ERROR: niaShareStoryRouter still in index.ts!"
assert "niaProxyRouter" in c, "ERROR: niaProxyRouter missing from index.ts!"
print("✓ index.ts clean — niaProxyRouter mounted, no duplicate")
PYEOF

echo ""
echo "── Force Railway rebuild ──"
python3 -c "
import pathlib, time, re
p = pathlib.Path('artifacts/api-server/build.mjs')
c = p.read_text()
c = re.sub(r'// cache-bust: \d+', f'// cache-bust: {int(time.time())}', c)
p.write_text(c)
print('✓ build.mjs cache-bust:', int(time.time()))
"
echo "$(date +%s)" > .build-cache-bust
echo "$(date +%s)" > .railway-cache-bust

echo ""
echo "── Committing and pushing ──"
git add \
  artifacts/api-server/src/routes/nia-proxy.ts \
  artifacts/api-server/build.mjs \
  .build-cache-bust \
  .railway-cache-bust

git commit -m "fix: complete rewrite of nia-proxy.ts — all 5 routes guaranteed

Full rewrite from verified source. Routes registered in order:
  POST   /api/nia/chat          (SSE streaming, kill-switch, rate-limit)
  GET    /api/nia/history/:id   (ownership check, kill-switch)
  GET    /api/nia/memory        (auth required)
  DELETE /api/nia/memory        (auth required)
  POST   /api/nia/share-story   (auth required, kill-switch)

export default router is AFTER all route registrations.
No duplicate nia-share-story.ts. index.ts mounts niaProxyRouter only.
build.mjs cache-busted to force fresh Railway build."

git push origin main

echo ""
echo "════════════════════════════════════════════════════════"
echo "✓ Pushed. Watch Railway dashboard. Wait ~2 min, then:"
echo ""
echo "curl -s -w '\nHTTP: %{http_code}\n' \\"
echo "  -X POST https://niakofa.com/api/nia/share-story \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"transcript\":\"Marcus helped me carry my groceries\",\"userName\":\"Treazure\",\"category\":\"groceries\"}'"
echo ""
echo "Expect: {\"error\":\"Authentication required\"} + HTTP: 401"
echo "════════════════════════════════════════════════════════"
