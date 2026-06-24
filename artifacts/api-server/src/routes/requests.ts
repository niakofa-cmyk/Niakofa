import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership, requireApproved } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, ratingsTable } from "@workspace/db";
// BUG-030: distanceMiles moved to shared lib/geo.ts — single server-side source of truth
import { distanceMiles } from "../lib/geo";
import { computeMatchScore } from "../lib/matching";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import {
  GetRequestsQueryParams,
  GetRequestParams,
  CreateRequestBody,
  UpdateRequestParams,
  UpdateRequestBody,
  ClaimRequestParams,
  CompleteRequestParams,
  GetNearbyRequestsQueryParams,
  MarkEnRouteParams,
  MarkArrivedParams,
} from "@workspace/api-zod";
import { broadcast, broadcastRequestEvent } from "../lib/ws-hub";
import { requestCreationLimiter, requestActionLimiter, paymentLimiter } from "../middlewares/rate-limit";
import { enqueuePayoutRetry } from "../lib/queue";
import { sendPushToNearbyHelpers, sendPushToAllHelpers, sendPushToUser } from "./push";
import { broadcastLeaderboardUpdate } from "./leaderboard";
import { logger } from "../lib/logger";
import { sendReceipt, sendAlertEmail } from "../lib/mailer";
import Stripe from "stripe";

// Lazy Stripe client — null when STRIPE_SECRET_KEY is not configured
const _STRIPE_SK = process.env["STRIPE_SECRET_KEY"] ?? "";
const _stripe = _STRIPE_SK
  ? new Stripe(_STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

const router = Router();

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

router.get("/requests/stats", requireAuth, async (_req, res) => {
  // All aggregations done at the DB level — no full table scan into memory
  const [statusCounts, categoryCounts, recentCompletions, pledgeVolume, onlineHelpers] =
    await Promise.all([
      db
        .select({ status: requestsTable.status, count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .groupBy(requestsTable.status),

      db
        .select({ category: requestsTable.category, count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .groupBy(requestsTable.category),

      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .where(
          and(
            eq(requestsTable.status, "completed"),
            sql`${requestsTable.completed_at} > NOW() - INTERVAL '24 hours'`
          )
        ),

      db
        .select({ total: sql<number>`COALESCE(SUM(${requestsTable.pledge_paid}), 0)::float` })
        .from(requestsTable),

      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.helper_mode_active, true)),
    ]);

  return res.json({
    total_open:             statusCounts.find(s => s.status === "open")?.count ?? 0,
    total_completed:        statusCounts.find(s => s.status === "completed")?.count ?? 0,
    total_helpers_online:   onlineHelpers[0]?.count ?? 0,
    requests_by_category:   categoryCounts,
    recent_completions:     recentCompletions[0]?.count ?? 0,
    total_pledge_volume:    pledgeVolume[0]?.total ?? 0,
  });
});

router.get("/requests/nearby", requireAuth, async (req, res) => {
  const parsed = GetNearbyRequestsQueryParams.safeParse({
    lat: parseFloat(req.query.lat as string),
    lng: parseFloat(req.query.lng as string),
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : 5,
  });
  if (!parsed.success) return res.status(400).json({ error: "lat and lng are required" });
  const { lat, lng, radius_miles } = parsed.data;
  const radius = radius_miles ?? 5;
  // PostGIS ST_DWithin spatial filter — the database uses the GiST index on
  // help_requests.geog to return only rows within `radius` miles, computing
  // exact geodesic distance server-side instead of loading a bounding box of
  // candidates and filtering in JS. Radius is converted miles → meters.
  const radiusMeters = radius * 1609.34;
  const origin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
  const nearbyRows = await db.select({
      row: requestsTable,
      distance_meters: sql<number>`ST_Distance(${requestsTable.geog}, ${origin})`,
    })
    .from(requestsTable)
    .where(and(
      eq(requestsTable.status, "open"),
      sql`${requestsTable.geog} IS NOT NULL`,
      sql`ST_DWithin(${requestsTable.geog}, ${origin}, ${radiusMeters})`,
    ));

  // Pull the requesting helper's own skills so results can be ranked by
  // relevance, not just urgency+distance. Falls back to an empty profile
  // (no skill bonus, ranking degrades gracefully to the old behavior) if
  // the caller isn't a helper or has no skills listed yet.
  const [helperProfile] = await db.select({
    helper_skills: usersTable.helper_skills,
    specialties: usersTable.specialties,
  }).from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);

  const nearby = nearbyRows
    .map((nr) => {
      const distance_miles = Number(nr.distance_meters) / 1609.34;
      const { score, reasons } = computeMatchScore(
        helperProfile ?? { helper_skills: [], specialties: [] },
        nr.row.category,
        nr.row.urgency,
        distance_miles
      );
      return { ...nr.row, distance_miles, match_score: score, match_reasons: reasons };
    })
    .sort((a, b) => b.match_score - a.match_score);

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

router.get("/requests", requireAuth, async (req, res) => {
  const params = GetRequestsQueryParams.safeParse({
    status: req.query.status,
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  // Optional helper_id filter — used by helper profile page
  const rawHelperId = req.query.helper_id ? parseInt(req.query.helper_id as string) : null;
  const helperId = rawHelperId !== null && !isNaN(rawHelperId) ? rawHelperId : null;
  if (req.query.helper_id && helperId === null) {
    return res.status(400).json({ error: "helper_id must be a valid integer" });
  }
  // Optional requester_id filter — used by profile page to fetch user's own requests
  const rawRequesterId = req.query.requester_id ? parseInt(req.query.requester_id as string) : null;
  const requesterId = rawRequesterId !== null && !isNaN(rawRequesterId) ? rawRequesterId : null;
  if (req.query.requester_id && requesterId === null) {
    return res.status(400).json({ error: "requester_id must be a valid integer" });
  }
  // Optional limit — capped at 500; default 200 to prevent full-table scans
  const rawLimit = req.query.limit ? parseInt(req.query.limit as string) : null;
  const limitParam = rawLimit !== null && !isNaN(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;

  // Push every filter we can into SQL instead of loading the entire table —
  // only the haversine radius filter (no PostGIS available) stays in JS.
  const conditions = [];
  if (helperId !== null) conditions.push(eq(requestsTable.helper_id, helperId));
  if (requesterId !== null) conditions.push(eq(requestsTable.requester_id, requesterId));
  if (params.success && params.data.status) conditions.push(eq(requestsTable.status, params.data.status));

  const hasGeoFilter = params.success && !!params.data.lat && !!params.data.lng;
  let radius = 10;
  let geoOrigin: ReturnType<typeof sql> | null = null;
  if (hasGeoFilter) {
    radius = params.data.radius_miles ?? 10;
    const lat = params.data.lat!;
    const lng = params.data.lng!;
    // HIGH-006/HIGH-007 + PostGIS: replace the JS haversine bounding-box with
    // a true ST_DWithin spatial filter, pushed into SQL BEFORE the LIMIT so
    // the GiST index narrows to in-radius rows and the LIMIT caps the
    // geo-narrowed set (not an arbitrary top-N-by-date slice). Exact geodesic
    // distance comes back from the same query via ST_Distance.
    const radiusMeters = radius * 1609.34;
    geoOrigin = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;
    conditions.push(sql`${requestsTable.geog} IS NOT NULL`);
    conditions.push(sql`ST_DWithin(${requestsTable.geog}, ${geoOrigin}, ${radiusMeters})`);
  }

  // Always push LIMIT into SQL — never load more than limitParam rows into memory.
  // When a geo filter is active, the ST_DWithin condition above is already
  // applied at the SQL level, so this LIMIT caps the geo-narrowed set.
  const rows = conditions.length > 0
    ? await db.select().from(requestsTable).where(and(...conditions)).orderBy(desc(requestsTable.created_at)).limit(limitParam)
    : await db.select().from(requestsTable).orderBy(desc(requestsTable.created_at)).limit(limitParam);

  // Compute exact geodesic distances for the returned rows in one extra query
  // (ST_Distance keyed by id) — keeps the main select fully typed while still
  // using PostGIS for the distance math. Rows were already radius-filtered via
  // ST_DWithin in the conditions above.
  const distanceById: Record<number, number> = {};
  if (hasGeoFilter && geoOrigin && rows.length > 0) {
    const ids = rows.map(r => r.id);
    const distRows = await db
      .select({ id: requestsTable.id, d: sql<number>`ST_Distance(${requestsTable.geog}, ${geoOrigin})` })
      .from(requestsTable)
      .where(sql`${requestsTable.id} = ANY(ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]::int[])`);
    for (const dr of distRows) {
      if (dr.d != null) distanceById[dr.id] = Number(dr.d) / 1609.34;
    }
  }

  // Collect all relevant user IDs (requesters + helpers) for a single batch fetch
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

  return res.json(rows.map(r => {
    // HIGH-010: when a geo filter was applied, distance is already known —
    // surface it instead of hardcoding null, matching /requests/nearby's
    // Math.round(distance * 3) ETA estimate. Endpoints with no viewer
    // coordinates (GET /requests/:id, claim, complete, en-route, etc.)
    // have no distance to compute from and correctly remain null.
    const distance = distanceById[r.id] ?? null;
    return {
      ...r,
      requester_name: userMap[r.requester_id]?.name ?? null,
      requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
      helper_name: r.helper_id ? (userMap[r.helper_id]?.name ?? null) : null,
      helper_avatar: r.helper_id ? (userMap[r.helper_id]?.avatar_url ?? null) : null,
      distance_miles: distance,
      estimated_duration_min: distance !== null ? Math.round(distance * 3) : null,
    };
  }));
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
  const parsed = GetRequestParams.safeParse({ id: parseInt(req.params.id as string) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, parsed.data.id)).limit(1);

  // BUG-010: 404 check MUST come before 403 check. If request is null and we
  // reached the 403 block first, accessing request.requester_id would throw.
  // The old code used `if (request && ...)` short-circuit which was safe, but
  // moving 404 first is the correct defensive order.
  if (!request) return res.status(404).json({ error: "Not found" });

  // Open requests stay visible to any logged-in user (helpers need to see
  // them before claiming). Once claimed/in-progress/completed, only the
  // requester and assigned helper can view the details.
  // BUG-010: Guard helper_id null — null !== userId is true, so a non-requester
  // correctly gets 403 when no helper is assigned yet. This is intentional.
  if (request.status !== "open") {
    const authenticatedUserId = req.authenticatedUserId!;
    if (request.requester_id !== authenticatedUserId && request.helper_id !== authenticatedUserId) {
      return res.status(403).json({ error: "Forbidden: you don't have access to this request" });
    }
  }
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
  const authenticatedUserId = req.authenticatedUserId;
  const requestId = parseInt(req.params.id as string);
  const [existing] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!existing) return res.status(404).json({ error: "Request not found" });
  if (existing.requester_id !== authenticatedUserId) {
    return res.status(403).json({ error: "Forbidden: You can only update your own requests" });
  }
  const pParsed = UpdateRequestParams.safeParse({ id: requestId });
  const bParsed = UpdateRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const updates: Record<string, unknown> = {};
  if (bParsed.data.status !== undefined) updates.status = bParsed.data.status;
  if (bParsed.data.description !== undefined) updates.description = bParsed.data.description;
  if (bParsed.data.urgency !== undefined) updates.urgency = bParsed.data.urgency;
  const [updated] = await db.update(requestsTable).set(updates).where(eq(requestsTable.id, pParsed.data.id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  const enriched = { ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcast({ type: "request_updated", payload: enriched });
  return res.json(enriched);
});

router.post("/requests/:id/claim", requireAuth, requireApproved, requestActionLimiter, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  // Prevent requester from claiming their own request
  const [existing] = await db.select({ requester_id: requestsTable.requester_id })
    .from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Request not found" });
  if (existing.requester_id === helperId) return res.status(403).json({ error: "Cannot claim your own request" });

  const [request] = await db.update(requestsTable)
    .set({ status: "claimed", helper_id: helperId, claimed_at: new Date() })
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.status, "open")))
    .returning();
  if (!request) return res.status(409).json({ error: "Request already claimed or not found" });
  const [helper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, helperId)).limit(1);
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: helper?.name ?? null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_ACCEPTED", "request_updated", enriched);

  // Notify requester that their request has been claimed
  const [requesterRow] = await db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1);
  if (requesterRow?.email) {
    sendAlertEmail({
      to: requesterRow.email,
      subject: "Your request was claimed!",
      title: "A helper is coming 💙",
      body: `Great news, ${requesterRow.name}! ${helper?.name ?? "A helper"} just claimed your request: "${request.title}". They should be on their way shortly.`,
    }).catch(err => logger.warn({ err }, "claim: sendAlertEmail failed"));
  }

  return res.json(enriched);
});

router.post("/requests/:id/en-route", requireAuth, requestActionLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const pParsed = MarkEnRouteParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  // Verify caller is the assigned helper before updating (gives clean 404/403)
  const [current] = await db.select({ helper_id: requestsTable.helper_id, status: requestsTable.status })
    .from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Request not found" });
  if (current.helper_id !== callerId) return res.status(403).json({ error: "You are not the assigned helper for this request" });

  // Include AND status = 'claimed' in the UPDATE WHERE so a concurrent
  // cancellation or reassignment between the SELECT and UPDATE is detected —
  // the UPDATE returns null instead of silently stomping the new state.
  const [request] = await db.update(requestsTable)
    .set({ status: "en_route", en_route_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, callerId),
      eq(requestsTable.status, "claimed"),
    ))
    .returning();
  if (!request) return res.status(409).json({ error: "Request is no longer in the claimed state — it may have been cancelled or reassigned" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_MOVING", "request_updated", enriched);

  // Notify requester that their helper is en route
  const [reqRow] = await db.select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1);
  const [helperRow] = await db.select({ name: usersTable.name })
    .from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
  if (reqRow?.email) {
    sendAlertEmail({
      to: reqRow.email,
      subject: "Your helper is on the way!",
      title: "En route! 🚗",
      body: `${helperRow?.name ?? "Your helper"} is now on the way to help with "${request.title}". They should arrive soon — keep an eye out!`,
    }).catch(err => logger.warn({ err }, "en-route: sendAlertEmail failed"));
  }

  return res.json(enriched);
});

router.post("/requests/:id/arrived", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const pParsed = MarkArrivedParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  // Verify caller is the assigned helper before updating (gives clean 404/403)
  const [current] = await db.select({ helper_id: requestsTable.helper_id, status: requestsTable.status })
    .from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Request not found" });
  if (current.helper_id !== callerId) return res.status(403).json({ error: "You are not the assigned helper for this request" });

  // Include AND status = 'en_route' in the UPDATE WHERE — catches a concurrent
  // cancellation or state change between the SELECT and UPDATE.
  const [request] = await db.update(requestsTable)
    .set({ status: "arrived", arrived_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, callerId),
      eq(requestsTable.status, "en_route"),
    ))
    .returning();
  if (!request) return res.status(409).json({ error: "Request is no longer en-route — it may have been cancelled or its state changed" });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_ARRIVED", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/complete", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const pParsed = CompleteRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  // Verify caller is the assigned helper BEFORE making any mutations
  const [current] = await db.select({ helper_id: requestsTable.helper_id, status: requestsTable.status })
    .from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if (!current) return res.status(404).json({ error: "Request not found" });
  if (current.helper_id !== callerId) return res.status(403).json({ error: "You are not the assigned helper for this request" });
  if (current.status === "completed") return res.status(409).json({ error: "Request already completed" });

  const [request] = await db.update(requestsTable)
    .set({ status: "completed", completed_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, callerId),
      sql`${requestsTable.status} != 'completed'`,
    ))
    .returning();
  if (!request) return res.status(404).json({ error: "Not found" });

  // Capture pre-increment stats for tier-change detection + name for gratitude prompt
  const [helperBefore] = await db
    .select({ help_count: usersTable.help_count, trust_score: usersTable.trust_score, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, callerId))
    .limit(1);

  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, callerId));

  // BUG-007: Do NOT insert the `earned` transaction row here — it must only be
  // recorded AFTER the Stripe transfer succeeds. If the transfer fails (even
  // after all BullMQ retries exhaust), inserting the row here would mean the
  // helper sees "earnings" in their history that were never actually paid out.
  // The insert is now deferred to the Stripe success block below (or payout-worker
  // on retry success). This block intentionally left empty as documentation.

  // Award goodwill point for volunteer missions
  if (request.payment_type === "goodwill") {
    await db.update(usersTable)
      .set({ goodwill_score: sql`${usersTable.goodwill_score} + 1` })
      .where(eq(usersTable.id, callerId));
    await db.insert(transactionsTable).values({
      user_id: callerId,
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
        .where(eq(stripeAccountsTable.user_id, callerId))
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
            helper_id: String(callerId),
            platform_fee_cents: String(platformFeeCents),
          },
        });

        // Record the completed payout
        await db.insert(paymentTransactionsTable).values({
          request_id: request.id,
          helper_id: callerId,
          requester_id: request.requester_id,
          amount: request.pay_it_forward_amount,
          state: "completed",
          payment_type: "immediate",
          stripe_transfer_id: transfer.id,
          notes: `Auto-payout on completion. Platform fee: $${(platformFeeCents / 100).toFixed(2)}`,
        });

        // BUG-007: Insert the `earned` transaction row here — AFTER the Stripe
        // transfer succeeds — so earnings history only reflects actual payouts.
        await db.insert(transactionsTable).values({
          user_id: callerId,
          request_id: request.id,
          type: "earned",
          amount: request.pay_it_forward_amount,
          description: request.title,
        });

        broadcast({
          type: "payout_sent",
          payload: {
            helper_id: callerId,
            amount: payoutCents / 100,
            transfer_id: transfer.id,
          },
        });
      }
    } catch (err: unknown) {
      // Non-fatal — the Stripe transfer itself failed; no wallet has been
      // credited at this point under the current logic, but the payout must
      // still be retried so the helper actually gets paid.
      logger.error({ err, request_id: request.id }, "Stripe payout failed — enqueuing retry");
      // Enqueue for exponential-backoff retry via BullMQ (up to 5 attempts)
      if (stripeAcct?.stripe_account_id) {
        const amountCents = Math.round((request.pay_it_forward_amount ?? 0) * 100);
        const platformFeeCents = Math.round(amountCents * 0.05);
        enqueuePayoutRetry({
          request_id:         request.id,
          helper_id:          callerId,
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
    callerId,
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
      helper_id: callerId,
    },
  });

  return res.json(enriched);
});


router.post("/requests/:id/tip", requireAuth, paymentLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id));
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const { tip_amount } = req.body as { tip_amount: number };
  if (typeof tip_amount !== "number" || isNaN(tip_amount) || tip_amount <= 0 || tip_amount > 10000) {
    return res.status(400).json({ error: "tip_amount must be a number between 0 and 10000" });
  }
  if (typeof tip_amount !== "number" || isNaN(tip_amount) || tip_amount <= 0 || tip_amount > 10000) {
    return res.status(400).json({ error: "tip_amount must be a number between 0 and 10000" });
  }
  const MAX_TIP_AMOUNT = 500; // sanity cap — tips are smaller-scale than pledges/payments
  if (!tip_amount || tip_amount <= 0 || tip_amount > MAX_TIP_AMOUNT) {
    return res.status(400).json({ error: `tip_amount must be greater than 0 and no more than $${MAX_TIP_AMOUNT}` });
  }

  const [request] = await db.select().from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  // Only the actual requester (verified via auth token) can tip
  if (request.requester_id !== callerId) return res.status(403).json({ error: "Only the requester can tip on this request" });
  if (request.status !== "completed") return res.status(409).json({ error: "Can only tip completed requests" });
  if (!request.helper_id) return res.status(400).json({ error: "No helper to tip" });

  // BUG-008: Tips are real money paid by the requester, but the current
  // implementation only increments benevolence_wallet (a goodwill ledger column)
  // without processing a real Stripe payment or transfer. This means helpers
  // receive a number in a wallet column but NO actual funds are moved.
  //
  // A proper fix requires: (1) a Stripe PaymentIntent for tip_amount charged to
  // the requester's saved payment method, (2) a Stripe Connect transfer to the
  // helper's account on payment_intent.succeeded webhook. Until that is
  // implemented, we log a warning and credit benevolence_wallet as before — but
  // tips should NOT be presented as "real earnings" in the UI.
  logger.warn(
    { request_id: requestId, helper_id: request.helper_id, tip_amount },
    "tip: credited benevolence_wallet without Stripe transfer — no real funds moved (BUG-008)"
  );
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

// POST /requests/:id/cancel
// Helper cancels → request re-opens to the pool (another helper can pick it up).
// Requester withdraws → request marked "cancelled" permanently.
router.post("/requests/:id/cancel", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id));
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const [request] = await db.select()
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });

  if (["completed", "cancelled"].includes(request.status)) {
    return res.status(409).json({ error: `Request is already ${request.status}` });
  }

  const isRequester = request.requester_id === callerId;
  const isHelper = request.helper_id === callerId;

  if (!isRequester && !isHelper) {
    return res.status(403).json({ error: "Not authorized to cancel this request" });
  }

  let updated: typeof requestsTable.$inferSelect | undefined;

  if (isRequester) {
    // Requester permanently withdraws their request
    const [row] = await db.update(requestsTable)
      .set({ status: "cancelled", cancelled_at: new Date() })
      .where(eq(requestsTable.id, requestId))
      .returning();
    updated = row;
  } else {
    // Helper unclaims — re-opens to the pool so another helper can take it
    if (!["claimed", "en_route", "arrived"].includes(request.status)) {
      return res.status(409).json({ error: "Can only cancel an active claim" });
    }
    const [row] = await db.update(requestsTable)
      .set({
        status: "open",
        helper_id: null,
        claimed_at: null,
        en_route_at: null,
        arrived_at: null,
      })
      .where(eq(requestsTable.id, requestId))
      .returning();
    updated = row;
  }

  if (!updated) return res.status(500).json({ error: "Failed to cancel request" });

  const enriched = {
    ...updated,
    requester_name: null, requester_avatar: null, helper_name: null,
    distance_miles: null, estimated_duration_min: null,
  };
  broadcast({ type: "request_updated", payload: enriched });

  // Push notification: when a helper cancels, immediately alert the requester so they know to look for a new helper
  if (!isRequester) {
    const [helperUser] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
    const [requesterUser] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1);
    sendPushToUser(request.requester_id, {
      title: "Your helper cancelled",
      body: `${helperUser?.name ?? "Your helper"} can no longer help with "${request.title}". Your request is back in the pool — a new helper will be notified.`,
      urgency: request.urgency === "emergency" ? "high" : "normal",
      requestId: requestId,
    }, {
      fallbackEmail: requesterUser?.email,
      fallbackEmailSubject: "Your helper cancelled — look for a new helper",
    }).catch(err => logger.warn({ err }, "cancel: sendPushToUser to requester failed"));
  }

  // Trust score penalty for helpers who cancel a claim — discourages repeated cancellations
  if (!isRequester && callerId) {
    await db.update(usersTable)
      .set({ trust_score: sql`GREATEST(0, ${usersTable.trust_score} - 5)` })
      .where(eq(usersTable.id, callerId));
    logger.info({ helper_id: callerId, request_id: requestId }, "cancel: helper trust_score -5 for claim cancellation");
  }

  // Email the other party
  const notifyId = isRequester ? (request.helper_id ?? null) : request.requester_id;
  if (notifyId) {
    const [notifyUser] = await db.select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, notifyId)).limit(1);
    const [actor] = await db.select({ name: usersTable.name })
      .from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
    if (notifyUser?.email) {
      sendAlertEmail({
        to: notifyUser.email,
        subject: isRequester
          ? "A request you were helping has been withdrawn"
          : "A request is back in the pool",
        title: isRequester ? "Request withdrawn" : "Back to open 💙",
        body: isRequester
          ? `${actor?.name ?? "The requester"} has withdrawn their request "${request.title}". No further action is needed from you.`
          : `${actor?.name ?? "The helper"} is no longer available for "${request.title}". The request is now open for another helper to claim.`,
      }).catch(err => logger.warn({ err }, "cancel: sendAlertEmail failed"));
    }
  }

  return res.json(enriched);
});

// POST /requests/:id/rate
// Either participant (requester or helper) can rate the other after completion.
// Stars 1–5 are required; a short review text is optional.
// Recomputes the ratee's trust_score as a scaled average across all received ratings.
router.post("/requests/:id/rate", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id));
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const { stars, review } = req.body as { stars?: number; review?: string };
  if (stars !== undefined && (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5)) {
    return res.status(400).json({ error: "stars must be an integer between 1 and 5" });
  }
  if (stars !== undefined && (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5)) {
    return res.status(400).json({ error: "stars must be an integer between 1 and 5" });
  }
  const starsNum = Number(stars);
  if (!starsNum || starsNum < 1 || starsNum > 5 || !Number.isInteger(starsNum)) {
    return res.status(400).json({ error: "stars must be an integer from 1 to 5" });
  }

  const [request] = await db.select()
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "completed") {
    return res.status(409).json({ error: "Can only rate completed requests" });
  }

  const isRequester = request.requester_id === callerId;
  const isHelper = request.helper_id === callerId;

  if (!isRequester && !isHelper) {
    return res.status(403).json({ error: "Only participants can rate this request" });
  }
  if (!request.helper_id) {
    return res.status(400).json({ error: "No helper to rate" });
  }

  const role = isRequester ? "requester" : "helper";
  const rateeId = isRequester ? request.helper_id : request.requester_id;

  // One rating per person per request
  const [existing] = await db.select({ id: ratingsTable.id })
    .from(ratingsTable)
    .where(and(eq(ratingsTable.request_id, requestId), eq(ratingsTable.rater_id, callerId)))
    .limit(1);
  if (existing) return res.status(409).json({ error: "You have already rated this request" });

  const [rating] = await db.insert(ratingsTable).values({
    request_id: requestId,
    rater_id: callerId,
    ratee_id: rateeId,
    stars: starsNum,
    review: typeof review === "string" && review.trim() ? review.trim() : null,
    role,
  }).returning();

  // Recompute trust_score for ratee: average-stars × 20 (1 star = 20, 5 stars = 100).
  // A banned user (trust_score = -1, a moderation sentinel value, not a
  // rating-derived one) must stay banned — a new rating can never silently
  // restore them above the ban threshold and reverse a moderation action
  // with no admin involvement.
  const [currentRatee] = await db.select({ trust_score: usersTable.trust_score })
    .from(usersTable).where(eq(usersTable.id, rateeId)).limit(1);
  const isBanned = currentRatee?.trust_score === -1;

  if (!isBanned) {
    // Recency-weighted average — a rating from today counts more than one
    // from a year ago, so the score reflects current behavior rather than
    // being permanently anchored by old ratings. Exponential decay with a
    // 90-day half-life: a rating's weight halves every ~90 days.
    const RECENCY_HALF_LIFE_DAYS = 90;
    const allRatings = await db.select({ stars: ratingsTable.stars, created_at: ratingsTable.created_at })
      .from(ratingsTable)
      .where(eq(ratingsTable.ratee_id, rateeId));

    const now = Date.now();
    let weightedSum = 0;
    let totalWeight = 0;
    for (const r of allRatings) {
      const daysAgo = (now - r.created_at.getTime()) / (1000 * 60 * 60 * 24);
      const weight = Math.pow(0.5, daysAgo / RECENCY_HALF_LIFE_DAYS);
      weightedSum += r.stars * weight;
      totalWeight += weight;
    }
    const avgStars = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const newTrustScore = Math.round(avgStars * 20);

    await db.update(usersTable)
      .set({ trust_score: newTrustScore })
      .where(eq(usersTable.id, rateeId));
  } else {
    logger.warn({ rateeId, requestId }, "rate: skipped trust_score recompute — user is banned");
  }

  logger.info({ request_id: requestId, rater_id: callerId, ratee_id: rateeId, stars: starsNum }, "rate: submitted");

  return res.status(201).json(rating);
});

export default router;
