import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { logger } from "../lib/logger";
import { sendSms } from "../lib/sms";
import { broadcast } from "../lib/ws-hub";

const router = Router();

const STRIPE_SK = process.env["STRIPE_SECRET_KEY"] ?? "";
const stripe = STRIPE_SK ? new Stripe(STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion }) : null;
const APP_URL = process.env["APP_URL"] ?? "https://niakofa.com";

// ── Stripe Identity verification session ─────────────────────────────────────
router.post("/verification/identity/start", async (req, res) => {
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
  const webhookSecret = process.env["STRIPE_IDENTITY_WEBHOOK_SECRET"] ?? "";

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

      broadcast({ type: "presence_update" as any, payload: { user_id: userId, identity_verified: true } });
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
router.post("/verification/safety-checkin/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  // Update last_seen (use updated_at as proxy)
  await db.update(usersTable)
    .set({ updated_at: new Date() })
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true, checked_in_at: new Date().toISOString() });
});

// ── SOS panic alert ───────────────────────────────────────────────────────────
router.post("/verification/sos", async (req, res) => {
  const { user_id, lat, lng, message } = req.body as {
    user_id: number;
    lat?: number;
    lng?: number;
    message?: string;
  };
  if (!user_id) return res.status(400).json({ error: "user_id required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, user_id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const locationStr = lat && lng
    ? `https://maps.google.com/maps?q=${lat},${lng}`
    : "Location unavailable";

  const sosMessage = `🚨 SOS from ${user.name} on Niakofa. ${message ?? "Emergency assistance needed."} Location: ${locationStr}`;

  // Broadcast to all moderators via WebSocket
  broadcast({
    type: "new_report" as any,
    payload: {
      type: "sos",
      user_id,
      user_name: user.name,
      lat, lng,
      message: message ?? "SOS activated",
      timestamp: new Date().toISOString(),
    }
  });

  // SMS panic contacts if configured
  const contacts: string[] = (user as any).panic_contacts ?? [];
  await Promise.allSettled(
    contacts.map(phone => sendSms(phone, sosMessage))
  );

  logger.warn({ user_id, lat, lng }, "SOS panic alert triggered");
  return res.json({ ok: true, contacts_notified: contacts.length, location: locationStr });
});

// ── Update panic contacts ─────────────────────────────────────────────────────
router.patch("/verification/panic-contacts/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  const { contacts } = req.body as { contacts: string[] };
  if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts array required" });

  await db.update(usersTable)
    .set({ panic_contacts: contacts.slice(0, 3) } as any)
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true, contacts });
});

export default router;
