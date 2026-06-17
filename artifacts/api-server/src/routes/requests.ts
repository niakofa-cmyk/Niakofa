import { Router } from "express";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  GetRequestsQueryParams,
  GetRequestParams,
  CreateRequestBody,
  UpdateRequestParams,
  UpdateRequestBody,
  ClaimRequestParams,
  ClaimRequestBody,
  CompleteRequestParams,
  CompleteRequestBody,
  GetNearbyRequestsQueryParams,
  MarkEnRouteParams,
  MarkEnRouteBody,
  MarkArrivedParams,
  MarkArrivedBody,
} from "@workspace/api-zod";
import { broadcast, broadcastRequestEvent } from "../lib/ws-hub";
import { requestCreationLimiter } from "../middlewares/rate-limit";
import { enqueuePayoutRetry } from "../lib/queue";
import { sendPushToAllHelpers } from "./push";
import { broadcastLeaderboardUpdate } from "./leaderboard";
import { logger } from "../lib/logger";
import { sendReceipt } from "../lib/mailer";
import Stripe from "stripe";

// Lazy Stripe client — null when STRIPE_SECRET_KEY is not configured
const _STRIPE_SK = process.env["STRIPE_SECRET_KEY"] ?? "";
const _stripe = _STRIPE_SK
  ? new Stripe(_STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

const router = Router();

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function enrichRequest(r: typeof requestsTable.$inferSelect, userMap: Record<number, { name: string; avatar_url: string | null }>, helperName?: string | null, extraFields?: Record<string, unknown>) {
  return {
    ...r,
    requester_name: userMap[r.requester_id]?.name ?? null,
    requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
    helper_name: helperName ?? null,
    distance_miles: null,
    estimated_duration_min: null,
    ...extraFields,
  };
}

router.get("/requests/stats", async (_req, res) => {
  const allRequests = await db.select().from(requestsTable);
  const open = allRequests.filter(r => r.status === "open").length;
  const completed = allRequests.filter(r => r.status === "completed").length;
  const recentCompletions = allRequests.filter(r => {
    if (!r.completed_at) return false;
    return Date.now() - new Date(r.completed_at).getTime() < 86400000;
  }).length;
  const onlineHelpers = await db.select().from(usersTable).where(eq(usersTable.helper_mode_active, true));
  const catMap: Record<string, number> = {};
  for (const r of allRequests) catMap[r.category] = (catMap[r.category] ?? 0) + 1;
  const requests_by_category = Object.entries(catMap).map(([category, count]) => ({ category, count }));

  // Total pay-it-forward pledge volume
  const pledgeVolume = allRequests.reduce((s, r) => s + (r.pledge_paid || 0), 0);

  return res.json({
    total_open: open,
    total_completed: completed,
    total_helpers_online: onlineHelpers.length,
    requests_by_category,
    recent_completions: recentCompletions,
    total_pledge_volume: pledgeVolume,
  });
});

router.get("/requests/nearby", async (req, res) => {
  const parsed = GetNearbyRequestsQueryParams.safeParse({
    lat: parseFloat(req.query.lat as string),
    lng: parseFloat(req.query.lng as string),
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : 5,
  });
  if (!parsed.success) return res.status(400).json({ error: "lat and lng are required" });
  const { lat, lng, radius_miles } = parsed.data;
  const radius = radius_miles ?? 5;
  const requests = await db.select().from(requestsTable).where(eq(requestsTable.status, "open"));
  const nearby = requests
    .map(r => ({ ...r, distance_miles: distanceMiles(lat, lng, r.lat, r.lng) }))
    .filter(r => r.distance_miles <= radius)
    .sort((a, b) => {
      const urgencyOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
      const urgencyDiff = (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
      if (urgencyDiff !== 0) return urgencyDiff;
      return a.distance_miles - b.distance_miles;
    });

  const userIds = [...new Set(nearby.map(r => r.requester_id))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return res.json(nearby.map(r => ({
    ...r,
    requester_name: userMap[r.requester_id]?.name ?? null,
    requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
    helper_name: null,
    estimated_duration_min: Math.round(r.distance_miles * 3),
  })));
});

router.get("/requests", async (req, res) => {
  const params = GetRequestsQueryParams.safeParse({
    status: req.query.status,
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  let rows = await db.select().from(requestsTable);
  if (params.success && params.data.status) rows = rows.filter(r => r.status === params.data.status);
  if (params.success && params.data.lat && params.data.lng) {
    const radius = params.data.radius_miles ?? 10;
    rows = rows.filter(r => distanceMiles(params.data.lat!, params.data.lng!, r.lat, r.lng) <= radius);
  }

  const userIds = [...new Set(rows.map(r => r.requester_id))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return res.json(rows.map(r => ({
    ...r,
    requester_name: userMap[r.requester_id]?.name ?? null,
    requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
    helper_name: null,
    distance_miles: null,
    estimated_duration_min: null,
  })));
});

router.post("/requests", requestCreationLimiter, async (req, res) => {
  const parsed = CreateRequestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

  // Max 5 active requests per user (open / claimed / en_route / arrived)
  const [activeCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.requester_id, parsed.data.requester_id),
        inArray(requestsTable.status, ["open", "claimed", "en_route", "arrived"])
      )
    );
  if ((activeCount?.count ?? 0) >= 5) {
    return res.status(429).json({
      error:
        "You have 5 active requests already. " +
        "Please wait for one to complete before creating another — this keeps the map accurate for everyone.",
    });
  }

  const [request] = await db.insert(requestsTable).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    category: parsed.data.category ?? "other",
    urgency: parsed.data.urgency ?? "medium",
    payment_type: parsed.data.payment_type ?? "pay_it_forward",
    status: "open",
    requester_id: parsed.data.requester_id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    neighborhood: parsed.data.neighborhood ?? null,
    pay_it_forward_amount: parsed.data.pay_it_forward_amount ?? null,
    pledge_amount: parsed.data.pledge_amount ?? null,
  }).returning();

  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_CREATED", "new_request", enriched);

  if (request.urgency === "emergency" || request.urgency === "high") {
    const isEmergency = request.urgency === "emergency";
    sendPushToAllHelpers({
      title: isEmergency ? "🚨 EMERGENCY — Help Needed Now!" : "🔴 Urgent Request Nearby",
      body: request.title,
      urgency: request.urgency,
      requestId: request.id,
    }).catch(() => {});
  }

  return res.status(201).json(enriched);
});

router.get("/requests/:id", async (req, res) => {
  const parsed = GetRequestParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, parsed.data.id)).limit(1);
  if (!request) return res.status(404).json({ error: "Not found" });
  const [requester] = await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1);
  let helperName = null;
  if (request.helper_id) {
    const [helper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.helper_id)).limit(1);
    helperName = helper?.name ?? null;
  }
  return res.json({ ...request, requester_name: requester?.name ?? null, requester_avatar: requester?.avatar_url ?? null, helper_name: helperName, distance_miles: null, estimated_duration_min: null });
});

router.patch("/requests/:id", async (req, res) => {
  const pParsed = UpdateRequestParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = UpdateRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const updates: Record<string, unknown> = {};
  if (bParsed.data.status !== undefined) updates.status = bParsed.data.status;
  if (bParsed.data.description !== undefined) updates.description = bParsed.data.description;
  if (bParsed.data.urgency !== undefined) updates.urgency = bParsed.data.urgency;
  const [request] = await db.update(requestsTable).set(updates).where(eq(requestsTable.id, pParsed.data.id)).returning();
  if (!request) return res.status(404).json({ error: "Not found" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcast({ type: "request_updated", payload: enriched });
  return res.json(enriched);
});

router.post("/requests/:id/claim", async (req, res) => {
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = ClaimRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "claimed", helper_id: bParsed.data.helper_id, claimed_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.status, "open")))
    .returning();
  if (!request) return res.status(409).json({ error: "Request already claimed or not found" });
  const [helper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, bParsed.data.helper_id)).limit(1);
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: helper?.name ?? null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_ACCEPTED", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/en-route", async (req, res) => {
  const pParsed = MarkEnRouteParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = MarkEnRouteBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "en_route", en_route_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, bParsed.data.helper_id)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_MOVING", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/arrived", async (req, res) => {
  const pParsed = MarkArrivedParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = MarkArrivedBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "arrived", arrived_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, bParsed.data.helper_id)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_ARRIVED", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/complete", async (req, res) => {
  const pParsed = CompleteRequestParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = CompleteRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });

  const [request] = await db.update(requestsTable)
    .set({ status: "completed", completed_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, bParsed.data.helper_id)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });

  // Capture pre-increment stats for tier-change detection + name for gratitude prompt
  const [helperBefore] = await db
    .select({ help_count: usersTable.help_count, trust_score: usersTable.trust_score, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, bParsed.data.helper_id))
    .limit(1);

  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, bParsed.data.helper_id));

  // Immediate-pay jobs: record in earnings history ONLY — do NOT credit benevolence_wallet.
  // benevolence_wallet is the goodwill/donation pot (pledges, sponsorships, tips).
  // The real money for immediate jobs arrives via the Stripe Connect transfer below.
  if (request.payment_type === "immediate" && request.pay_it_forward_amount && request.pay_it_forward_amount > 0) {
    await db.insert(transactionsTable).values({
      user_id: bParsed.data.helper_id,
      request_id: request.id,
      type: "earned",
      amount: request.pay_it_forward_amount,
      description: request.title,
    });
  }

  // Award goodwill point for volunteer missions
  if (request.payment_type === "goodwill") {
    await db.update(usersTable)
      .set({ goodwill_score: sql`${usersTable.goodwill_score} + 1` })
      .where(eq(usersTable.id, bParsed.data.helper_id));
    await db.insert(transactionsTable).values({
      user_id: bParsed.data.helper_id,
      request_id: request.id,
      type: "goodwill",
      amount: 0,
      description: request.title,
    });
  }

  // ── Real Stripe payout for immediate-pay completed requests ───────────────
  // Only fires when: payment_type === "immediate", amount > 0, Stripe configured,
  // and helper has a Connect account with payouts enabled.
  if (
    request.payment_type === "immediate" &&
    request.pay_it_forward_amount &&
    request.pay_it_forward_amount > 0 &&
    _stripe
  ) {
    let stripeAcct: typeof stripeAccountsTable.$inferSelect | undefined;
    try {
      [stripeAcct] = await db
        .select()
        .from(stripeAccountsTable)
        .where(eq(stripeAccountsTable.user_id, bParsed.data.helper_id))
        .limit(1);

      if (stripeAcct?.payouts_enabled && stripeAcct.stripe_account_id) {
        const amountCents = Math.round(request.pay_it_forward_amount * 100);
        const platformFeeCents = Math.round(amountCents * 0.05); // 5% platform fee
        const payoutCents = amountCents - platformFeeCents;

        const transfer = await _stripe.transfers.create({
          amount: payoutCents,
          currency: "usd",
          destination: stripeAcct.stripe_account_id,
          metadata: {
            request_id: String(request.id),
            helper_id: String(bParsed.data.helper_id),
            platform_fee_cents: String(platformFeeCents),
          },
        });

        // Record the completed payout
        await db.insert(paymentTransactionsTable).values({
          request_id: request.id,
          helper_id: bParsed.data.helper_id,
          requester_id: request.requester_id,
          amount: request.pay_it_forward_amount,
          state: "completed",
          payment_type: "immediate",
          stripe_transfer_id: transfer.id,
          notes: `Auto-payout on completion. Platform fee: $${(platformFeeCents / 100).toFixed(2)}`,
        });

        broadcast({
          type: "payout_sent",
          payload: {
            helper_id: bParsed.data.helper_id,
            amount: payoutCents / 100,
            transfer_id: transfer.id,
          },
        });
      }
    } catch (err: unknown) {
      // Non-fatal — wallet was already credited, but payout must be retried
      logger.error({ err, request_id: request.id }, "Stripe payout failed — enqueuing retry");
      // Enqueue for exponential-backoff retry via BullMQ (up to 5 attempts)
      if (stripeAcct?.stripe_account_id) {
        const amountCents = Math.round((request.pay_it_forward_amount ?? 0) * 100);
        const platformFeeCents = Math.round(amountCents * 0.05);
        enqueuePayoutRetry({
          request_id:         request.id,
          helper_id:          bParsed.data.helper_id,
          requester_id:       request.requester_id,
          amount_cents:       amountCents,
          platform_fee_cents: platformFeeCents,
          stripe_account_id:  stripeAcct.stripe_account_id,
          request_title:      request.title,
        }).catch(() => {});
      }
    }
  }

  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_COMPLETED", "request_updated", enriched);

  // Fire-and-forget leaderboard broadcast (doesn't block response)
  broadcastLeaderboardUpdate(
    bParsed.data.helper_id,
    helperBefore?.help_count ?? 0,
    helperBefore?.trust_score ?? 0
  ).catch(() => {});


  // Fire receipt email async (non-blocking)
  const [requester] = await db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1).catch(() => [null]);
  if (requester?.email) {
    sendReceipt({
      to: requester.email,
      helperName: helperBefore?.name ?? "Your helper",
      requesterName: requester.name,
      requestTitle: request.title,
      amount: request.payment_type === "immediate" ? (request.pay_it_forward_amount ?? undefined) : undefined,
      paymentType: request.payment_type,
      completedAt: new Date(),
    }).catch(() => {});
  }

  // Prompt the requester to write a public thank-you post
  broadcast({
    type: "new_gratitude_prompt",
    payload: {
      request_id: request.id,
      requester_id: request.requester_id,
      request_title: request.title,
      helper_name: helperBefore?.name ?? null,
      helper_id: bParsed.data.helper_id,
    },
  });

  return res.json(enriched);
});


router.post("/requests/:id/tip", async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const { requester_id, tip_amount } = req.body as { requester_id: number; tip_amount: number };
  if (!requester_id || !tip_amount || tip_amount <= 0) {
    return res.status(400).json({ error: "requester_id and tip_amount > 0 required" });
  }

  const [request] = await db.select().from(requestsTable)
    .where(and(eq(requestsTable.id, requestId), eq(requestsTable.requester_id, requester_id)))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "completed") return res.status(409).json({ error: "Can only tip completed requests" });
  if (!request.helper_id) return res.status(400).json({ error: "No helper to tip" });

  // Credit tip to helper benevolence_wallet
  await db.update(usersTable)
    .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${tip_amount}` })
    .where(eq(usersTable.id, request.helper_id));

  await db.insert(transactionsTable).values({
    user_id: request.helper_id,
    request_id: requestId,
    type: "tip_received",
    amount: tip_amount,
    description: `Tip for: ${request.title}`,
  });

  broadcast({
    type: "payout_sent" as any,
    payload: { helper_id: request.helper_id, amount: tip_amount, type: "tip" },
  });

  return res.status(201).json({ ok: true, tip_amount, helper_id: request.helper_id });
});

export default router;
