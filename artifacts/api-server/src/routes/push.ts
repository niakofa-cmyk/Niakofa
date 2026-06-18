import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"] ?? "";
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"] ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:hello@payitforward.community",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

router.post("/push/subscribe", async (req, res) => {
  const { userId, subscription } = req.body as { userId: number; subscription: webpush.PushSubscription };
  if (!userId || !subscription?.endpoint) return res.status(400).json({ error: "userId and subscription required" });

  // Upsert: if endpoint already exists, update the user_id; otherwise insert
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

router.post("/push/unsubscribe", async (req, res) => {
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

type PushPayload = {
  title: string;
  body: string;
  urgency?: string;
  requestId?: number;
  icon?: string;
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

async function deliverToSubs(subs: webpush.PushSubscription[], payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || subs.length === 0) return;
  const data = JSON.stringify(payload);
  const opts = pushOptions(payload.urgency);
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(sub, data, opts).catch(err => {
        // 410 Gone = subscription expired — remove from DB
        if ((err as { statusCode?: number }).statusCode === 410) {
          db.delete(pushSubscriptionsTable)
            .where(eq(pushSubscriptionsTable.endpoint, sub.endpoint))
            .catch(() => {});
        }
      })
    )
  );
}

/**
 * Send a push notification to helpers within `radiusMiles` of (lat, lng).
 * Only helpers with helper_mode_active = true and a stored location are considered.
 */
export async function sendPushToNearbyHelpers(
  lat: number,
  lng: number,
  radiusMiles: number,
  payload: PushPayload
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  // Fetch all active helpers that have a stored lat/lng
  const helpers = await db
    .select({ id: usersTable.id, lat: usersTable.lat, lng: usersTable.lng })
    .from(usersTable)
    .where(eq(usersTable.helper_mode_active, true));

  // Filter to those within radius
  const nearbyIds = helpers
    .filter(h => h.lat != null && h.lng != null)
    .filter(h => haversineMiles(lat, lng, h.lat!, h.lng!) <= radiusMiles)
    .map(h => h.id);

  if (nearbyIds.length === 0) return;

  // Fetch their subscriptions in parallel, then deliver
  const subArrays = await Promise.all(nearbyIds.map(id => getSubsForUser(id)));
  const allSubs = subArrays.flat();
  await deliverToSubs(allSubs, payload);
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

/** Send a push notification to a specific user by userId */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const subs = await getSubsForUser(userId);
  await deliverToSubs(subs, payload);
}

/** Send a push notification to multiple users */
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map(id => sendPushToUser(id, payload)));
}

export default router;
