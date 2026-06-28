/**
 * Niakofa Rate Limiting Middleware
 *
 * Philosophy from the product doc: protect good people, never punish them.
 * All error messages are SOFT — informative, not hostile.
 * Limits escalate from gentle warnings to hard stops only when necessary.
 *
 * Trust model (future): high-trust/verified users get higher limits.
 * Today: IP-based and userId-based limits that are generous but enforceable.
 */
import { rateLimit } from "express-rate-limit";

// ── 1. Auth Routes (10 / 15 min) ─────────────────────────────────────────────
// Protects: login, signup, password reset against brute-force / credential stuffing.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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
  keyGenerator: (req) => {
    // Key on the authenticated userId set by parseAuth (runs before all routes).
    // Never key on req.body.requester_id — unauthenticated body data can be spoofed
    // to rotate around the limit.
    const userId = req.authenticatedUserId;
    return userId ? `req-create-${userId}` : `req-create-ip-${req.ip ?? "unknown"}`;
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
  message: {
    error:
      "Too many payment requests in a short period. " +
      "Please wait a few minutes before trying again.",
  },
});

// ── 5. General API (200 / 15 min) ────────────────────────────────────────────
// Broad protection on all /api routes. High enough that normal users never hit it.
// Blocks only clearly automated abuse (scrapers, bots, DoS).
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `chat-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "You're sending messages too fast. Slow down a little." },
});
// ── 7. Crisis-Aware Chat (20 / min per user, tighter during crisis window) ───
// Used by nia-proxy for the /nia/chat endpoint. Named "crisis-aware" because
// we intentionally keep this generous — someone in a mental health moment
// should not hit a rate limit. 20/min is still abuse protection without
// punishing someone who needs to talk.
export const crisisAwareChatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-chat-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "You're sending messages too quickly. Please slow down." },
});

// ── 8. Nia Chat History (60 / 15 min per user) ───────────────────────────────
// History reads are cheap but should still be throttled against scraping.
export const niaChatHistoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nia-history-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many history requests. Please wait a moment." },
});

// ── 9. Admin Endpoints (30 / 15 min) ─────────────────────────────────────────
// Admin routes are low-volume by design; this mainly protects against
// automated scripts hammering the analytics endpoints.
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many admin requests. Please slow down." },
});

// ── 10. Voice I/O (30 / hour per user) ───────────────────────────────────────
// STT and TTS calls hit OpenAI — cost-sensitive. 30/hour is generous for
// real usage but protects against accidental loops or abuse.
export const voiceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `voice-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Voice limit reached. Please wait an hour before trying again." },
});

// ── 11. Navigation / Directions (60 / min per user) ──────────────────────────
// Mapbox directions calls are metered — 60/min is generous for real turn-by-turn
// usage (a new route request per second) while blocking runaway loops or scrapers.
export const navigationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const r = req as typeof req & { authenticatedUserId?: number };
    return `nav-${r.authenticatedUserId ?? req.ip ?? "unknown"}`;
  },
  message: { error: "Too many route requests. Please wait a moment before fetching a new route." },
});
