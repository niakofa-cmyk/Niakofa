import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership } from "../middlewares/authz";
import { db, usersTable, reportsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { logger } from "../lib/logger";
import { getStripeSecretKey } from "../lib/stripe-config";
import { sendSms } from "../lib/sms";
import { broadcast } from "../lib/ws-hub";

const router = Router();

const STRIPE_SK = getStripeSecretKey();
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion }) : null;
const APP_URL = process.env["APP_URL"] ?? "https://niakofa.com";

// ── Stripe Identity verification session ─────────────────────────────────────
// requireOwnership("user_id") added — this route had requireAuth but no
// ownership check at all, unlike every other user-scoped route in this file
// (safety-checkin, sos, panic-contacts all use requireOwnership). Without it,
// any authenticated user could pass an arbitrary user_id and: (1) trigger a
// billable Stripe Identity session against someone else's account, and
// (2) overwrite that user's stripe_identity_session_id with a session the
// caller controls — letting them complete verification with their own
// document/selfie while it gets attributed to the victim's account via the
// webhook above.
router.post("/verification/identity/start", requireAuth, requireOwnership("user_id"), async (req, res) => {
  const { user_id } = req.body as { user_id: number };
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  try {
    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: { user_id: String(user_id) },
      options: { document: { require_live_capture: true, require_matching_selfie: true } },
      return_url: `${APP_URL}/profile?verified=1`,
    });

    await db.update(usersTable)
      .set({
        identity_verification_status: "pending",
        stripe_identity_session_id: session.id,
      })
      .where(eq(usersTable.id, user_id));

    logger.info({ user_id, session_id: session.id }, "identity verification started");
    return res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    logger.error({ err }, "identity verification start failed");
    return res.status(500).json({ error: "Failed to create verification session" });
  }
});

// ── Webhook: Stripe Identity result ──────────────────────────────────────────
router.post("/verification/identity/webhook", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env["STRIPE_IDENTITY_WEBHOOK_SECRET"];
  if (!webhookSecret) {
    logger.error("identity webhook: STRIPE_IDENTITY_WEBHOOK_SECRET not configured — rejecting request");
    return res.status(503).json({ error: "Identity webhook not configured" });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err instanceof Error ? err.message : "Unknown"}`);
  }

  if (event.type === "identity.verification_session.verified") {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const userId = parseInt(session.metadata?.user_id ?? "0");
    if (userId) {
      await db.update(usersTable)
        .set({
          identity_verified: true,
          identity_verification_status: "verified",
          trust_score: 95,
        })
        .where(eq(usersTable.id, userId));

      broadcast({ type: "presence_update", payload: { user_id: userId, identity_verified: true } });
      logger.info({ user_id: userId }, "identity verified");
    }
  } else if (event.type === "identity.verification_session.requires_input") {
    const session = event.data.object as Stripe.Identity.VerificationSession;
    const userId = parseInt(session.metadata?.user_id ?? "0");
    if (userId) {
      await db.update(usersTable)
        .set({ identity_verification_status: "failed" })
        .where(eq(usersTable.id, userId));
    }
  }

  return res.json({ received: true });
});

// ── Passive safety check-in ───────────────────────────────────────────────────
// Called periodically during active requests to confirm helper is safe
router.post("/verification/safety-checkin/:userId", requireAuth, requireOwnership("userId"), async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  // Update last_seen (use updated_at as proxy)
  await db.update(usersTable)
    .set({ updated_at: new Date() })
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true, checked_in_at: new Date().toISOString() });
});

// ── SOS panic alert ───────────────────────────────────────────────────────────

// ── SOS panic alert rate limiter (3 per hour per user) ────────────────────────
// keyGenerator previously read req.userId, a field requireAuth never sets
// (it sets req.authenticatedUserId — see middlewares/auth.ts). That meant
// this always fell back to req.ip, so the limit was actually per-IP, not
// per-user: anyone sharing a network (household, office, carrier CGNAT)
// shared one 3-per-hour SOS bucket. sosLimiter runs after requireAuth in
// this route's middleware chain, so authenticatedUserId is reliably set.
const sosLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req) => String((req as { authenticatedUserId?: number }).authenticatedUserId ?? req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "SOS rate limit exceeded. If this is a real emergency please call 911." },
});

router.post("/verification/sos", requireAuth, sosLimiter, requireOwnership("user_id"), async (req, res) => {
  const { user_id, lat, lng, message } = req.body as {
    user_id: number;
    lat?: number;
    lng?: number;
    message?: string;
  };
  if (!user_id) return res.status(400).json({ error: "user_id required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  // lat/lng of exactly 0 (equator / prime meridian) is a valid coordinate,
  // not an absent one — `lat && lng` would wrongly report "Location
  // unavailable" for those real locations since 0 is falsy in JS.
  const locationStr = lat != null && lng != null
    ? `https://maps.google.com/maps?q=${lat},${lng}`
    : "Location unavailable";

  const sosMessage = `🚨 SOS from ${user.name} on Niakofa. ${message ?? "Emergency assistance needed."} Location: ${locationStr}`;

  // SAFETY: persist a durable "sos" report FIRST. Broadcast only reaches admins who
  // are connected right now, and SMS to panic contacts can fail silently (no
  // contacts configured, carrier rejection, etc.) — if either of those were the
  // only record, this panic-button SOS could vanish entirely while the caller
  // still received "ok: true". If persistence itself fails, tell the caller —
  // never a false "help is on the way".
  let reportId: number | undefined;
  try {
    const [inserted] = await db.insert(reportsTable).values({
      reporter_id: user_id,
      type: "sos",
      description: `Panic-button SOS from ${user.name}. ${message ?? "Emergency assistance needed."} Location: ${locationStr}`,
      status: "pending",
    }).returning({ id: reportsTable.id });
    reportId = inserted?.id;
  } catch (err) {
    logger.error({ err, user_id, lat, lng }, "verification/sos: FAILED to persist SOS report — returning error, not false reassurance");
    return res.status(500).json({ error: "SOS could not be recorded. If this is an emergency, call 911 now." });
  }

  // Broadcast to all moderators via WebSocket — best-effort, already durably recorded above.
  try {
    broadcast({
      type: "new_report",
      payload: {
        type: "sos",
        report_id: reportId,
        user_id,
        user_name: user.name,
        lat, lng,
        message: message ?? "SOS activated",
        timestamp: new Date().toISOString(),
      }
    });
  } catch (err) {
    logger.error({ err, user_id, reportId }, "verification/sos: admin broadcast failed after durable persist");
  }

  // SMS panic contacts if configured — best-effort.
  const contacts: string[] = user.panic_contacts ?? [];
  const smsResults = await Promise.allSettled(
    contacts.map(phone => sendSms(phone, sosMessage))
  );
  const smsFailures = smsResults.filter(r => r.status === "rejected").length;
  if (smsFailures > 0) {
    logger.error({ user_id, reportId, smsFailures, total: contacts.length }, "verification/sos: some panic-contact SMS failed to send");
  }

  logger.warn({ user_id, lat, lng, reportId }, "SOS panic alert triggered");
  return res.json({ ok: true, report_id: reportId, contacts_notified: contacts.length - smsFailures, location: locationStr });
});

// ── Update panic contacts ─────────────────────────────────────────────────────
router.patch("/verification/panic-contacts/:userId", requireAuth, requireOwnership("userId"), async (req, res) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  const { contacts } = req.body as { contacts: string[] };
  if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts array required" });

  // Route summary and the OpenAPI schema (UpdatePanicContactsInput, maxItems: 5)
  // both say "max 5" — this used to silently truncate to 3 and then echo back
  // the original (untruncated) input, so a client submitting 5 contacts was
  // told all 5 saved when only 3 actually did. Now stores and returns the
  // same, actually-persisted array.
  const storedContacts = contacts.slice(0, 5);

  await db.update(usersTable)
    .set({ panic_contacts: storedContacts })
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true, contacts: storedContacts });
});

export default router;
