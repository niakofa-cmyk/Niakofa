/**
 * Niakofa Rate Limiting Middleware
 *
 * Philosophy from the product doc: protect good people, never punish them.
 * All error messages are SOFT — informative, not hostile.
 * Limits escalate from gentle warnings to hard stops only when necessary.
 *
 * Trust model (future): high-trust/verified users get higher limits.
 * Today: IP-based and userId-based limits that are generous but enforceable.
 *
 * STORE: backed by Redis when configured (via the shared connection in
 * lib/queue.ts) so limits are enforced consistently across restarts and
 * multiple instances. Falls back to express-rate-limit's default in-memory
 * store when Redis isn't configured — same graceful-degradation pattern
 * used everywhere else in this codebase (queues, cache).
 */
import { rateLimit, type Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisConnection } from "../lib/queue";
import { isCrisisModeActive } from "../lib/crisis-state";
import type { Request, Response, NextFunction } from "express";

function createStore(prefix: string): Store | undefined {
  const redis = getRedisConnection();
  if (!redis) return undefined; // falls back to default in-memory store
  return new RedisStore({
    sendCommand: (command: string, ...rest: string[]) =>
      redis.call(command, ...rest) as ReturnType<RedisStore["sendCommand"]>,
    prefix: `rl:${prefix}:`,
  });
}

// ── 1. Auth Routes (10 / 15 min) ─────────────────────────────────────────────
// Protects: login, signup, password reset against brute-force / credential stuffing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("auth"),
  message: {
    error:
      "Too many sign-in attempts from this device. Please wait 15 minutes and try again. " +
      "If you're having trouble, contact support@niakofa.com.",
  },
});

// ── 2. Request Creation (10 / hour per requester) ────────────────────────────
// Protects against spam help requests, troll floods, fake emergencies.
// Keyed by requester_id from body (not IP) — prevents VPN bypass while
// allowing multiple users behind a shared NAT.
export const requestCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("req-create"),
  keyGenerator: (req) => {
    // This route always runs requireAuth + requireOwnership("requester_id")
    // before this limiter, so authenticatedUserId is guaranteed present.
    // BUG-016: Guard against undefined — if middleware order is ever changed
    // and authenticatedUserId is missing, block the request with a fixed key
    // rather than allowing unlimited requests under the undefined key.
    if (!req.authenticatedUserId) {
      return "req-create-unauthenticated-blocked";
    }
    return `req-create-${req.authenticatedUserId}`;
  },
  message: {
    error:
      "You've created several requests recently. " +
      "Please wait a few minutes before creating another — this keeps the map clear for people who need help most.",
  },
});

// ── 3. GPS Location Updates (1 / 3 seconds per user) ─────────────────────────
// Prevents battery drain, server overload, and GPS stream abuse.
// Keyed by userId from URL params so one user can't block another.
export const gpsLimiter = rateLimit({
  windowMs: 3_000,
  limit: 1,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("gps"),
  keyGenerator: (req) =>
    `gps-${req.params?.["id"] ?? "unknown"}-${req.ip ?? ""}`,
  message: {
    error:
      "Location updates are throttled to protect the network. " +
      "Your app will automatically retry — no action needed.",
  },
});

// ── 4. Payment Endpoints (20 / 15 min) ───────────────────────────────────────
// Protects: payout triggers, payment-intent creation, wallet operations
// against replay attacks and spam triggers.
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("payment"),
  message: {
    error:
      "Too many payment requests in a short period. " +
      "Please wait a few minutes before trying again.",
  },
});

// ── 5. General API (200 / 15 min) ────────────────────────────────────────────
// Broad protection on all /api routes. High enough that normal users never hit it.
// Blocks only clearly automated abuse (scrapers, bots, DoS).
// ── Civic Suggestions (5 / hour per IP) ──────────────────────────────────────
// Public, unauthenticated write endpoint — caps spam/abuse submissions
// without requiring sign-in for a low-stakes "suggest a resource" form.
export const civicSuggestionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("civic-suggestion"),
  message: {
    error: "Too many suggestions submitted. Please try again in an hour.",
  },
});

export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("general"),
  message: {
    error:
      "Too many requests from this address. " +
      "Please slow down and try again in a few minutes.",
  },
});

// ── 6. Chat Messages (30 / min per user) ─────────────────────────────────────
// Key on the authenticated userId (set by parseAuth before this runs).
// Falls back to IP only when there is no verified token (should not happen
// on POST chat since requireAuth runs first, but defensive).
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("chat"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `chat-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "You're sending messages too fast. Slow down a little." },
});

// ── 6b. Crisis-exempt Chat Limiter ──────────────────────────────────────────
// During a crisis, users may need to send rapid check-ins, safety updates,
// or resource requests. This limiter is used instead of chatLimiter when
// req.crisisMode === true (set by the crisis bypass middleware below).
// 120/min (4x normal) — generous enough for real emergencies, still blocks bots.
export const crisisChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("chat-crisis"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `chat-crisis-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Please slow down a little — even during an emergency." },
});

// ── 6c. Crisis Mode Bypass Middleware ────────────────────────────────────────
// Checks if crisis mode is active (via CRISIS_MODE_ACTIVE env var set by
// the crisis/activate route). If active, skips the normal chatLimiter and
// uses crisisChatLimiter instead so users are never cut off during emergencies.
export async function crisisAwareChatLimiter(req: Request, res: Response, next: NextFunction) {
  const crisisActive = await isCrisisModeActive();
  if (crisisActive) {
    return crisisChatLimiter(req, res, next);
  }
  return chatLimiter(req, res, next);
}

// ── 7. Navigation/Directions (60 / 15 min per user) ──────────────────────────
// Protects against unmetered cost-amplification against the paid Mapbox
// Directions API — this route proxies directly to a billed third-party API.
export const navigationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("navigation"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nav-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many route requests in a short period. Please wait a few minutes." },
});

// ── 8. Request State Transitions (claim/en-route — 20 / 15 min per user) ────
// Previously only covered by the broad 200/15min global limiter — this adds
// a tighter, dedicated limit specifically on claim/en-route to prevent
// abuse/spam of request state transitions by an authenticated user.
export const requestActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("request-action"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `req-action-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many request actions in a short period. Please wait a few minutes." },
});

// ── 9. Community Posts (5 / 15 min per user) ─────────────────────────────────
// Tighter limit than the general API — community posts go into the public feed
// and a human moderator reviews pending ones. 5/15 min is generous for genuine
// community members, tight enough to prevent feed-flooding by automated accounts.
export const communityPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("community-post"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `community-post-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: {
    error:
      "You've posted several times recently. " +
      "Please wait a few minutes before posting again — this keeps the community feed fresh for everyone.",
  },
});

// ── 10. Nia Chat (30 / min per user, crisis-aware) ───────────────────────────
// Exported for use in the nia-proxy route in addition to the direct chat route.
// Reuses crisisAwareChatLimiter — no need for a new limiter.

// ── 11. Push Subscribe/Unsubscribe (10/15 min per user) ─────────────────────
// BUG-4-H03: Push notification endpoints had no per-user rate limit. A script
// could trigger thousands of OS-level notifications to any user. This caps
// subscribe/unsubscribe churn to prevent both spam and subscription flooding.
export const pushSubscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("push-subscribe"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `push-sub-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many push subscription changes. Please try again later." },
});

// ── SOS panic button (3/hour per user) ───────────────────────────────────────
export const sosLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("sos"),
  keyGenerator: (req) => String(req.authenticatedUserId ?? req.ip),
  message: { error: "SOS limit reached — please call 911 for immediate emergencies." },
});

// ── 12. Admin endpoints (100 / 15 min per admin user) ────────────────────────
// Admin users perform bulk operations (report review, user management, analytics)
// but should still be rate-limited to prevent runaway automation or compromised
// admin token abuse. 100/15min is generous for legitimate admin work while
// blocking automated scraping or scanning of admin-only data.
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("admin"),
  keyGenerator: (req) => `admin-${String(req.authenticatedUserId ?? req.ip)}`,
  message: {
    error: "Too many admin requests in a short period. Please wait a few minutes.",
  },
});

// ── 13. Nia history reads (60 / 15 min per user) ─────────────────────────────
// History reads are cheap but should be bounded to prevent session-ID scraping
// (enumerating conversation history across sessions). Keyed by userId + IP.
export const niaChatHistoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("nia-history"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-hist-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many Nia history requests. Please slow down." },
});

// ── Voice I/O (Phase 6) ───────────────────────────────────────────────────────
// Voice (STT + TTS) is meaningfully more expensive per call than text chat —
// a real per-minute provider cost on both legs, not just LLM tokens. Tighter
// budget than chatLimiter, and per-user only (no anonymous voice — voice
// routes require requireAuth, unlike text chat which allows anonymous use).
export const voiceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  store: createStore("nia-voice"),
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-voice-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "You've reached the hourly voice limit with Nia. Text chat is still available." },
});
