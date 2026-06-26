import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable, usersTable, userSettingsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendAlertEmail } from "../lib/mailer";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership } from "../middlewares/authz";
import { pushSubscribeLimiter } from "../middlewares/rate-limit";

const router = Router();

const VAPID_PUBLIC = process.env["VAPID_PUBLIC_KEY"] ?? "";
const VAPID_PRIVATE = process.env["VAPID_PRIVATE_KEY"] ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:hello@niakofa.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

router.post("/push/subscribe", requireAuth, pushSubscribeLimiter, requireOwnership("userId"), async (req, res) => {
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

router.post("/push/unsubscribe", requireAuth, pushSubscribeLimiter, requireOwnership("userId"), async (req, res) => {
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
  return rows.map((r: { subscription: unknown }) => r.subscription as unknown as webpush.PushSubscription);
}

/**
 * Notification category a push belongs to, matching the toggles on the
 * Settings screen (notif_nearby_requests, notif_emergency, etc). Passing a
 * notifKey to the send functions below means recipients who turned that
 * category off in Settings are skipped entirely — these toggles existed in
 * the UI and were saved, but nothing ever checked them before this.
 */
export type NotifKey =
  | "notif_nearby_requests"
  | "notif_emergency"
  | "notif_task_accepted"
  | "notif_wallet_updates"
  | "notif_community_activity"
  | "notif_pledge_reminders";

/**
 * Filters userIds down to those who have notifKey enabled. Users with no
 * user_settings row yet are kept — the column defaults to true, same as a
 * fresh row would get on first GET /settings.
 */
async function filterByNotifPref(userIds: number[], notifKey?: NotifKey): Promise<number[]> {
  if (!notifKey || userIds.length === 0) return userIds;
  const rows = await db
    .select({ user_id: userSettingsTable.user_id, enabled: userSettingsTable[notifKey] })
    .from(userSettingsTable)
    .where(inArray(userSettingsTable.user_id, userIds));
  const disabled = new Set(rows.filter((r: { enabled: boolean }) => r.enabled === false).map((r: { user_id: number }) => r.user_id));
  return userIds.filter(id => !disabled.has(id));
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
              .catch(() => {});
          }
        })
    )
  );
  return delivered;
}

/**
 * Send push to a specific user, falling back to email if:
 *   • VAPID keys are not configured, OR
 *   • the user has no active push subscriptions
 * The email fallback requires `fallbackEmail` and `fallbackEmailSubject` to be provided.
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
  options?: { fallbackEmail?: string; fallbackEmailSubject?: string; notifKey?: NotifKey }
): Promise<void> {
  if (options?.notifKey) {
    const [allowed] = await filterByNotifPref([userId], options.notifKey);
    if (allowed === undefined) return;
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
    }).catch(() => {});
  }
}

/**
 * Send push to multiple users, with optional per-user email fallback.
 * Fetches each user's email from DB automatically when `emailFallback: true`.
 */
export async function sendPushToUsers(
  userIds: number[],
  payload: PushPayload,
  options?: { emailFallback?: boolean; notifKey?: NotifKey }
): Promise<void> {
  if (userIds.length === 0) return;

  // Fetch emails upfront if fallback is requested
  let emailMap: Map<number, string> = new Map();
  if (options?.emailFallback) {
    const users = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));
    emailMap = new Map(users.map((u: { id: number; email: string | null }) => [u.id, u.email]));
  }

  await Promise.allSettled(
    userIds.map(id =>
      sendPushToUser(id, payload, {
        fallbackEmail: options?.emailFallback ? emailMap.get(id) : undefined,
        fallbackEmailSubject: payload.title,
        notifKey: options?.notifKey,
      })
    )
  );
}

/**
 * Send a push notification to helpers within `radiusMiles` of (lat, lng).
 * Only helpers with helper_mode_active = true and a stored location are considered.
 * For emergency urgency, falls back to email if push is unavailable.
 */
export async function sendPushToNearbyHelpers(
  lat: number,
  lng: number,
  radiusMiles: number,
  payload: PushPayload,
  notifKey?: NotifKey
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    // No VAPID keys — email all active helpers as fallback for emergency
    if (payload.urgency === "emergency") {
      const helpers = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.helper_mode_active, true));
      const allowedIds = new Set(await filterByNotifPref(helpers.map((h: { id: number }) => h.id), notifKey));
      await Promise.allSettled(
        helpers.filter((h: { id: number; email: string | null }) => !!h.email && allowedIds.has(h.id)).map((h: { email: string | null; name: string | null }) =>
          sendAlertEmail({
            to: h.email!,
            subject: `🚨 Emergency request near you: ${payload.title}`,
            title: payload.title,
            body: payload.body,
          })
        )
      );
    }
    return;
  }

  // PostGIS ST_DWithin — let the database return only active helpers within
  // radius using the GiST index on users.geog, instead of loading every
  // active helper and filtering in JS. Radius converted miles → meters.
  // We query the flat system radius here (cheap, index-backed first pass);
  // each helper's own service_radius_miles preference is then applied as an
  // additional cap below, since a helper may have chosen a smaller radius
  // than the system default for this urgency tier.
  const radiusMeters = radiusMiles * 1609.34;
  const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const nearbyHelpers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      lat: usersTable.lat,
      lng: usersTable.lng,
      serviceRadiusMiles: userSettingsTable.service_radius_miles,
    })
    .from(usersTable)
    .leftJoin(userSettingsTable, eq(userSettingsTable.user_id, usersTable.id))
    .where(and(
      eq(usersTable.helper_mode_active, true),
      sql`${usersTable.geog} IS NOT NULL`,
      sql`ST_DWithin(${usersTable.geog}, ${origin}, ${radiusMeters})`,
    ));

  if (nearbyHelpers.length === 0) return;

  // Helpers with no saved preference (no settings row, or null) fall back to
  // the system radius — same "no row yet" default used everywhere else.
  const inServiceRadius = nearbyHelpers.filter(
    (h: { lat: number | null; lng: number | null; serviceRadiusMiles: number | null }) => {
      if (h.lat == null || h.lng == null) return false;
      const distanceMiles = haversineMiles(lat, lng, h.lat, h.lng);
      return distanceMiles <= (h.serviceRadiusMiles ?? radiusMiles);
    }
  );
  if (inServiceRadius.length === 0) return;

  const allowedIds = new Set(await filterByNotifPref(inServiceRadius.map((h: { id: number }) => h.id), notifKey));
  const notifiableHelpers = inServiceRadius.filter((h: { id: number }) => allowedIds.has(h.id));
  if (notifiableHelpers.length === 0) return;

  const isEmergency = payload.urgency === "emergency";

  // Deliver push + email fallback for each nearby helper in parallel
  await Promise.allSettled(
    notifiableHelpers.map(async (h: { id: number; email?: string | null }) => {
      const subs = await getSubsForUser(h.id);
      const delivered = await deliverToSubs(subs, payload);
      if (delivered === 0 && isEmergency && h.email) {
        await sendAlertEmail({
          to: h.email,
          subject: `🚨 Emergency request near you: ${payload.title}`,
          title: payload.title,
          body: `${payload.body}\n\nOpen the Niakofa app to respond.`,
        }).catch(() => {});
      }
    })
  );
}

/** Send a push notification to all registered subscribers (broadcast fallback) */
export async function sendPushToAllHelpers(payload: PushPayload, notifKey?: NotifKey): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const rows = await db
    .select({ user_id: pushSubscriptionsTable.user_id, subscription: pushSubscriptionsTable.subscription })
    .from(pushSubscriptionsTable);
  const allowedIds = new Set(await filterByNotifPref(rows.map((r: { user_id: number }) => r.user_id), notifKey));
  const subs = rows
    .filter((r: { user_id: number }) => allowedIds.has(r.user_id))
    .map((r: { subscription: unknown }) => r.subscription as unknown as webpush.PushSubscription);
  await deliverToSubs(subs, payload);
}

export default router;
