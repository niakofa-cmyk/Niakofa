import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable, userSettingsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { sendAlertEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership } from "../middlewares/authz";

const router = Router();

const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"] ?? "";
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"] ?? "";

let vapidConfigured = false;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(
      "mailto:hello@payitforward.community",
      VAPID_PUBLIC,
      VAPID_PRIVATE
    );
    vapidConfigured = true;
    logger.info("web-push: VAPID keys loaded successfully");
  } catch (err) {
    // Invalid VAPID key — log and degrade gracefully. Push notifications will
    // be disabled but the server continues running. Fix by regenerating VAPID
    // keys with: npx web-push generate-vapid-keys and updating Railway vars.
    logger.error({ err }, "web-push: invalid VAPID keys — push notifications disabled. " +
      "Regenerate with: npx web-push generate-vapid-keys");
  }
}

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

router.post("/push/subscribe", requireAuth, requireOwnership("userId"), async (req, res) => {
  const { userId, subscription } = req.body as { userId: number; subscription: webpush.PushSubscription };
  if (!userId || !subscription?.endpoint) return res.status(400).json({ error: "userId and subscription required" });

  const existing = await db
    .select({ id: pushSubscriptionsTable.id })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptionsTable)
      .set({ user_id: userId, subscription: subscription as unknown as Record<string, unknown>, updated_at: new Date() })
      .where(eq(pushSubscriptionsTable.endpoint, subscription.endpoint));
  } else {
    await db.insert(pushSubscriptionsTable).values({
      user_id: userId,
      endpoint: subscription.endpoint,
      subscription: subscription as unknown as Record<string, unknown>,
    });
  }

  return res.json({ ok: true });
});

router.post("/push/unsubscribe", requireAuth, requireOwnership("userId"), async (req, res) => {
  const { userId, endpoint } = req.body as { userId: number; endpoint: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (endpoint) {
    await db
      .delete(pushSubscriptionsTable)
      .where(and(eq(pushSubscriptionsTable.user_id, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
  } else {
    await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.user_id, userId));
  }
  return res.json({ ok: true });
});

export type PushPayload = {
  title: string;
  body: string;
  urgency?: string;
  requestId?: number;
  icon?: string;
  // notifType drives user-settings gate:
  //   "nearby_requests"    → notif_nearby_requests
  //   "task_accepted"      → notif_task_accepted
  //   "wallet"             → notif_wallet_updates
  //   "community"          → notif_community_activity
  //   "emergency"          → notif_emergency (emergencies always bypass gate)
  //   "nia_checkin" | undefined → not gated (always send)
  notifType?: "nearby_requests" | "task_accepted" | "wallet" | "community" | "emergency" | "nia_checkin";
};

function pushOptions(urgency?: string): webpush.RequestOptions {
  return {
    urgency: urgency === "emergency" ? "high" : "normal",
    TTL: 86400,
  };
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getSubsForUser(userId: number): Promise<webpush.PushSubscription[]> {
  const rows = await db
    .select({ subscription: pushSubscriptionsTable.subscription })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.user_id, userId));
  return rows.map(r => r.subscription as unknown as webpush.PushSubscription);
}

/**
 * Deliver to a set of push subscriptions.
 * Returns the count of successful deliveries.
 */
async function deliverToSubs(subs: webpush.PushSubscription[], payload: PushPayload): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || subs.length === 0) return 0;
  const data = JSON.stringify(payload);
  const opts = pushOptions(payload.urgency);
  let delivered = 0;
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(sub, data, opts)
        .then(() => { delivered++; })
        .catch(err => {
          // 410 Gone = subscription expired — remove from DB
          if ((err as { statusCode?: number }).statusCode === 410) {
            db.delete(pushSubscriptionsTable)
              .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint))
              .catch(() => {
                // Non-fatal: subscription cleanup failure doesn't affect delivery count
              });
          }
        })
    )
  );
  return delivered;
}

/**
 * Return true if this user has opted in to this notification type.
 * Emergency and nia_checkin types are never blocked by user settings.
 * Missing settings row = all defaults = allow.
 */
async function userAllowsNotif(
  userId: number,
  notifType: PushPayload["notifType"]
): Promise<boolean> {
  // These types are never gated
  if (!notifType || notifType === "emergency" || notifType === "nia_checkin") return true;

  const rows = await db
    .select({
      notif_nearby_requests: userSettingsTable.notif_nearby_requests,
      notif_task_accepted: userSettingsTable.notif_task_accepted,
      notif_wallet_updates: userSettingsTable.notif_wallet_updates,
      notif_community_activity: userSettingsTable.notif_community_activity,
      notif_emergency: userSettingsTable.notif_emergency,
    })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.user_id, userId))
    .limit(1);

  if (rows.length === 0) return true; // no settings row = default on

  const s = rows[0];
  switch (notifType) {
    case "nearby_requests": return s.notif_nearby_requests ?? true;
    case "task_accepted":   return s.notif_task_accepted ?? true;
    case "wallet":          return s.notif_wallet_updates ?? true;
    case "community":       return s.notif_community_activity ?? false;
    default:                return true;
  }
}

/**
 * Send push to a specific user, falling back to email if:
 *   • VAPID keys are not configured, OR
 *   • the user has no active push subscriptions
 * Respects the user's notif_* preferences from user_settings.
 * Emergency type bypasses all preference gates.
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
  options?: { fallbackEmail?: string; fallbackEmailSubject?: string }
): Promise<void> {
  // Check user's notification preference first
  if (!(await userAllowsNotif(userId, payload.notifType))) {
    logger.debug({ userId, notifType: payload.notifType }, "push: skipped — user opted out");
    return;
  }

  const subs = await getSubsForUser(userId);
  const delivered = await deliverToSubs(subs, payload);

  if (delivered === 0 && options?.fallbackEmail) {
    logger.info({ userId }, "push: no delivery — falling back to email");
    await sendAlertEmail({
      to: options.fallbackEmail,
      subject: options.fallbackEmailSubject ?? payload.title,
      title: payload.title,
      body: payload.body,
    }).catch(() => {
      // Non-fatal: email fallback failure doesn't affect the main push flow
    });
  }
}

/**
 * Send push to multiple users, with optional per-user email fallback.
 * Fetches each user's email from DB automatically when `emailFallback: true`.
 * Each user's notification preferences are checked individually.
 */
export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload,
  options?: { emailFallback?: boolean }
): Promise<void> {
  if (userIds.length === 0) return;

  let emailMap: Map<number, string> = new Map();
  if (options?.emailFallback) {
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable);
    emailMap = new Map(users.map(u => [u.id, u.email]));
  }

  await Promise.allSettled(
    userIds.map(id =>
      sendPushToUser(id, payload, options?.emailFallback ? {
        fallbackEmail: emailMap.get(id),
        fallbackEmailSubject: payload.title,
      } : undefined)
    )
  );
}

/**
 * Send a push notification to helpers within `radiusMiles` of (lat, lng).
 * Only helpers with helper_mode_active = true and a stored location are considered.
 * Each helper's notif_nearby_requests preference is now respected.
 *
 * BUG-15a FIX: Previously never checked notif_* flags from user_settings —
 * every helper in radius received every notification regardless of their
 * notification preferences. Now uses userAllowsNotif() per helper.
 * Emergency urgency bypasses the preference gate (consistent with the rest
 * of the codebase's "emergency overrides everything" design intent).
 */
export async function sendPushToNearbyHelpers(
  lat: number,
  lng: number,
  radiusMiles: number,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // No VAPID keys — email all active helpers as fallback for emergency
    if (payload.urgency === "emergency") {
      const helpers = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.helper_mode_active, true));
      await Promise.allSettled(
        helpers.map(h =>
          sendAlertEmail({
            to: h.email,
            subject: `🚨 Emergency request near you: ${payload.title}`,
            title: payload.title,
            body: payload.body,
          })
        )
      );
    }
    return;
  }

  // Fetch all active helpers that have a stored lat/lng
  const helpers = await db
    .select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.helper_mode_active, true));

  // Filter to those within radius
  const nearbyHelpers = helpers
    .filter(h => h.lat != null && h.lng != null)
    .filter(h => haversineMiles(lat, lng, h.lat!, h.lng!) <= radiusMiles);

  if (nearbyHelpers.length === 0) return;

  const isEmergency = payload.urgency === "emergency";

  // Deliver push + email fallback for each nearby helper in parallel
  // Each helper's notif preference is checked (emergency bypasses)
  await Promise.allSettled(
    nearbyHelpers.map(async h => {
      // Check notification preference — emergency always goes through
      if (!isEmergency && !(await userAllowsNotif(h.id, payload.notifType ?? "nearby_requests"))) {
        return; // helper opted out of this notification type
      }
      const subs = await getSubsForUser(h.id);
      const delivered = await deliverToSubs(subs, payload);
      if (delivered === 0 && isEmergency && h.email) {
        await sendAlertEmail({
          to: h.email,
          subject: `🚨 Emergency request near you: ${payload.title}`,
          title: payload.title,
          body: `${payload.body}\n\nOpen the Niakofa app to respond.`,
        }).catch(() => {
          // Non-fatal: emergency email fallback failure doesn't block other helpers
        });
      }
    })
  );
}

/** Send a push notification to all registered subscribers (broadcast fallback) */
export async function sendPushToAllHelpers(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const rows = await db
    .select({ subscription: pushSubscriptionsTable.subscription })
    .from(pushSubscriptionsTable);
  const subs = rows.map(r => r.subscription as unknown as webpush.PushSubscription);
  await deliverToSubs(subs, payload);
}

export default router;
