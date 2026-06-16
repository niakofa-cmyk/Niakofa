import { Router } from "express";
import webpush from "web-push";

const router = Router();

// In-memory subscription store (in production: persist to DB)
const subscriptions: Map<number, webpush.PushSubscription[]> = new Map();

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

router.post("/push/subscribe", (req, res) => {
  const { userId, subscription } = req.body as { userId: number; subscription: webpush.PushSubscription };
  if (!userId || !subscription?.endpoint) return res.status(400).json({ error: "userId and subscription required" });

  const existing = subscriptions.get(userId) ?? [];
  const alreadyExists = existing.some(s => s.endpoint === subscription.endpoint);
  if (!alreadyExists) {
    subscriptions.set(userId, [...existing, subscription]);
  }
  return res.json({ ok: true });
});

router.post("/push/unsubscribe", (req, res) => {
  const { userId, endpoint } = req.body as { userId: number; endpoint: string };
  if (!userId) return res.status(400).json({ error: "userId required" });
  const existing = subscriptions.get(userId) ?? [];
  subscriptions.set(userId, existing.filter(s => s.endpoint !== endpoint));
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

/** Send a push notification to all registered subscribers (for broadcast events) */
export async function sendPushToAllHelpers(payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const allSubs: webpush.PushSubscription[] = [];
  for (const subs of subscriptions.values()) allSubs.push(...subs);
  if (allSubs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.allSettled(
    allSubs.map(sub =>
      webpush.sendNotification(sub, data, pushOptions(payload.urgency)).catch(() => {})
    )
  );
}

/** Send a push notification to a specific user by userId */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const userSubs = subscriptions.get(userId);
  if (!userSubs || userSubs.length === 0) return;
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
