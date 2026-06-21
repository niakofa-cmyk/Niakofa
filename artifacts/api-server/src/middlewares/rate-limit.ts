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
