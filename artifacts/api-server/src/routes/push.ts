import { Router } from "express";
import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

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

  try {
    // Upsert — if the endpoint already exists, update its user_id binding.
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
  } catch (err) {
    logger.error({ err }, "push: failed to persist subscription");
    return res.status(500).json({ error: "Failed to save subscription" });
  }

  return res.json({ ok: true });
});

router.post("/push/unsubscribe", async (req, res) => {
  const { userId, endpoint } = req.body as { userId: number; endpoint: string };
  if (!userId || !endpoint) return res.status(400).json({ error: "userId and endpoint required" });

  try {
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.user_id, userId),
          eq(pushSubscriptionsTable.endpoint, endpoint)
        )
      );
  } catch (err) {
    logger.warn({ err }, "push: failed to remove subscription");
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
    TTL: 86400, // 24 h
  };
}

async function getSubscriptionsForUser(userId: number): Promise<webpush.PushSubscription[]> {
  const rows = await db
    .select({ subscription: pushSubscriptionsTable.subscription })
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.user_id, userId));
  return rows.map(r => r.subscription as unknown as webpush.PushSubscription);
}

async function getAllSubscriptions(): Promise<webpush.PushSubscription[]> {
  const rows = await db.select({ subscription: pushSubscriptionsTable.subscription }).from(pushSubscriptionsTable);
  return rows.map(r => r.subscription as unknown as webpush.PushSubscription);
}

/** Send a push notification to all registered subscribers */
export async function sendPushToAllHelpers(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  let allSubs: webpush.PushSubscription[];
  try {
    allSubs = await getAllSubscriptions();
  } catch (err) {
    logger.warn({ err }, "push: could not load subscriptions");
    return;
  }
  if (allSubs.length === 0) return;
  const data = JSON.stringify(payload);
  await Promise.allSettled(
    allSubs.map(sub =>
      webpush.sendNotification(sub, data, pushOptions(payload.urgency)).catch(() => {})
    )
  );
}

/** Send a push notification to a specific user */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  let userSubs: webpush.PushSubscription[];
  try {
    userSubs = await getSubscriptionsForUser(userId);
  } catch (err) {
    logger.warn({ err }, "push: could not load user subscriptions");
    return;
  }
  if (userSubs.length === 0) return;
  const data = JSON.stringify(payload);
  await Promise.allSettled(
    userSubs.map(sub =>
      webpush.sendNotification(sub, data, pushOptions(payload.urgency)).catch(() => {})
    )
  );
}

/** Send a push notification to multiple users */
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<void> {
  await Promise.allSettled(userIds.map(id => sendPushToUser(id, payload)));
}

export default router;
