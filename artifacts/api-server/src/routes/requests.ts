import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, requestHelpersTable, helperAvailabilityTable } from "@workspace/db";
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
import { broadcast, broadcastRequestEvent, sendToUser } from "../lib/ws-hub";
import { requestCreationLimiter } from "../middlewares/rate-limit";
import { enqueuePayoutRetry } from "../lib/queue";
import { sendPushToNearbyHelpers, sendPushToAllHelpers } from "./push";
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
  // All counts done in the DB — never load the full table into memory.
  const [openRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .where(eq(requestsTable.status, "open"));

  const [completedRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .where(eq(requestsTable.status, "completed"));

  const [recentRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.status, "completed"),
        sql`${requestsTable.completed_at} > NOW() - INTERVAL '24 hours'`
      )
    );

  const [pledgeRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(pledge_paid), 0)::float` })
    .from(requestsTable);

  const categoryRows = await db
    .select({ category: requestsTable.category, count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .groupBy(requestsTable.category);

  const [helperRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(usersTable)
    .where(eq(usersTable.helper_mode_active, true));

  return res.json({
    total_open: openRow?.count ?? 0,
    total_completed: completedRow?.count ?? 0,
    total_helpers_online: helperRow?.count ?? 0,
    requests_by_category: categoryRows.map(r => ({ category: r.category, count: r.count })),
    recent_completions: recentRow?.count ?? 0,
    total_pledge_volume: pledgeRow?.total ?? 0,
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

  const helperId = req.query.helper_id ? parseInt(req.query.helper_id as string) : null;
  const requesterId = req.query.requester_id ? parseInt(req.query.requester_id as string) : null;
  const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 200;

  // Build WHERE conditions in the DB — never load the full table.
  const conditions = [];
  if (params.success && params.data.status) {
    conditions.push(eq(requestsTable.status, params.data.status as any));
  }
  if (helperId) conditions.push(eq(requestsTable.helper_id, helperId));
  if (requesterId) conditions.push(eq(requestsTable.requester_id, requesterId));

  // Bounding-box pre-filter when lat/lng provided (PostGIS not required).
  // Exact haversine filter applied in JS after for accuracy.
  if (params.success && params.data.lat && params.data.lng) {
    const radius = params.data.radius_miles ?? 10;
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.cos((params.data.lat * Math.PI) / 180));
    conditions.push(sql`${requestsTable.lat} BETWEEN ${params.data.lat - latDelta} AND ${params.data.lat + latDelta}`);
    conditions.push(sql`${requestsTable.lng} BETWEEN ${params.data.lng - lngDelta} AND ${params.data.lng + lngDelta}`);
  }

  let rows = await db
    .select()
    .from(requestsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${requestsTable.created_at} DESC`)
    .limit(Math.min(limitParam > 0 ? limitParam : 200, 500));

  // Exact radius filter in JS (bounding box above is a fast pre-filter)
  if (params.success && params.data.lat && params.data.lng) {
    const radius = params.data.radius_miles ?? 10;
    rows = rows.filter(r => distanceMiles(params.data.lat!, params.data.lng!, r.lat, r.lng) <= radius);
  }

  const allUserIds = [...new Set([
    ...rows.map(r => r.requester_id),
    ...rows.map(r => r.helper_id).filter((id): id is number => id != null),
  ])];
  const users = allUserIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(allUserIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return res.json(rows.map(r => ({
    ...r,
    requester_name: userMap[r.requester_id]?.name ?? null,
    requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
    helper_name: r.helper_id ? (userMap[r.helper_id]?.name ?? null) : null,
    helper_avatar: r.helper_id ? (userMap[r.helper_id]?.avatar_url ?? null) : null,
    distance_miles: null,
    estimated_duration_min: null,
  })));
});

router.post("/requests", requireAuth, requireOwnership("requester_id"), requestCreationLimiter, async (req, res) => {
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

  // Push notifications — geolocation-targeted when request has coordinates
  if (request.urgency === "emergency" || request.urgency === "high") {
    const isEmergency = request.urgency === "emergency";
    const payload = {
      title: isEmergency ? "🚨 EMERGENCY — Help Needed Now!" : "🔴 Urgent Request Nearby",
      body: request.title,
      urgency: request.urgency,
      requestId: request.id,
    };
    // Notify helpers within 15 miles of the request; fall back to all helpers if no nearby ones found
    sendPushToNearbyHelpers(request.lat, request.lng, 15, payload).catch(() => {
      sendPushToAllHelpers(payload).catch(() => {});
    });
  } else {
    // For medium/low urgency, notify helpers within 5 miles
    sendPushToNearbyHelpers(request.lat, request.lng, 5, {
      title: "💙 Help Request Near You",
      body: request.title,
      urgency: request.urgency,
      requestId: request.id,
    }).catch(() => {});
  }

  return res.status(201).json(enriched);
});

router.get("/requests/:id", requireAuth, async (req, res) => {
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

router.patch("/requests/:id", requireAuth, async (req, res) => {
  const authenticatedUserId = (req as any).authenticatedUserId;
  const requestId = parseInt(req.params.id);
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== authenticatedUserId) {
    return res.status(403).json({ error: "Forbidden: You can only update your own requests" });
  }
  const pParsed = UpdateRequestParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = UpdateRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const updates: Record<string, unknown> = {};
  if (bParsed.data.status !== undefined) updates.status = bParsed.data.status;
  if (bParsed.data.description !== undefined) updates.description = bParsed.data.description;
  if (bParsed.data.urgency !== undefined) updates.urgency = bParsed.data.urgency;
  const [updatedRequest] = await db.update(requestsTable).set(updates).where(eq(requestsTable.id, pParsed.data.id)).returning();
  if (!updatedRequest) return res.status(404).json({ error: "Not found" });
  const enriched = { ...updatedRequest, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcast({ type: "request_updated", payload: enriched });
  return res.json(enriched);
});

// helper_id is intentionally NOT taken from the request body — it's the
// authenticated caller's own ID, derived server-side from the verified
// token. The body field still exists in the API contract (frontend may
// send it) but the server never trusts a client-asserted identity for an
// action this consequential. requireOwnership("helper_id") used to guard
// against exactly this, by checking body.helper_id === authenticatedUserId
// — safe, but a roundabout way to express "act as yourself."
router.post("/requests/:id/claim", requireAuth, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(req.params.id) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "claimed", helper_id: helperId, claimed_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.status, "open")))
    .returning();
  if (!request) return res.status(409).json({ error: "Request already claimed or not found" });
  const [helper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, helperId)).limit(1);
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: helper?.name ?? null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_ACCEPTED", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/en-route", requireAuth, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = MarkEnRouteParams.safeParse({ id: parseInt(req.params.id) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "en_route", en_route_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, helperId)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_MOVING", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/arrived", requireAuth, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = MarkArrivedParams.safeParse({ id: parseInt(req.params.id) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });
  const [request] = await db.update(requestsTable)
    .set({ status: "arrived", arrived_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, helperId)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_ARRIVED", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/complete", requireAuth, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = CompleteRequestParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = CompleteRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });

  const [request] = await db.update(requestsTable)
    .set({ status: "completed", completed_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, helperId)))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });

  // Capture pre-increment stats for tier-change detection + name for gratitude prompt
  const [helperBefore] = await db
    .select({ help_count: usersTable.help_count, trust_score: usersTable.trust_score, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, helperId))
    .limit(1);

  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, helperId));

  // Immediate-pay jobs: record in earnings history ONLY — do NOT credit benevolence_wallet.
  // benevolence_wallet is the goodwill/donation pot (pledges, sponsorships, tips).
  // The real money for immediate jobs arrives via the Stripe Connect transfer below.
  if (request.payment_type === "immediate" && request.pay_it_forward_amount && request.pay_it_forward_amount > 0) {
    await db.insert(transactionsTable).values({
      user_id: helperId,
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
      .where(eq(usersTable.id, helperId));
    await db.insert(transactionsTable).values({
      user_id: helperId,
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
        .where(eq(stripeAccountsTable.user_id, helperId))
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
            helper_id: String(helperId),
            platform_fee_cents: String(platformFeeCents),
          },
        });

        // Record the completed payout
        await db.insert(paymentTransactionsTable).values({
          request_id: request.id,
          helper_id: helperId,
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
            helper_id: helperId,
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
          helper_id:          helperId,
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
    helperId,
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
      helper_id: helperId,
    },
  });

  return res.json(enriched);
});


router.post("/requests/:id/tip", requireAuth, requireOwnership("requester_id"), async (req, res) => {
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
    type: "payout_sent",
    payload: { helper_id: request.helper_id, amount: tip_amount, type: "tip" },
  });

  return res.status(201).json({ ok: true, tip_amount, helper_id: request.helper_id });
});

// ── Help Chains ──────────────────────────────────────────────────────────────

// POST /requests/:id/helpers/join — join the help chain for a request
router.post("/requests/:id/helpers/join", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });
  const r = req as typeof req & { authenticatedUserId: number };
  const helperId = r.authenticatedUserId;

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "claimed" && request.status !== "en_route" && request.status !== "arrived") {
    return res.status(409).json({ error: "Request must be claimed before joining the chain" });
  }
  if (request.requester_id === helperId) return res.status(409).json({ error: "Requester cannot join the help chain" });
  if (request.helper_id === helperId) return res.status(409).json({ error: "Primary helper is already on this request" });

  // Upsert — if already in chain, return 200 silently
  const existing = await db.select().from(requestHelpersTable)
    .where(and(eq(requestHelpersTable.request_id, requestId), eq(requestHelpersTable.helper_id, helperId)))
    .limit(1);
  if (existing.length > 0) return res.json({ ok: true, already_member: true });

  const [row] = await db.insert(requestHelpersTable)
    .values({ request_id: requestId, helper_id: helperId })
    .returning();

  // Notify requester and primary helper
  sendToUser(request.requester_id, { type: "help_chain_joined", payload: { request_id: requestId, helper_id: helperId } });
  if (request.helper_id) sendToUser(request.helper_id, { type: "help_chain_joined", payload: { request_id: requestId, helper_id: helperId } });

  return res.status(201).json(row);
});

// DELETE /requests/:id/helpers/leave — leave the help chain
router.delete("/requests/:id/helpers/leave", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });
  const r = req as typeof req & { authenticatedUserId: number };
  const helperId = r.authenticatedUserId;

  await db.delete(requestHelpersTable)
    .where(and(eq(requestHelpersTable.request_id, requestId), eq(requestHelpersTable.helper_id, helperId)));

  const [request] = await db.select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
    .from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (request) {
    sendToUser(request.requester_id, { type: "help_chain_left", payload: { request_id: requestId, helper_id: helperId } });
    if (request.helper_id) sendToUser(request.helper_id, { type: "help_chain_left", payload: { request_id: requestId, helper_id: helperId } });
  }

  return res.json({ ok: true });
});

// GET /requests/:id/helpers — list all chain members with basic profile info
router.get("/requests/:id/helpers", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const members = await db
    .select({
      id: requestHelpersTable.id,
      helper_id: requestHelpersTable.helper_id,
      joined_at: requestHelpersTable.joined_at,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
      trust_score: usersTable.trust_score,
    })
    .from(requestHelpersTable)
    .innerJoin(usersTable, eq(usersTable.id, requestHelpersTable.helper_id))
    .where(eq(requestHelpersTable.request_id, requestId))
    .orderBy(requestHelpersTable.joined_at);

  return res.json(members);
});

export default router;
