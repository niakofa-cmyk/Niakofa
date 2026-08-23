import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, requestHelpersTable, userSettingsTable, businessesTable, businessMembersTable, systemSettingsTable, communityPoolLedgerTable, ratingsTable, hubCommunityLeadersTable, scheduledPaymentsTable, chatMessagesTable, reportsTable } from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import {
  GetRequestsQueryParams,
  GetRequestParams,
  CreateRequestBody,
  UpdateRequestParams,
  UpdateRequestBody,
  ClaimRequestParams,
  CompleteRequestParams,
  CompleteRequestBody,
  GetNearbyRequestsQueryParams,
  MarkEnRouteParams,
  MarkArrivedParams,
} from "@workspace/api-zod";
import { broadcast, broadcastRequestEvent, sendToUser, sendToRequestParticipants } from "../lib/ws-hub";
import { requestCreationLimiter, adminLimiter } from "../middlewares/rate-limit";
import { enqueuePayoutRetry } from "../lib/queue";
import { sendPushToNearbyHelpers, sendPushToAllHelpers, sendPushToUser, type PushPayload } from "./push";
import { payHelperFromPool, payHelpersFromPool, getGuaranteedMinimum, isPoolEnabled, queuePendingMinimum, maybeAlertLowBalance, getHourlyMinimumRate, roundMoney } from "../lib/community-pool";
import { broadcastLeaderboardUpdate } from "./leaderboard";
import { getTrustTier, meetsQualityGate, TIER_RANK, tierAtLeast, isSensitiveCategory, getHubLeadershipTrustBonus } from "@workspace/trust-tiers";
import type { TrustTier } from "@workspace/trust-tiers";
import { stripTags } from "../lib/sanitize";
import { logger } from "../lib/logger";
import { sendReceipt } from "../lib/mailer";
import { moderateRequestText } from "../lib/post-moderation";
import Stripe from "stripe";
import type { repaymentPlansTable as RepaymentPlansTable } from "@workspace/db";

// Lazy Stripe client — null when STRIPE_SECRET_KEY is not configured
const _STRIPE_SK = process.env["STRIPE_SECRET_KEY"] ?? "";
const _stripe = _STRIPE_SK
  ? new Stripe(_STRIPE_SK, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

const router = Router();

// ─── Pin-coordinate fuzzing ───────────────────────────────────────────────────
// Browsing helpers see a ~100 m neighbourhood-level pin, not the requester's
// exact address. Full precision is only returned via GET /requests/:id — which
// a helper reaches after claiming (the claim flow navigates there).
//
// The jitter is deterministic (seeded by request ID) so the pin is stable
// across map refreshes and doesn't appear to "jump". Emergency requests are
// not fuzzed: getting there fast matters more than address privacy.
//
// Math: 0.001° lat ≈ 111 m; 0.001° lng ≈ 111 m × cos(lat).
// Exported so a regression test can assert the map's privacy fuzzing
// behavior directly (deterministic, bounded, emergency bypass) without
// spinning up the full route + DB mock.
export function fuzzCoordinates(
  lat: number,
  lng: number,
  requestId: number,
  urgency: string,
): { lat: number; lng: number } {
  if (urgency === "emergency") return { lat, lng };
  // Two independent Knuth multiplicative hash steps for lat and lng jitter.
  // >>> 0 converts to unsigned 32-bit so bitwise ops stay predictable.
  const h1 = ((requestId * 2654435761) >>> 0);
  const h2 = ((requestId * 1234567891 + 9876543) >>> 0);
  const fuzzLat = ((h1 % 10000) / 10000 - 0.5) * 0.002;         // ±0.001°
  const fuzzLng = ((h2 % 10000) / 10000 - 0.5) * 0.002
    / Math.cos(lat * (Math.PI / 180));
  return {
    lat: Math.round((lat + fuzzLat) * 1e5) / 1e5,
    lng: Math.round((lng + fuzzLng) * 1e5) / 1e5,
  };
}

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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

  // limit: caller can request up to 200 rows; default 100. This prevents a
  // hard ceiling from silently hiding valid nearby requests in dense areas
  // while still bounding payload size. Bug fixed: parseInt("abc") returns
  // NaN, and NaN || 100 silently returns 100 instead of a 400, giving
  // callers wrong results they can't detect.
  let limit = 100;
  if (req.query.limit !== undefined) {
    const parsedLimit = parseInt(req.query.limit as string, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({ error: "limit must be a positive integer" });
    }
    limit = Math.min(parsedLimit, 200);
  }

  const radiusMeters = radius * 1609.344;

  // PostGIS ST_DWithin against the indexed geog column (kept in sync with
  // lat/lng by trg_help_requests_sync_geog, migration 0052; indexed by
  // help_requests_geog_gix, a GiST index) — pushes the radius filter and
  // sort into the DB instead of pulling every open request and computing
  // Haversine distance in JS for each one. Falls back to the old JS
  // Haversine path if PostGIS/geog isn't available (e.g. a dev DB without
  // the extension), so this endpoint never hard-fails on missing PostGIS.
  let nearby: (typeof requestsTable.$inferSelect & { distance_miles: number })[];
  try {
    const nearbyRows = await db.execute(sql`
      SELECT
        hr.*,
        ST_Distance(
          ST_MakePoint(${lng}, ${lat})::geography,
          hr.geog
        ) / 1609.344 AS distance_miles
      FROM help_requests hr
      WHERE hr.status = 'open'
        AND hr.geog IS NOT NULL
        AND ST_DWithin(
          ST_MakePoint(${lng}, ${lat})::geography,
          hr.geog,
          ${radiusMeters}
        )
      ORDER BY
        CASE hr.urgency
          WHEN 'emergency' THEN 0
          WHEN 'high'      THEN 1
          WHEN 'medium'    THEN 2
          ELSE                  3
        END,
        distance_miles
      LIMIT ${limit}
    `);
    nearby = nearbyRows.rows as (typeof requestsTable.$inferSelect & { distance_miles: number })[];
  } catch (geoErr) {
    // PostGIS not available — fall back to Haversine in JS.
    // This is slower (full table scan) but keeps the endpoint functional.
    logger.warn({ err: geoErr }, "nearby: PostGIS unavailable, falling back to Haversine");
    const allOpen = await db.select().from(requestsTable).where(eq(requestsTable.status, "open"));
    nearby = allOpen
      .map(r => ({ ...r, distance_miles: distanceMiles(lat, lng, r.lat, r.lng) }))
      .filter(r => r.distance_miles <= radius)
      .sort((a, b) => {
        const urgencyOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
        const urgencyDiff = (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2);
        if (urgencyDiff !== 0) return urgencyDiff;
        return a.distance_miles - b.distance_miles;
      })
      .slice(0, limit);
  }

  const userIds = [...new Set(nearby.map(r => r.requester_id))];
  const users = userIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::int[])`)
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  return res.json(nearby.map(r => {
    // Fuzz open-request coordinates so browsing helpers see a neighbourhood
    // pin (~100 m jitter), not the requester's exact address.
    const { lat: fLat, lng: fLng } = fuzzCoordinates(r.lat, r.lng, r.id, r.urgency);
    return {
      ...r,
      lat: fLat,
      lng: fLng,
      requester_name: userMap[r.requester_id]?.name ?? null,
      requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
      helper_name: null,
      estimated_duration_min: Math.round(r.distance_miles * 3),
    };
  }));
});

router.get("/requests", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;

  // Look up admin flag once — used below to decide whether to unfuzz coordinates.
  const [callerRow] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, callerId))
    .limit(1);
  const callerIsAdmin = callerRow?.is_admin === true;

  const params = GetRequestsQueryParams.safeParse({
    status: req.query.status,
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  const helperIdRaw = req.query.helper_id ? parseInt(req.query.helper_id as string) : null;
  const requesterIdRaw = req.query.requester_id ? parseInt(req.query.requester_id as string) : null;
  // Guard against parseInt("abc") === NaN producing a malformed SQL query
  if (helperIdRaw !== null && isNaN(helperIdRaw)) return res.status(400).json({ error: "helper_id must be a valid integer" });
  if (requesterIdRaw !== null && isNaN(requesterIdRaw)) return res.status(400).json({ error: "requester_id must be a valid integer" });
  const helperId = helperIdRaw;
  const requesterId = requesterIdRaw;
  const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 100;
  // Reject out-of-range limits explicitly rather than silently clamping, so
  // callers get a clear error instead of truncated results they didn't expect.
  if (isNaN(limitParam) || limitParam < 1) {
    return res.status(400).json({ error: "limit must be a positive integer" });
  }
  if (limitParam > 100) {
    return res.status(400).json({ error: "maximum limit is 100; use offset for pagination" });
  }

  // Build WHERE conditions in the DB — never load the full table.
  const conditions = [];
  if (params.success && params.data.status) {
    conditions.push(eq(requestsTable.status, params.data.status));
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
    .limit(limitParam); // already validated to be 1–100 above

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

  return res.json(rows.map(r => {
    // Only the requester, assigned helper, and admins see exact coordinates.
    // Every other authenticated caller gets the same ~100m jitter regardless
    // of request status — the old "no fuzzing for claimed/completed" logic was
    // the data-exposure gap: anyone could query ?status=completed and harvest
    // real names tied to exact home coordinates.
    const isParticipant =
      r.requester_id === callerId ||
      (r.helper_id != null && r.helper_id === callerId);
    const { lat: fLat, lng: fLng } = (isParticipant || callerIsAdmin)
      ? { lat: r.lat, lng: r.lng }
      : fuzzCoordinates(r.lat, r.lng, r.id, r.urgency);
    return {
      ...r,
      lat: fLat,
      lng: fLng,
      requester_name: userMap[r.requester_id]?.name ?? null,
      requester_avatar: userMap[r.requester_id]?.avatar_url ?? null,
      helper_name: r.helper_id ? (userMap[r.helper_id]?.name ?? null) : null,
      helper_avatar: r.helper_id ? (userMap[r.helper_id]?.avatar_url ?? null) : null,
      distance_miles: null,
      estimated_duration_min: null,
    };
  }));
});

// POST /requests — no requireOwnership middleware here because requester_id
// is not a URL param; it is derived from the auth token inside the handler.
// Ownership is enforced at the DB level: requester_id is always set to
// req.authenticatedUserId regardless of what the client sends.
router.post("/requests", requireAuth, requireApproved, requestCreationLimiter, async (req, res) => {
  const parsed = CreateRequestBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const clientRequestId = String(req.header("Idempotency-Key") ?? "").trim();
  if (clientRequestId.length > 128) {
    return res.status(400).json({ error: "Idempotency-Key must be 128 characters or fewer." });
  }
  // Resolve a timed-out/replayed create before any side effects (notifications,
  // moderation, or pool work). The unique index is the final race-safe guard.
  if (clientRequestId) {
    const [existing] = await db
      .select()
      .from(requestsTable)
      .where(and(
        eq(requestsTable.requester_id, req.authenticatedUserId!),
        eq(requestsTable.client_request_id, clientRequestId),
      ))
      .limit(1);
    if (existing) return res.status(200).json(existing);
  }

  // Sensitive categories (childcare, senior_care, medical) involve vulnerable
  // people. The requester must explicitly acknowledge that Niakofa is not a
  // licensed childcare, homecare, or medical provider before posting one.
  if (isSensitiveCategory(parsed.data.category) && (parsed.data as { sensitive_acknowledged?: boolean }).sensitive_acknowledged !== true) {
    return res.status(400).json({
      error:
        "This category involves care for vulnerable people. Please confirm you understand that " +
        "Niakofa is a community mutual-aid network — not a licensed childcare, homecare, or medical provider — " +
        "and that you are responsible for vetting the helper before they begin.",
      requires_sensitive_acknowledgment: true,
    });
  }

  // ── ToS waiver server-side gate ───────────────────────────────────────────
  // The liability waiver modal (WaiverModal.tsx) is shown in the frontend for
  // childcare, senior_care, medical, home_repair, and moving_labor. That is a
  // UX nicety — not a real control. Anyone hitting the API directly (Postman,
  // a modified client, a script) can skip the modal entirely. This is the real
  // gate: we check the DB to confirm the user's tos_waiver_accepted_at is set
  // before allowing the request to be created. This mirrors exactly how
  // sensitive_acknowledged works for the care categories above.
  //
  // Note: we use req.authenticatedUserId (not parsed.data.requester_id) so a
  // caller cannot spoof a different user's acceptance record.
  const WAIVER_GATED_CATEGORIES = ["childcare", "senior_care", "medical", "home_repair", "moving_labor", "legal_aid", "mental_health_peer"];
  // Keep this in sync with WaiverModal.tsx CURRENT_TOS_VERSION.
  // When the ToS is updated, bump both strings — old acceptances are then
  // treated as stale and the gate forces re-acceptance.
  const CURRENT_TOS_VERSION = "2026-07";
  if (WAIVER_GATED_CATEGORIES.includes(parsed.data.category)) {
    const authenticatedUserId = req.authenticatedUserId!;
    const [requesterRow] = await db
      .select({
        tos_waiver_accepted_at: usersTable.tos_waiver_accepted_at,
        tos_waiver_version: usersTable.tos_waiver_version,
      })
      .from(usersTable)
      .where(eq(usersTable.id, authenticatedUserId))
      .limit(1);
    if (!requesterRow || !requesterRow.tos_waiver_accepted_at) {
      return res.status(400).json({
        error:
          "You must accept the community liability waiver before posting a request in this category. " +
          "Please complete the waiver in the app before submitting.",
        requires_tos_waiver: true,
        category: parsed.data.category,
      });
    }
    // Version gate: if the user accepted an older version, block until they
    // re-accept the current one. The frontend should detect requires_tos_waiver
    // and surface the modal again.
    if (requesterRow.tos_waiver_version !== CURRENT_TOS_VERSION) {
      return res.status(400).json({
        error:
          "The community liability waiver has been updated. " +
          "Please review and accept the current version before continuing.",
        requires_tos_waiver: true,
        tos_version_outdated: true,
        current_version: CURRENT_TOS_VERSION,
        accepted_version: requesterRow.tos_waiver_version ?? null,
        category: parsed.data.category,
      });
    }
  }

  // ── Business account guardrail ─────────────────────────────────────────────
  // The document is explicit: "the actual guardrail goes in the request-creation
  // route, not the frontend." Client-side hiding of pay_it_forward is a UX
  // nicety, not the real control. This is the real control.
  //
  // If business_id is present:
  //  1. Feature flag must be on (businesses_enabled in system_settings)
  //  2. Business must be admin-approved
  //  3. Requester must be an active member of that business
  //  4. payment_type: pay_it_forward is rejected — businesses pay directly
  //  5. Staff posts are held in pending_owner_approval until the owner approves
  const businessId = (parsed.data as Record<string, unknown>).business_id as number | null | undefined;
  let requestStatus: "open" | "pending_owner_approval" = "open";
  if (businessId != null) {
    const [flagRow] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "businesses_enabled"))
      .limit(1);
    if (!flagRow || flagRow.value !== "true") {
      return res.status(403).json({
        error: "Business accounts are not enabled yet. Contact support to enable this feature.",
        code: "businesses_not_enabled",
      });
    }

    const [business] = await db
      .select({ approval_status: businessesTable.approval_status, display_name: businessesTable.display_name })
      .from(businessesTable)
      .where(eq(businessesTable.id, businessId))
      .limit(1);
    if (!business) {
      return res.status(404).json({ error: "Business not found.", code: "business_not_found" });
    }
    if (business.approval_status !== "approved") {
      return res.status(403).json({
        error: `"${business.display_name}" is still pending admin approval. You cannot post requests for it yet.`,
        code: "business_not_approved",
        approval_status: business.approval_status,
      });
    }

    // Use req.authenticatedUserId (not parsed.data.requester_id) so a caller
    // cannot spoof a different user's membership to bypass the cap check.
    const authenticatedRequesterId = req.authenticatedUserId!;
    const [membership] = await db
      .select({ role: businessMembersTable.role, spending_cap_cents: businessMembersTable.spending_cap_cents })
      .from(businessMembersTable)
      .where(and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, authenticatedRequesterId),
        eq(businessMembersTable.status, "active"),
      ))
      .limit(1);
    if (!membership) {
      return res.status(403).json({
        error: "You are not an active member of this business.",
        code: "not_business_member",
      });
    }

    if (parsed.data.payment_type === "pay_it_forward") {
      return res.status(400).json({
        error: "Business requests cannot use pay-it-forward. Please choose immediate payment or goodwill.",
        code: "business_pif_blocked",
      });
    }

    // Per-staff spending cap enforcement: paid business requests (immediate) count
    // against the AUTHENTICATED staff member's cap. Goodwill posts cost $0 and
    // are always allowed. Using authenticatedRequesterId (not parsed body) prevents
    // a caller from spoofing a different user's ID to bypass their own cap.
    const isPaid = parsed.data.payment_type === "immediate";
    const newAmountCents = isPaid && parsed.data.pay_it_forward_amount
      ? Math.round(parsed.data.pay_it_forward_amount * 100)
      : 0;
    if (isPaid && membership.spending_cap_cents !== null && membership.spending_cap_cents !== undefined) {
      // SQL returns sum in dollars; multiply by 100 to convert to cents.
      const [spent] = await db
        .select({ total_cents: sql<number>`COALESCE(SUM(${requestsTable.pay_it_forward_amount}), 0) * 100` })
        .from(requestsTable)
        .where(
          and(
            eq(requestsTable.business_id, businessId),
            eq(requestsTable.requester_id, authenticatedRequesterId),
            eq(requestsTable.payment_type, "immediate"),
            inArray(requestsTable.status, ["open", "claimed", "en_route", "arrived", "completed", "pending_owner_approval"]),
          )
        );
      const currentSpentCents = Math.round(spent?.total_cents ?? 0);
      if (currentSpentCents + newAmountCents > membership.spending_cap_cents) {
        return res.status(403).json({
          error: "This request would exceed your business spending cap. Contact the business owner to request a higher limit.",
          code: "business_spending_cap_exceeded",
          spent_cents: currentSpentCents,
          cap_cents: membership.spending_cap_cents,
        });
      }
    }

    // Owner posts go live immediately; staff posts require owner approval first.
    requestStatus = membership.role === "owner" ? "open" : "pending_owner_approval";
  }

  // Max 5 active requests per user (open / claimed / en_route / arrived)
  // Use req.authenticatedUserId — not parsed.data.requester_id — so a caller
  // cannot spoof a different user's ID to bypass their own cap.
  const [activeCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.requester_id, req.authenticatedUserId!),
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

  // ── PIF outstanding pledge soft cap ───────────────────────────────────────
  // A gentle signal — not a hard block — for users who repeatedly get help
  // without ever paying forward. "Defaulted" is an internal risk signal and
  // trust-score ding; it does NOT hard-block new requests. That would
  // contradict the mission ("2 days to 2 years, no pressure").
  //
  // Soft cap: max 5 unpaid pledges (active OR defaulted) before a new PIF is
  // gently declined with a clear path back (pay any amount to restore).
  // Counting defaulted pledges means serial non-payers still get a ceiling,
  // but a single defaulted pledge no longer kills the account immediately.
  //
  // Admin can restore pledge_status via PATCH /admin/requests/:id/pledge-status.
  if (parsed.data.payment_type === "pay_it_forward") {
    // Soft cap: max 5 unpaid pledges (active + defaulted combined)
    const [unpaidPif] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.requester_id, req.authenticatedUserId!),
          eq(requestsTable.payment_type, "pay_it_forward"),
          eq(requestsTable.status, "completed"),
          sql`${requestsTable.pledge_status} IN ('active', 'defaulted')`,
          sql`${requestsTable.pledge_amount} > 0`,
          sql`COALESCE(${requestsTable.pledge_paid}, 0) = 0`,
        )
      );
    const unpaidCount = unpaidPif?.count ?? 0;
    if (unpaidCount >= 5) {
      return res.status(403).json({
        error:
          `You have ${unpaidCount} completed pay-it-forward requests with no repayment yet. ` +
          "When you're back on your feet, even a small contribution keeps the cycle going for the next neighbor. " +
          "Pay any amount in your wallet to restore your posting ability.",
        code: "pif_pledge_cap_exceeded",
        unpaid_pif_count: unpaidCount,
      });
    }
  }

  // ── Content moderation ─────────────────────────────────────────────────────
  // Emergency requests bypass screening entirely — life safety cannot wait for
  // an admin queue. All other requests get the heuristic filter applied to the
  // combined title + description. "Pending" requests still go live (someone
  // genuinely needs help), but they are flagged for admin review.
  // Server-side bounds validation for estimated_hours.
  // A malicious caller submitting a huge value (e.g. 10000 hours) would
  // inflate the guaranteed minimum calculation and create unbounded payout
  // obligations in the Community Pool queue. Clamp hard server-side, never
  // trust the client value alone.
  const rawEstimatedHours = (req.body as Record<string, unknown>).estimated_hours;
  let estimatedHours: number | null = null;
  if (typeof rawEstimatedHours === "number" && Number.isFinite(rawEstimatedHours)) {
    if (rawEstimatedHours < 0.5 || rawEstimatedHours > 24) {
      return res.status(400).json({
        error: "estimated_hours must be between 0.5 and 24.",
        code: "invalid_estimated_hours",
      });
    }
    estimatedHours = Math.round(rawEstimatedHours * 10) / 10; // round to 1 decimal
  }

  const isEmergencyUrgency = parsed.data.urgency === "emergency";
  let modStatus: "approved" | "pending" = "approved";
  let modReason: string | null = null;
  if (!isEmergencyUrgency) {
    const modResult = moderateRequestText(parsed.data.title, parsed.data.description ?? "");
    modStatus = modResult.status;
    modReason = modResult.reason;
    if (modStatus === "pending") {
      logger.warn(
        { requester_id: req.authenticatedUserId, title: parsed.data.title, reason: modReason },
        "help request flagged for moderation review",
      );
    }
  }

  const [request] = await db.insert(requestsTable).values({
    title: stripTags(parsed.data.title),
    description: parsed.data.description != null ? stripTags(parsed.data.description) : null,
    category: parsed.data.category ?? "other",
    urgency: parsed.data.urgency ?? "medium",
    payment_type: parsed.data.payment_type ?? "pay_it_forward",
    status: requestStatus,
    // Always derive requester_id from the auth token — never from the body.
    // This prevents a caller from creating requests attributed to other users.
    requester_id: req.authenticatedUserId!,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    neighborhood: parsed.data.neighborhood ?? null,
    pay_it_forward_amount: parsed.data.pay_it_forward_amount ?? null,
    pledge_amount: parsed.data.pledge_amount ?? null,
    business_id: businessId ?? null,
    moderation_status: modStatus,
    moderation_reason: modReason,
    estimated_hours: estimatedHours,
    client_request_id: clientRequestId || null,
  }).returning();

  // ── Livable-wage floor transparency ────────────────────────────────────────
  // Compute the expected pool-backed floor for this request so the frontend
  // can show a helpful subsidy notice: "The Community Pool will top your
  // helper's pay up to $X (livable wage floor)." This is non-blocking —
  // the request is created regardless of whether the offered amount meets
  // the floor. The pool guarantees the floor at completion time.
  let livableWageInfo: { floor: number; hourly_rate: number; subsidy_expected: boolean } | null = null;
  if (parsed.data.payment_type === "pay_it_forward" && estimatedHours && estimatedHours > 0) {
    try {
      const hourlyRate = await getHourlyMinimumRate();
      const floor = Math.round(estimatedHours * hourlyRate * 100) / 100;
      const offeredAmount = (parsed.data.pledge_amount ?? parsed.data.pay_it_forward_amount) ?? 0;
      livableWageInfo = { floor, hourly_rate: hourlyRate, subsidy_expected: offeredAmount < floor };
    } catch {
      // non-fatal — omit wage info from response
    }
  }

  const enriched = {
    ...request,
    requester_name: null,
    requester_avatar: null,
    helper_name: null,
    distance_miles: null,
    estimated_duration_min: null,
    ...(livableWageInfo ? { livable_wage_info: livableWageInfo } : {}),
  };
  broadcastRequestEvent("REQUEST_CREATED", "new_request", enriched);

  // Push notifications — geolocation-targeted when request has coordinates
  if (request.urgency === "emergency" || request.urgency === "high") {
    const isEmergency = request.urgency === "emergency";
    const payload: PushPayload = {
      title: isEmergency ? "🚨 EMERGENCY — Help Needed Now!" : "🔴 Urgent Request Nearby",
      body: request.title,
      urgency: request.urgency,
      requestId: request.id,
      notifType: isEmergency ? "emergency" : "nearby_requests",
    };
    // Notify helpers within 15 miles of the request; fall back to all helpers if no nearby ones found
    sendPushToNearbyHelpers(request.lat, request.lng, 15, payload).catch((err) => {
      logger.warn({ err, requestId: request.id }, "push: nearby urgent/emergency delivery failed — falling back to broadcast");
      sendPushToAllHelpers(payload).catch((err2) => {
        logger.warn({ err: err2, requestId: request.id }, "push: broadcast fallback also failed — no push sent");
      });
    });
  } else {
    // For medium/low urgency, notify helpers within 5 miles
    sendPushToNearbyHelpers(request.lat, request.lng, 5, {
      title: "💙 Help Request Near You",
      body: request.title,
      urgency: request.urgency,
      requestId: request.id,
      notifType: "nearby_requests" as const,
    }).catch((err) => {
      logger.warn({ err, requestId: request.id }, "push: nearby normal delivery failed — helpers won't get push alert, request still created");
    });
  }

  return res.status(201).json(enriched);
});

// GET /requests/:id
// Full-precision lat/lng is only returned to:
//   • the requester (their own request)
//   • the assigned helper (they need exact coords to navigate)
//   • admins (moderation / oversight)
// All other authenticated users get fuzzed coordinates (~100 m jitter),
// the same privacy protection applied to /requests/nearby.
router.get("/requests/:id", requireAuth, async (req, res) => {
  const parsed = GetRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const authenticatedUserId = req.authenticatedUserId!;

  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, parsed.data.id)).limit(1);
  if (!request) return res.status(404).json({ error: "Not found" });

  // Determine access level in one DB round-trip alongside requester lookup
  const [requester, authUser] = await Promise.all([
    db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url, goodwill_score: usersTable.goodwill_score })
      .from(usersTable).where(eq(usersTable.id, request.requester_id)).limit(1).then(r => r[0] ?? null),
    db.select({ is_admin: usersTable.is_admin })
      .from(usersTable).where(eq(usersTable.id, authenticatedUserId)).limit(1).then(r => r[0] ?? null),
  ]);

  const isRequester      = request.requester_id === authenticatedUserId;
  const isAssignedHelper = request.helper_id === authenticatedUserId;
  const isAdmin          = authUser?.is_admin === true;
  const hasFullAccess    = isRequester || isAssignedHelper || isAdmin;

  // Fuzz coordinates for users who have no operational need for full precision
  let lat = request.lat;
  let lng = request.lng;
  if (!hasFullAccess && lat !== null && lng !== null) {
    // ±0.0009° ≈ ±100 m — same jitter as /requests/nearby
    lat = lat + (Math.random() - 0.5) * 0.0018;
    lng = lng + (Math.random() - 0.5) * 0.0018;
  }

  let helperName = null;
  if (request.helper_id) {
    const [helper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.helper_id)).limit(1);
    helperName = helper?.name ?? null;
  }

  return res.json({
    ...request,
    lat,
    lng,
    requester_name: requester?.name ?? null,
    requester_avatar: requester?.avatar_url ?? null,
    requester_goodwill_score: requester?.goodwill_score ?? 100,
    helper_name: helperName,
    distance_miles: null,
    estimated_duration_min: null,
  });
});

router.patch("/requests/:id", requireAuth, async (req, res) => {
  const authenticatedUserId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id));
  const [request] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== authenticatedUserId) {
    return res.status(403).json({ error: "Forbidden: You can only update your own requests" });
  }
  const pParsed = UpdateRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = UpdateRequestBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid" });
  const updates: Record<string, unknown> = {};
  // status is intentionally NOT settable here — it must go through the
  // dedicated state-transition endpoints (claim, en-route, arrived, complete,
  // cancel) which enforce atomic guards and side effects. Allowing a raw
  // status update here would bypass all state-machine checks.
  if (bParsed.data.description !== undefined) updates.description = bParsed.data.description != null ? stripTags(bParsed.data.description) : null;
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
router.post("/requests/:id/claim", requireAuth, requireApproved, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });

  // Enforce max_travel_miles as a hard server-side block at claim time.
  // Emergency requests bypass this check by design (consistent with the
  // rest of the urgency-based bypass pattern used elsewhere in this file).
  const [existingFull] = await db
    .select({ lat: requestsTable.lat, lng: requestsTable.lng, urgency: requestsTable.urgency, category: requestsTable.category, requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id, status: requestsTable.status })
    .from(requestsTable)
    .where(eq(requestsTable.id, pParsed.data.id))
    .limit(1);

  // A requester cannot claim their own request as a helper.
  if (existingFull && existingFull.requester_id === helperId) {
    return res.status(403).json({ error: "You cannot claim your own request." });
  }
  // A timed-out client may replay a claim after the first request committed.
  // Returning the committed row is safe and keeps a successful operation from
  // appearing as a failure to the helper.
  if (existingFull?.status === "claimed" && existingFull.helper_id === helperId) {
    const [claimed] = await db.select().from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
    return res.json({ ...claimed, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null });
  }

  // Sensitive categories (childcare, senior_care, medical) involve vulnerable
  // people, so claiming them requires more than signup: the helper must be at
  // least "verified" trust tier AND have completed identity verification (or a
  // passed background check). Groceries-level trust is not enough to watch
  // someone's kids or check on an elderly parent. NO emergency bypass here —
  // urgency never lowers the bar for who can be alone with a vulnerable person.
  if (existingFull && isSensitiveCategory(existingFull.category)) {
    const [helperTrust] = await db
      .select({
        trust_score: usersTable.trust_score,
        help_count: usersTable.help_count,
        identity_verified: usersTable.identity_verified,
        background_check_status: usersTable.background_check_status,
      })
      .from(usersTable)
      .where(eq(usersTable.id, helperId))
      .limit(1);
    if (!helperTrust) return res.status(404).json({ error: "Helper not found" });

    const tier = getTrustTier(helperTrust.trust_score ?? 0, helperTrust.help_count ?? 0);
    const idCleared = helperTrust.identity_verified === true || helperTrust.background_check_status === "passed";
    if (!tierAtLeast(tier, "verified") || !idCleared) {
      const missing: string[] = [];
      if (!tierAtLeast(tier, "verified")) missing.push("reach Verified Helper tier (5 completed helps with good ratings)");
      if (!idCleared) missing.push("complete identity verification in your Profile");
      return res.status(403).json({
        error:
          "This request involves care for a vulnerable person (childcare, senior care, or medical), " +
          "so it needs extra trust safeguards. To claim it, you still need to: " + missing.join(", and ") + ". " +
          "Thank you for keeping our most vulnerable neighbors safe.",
        sensitive_category: existingFull.category,
        required_tier: "verified",
        current_tier: tier,
        identity_cleared: idCleared,
      });
    }
  }

  if (existingFull && existingFull.urgency !== "emergency") {
    const [helperSettings] = await db
      .select({ max_travel_miles: userSettingsTable.max_travel_miles })
      .from(userSettingsTable)
      .where(eq(userSettingsTable.user_id, helperId))
      .limit(1);
    const maxTravel = helperSettings?.max_travel_miles ?? 15;
    const [helperUser] = await db
      .select({ lat: usersTable.lat, lng: usersTable.lng })
      .from(usersTable)
      .where(eq(usersTable.id, helperId))
      .limit(1);
    if (helperUser?.lat != null && helperUser?.lng != null && existingFull.lat != null && existingFull.lng != null) {
      const dist = distanceMiles(helperUser.lat, helperUser.lng, existingFull.lat, existingFull.lng);
      if (dist > maxTravel) {
        return res.status(400).json({
          error: `This request is ${dist.toFixed(1)} miles away — beyond your max travel distance of ${maxTravel} miles. You can change this in Settings.`,
          distance_miles: parseFloat(dist.toFixed(1)),
          max_travel_miles: maxTravel,
        });
      }
    }
  }

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

router.post("/requests/:id/en-route", requireAuth, requireApproved, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = MarkEnRouteParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });
  const [current] = await db.select().from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if (current?.status === "en_route" && current.helper_id === helperId) return res.json(current);
  // Include status = 'claimed' in WHERE to make the transition atomic.
  // Without it, a concurrent cancellation or admin reassignment between the
  // caller's ownership check and this UPDATE could leave the row in an
  // inconsistent state. The UPDATE returning null → 409 (not 404) because the
  // request still exists — the caller is just no longer the assigned helper.
  const [request] = await db.update(requestsTable)
    .set({ status: "en_route", en_route_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, helperId),
      eq(requestsTable.status, "claimed"),
    ))
    .returning();
  if (!request) return res.status(409).json({ error: "Cannot mark en-route — request may have been cancelled or you are no longer the assigned helper." });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_MOVING", "request_updated", enriched);
  return res.json(enriched);
});

router.post("/requests/:id/arrived", requireAuth, requireApproved, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = MarkArrivedParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid" });
  const [current] = await db.select().from(requestsTable).where(eq(requestsTable.id, pParsed.data.id)).limit(1);
  if ((current?.status === "arrived" || current?.status === "completed") && current.helper_id === helperId) return res.json(current);
  // Include status = 'en_route' to make the transition atomic — same pattern
  // as en-route above. A concurrent cancellation between check and write is
  // caught by the missing row, returning 409 not 404.
  const [request] = await db.update(requestsTable)
    .set({ status: "arrived", arrived_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, helperId),
      eq(requestsTable.status, "en_route"),
    ))
    .returning();
  if (!request) return res.status(409).json({ error: "Cannot mark arrived — request may have been cancelled or is not currently in en-route status." });
  const enriched = { ...request, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("HELPER_ARRIVED", "request_updated", enriched);
  return res.json(enriched);
});

// ─── Cancel ───────────────────────────────────────────────────────────────────
// Two roles, two semantics:
//
//  Helper cancels (no-show / drop):
//    • Sets status back to "open", clears helper_id and all progress timestamps.
//    • The request re-enters the pool — fair to the requester who still needs help.
//    • Records cancelled_at for audit; does NOT decrement help_count (was 0 for
//      this request anyway — help_count is incremented only on completion).
//    • Cannot cancel after "completed" (guard prevents it).
//
//  Requester cancels (withdraw):
//    • Sets status to "cancelled", records cancelled_at.
//    • Cannot cancel if already "completed" (guard prevents it).
//    • CAN cancel even after a helper is "en_route" or "arrived" — rare but valid
//      (e.g. emergency arose). If a helper is en-route/arrived the requester
//      should confirm, but that UX gate lives on the client (window.confirm).
//      Server records the cancellation fairly regardless.
//
// Concurrency note: the WHERE clause on each branch is the atomic guard.
// Two simultaneous cancel calls from different sessions resolve safely —
// the second UPDATE returns 0 rows → 409.
// Helper-side cancel reasons. 'request_changed' means the requester altered the
// task/address/timing out from under the helper — that drop is not the helper's
// fault, so it is exempt from the no_show_count increment below. The other
// reasons are genuine drops and count normally.
const HelperCancelReasons = ["traffic", "safety", "request_changed", "other"] as const;
const CancelRequestBody = z.object({
  reason: z.enum(HelperCancelReasons).optional(),
}).optional();

router.post("/requests/:id/cancel", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const bodyParsed = CancelRequestBody.safeParse(req.body);
  const cancelReason = bodyParsed.success ? bodyParsed.data?.reason : undefined;

  // Fetch current state to determine caller's role
  const [existing] = await db
    .select({
      id: requestsTable.id,
      status: requestsTable.status,
      requester_id: requestsTable.requester_id,
      helper_id: requestsTable.helper_id,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!existing) return res.status(404).json({ error: "Request not found" });
  if (existing.status === "completed") {
    return res.status(409).json({ error: "Cannot cancel a completed request." });
  }
  if (existing.status === "cancelled") {
    return res.status(409).json({ error: "Request is already cancelled." });
  }

  const isHelper   = existing.helper_id === callerId;
  const isRequester = existing.requester_id === callerId;

  if (!isHelper && !isRequester) {
    return res.status(403).json({ error: "You are not associated with this request." });
  }

  let updated;

  if (isHelper) {
    // Helper releases claim — re-open for a new helper
    [updated] = await db
      .update(requestsTable)
      .set({
        status: "open",
        helper_id: null,
        claimed_at: null,
        en_route_at: null,
        arrived_at: null,
        cancelled_at: new Date(),
        last_helper_cancel_reason: cancelReason ?? null,
        last_cancelled_by_helper_id: callerId,
      })
      .where(
        and(
          eq(requestsTable.id, requestId),
          eq(requestsTable.helper_id, callerId),
          sql`${requestsTable.status} NOT IN ('completed', 'cancelled')`
        )
      )
      .returning();

    if (!updated) {
      return res.status(409).json({ error: "Request could not be released — it may have already changed state." });
    }

    // Increment no_show_count — fire-and-forget, never blocks the response.
    // This counter lets requesters see a helper's abandonment history on their
    // public profile before picking them for a sensitive request.
    //
    // Exception: 'request_changed' means the requester altered the task/address
    // out from under the helper after they'd already claimed it — that's not a
    // genuine no-show and must not be held against the helper's record.
    const isForgiven = cancelReason === "request_changed";
    if (!isForgiven) {
      db.update(usersTable)
        .set({ no_show_count: sql`${usersTable.no_show_count} + 1` })
        .where(eq(usersTable.id, callerId))
        .catch(err => logger.warn({ err, helper_id: callerId }, "no_show_count increment failed"));
    }

    const enriched = { ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
    broadcastRequestEvent("REQUEST_CREATED", "request_updated", enriched); // re-open → back in the pool
    logger.info(
      { request_id: requestId, helper_id: callerId, reason: cancelReason ?? null, no_show_forgiven: isForgiven },
      "Helper released claim — request re-opened"
    );
    return res.json({
      ...enriched,
      message: isForgiven
        ? "Claim released. Since the request changed, this won't count against your record."
        : "Claim released. The request is back in the pool for another helper.",
    });
  }

  // Requester withdraws
  [updated] = await db
    .update(requestsTable)
    .set({ status: "cancelled", cancelled_at: new Date() })
    .where(
      and(
        eq(requestsTable.id, requestId),
        eq(requestsTable.requester_id, callerId),
        sql`${requestsTable.status} NOT IN ('completed', 'cancelled')`
      )
    )
    .returning();

  if (!updated) {
    return res.status(409).json({ error: "Request could not be cancelled — it may have already changed state." });
  }

  const enriched = { ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null };
  broadcastRequestEvent("REQUEST_CANCELLED", "request_updated", enriched);
  logger.info({ request_id: requestId, requester_id: callerId }, "Requester withdrew request");
  return res.json({ ...enriched, message: "Request withdrawn." });
});

router.post("/requests/:id/complete", requireAuth, requireApproved, async (req, res) => {
  const helperId = req.authenticatedUserId!;
  const pParsed = CompleteRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) {
    return res.status(400).json({ error: "Invalid request id", details: pParsed.error.issues });
  }
  // Parse the optional body. helper_id is derived from the auth token and
  // is NEVER required in the body (sending it is accepted for backward compat
  // but the server always uses req.authenticatedUserId, never the body value).
  // notes is the only body field the handler may use in future.
  // We accept an empty body or missing body gracefully.
  const bParsed = CompleteRequestBody.safeParse(req.body ?? {});
  if (!bParsed.success) {
    // Body is entirely optional — only reject if something was sent AND invalid
    // (e.g. notes is not a string). An empty / missing body always passes.
    const hasBody = req.body && Object.keys(req.body).length > 0;
    if (hasBody) {
      return res.status(400).json({ error: "Invalid request body", details: bParsed.error?.issues });
    }
  }

  // Completion triggers wallet, pool, trust, and payout side effects below.
  // Never replay those effects when a mobile client retries after a timeout.
  const [alreadyCompleted] = await db
    .select()
    .from(requestsTable)
    .where(and(eq(requestsTable.id, pParsed.data.id), eq(requestsTable.helper_id, helperId), eq(requestsTable.status, "completed")))
    .limit(1);
  if (alreadyCompleted) return res.json(alreadyCompleted);

  // Status guard makes completion idempotent: a request can only transition to
  // completed ONCE, so every side effect below (help_count, pool front,
  // guaranteed minimum, payout) fires exactly once even on repeated calls.
  const [request] = await db.update(requestsTable)
    .set({ status: "completed", completed_at: new Date() })
    .where(and(
      eq(requestsTable.id, pParsed.data.id),
      eq(requestsTable.helper_id, helperId),
      sql`${requestsTable.status} NOT IN ('completed', 'cancelled')`
    ))
    .returning();
  if (!request) {
    return res.status(404).json({ 
      error: "Request not found, already completed, or you are not the assigned helper",
      request_id: pParsed.data.id
    });
  }

  // Capture pre-increment stats for tier-change detection + name for gratitude prompt.
  // community_id is also fetched here so pool ledger writes can be scoped correctly.
  const [helperBefore] = await db
    .select({
      help_count:   usersTable.help_count,
      trust_score:  usersTable.trust_score,
      name:         usersTable.name,
      community_id: usersTable.community_id,
    })
    .from(usersTable)
    .where(eq(usersTable.id, helperId))
    .limit(1);

  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, helperId));

  // Trust-score participation bump: +1 per completed job, capped at 80.
  // Participation raises a helper from the low starting default regardless of
  // how any later rating turns out (low-quality jobs still count — that's the
  // point). Cap is deliberately below the 85 threshold trust-tiers.ts needs
  // to leave "member", so volume alone can never buy tier advancement.
  await db.update(usersTable)
    .set({ trust_score: sql`LEAST(80, COALESCE(${usersTable.trust_score}, 0) + 1)` })
    .where(eq(usersTable.id, helperId));

  // ── Tier stickiness: advance highest_tier_reached when quality gate passes ─
  // After the participation bump, re-read the fresh stats and check whether the
  // helper has crossed a tier threshold AND passes the quality gate (avg rating
  // ≥ 4.0 for trusted/elite/anchor).  highest_tier_reached can only go up.
  try {
    const [refreshed] = await db
      .select({
        trust_score:           usersTable.trust_score,
        help_count:            usersTable.help_count,
        highest_tier_reached:  usersTable.highest_tier_reached,
      })
      .from(usersTable)
      .where(eq(usersTable.id, helperId))
      .limit(1);

    if (refreshed) {
      // Hub-leadership trust bonus: approved hub leaders earn extra trust-score
      // credit based on how long they've been active (3–6m→+2, 6–12m→+4, 12m+→+6).
      // This closes the documented gap: "Trust tiers currently plateau at a
      // platform-wide reputation — hub leadership doesn't feed back into it."
      // The bonus is applied only at tier-advancement evaluation — it does NOT
      // modify the stored trust_score column so the behavioral reputation metric
      // remains clean. If the DB lookup fails, we fall through without the bonus.
      let leadershipBonus = 0;
      try {
        const [leaderRecord] = await db
          .select({ approved: hubCommunityLeadersTable.approved, approved_at: hubCommunityLeadersTable.approved_at })
          .from(hubCommunityLeadersTable)
          .where(and(eq(hubCommunityLeadersTable.user_id, helperId), eq(hubCommunityLeadersTable.approved, true)))
          .limit(1);
        if (leaderRecord) {
          leadershipBonus = getHubLeadershipTrustBonus(leaderRecord.approved_at, leaderRecord.approved);
        }
      } catch { /* non-fatal — leadership bonus is advisory */ }

      // Effective score for tier computation includes leadership bonus.
      // CAP: hub leadership bonus can push a helper into "trusted" (score ≥ 90)
      // but not past it — bonus alone must not enable elite (95) or anchor (95+)
      // progression. We cap the contribution of the bonus at 90 so helpers who
      // are long-time leaders can reach trusted-tier, but the quality gate (4.0
      // avg rating, 15+ completions) is still the gate for the upper tiers.
      const baseScore = refreshed.trust_score ?? 0;
      const cappedBonus = Math.min(leadershipBonus, Math.max(0, 90 - baseScore));
      const effectiveScore = Math.min(100, baseScore + cappedBonus);
      const computedTier  = getTrustTier(effectiveScore, refreshed.help_count ?? 0);
      const currentHighest = (refreshed.highest_tier_reached ?? "member") as TrustTier;

      if (TIER_RANK[computedTier] > TIER_RANK[currentHighest]) {
        // Quality gate: fetch average rating as ratee (helper being rated by requesters)
        const [avgRow] = await db
          .select({ avg: sql<number>`AVG(${ratingsTable.stars})::float8` })
          .from(ratingsTable)
          .where(eq(ratingsTable.ratee_id, helperId));
        const avgRating = (avgRow?.avg != null && !isNaN(avgRow.avg)) ? avgRow.avg : null;

        if (meetsQualityGate(computedTier, avgRating)) {
          // Atomic monotonic advance: SQL CASE converts tier names to numeric rank
          // so the UPDATE only fires when the stored tier is STRICTLY lower than the
          // candidate. Two concurrent completions cannot regress the tier — the one
          // with the lower computed tier will evaluate the WHERE to false and be a
          // safe no-op.
          const candidateRank = TIER_RANK[computedTier];
          await db.execute(sql`
            UPDATE users
            SET highest_tier_reached = ${computedTier}
            WHERE id = ${helperId}
              AND CASE highest_tier_reached
                WHEN 'anchor'   THEN 4
                WHEN 'elite'    THEN 3
                WHEN 'trusted'  THEN 2
                WHEN 'verified' THEN 1
                ELSE 0
              END < ${candidateRank}
          `);
          logger.info(
            { helper_id: helperId, new_tier: computedTier, candidate_rank: candidateRank, avg_rating: avgRating },
            "helper: tier advanced — highest_tier_reached updated atomically"
          );
        } else {
          logger.info(
            { helper_id: helperId, candidate_tier: computedTier, avg_rating: avgRating },
            "helper: tier advancement blocked by quality gate (avg rating < 4.0)"
          );
        }
      }
    }
  } catch (tierErr) {
    // Non-fatal — completion always succeeds regardless of tier advancement errors
    logger.warn({ err: tierErr, helper_id: helperId }, "highest_tier_reached update failed (non-fatal)");
  }

  // Log request completion
  logger.info({ 
    request_id: request.id, 
    helper_id: helperId, 
    payment_type: request.payment_type,
    amount: request.pay_it_forward_amount 
  }, "Request marked as completed");

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
    logger.info({ helper_id: helperId, request_id: request.id }, "Goodwill point awarded");
  }

  // ── Multi-helper coordination: goodwill credit + real payment split ──────────
  // When co-helpers from request_helpers joined this request, they now get TWO
  // things: a light +1 goodwill credit for showing up, AND (for pay-it-forward
  // requests) a genuine equal share of the pledge itself — not just a $0 credit.
  // Both are fire-and-forget/non-blocking: coordination shouldn't delay or risk
  // the primary completion flow.
  let coHelperIds: number[] = [];
  try {
    const coHelpers = await db
      .select({ helper_id: requestHelpersTable.helper_id })
      .from(requestHelpersTable)
      .where(eq(requestHelpersTable.request_id, request.id));

    if (coHelpers.length > 0) {
      // helper_id is nullable now (request_helpers.helper_id is ON DELETE SET NULL,
      // migration 0070) — drop any co-helper rows whose account was since deleted.
      coHelperIds = coHelpers
        .map(c => c.helper_id)
        .filter((id): id is number => id !== null && id !== helperId);
      if (coHelperIds.length > 0) {
        // Award goodwill credit to each co-helper
        for (const coHelperId of coHelperIds) {
          db.update(usersTable)
            .set({ goodwill_score: sql`${usersTable.goodwill_score} + 1` })
            .where(eq(usersTable.id, coHelperId))
            .catch((err: unknown) => logger.warn({ err, co_helper_id: coHelperId }, "coordination-credit: goodwill update failed (non-fatal)"));
        }
        logger.info({ request_id: request.id, co_helper_count: coHelperIds.length }, "coordination-credit: goodwill credits queued for co-helpers");
      }
    }
  } catch (err) {
    // Never fail the primary completion flow for coordination credits
    logger.warn({ err, request_id: request.id }, "coordination-credit: failed to query co-helpers (non-fatal)");
  }

  // ── Community Pool: front pay-it-forward payment + guaranteed minimum ─────
  // The pool pays the helper(s) NOW; the requester's later repayment replenishes
  // the pool (handled in the Stripe webhook). Every payment type — pay_it_forward,
  // goodwill, AND immediate — gets a guaranteed minimum floor.
  //
  // For immediate tasks the requester's Stripe payment already counts toward
  // the floor: the pool only covers the gap, so there is never a double-pay.
  try {
    if (await isPoolEnabled()) {
      const pledge = request.pay_it_forward_amount ?? 0;
      let paidFromPool = 0;

      if (request.payment_type === "pay_it_forward" && pledge > 0) {
        // Payment splitting: the pledge is divided equally among the primary
        // helper and every co-helper who coordinated on this request, instead
        // of the primary keeping 100% and co-helpers getting a flat goodwill
        // credit. One pool ledger debit still covers the full pledge (the
        // partial-unique-index duplicate guard is unchanged) — payHelpersFromPool
        // just fans the money out across every participant's wallet.
        const participantIds = [helperId, ...coHelperIds];
        const shareAmount = roundMoney(pledge / participantIds.length);
        // Give any leftover cent(s) from rounding to the primary helper so the
        // total paid out exactly equals the pledge.
        const shares = participantIds.map((id, idx) => ({
          helperId: id,
          amount: idx === 0
            ? roundMoney(pledge - shareAmount * (participantIds.length - 1))
            : shareAmount,
        }));

        const frontOutcome = await payHelpersFromPool({
          entryType: "helper_front",
          requestId: request.id,
          requestTitle: request.title,
          shares,
          communityId: helperBefore?.community_id ?? null,
          hubId: request.hub_id ?? null,
        });
        if (frontOutcome === "paid") {
          paidFromPool = pledge;
          await db.insert(paymentTransactionsTable).values({
            request_id: request.id,
            helper_id: helperId,
            requester_id: request.requester_id,
            amount: pledge,
            state: "sponsored",
            payment_type: "pay_it_forward",
            sponsored_by: "community_pool",
            notes: coHelperIds.length > 0
              ? `Community Pool fronted helper payment at completion, split equally across ${participantIds.length} helpers — requester repayment replenishes the pool`
              : "Community Pool fronted helper payment at completion — requester repayment replenishes the pool",
          });
          broadcast({
            type: "pool_front_paid",
            payload: { request_id: request.id, helper_id: helperId, amount: pledge },
          });
          for (const share of shares) {
            const isPrimary = share.helperId === helperId;
            sendPushToUser(share.helperId, {
              title: "💙 Paid by the Community Pool",
              body: isPrimary
                ? `${share.amount.toFixed(2)} was added to your Goodwill Fund right away for: "${request.title}". No waiting.`
                : `You coordinated on "${request.title}" — ${share.amount.toFixed(2)} of the pledge was added to your Goodwill Fund.`,
              requestId: request.id,
              notifType: "wallet" as const,
            }).catch((err) => {
              logger.warn({ err, helper_id: share.helperId, request_id: request.id }, "push: pool-front wallet notification failed — helper still paid");
            });
          }
          logger.info({ request_id: request.id, shares, total: pledge }, "Community pool fronted helper payment (split across participants)");
        }
      }

      // Guaranteed minimum floor: top up to the minimum when the pool front
      // didn't happen or came in under the floor (goodwill tasks included).
      // Pass estimated_hours so the floor scales with task duration (hours × rate),
      // making the "livable wage" guarantee real math, not a flat number.
      //
      // For immediate-pay tasks, count the requester's Stripe payment toward the
      // floor first — the pool only tops up the gap, never double-pays.
      const effectivePaid = request.payment_type === "immediate"
        ? Math.max(paidFromPool, pledge)
        : paidFromPool;

      // Pass helperId so the tenure-tier wage multiplier (1.0–1.2×) is applied.
      // anchor-tier helpers (50+ helps, 97+ trust) earn 20% more from the pool.
      const minimum = await getGuaranteedMinimum(request.estimated_hours, helperId);
      if (minimum > 0 && effectivePaid < minimum) {
        const topUp = Math.round((minimum - effectivePaid) * 100) / 100;
        const minOutcome = await payHelperFromPool({
          entryType: "guaranteed_minimum",
          amount: topUp,
          requestId: request.id,
          helperId,
          communityId: helperBefore?.community_id ?? null,
          requestTitle: request.title,
          hubId: request.hub_id ?? null,
        });
        if (minOutcome === "paid") {
          sendPushToUser(helperId, {
            title: "💙 Community Pool Thank-You",
            body: `The Community Pool added $${topUp.toFixed(2)} to your Goodwill Fund for helping with: "${request.title}".`,
            requestId: request.id,
            notifType: "wallet" as const,
          }).catch((err) => {
            logger.warn({ err, helper_id: helperId, request_id: request.id }, "push: guaranteed-minimum wallet notification failed — minimum still paid");
          });
          logger.info({ request_id: request.id, helper_id: helperId, amount: topUp }, "Guaranteed minimum paid from community pool");
        } else if (minOutcome === "insufficient") {
          // Pool ran dry — queue the guarantee so the backfill worker pays it
          // once the pool is replenished. For an un-fronted pay-it-forward
          // request the pledge itself still arrives via Stripe later, so only
          // the gap below the floor is owed.
          const owed = request.payment_type === "pay_it_forward" ? minimum - pledge : topUp;
          await queuePendingMinimum({
            requestId: request.id,
            helperId,
            amount: owed,
            requestTitle: request.title,
          });
        }
      }

      // Warn admins (deduped) whenever completions run against a low pool
      maybeAlertLowBalance().catch(err => logger.warn({ err }, "maybeAlertLowBalance: non-critical side effect failed — continuing"));
    }
  } catch (err) {
    // Never block completion on pool payment issues
    logger.error({ err, request_id: request.id, helper_id: helperId }, "Community pool payment step failed");
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

      if (!stripeAcct) {
        logger.warn({ helper_id: helperId, request_id: request.id }, "No Stripe account found for helper");
      } else if (!stripeAcct.payouts_enabled) {
        logger.info({ helper_id: helperId, request_id: request.id }, "Payouts disabled for helper account");
      } else if (stripeAcct.stripe_account_id) {
        const amountCents = Math.round(request.pay_it_forward_amount * 100);
        const platformFeeCents = Math.round(amountCents * 0.05); // 5% platform fee
        const payoutCents = amountCents - platformFeeCents;

        logger.info({ 
          helper_id: helperId, 
          request_id: request.id,
          amount_usd: (amountCents / 100).toFixed(2),
          platform_fee_usd: (platformFeeCents / 100).toFixed(2)
        }, "Processing Stripe transfer");

        const transfer = await _stripe.transfers.create(
          {
            amount: payoutCents,
            currency: "usd",
            destination: stripeAcct.stripe_account_id,
            metadata: {
              request_id: String(request.id),
              helper_id: String(helperId),
              platform_fee_cents: String(platformFeeCents),
            },
          },
          { idempotencyKey: `payout-${request.id}-${helperId}` }
        );

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

        logger.info({ 
          helper_id: helperId, 
          request_id: request.id,
          transfer_id: transfer.id,
          amount_transferred: (payoutCents / 100).toFixed(2)
        }, "Stripe transfer completed successfully");

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
      logger.error({ 
        err, 
        request_id: request.id,
        helper_id: helperId,
        stripe_account_id: stripeAcct?.stripe_account_id
      }, "Stripe payout failed — enqueuing retry");
      
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
        }).catch((err) => {
          logger.error({ err, request_id: request.id }, "Failed to enqueue payout retry");
        });
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
  ).catch(err => logger.warn({ err }, "broadcastLeaderboardUpdate: non-critical side effect failed — continuing"));


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
    }).catch(err => logger.warn({ err }, "sendReceipt: non-critical side effect failed — continuing"));
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


// ── POST /requests/:id/rate ────────────────────────────────────────────────────
// RatingModal.tsx has called this endpoint since it was built; no route ever
// existed in the server layer so every real submission was a silent 404.
//
// Design decisions (matching the patch spec):
// - requireAuth only (no requireApproved): leaving a rating about a past job is
//   an opinion, not a money-moving action. Suspended accounts may still rate.
// - Only allowed once the request status is "completed" (exact string used by /complete).
// - role/ratee derived server-side from request.requester_id/helper_id — never
//   trusted from the client body. The frontend's `role` prop is display copy only.
// - Duplicate submissions hit ratingsTable's unique(request_id, rater_id) constraint
//   and return the exact error string the frontend already special-cases.
const RateRequestBody = z.object({
  stars: z.number().int().min(1).max(5),
  review: z.string().max(500).trim().optional(),
});

router.post("/requests/:id/rate", requireAuth, async (req, res) => {
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  const bParsed = RateRequestBody.safeParse(req.body);
  if (!bParsed.success) {
    return res.status(400).json({ error: "Invalid rating", details: bParsed.error?.issues });
  }

  const raterId = req.authenticatedUserId!;
  const requestId = pParsed.data.id;

  const [request] = await db.select().from(requestsTable)
    .where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });

  if (request.status !== "completed") {
    return res.status(400).json({ error: "You can only rate a request after it's completed" });
  }

  let role: "requester" | "helper";
  let rateeId: number;
  if (request.requester_id === raterId) {
    role = "requester";
    if (!request.helper_id) {
      return res.status(400).json({ error: "This request has no helper to rate yet" });
    }
    rateeId = request.helper_id;
  } else if (request.helper_id === raterId) {
    role = "helper";
    rateeId = request.requester_id;
  } else {
    return res.status(403).json({ error: "You weren't part of this request" });
  }

  try {
    await db.insert(ratingsTable).values({
      request_id: requestId,
      rater_id: raterId,
      ratee_id: rateeId,
      stars: bParsed.data.stars,
      review: bParsed.data.review ?? null,
      role,
    });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
      return res.status(409).json({ error: "You have already rated this request" });
    }
    logger.error({ err, request_id: requestId, rater_id: raterId }, "rating: insert failed");
    return res.status(500).json({ error: "Failed to submit rating" });
  }

  // ── Trust-score adjustment from star rating ───────────────────────────────
  // When the REQUESTER rates the HELPER (role="requester"), apply a small
  // trust_score nudge to the helper based on stars received.
  // Ratings push the score past the participation cap (80) up to 100 —
  // quality signal is the only path to the upper tier thresholds (90/95/97).
  //
  // Mapping: 5⭐→+2, 4⭐→+1, 3⭐→0, 2⭐→-1, 1⭐→-2
  // Clamped to [1, 100]. Only applied to verified helpers (is_helper=true).
  //
  // INVERSE direction: when the HELPER rates the REQUESTER (role="helper"),
  // adjust goodwill_score instead of trust_score. Goodwill score governs
  // pledge accountability, not the helper tier ladder.
  if (role === "requester") {
    const stars = bParsed.data.stars;
    const adjustment = stars >= 5 ? 2 : stars === 4 ? 1 : stars === 3 ? 0 : stars === 2 ? -1 : -2;
    if (adjustment !== 0) {
      await db.update(usersTable)
        .set({ trust_score: sql`LEAST(100, GREATEST(1, COALESCE(${usersTable.trust_score}, 5) + ${adjustment}))` })
        .where(and(eq(usersTable.id, rateeId), eq(usersTable.is_helper, true)))
        .catch((err) => {
          logger.warn({ err, ratee_id: rateeId, stars }, "rating: trust_score adjustment failed (non-fatal)");
        });
    }
  } else if (role === "helper") {
    // Helper rated the requester: adjust goodwill_score
    const stars = bParsed.data.stars;
    const adjustment = stars >= 4 ? 1 : stars === 3 ? 0 : -1;
    if (adjustment !== 0) {
      await db.update(usersTable)
        .set({ goodwill_score: sql`LEAST(200, GREATEST(0, COALESCE(${usersTable.goodwill_score}, 100) + ${adjustment}))` })
        .where(eq(usersTable.id, rateeId))
        .catch((err) => {
          logger.warn({ err, ratee_id: rateeId, stars }, "rating: goodwill_score adjustment failed (non-fatal)");
        });
    }
  }

  logger.info({ request_id: requestId, rater_id: raterId, ratee_id: rateeId, role, stars: bParsed.data.stars }, "rating: submitted");
  return res.json({ success: true });
});


// ── POST /requests/:id/tip — RETIRED (410 Gone) ───────────────────────────────
// This endpoint previously credited an arbitrary client-supplied tip_amount
// directly to a helper's benevolence_wallet with no Stripe payment verification.
// That is a money-security hole: any authenticated user could inflate a helper's
// wallet balance by any amount simply by calling this route.
//
// Tips now flow through the existing pledge/Stripe path:
//   - Immediate tippers: create a Stripe PaymentIntent (POST /payments/create-intent)
//     and confirm via the StripePaymentModal; the webhook handler credits the wallet.
//   - PIF requesters: the standard Niakofa pledge flow (POST /users/:id/pledge).
//
// Returning 410 (not 404) signals to clients that the endpoint existed but was
// intentionally removed — callers should update rather than retry.
// ── POST /requests/:id/tip-wallet — tip a helper from your wallet balance ─────
router.post("/requests/:id/tip-wallet", requireAuth, requireApproved, async (req, res) => {
  const requestId = parseInt(String(req.params.id));
  const callerId  = req.authenticatedUserId!;
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const { tip_amount_cents } = req.body as { tip_amount_cents?: number };
  if (!tip_amount_cents || tip_amount_cents < 50 || tip_amount_cents > 10_000) {
    return res.status(400).json({ error: "tip_amount_cents must be between 50 (¢) and 10 000 (= $100)" });
  }

  const [request] = await db.select({
    requester_id: requestsTable.requester_id,
    helper_id:    requestsTable.helper_id,
    status:       requestsTable.status,
  }).from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== callerId) return res.status(403).json({ error: "Only the requester may tip the helper" });
  if (!request.helper_id)  return res.status(409).json({ error: "No helper assigned to this request" });
  if (!["completed","arrived"].includes(request.status)) {
    return res.status(409).json({ error: "Tips are only allowed after the helper has arrived or the request is complete" });
  }

  const tipDollars = tip_amount_cents / 100;

  let txFailed = false;
  await db.transaction(async tx => {
    const [requesterRow] = await tx.select({ wallet: usersTable.benevolence_wallet })
      .from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
    if (!requesterRow) throw Object.assign(new Error("User not found"), { status: 404 });
    if ((requesterRow.wallet ?? 0) < tipDollars) {
      throw Object.assign(new Error("Insufficient balance"), { code: "insufficient_balance", status: 402 });
    }

    await tx.update(usersTable)
      .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} - ${tipDollars}` })
      .where(eq(usersTable.id, callerId));

    await tx.update(usersTable)
      .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${tipDollars}` })
      .where(eq(usersTable.id, request.helper_id!));

    await tx.insert(transactionsTable).values([
      { user_id: callerId,           type: "tip_sent",     amount: -tipDollars, description: `Tip to helper for request #${requestId}`, request_id: requestId },
      { user_id: request.helper_id!, type: "tip_received", amount:  tipDollars, description: `Tip from requester for request #${requestId}`, request_id: requestId },
    ]);
  }).catch((err: Error & { code?: string; status?: number }) => {
    if (err.code === "insufficient_balance") {
      txFailed = true;
      return res.status(402).json({ error: err.message, code: err.code });
    }
    throw err;
  });

  // If the transaction failed (insufficient balance), the response was already
  // sent inside .catch — do not fall through to sendToUser or res.json.
  if (txFailed) return;

  sendToUser(request.helper_id, {
    type: "payment_completed",
    payload: { tip_amount_cents, request_id: requestId, from_user_id: callerId },
  });

  return res.json({ ok: true, tip_amount_cents, request_id: requestId });
});

router.post("/requests/:id/tip", (_req, res) => {
  return res.status(410).json({
    error:
      "POST /requests/:id/tip has been retired. Tips are now processed through " +
      "the Stripe payment flow (POST /payments/create-intent) or the standard " +
      "pledge path (POST /users/:id/pledge). See API changelog for migration guidance.",
    code: "endpoint_retired",
  });
});

// ── Help Chains ──────────────────────────────────────────────────────────────

// POST /requests/:id/helpers/join — join the help chain for a request
// requireApproved: only community-approved users may join help chains.
// Unapproved accounts cannot perform help-chain mutations (same gate as /claim).
router.post("/requests/:id/helpers/join", requireAuth, requireApproved, async (req, res) => {
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
  sendToRequestParticipants(request.requester_id, request.helper_id, {
    type: "help_chain_joined",
    payload: { request_id: requestId, helper_id: helperId },
  });

  return res.status(201).json(row);
});

// DELETE /requests/:id/helpers/leave — leave the help chain
// requireApproved: symmetric with join — leaving is a help-chain mutation.
router.delete("/requests/:id/helpers/leave", requireAuth, requireApproved, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });
  const r = req as typeof req & { authenticatedUserId: number };
  const helperId = r.authenticatedUserId;

  await db.delete(requestHelpersTable)
    .where(and(eq(requestHelpersTable.request_id, requestId), eq(requestHelpersTable.helper_id, helperId)));

  const [request] = await db.select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
    .from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (request) {
    sendToRequestParticipants(request.requester_id, request.helper_id, {
      type: "help_chain_left",
      payload: { request_id: requestId, helper_id: helperId },
    });
  }

  return res.json({ ok: true });
});

// ── Admin: Pledge write-off ───────────────────────────────────────────────────
// PATCH /admin/requests/:id/pledge-status
// Marks a pledge as forgiven or written_off so stale unpaid pledges no longer
// drag down the pool runway number (outstanding_pif_total). Only admins can
// call this — it is an explicit write-off decision, not something the system
// does automatically. Write-offs after ~12-18 months of non-payment are the
// recommended threshold (see CLAUDE.md "Known product gaps").
router.patch("/admin/requests/:id/pledge-status", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const adminId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const { pledge_status, reason } = req.body as { pledge_status?: string; reason?: string };
  if (pledge_status !== "active" && pledge_status !== "forgiven" && pledge_status !== "written_off" && pledge_status !== "defaulted") {
    return res.status(400).json({ error: "pledge_status must be 'active', 'forgiven', 'written_off', or 'defaulted'." });
  }

  const result = await db.transaction(async (tx) => {
    // Update the pledge status on the request row
    const [updated] = await tx
      .update(requestsTable)
      .set({ pledge_status } as Record<string, unknown>)
      .where(eq(requestsTable.id, requestId))
      .returning();

    if (!updated) return null;

    // When forgiving or writing off, cancel all pending scheduled payments for this
    // request so the reminder worker stops chasing them and the UI clears them.
    if (pledge_status === "forgiven" || pledge_status === "written_off") {
      await tx
        .update(scheduledPaymentsTable)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(scheduledPaymentsTable.request_id, requestId),
            eq(scheduledPaymentsTable.status, "pending")
          )
        );
    }

    return updated;
  });

  if (!result) return res.status(404).json({ error: "Request not found." });

  const actionLabel = pledge_status === "written_off" ? "wrote off"
    : pledge_status === "forgiven" ? "forgave"
    : pledge_status === "defaulted" ? "defaulted"
    : "restored";

  logger.info(
    {
      request_id: requestId,
      pledge_status,
      admin_id: adminId,
      pledge_amount: result.pledge_amount,
      pledge_paid: result.pledge_paid,
      reason: reason ?? null,
    },
    `Admin ${actionLabel} pledge${reason ? ` — reason: ${reason}` : ""}`,
  );
  return res.json(result);
});

// ── Admin: Flagged requests moderation queue ──────────────────────────────────
// GET /admin/requests/flagged — list requests with moderation_status='pending'
// These are requests that tripped the heuristic screen (spam/illegal signals)
// but were still created (to not block someone who genuinely needs help).
// Admins can approve or reject them here.
router.get("/admin/requests/flagged", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const flagged = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      description: requestsTable.description,
      category: requestsTable.category,
      urgency: requestsTable.urgency,
      status: requestsTable.status,
      moderation_status: requestsTable.moderation_status,
      moderation_reason: requestsTable.moderation_reason,
      requester_id: requestsTable.requester_id,
      requester_name: usersTable.name,
      requester_email: usersTable.email,
      created_at: requestsTable.created_at,
    })
    .from(requestsTable)
    .leftJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
    .where(eq(requestsTable.moderation_status, "pending"))
    .orderBy(requestsTable.created_at);

  return res.json(flagged);
});

// POST /admin/requests/:id/moderate — approve or reject a flagged request
// action: 'approve' → set moderation_status='approved' (request stays live)
// action: 'reject'  → set moderation_status='rejected' + cancel the request
// Only operates on rows where moderation_status='pending' to match queue semantics.
router.post("/admin/requests/:id/moderate", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const adminId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const { action } = req.body as { action?: "approve" | "reject" };
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }

  // Approve: mark moderation cleared, request stays in its current status.
  // Reject:  cancel the request AND mark moderation rejected — BUT only when
  //          the request is still in a cancellable state (open or pending_owner_approval).
  //          A request that was claimed/completed before moderation review must NOT
  //          be silently cancelled — that would break the lifecycle and helper payment.
  //          Admins should use pledge-status write-off for completed-but-problematic rows.
  let updatePayload: Record<string, unknown>;
  if (action === "approve") {
    updatePayload = { moderation_status: "approved", moderation_reason: null };
  } else {
    updatePayload = { moderation_status: "rejected", status: "cancelled", cancelled_at: new Date() };
  }

  // WHERE clause:
  //   - moderation_status = 'pending' (prevents re-moderation of already-reviewed rows)
  //   - For reject: also restrict to open/pending_owner_approval (cannot cancel completed work)
  const whereClause =
    action === "approve"
      ? and(eq(requestsTable.id, requestId), eq(requestsTable.moderation_status, "pending"))
      : and(
          eq(requestsTable.id, requestId),
          eq(requestsTable.moderation_status, "pending"),
          inArray(requestsTable.status, ["open", "pending_owner_approval"]),
        );

  const [updated] = await db
    .update(requestsTable)
    .set(updatePayload)
    .where(whereClause)
    .returning();

  if (!updated) {
    // Distinguish: already completed vs. not found vs. wrong moderation state
    const [check] = await db
      .select({ status: requestsTable.status, moderation_status: requestsTable.moderation_status })
      .from(requestsTable)
      .where(eq(requestsTable.id, requestId))
      .limit(1);
    if (!check) return res.status(404).json({ error: "Request not found." });
    if (check.moderation_status !== "pending") {
      return res.status(409).json({ error: "Request is not in pending moderation state.", moderation_status: check.moderation_status });
    }
    // reject attempted on a claimed/completed request
    return res.status(409).json({
      error:
        "Cannot cancel this request — it has already been claimed or completed. " +
        "Use the pledge write-off endpoint (PATCH /admin/requests/:id/pledge-status) " +
        "to handle already-completed problematic requests.",
      status: check.status,
    });
  }

  logger.info(
    { request_id: requestId, action, admin_id: adminId, title: updated.title },
    `Admin ${action === "approve" ? "approved" : "rejected"} flagged request`,
  );
  return res.json(updated);
});

// ── Self-service pledge repayment ─────────────────────────────────────────────
// POST /requests/:id/pledge-repay
//
// Any authenticated requester can record a partial or full repayment against
// their Pay It Forward pledge. Making ANY repayment immediately reinstates a
// defaulted pledge back to 'active', restoring the user's ability to post new
// PIF requests without waiting for an admin action.
//
// Design intent: "No pressure — pay what you can, whenever you can."
// Once a requester demonstrates intent by making a payment, they regain access.
// The full outstanding balance remains tracked until the pledge is fully repaid.
//
// Rules:
//   - Only the original requester can submit a repayment
//   - Only on active or defaulted pledges (forgiven/written_off are closed)
//   - Amount must be > 0 and ≤ outstanding balance
//   - Funds are debited from the user's benevolence_wallet (funded via Stripe
//     webhook) — no raw client-supplied amount is credited without verification.
//     This closes the same class of fraud that /requests/:id/tip had: crediting
//     an arbitrary client-supplied amount with no Stripe payment verification.
//   - Ledger entry recorded for audit trail
//   - 'defaulted' status flips back to 'active' on any repayment
//   - Full repayment flips status to 'repaid' (pledge completed)
router.post("/requests/:id/pledge-repay", requireAuth, async (req, res) => {
  const requesterId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });
  const idempotencyKey = String(req.header("Idempotency-Key") ?? "").trim();
  if (idempotencyKey.length > 128) return res.status(400).json({ error: "Idempotency-Key must be 128 characters or fewer." });
  // Check the durable ledger before validating the current pledge state. A
  // successful full repayment changes the pledge to `repaid`; a replay of
  // that same operation must still return success rather than a misleading
  // "already resolved" conflict.
  if (idempotencyKey) {
    const [priorTransaction] = await db
      .select({ amount: transactionsTable.amount })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.user_id, requesterId),
        eq(transactionsTable.idempotency_key, idempotencyKey),
      ))
      .limit(1);
    if (priorTransaction) {
      const [currentRequest] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
      return res.status(200).json({
        success: true,
        amount_paid: Math.abs(priorTransaction.amount),
        new_pledge_paid: currentRequest?.pledge_paid ?? null,
        pledge_status: currentRequest?.pledge_status ?? "repaid",
        message: "Repayment already recorded.",
      });
    }
  }

  const { amount } = req.body as { amount?: unknown };
  const amountNum = typeof amount === "number" ? amount : parseFloat(String(amount ?? ""));
  if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const [request] = await db
    .select()
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== requesterId) return res.status(403).json({ error: "Forbidden" });
  if (request.pledge_status !== "defaulted" && request.pledge_status !== "active") {
    return res.status(409).json({ error: "This pledge is already resolved." });
  }
  if (!request.pledge_amount || request.pledge_amount <= 0) {
    return res.status(400).json({ error: "No outstanding pledge on this request." });
  }

  const outstanding = (request.pledge_amount ?? 0) - (request.pledge_paid ?? 0);
  if (outstanding <= 0) {
    return res.status(409).json({ error: "This pledge is already fully paid." });
  }
  // Cap repayment at the outstanding balance — no overpayment
  const safeAmount = Math.min(amountNum, outstanding);

  // Atomic SQL increment — avoids lost-update race when two repayments hit concurrently.
  // Status is computed inside the DB from the post-update pledge_paid value, never from
  // stale application-layer reads.  RETURNING captures what was actually written.
  //
  // SECURITY: the repayment amount is debited from the user's benevolence_wallet,
  // which is only credited by the Stripe webhook handler. This ensures every
  // pledge_repayment is backed by real Stripe-verified funds — not a raw
  // client-supplied number. Same pattern as /requests/:id/tip-wallet.
  let updated: { pledge_paid: number | null; pledge_status: string | null; pledge_amount: number | null } | undefined;
  try {
    [updated] = await db.transaction(async (tx) => {
      // Reserve the operation before touching the wallet. The unique index
      // makes concurrent retries collapse to one ledger debit.
      if (idempotencyKey) {
        const [reserved] = await tx.insert(transactionsTable).values({
          user_id: requesterId,
          type: "pledge_repayment",
          amount: -safeAmount,
          description: `Pledge repayment for request #${requestId}`,
          request_id: requestId,
          idempotency_key: idempotencyKey,
        }).onConflictDoNothing({
          target: [transactionsTable.user_id, transactionsTable.idempotency_key],
        }).returning({ id: transactionsTable.id });
        if (!reserved) throw Object.assign(new Error("already_processed"), { status: 200 });
      }
      // Verify the user has sufficient wallet balance (funded via Stripe webhook)
      const [requesterRow] = await tx.select({ wallet: usersTable.benevolence_wallet })
        .from(usersTable).where(eq(usersTable.id, requesterId)).limit(1);
      if (!requesterRow) throw Object.assign(new Error("User not found"), { status: 404 });
      if ((requesterRow.wallet ?? 0) < safeAmount) {
        throw Object.assign(new Error("Insufficient wallet balance to cover this repayment"), { code: "insufficient_balance", status: 402 });
      }

      // Debit the wallet — atomically, with a guard to prevent going negative
      const debitResult = await tx
        .update(usersTable)
        .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} - ${safeAmount}` })
        .where(
          and(
            eq(usersTable.id, requesterId),
            sql`COALESCE(${usersTable.benevolence_wallet}, 0) >= ${safeAmount}`,
          ),
        )
        .returning({ wallet: usersTable.benevolence_wallet });

      if (!debitResult[0]) {
        throw Object.assign(new Error("Insufficient wallet balance to cover this repayment"), { code: "insufficient_balance", status: 402 });
      }

      const rows = await tx
        .update(requestsTable)
        .set({
          // Increment pledge_paid atomically; cap at pledge_amount to prevent overshoot
          pledge_paid: sql`LEAST(
            COALESCE(${requestsTable.pledge_paid}, 0) + ${safeAmount},
            COALESCE(${requestsTable.pledge_amount}, 0)
          )`,
          // Status transitions computed inside DB from post-update state:
          //   fully paid  → 'repaid'  (NOT 'forgiven' — 'forgiven' is admin charity only)
          //   was defaulted, partially paid → 'active'  (reinstatement on any repayment)
          //   was active, partially paid → unchanged ('active')
          pledge_status: sql<string>`CASE
            WHEN (COALESCE(${requestsTable.pledge_paid}, 0) + ${safeAmount}) >= COALESCE(${requestsTable.pledge_amount}, 0)
              THEN 'repaid'
            WHEN ${requestsTable.pledge_status} = 'defaulted'
              THEN 'active'
            ELSE ${requestsTable.pledge_status}
          END`,
          // Clear any pending hardship — requester has demonstrated intent to pay
          hardship_requested_at: null,
          hardship_note: null,
        } as Record<string, unknown>)
        .where(
          and(
            eq(requestsTable.id, requestId),
            // Guard: only update rows still carrying an outstanding balance
            // (prevents double-credit if the same client fires the request twice)
            sql`COALESCE(${requestsTable.pledge_paid}, 0) < COALESCE(${requestsTable.pledge_amount}, 0)`,
          )
        )
        .returning({
          pledge_paid: requestsTable.pledge_paid,
          pledge_status: requestsTable.pledge_status,
          pledge_amount: requestsTable.pledge_amount,
        });

      if (!rows[0]) {
        // Race: another concurrent repayment already cleared the balance
        throw Object.assign(new Error("already_paid"), { status: 409 });
      }

      const row = rows[0];
      const amountActuallyApplied = Math.min(safeAmount, (row.pledge_amount ?? 0) - ((row.pledge_paid ?? 0) - safeAmount));

      // Record the wallet debit as a transaction for the audit trail.
      if (!idempotencyKey) {
        await tx.insert(transactionsTable).values({
          user_id: requesterId,
          type: "pledge_repayment",
          amount: -safeAmount,
          description: `Pledge repayment for request #${requestId}`,
          request_id: requestId,
        });
      }

      // Record the repayment in the pool ledger for the audit trail.
      await tx.insert(communityPoolLedgerTable).values({
        entry_type: "pledge_repayment",
        amount: amountActuallyApplied > 0 ? amountActuallyApplied : safeAmount,
        request_id: requestId,
        user_id: requesterId,
        notes: `Self-service repayment — pledge ${row.pledge_status === "repaid" ? "fully paid" : "reinstated from defaulted"}`,
      });

      return rows;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "already_processed") {
      const [replayed] = await db.select().from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
      return res.status(200).json({
        success: true,
        amount_paid: safeAmount,
        new_pledge_paid: replayed?.pledge_paid ?? request.pledge_paid,
        pledge_status: replayed?.pledge_status ?? request.pledge_status,
        message: "Repayment already recorded.",
      });
    }
    if (err instanceof Error && err.message === "already_paid") {
      return res.status(409).json({ error: "This pledge is already fully paid or resolved." });
    }
    if ((err as Error & { code?: string }).code === "insufficient_balance") {
      return res.status(402).json({ error: (err as Error).message, code: "insufficient_balance" });
    }
    throw err;
  }

  if (!updated) {
    return res.status(409).json({ error: "This pledge is already fully paid or resolved." });
  }

  // 'repaid' = system-closed after full self-service repayment (NOT 'forgiven' — that's admin charity)
  const fullyPaid = updated.pledge_status === "repaid";

  // Reward repayment with a visible trust-score boost so repayment history shows
  // up in trust tiers — not just as protection against the -10 default penalty.
  // +5 on full repayment; +2 on partial/reinstatement from defaulted.
  // Both are capped at 100; the 80-cap only applies to the completion-volume bump.
  if (fullyPaid) {
    await db
      .update(usersTable)
      .set({ trust_score: sql`LEAST(100, COALESCE(${usersTable.trust_score}, 5) + 5)` })
      .where(eq(usersTable.id, requesterId));
  } else if (updated.pledge_status === "active") {
    // Reinstated from defaulted — partial signal, smaller boost
    await db
      .update(usersTable)
      .set({ trust_score: sql`LEAST(100, COALESCE(${usersTable.trust_score}, 5) + 2)` })
      .where(eq(usersTable.id, requesterId));
  }

  logger.info(
    { request_id: requestId, requester_id: requesterId, amount: safeAmount, new_status: updated.pledge_status, fully_paid: fullyPaid },
    "pledge-repay: self-service repayment recorded"
  );

  return res.status(200).json({
    success: true,
    amount_paid: safeAmount,
    new_pledge_paid: updated.pledge_paid,
    pledge_status: updated.pledge_status,
    message: fullyPaid
      ? "Thank you! Your pledge has been fully paid. The community is grateful. 💙"
      : "Thank you! Your pledge is back in good standing. Pay more whenever you're able. 💙",
  });
});

// ── Hardship / Forgiveness Request — requester self-service ──────────────────
// POST /requests/:id/hardship
// Lets a requester proactively say "I can't pay this right now." Creates an
// admin-visible queue item. Replaces the "awkward silent non-payment" model
// with a transparent self-serve forgiveness request.
//
// Rules:
//   - Only the original requester can submit
//   - Only on active or defaulted pledges (forgiven/written_off don't need it)
//   - One submission per request (hardship_requested_at not null = already filed)
router.post("/requests/:id/hardship", requireAuth, requestCreationLimiter, async (req, res) => {
  const requesterId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const [request] = await db
    .select()
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== requesterId) return res.status(403).json({ error: "Forbidden" });
  if (!request.pledge_amount || request.pledge_amount <= 0) {
    return res.status(400).json({ error: "This request has no outstanding pledge." });
  }
  // Only allow on active or defaulted pledges — not on already-resolved ones
  if (request.pledge_status !== "active" && request.pledge_status !== "defaulted") {
    return res.status(409).json({ error: "This pledge has already been resolved." });
  }
  const alreadyFiled = (request as typeof request & { hardship_requested_at?: string | null }).hardship_requested_at;
  if (alreadyFiled) {
    return res.status(409).json({ error: "A hardship request has already been submitted for this pledge. An admin will review it." });
  }

  const { note } = req.body as { note?: string };
  const safeNote = typeof note === "string" ? note.trim().slice(0, 1000) : null;

  await db
    .update(requestsTable)
    .set({ hardship_requested_at: new Date(), hardship_note: safeNote } as Record<string, unknown>)
    .where(eq(requestsTable.id, requestId));

  logger.info(
    { request_id: requestId, requester_id: requesterId },
    "requester filed hardship request — pending admin review",
  );

  return res.status(200).json({ success: true, message: "Your hardship request has been submitted. No pressure — an admin will review it with care." });
});

// ── Admin: Dismiss (clear) a hardship request without changing pledge_status ──
// DELETE /admin/requests/:id/hardship
// Called when admin reviews but wants to keep the pledge active (no forgiveness
// yet), or just clear a stale queue entry. Clears hardship_requested_at and
// hardship_note so the item no longer appears in the admin queue.
router.delete("/admin/requests/:id/hardship", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const adminId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const [updated] = await db
    .update(requestsTable)
    .set({ hardship_requested_at: null, hardship_note: null } as Record<string, unknown>)
    .where(eq(requestsTable.id, requestId))
    .returning({ id: requestsTable.id, pledge_status: requestsTable.pledge_status });

  if (!updated) return res.status(404).json({ error: "Request not found" });

  logger.info({ request_id: requestId, admin_id: adminId }, "Admin dismissed hardship request (cleared from queue, pledge_status unchanged)");
  return res.json({ success: true });
});

// ── Admin: List pending hardship requests ─────────────────────────────────────
// GET /admin/hardship-requests
router.get("/admin/hardship-requests", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  // FIX (data-loss audit, follow-up): requestsTable.requester_id has no FK
  // constraint at all (nothing enforces it still points to a real user).
  // A completed request's requester could be deleted without ever tripping
  // the active-request block in the account-deletion route (that only
  // checks ACTIVE_REQUEST_STATUSES), leaving requester_id orphaned. The old
  // INNER JOIN then silently dropped that request from this admin queue —
  // a request going missing from view, which is the exact failure mode
  // this whole audit is meant to close. LEFT JOIN keeps the request visible
  // with requester_name/email as null instead of hiding it entirely.
  const rows = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      pledge_amount: requestsTable.pledge_amount,
      pledge_paid: requestsTable.pledge_paid,
      pledge_status: requestsTable.pledge_status,
      hardship_note: requestsTable.hardship_note,
      hardship_requested_at: requestsTable.hardship_requested_at,
      requester_id: requestsTable.requester_id,
      requester_name: usersTable.name,
      requester_email: usersTable.email,
    })
    .from(requestsTable)
    .leftJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
    .where(sql`${requestsTable.hardship_requested_at} IS NOT NULL AND ${requestsTable.pledge_status} NOT IN ('forgiven', 'written_off', 'repaid')`)
    .orderBy(requestsTable.hardship_requested_at);

  return res.json(rows);
});

// ── Flexible Repayment Plan ───────────────────────────────────────────────────
// POST /requests/:id/repayment-plan
//
// Creates a structured installment repayment plan for a Pay It Forward pledge.
// Atomically inserts a repayment_plans row + N scheduled_payments rows so the
// reminder worker can nudge the requester at each installment date.
//
// Body: { plan_type, period, total_amount, start_date }
// plan_type:    "installments_2" | "installments_4"
// period:       "days_2" | "weeks_2" | "months_2" | "years_2"
// total_amount: total USD to repay (≤ outstanding balance)
// start_date:   ISO timestamp — first installment date (must be ≥ today)
//
// installment_count is DERIVED from plan_type server-side — the client value
// is intentionally ignored to prevent semantic mismatches.
router.post("/requests/:id/repayment-plan", requireAuth, requestCreationLimiter, async (req, res) => {
  const requesterId = req.authenticatedUserId!;
  const requestId = parseInt(String(req.params.id), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request id" });

  const { plan_type, period, total_amount, start_date } = req.body as {
    plan_type?: string;
    period?: string;
    total_amount?: number;
    start_date?: string;
  };

  // Canonical lookup tables — single source of truth for both validation and computation
  const PLAN_INSTALLMENT_COUNT: Record<string, number> = {
    installments_2: 2,
    installments_4: 4,
  };
  const PERIOD_DAYS: Record<string, number> = {
    days_2: 2, weeks_2: 14, months_2: 60, years_2: 730,
  };

  if (!plan_type || !(plan_type in PLAN_INSTALLMENT_COUNT)) {
    return res.status(400).json({ error: "plan_type must be 'installments_2' or 'installments_4'" });
  }
  if (!period || !(period in PERIOD_DAYS)) {
    return res.status(400).json({ error: "period must be one of: days_2, weeks_2, months_2, years_2" });
  }
  if (!total_amount || total_amount <= 0) {
    return res.status(400).json({ error: "total_amount must be a positive number" });
  }
  if (!start_date) {
    return res.status(400).json({ error: "start_date is required" });
  }

  const startDate = new Date(start_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (isNaN(startDate.getTime()) || startDate < today) {
    return res.status(400).json({ error: "start_date must be today or in the future" });
  }

  // Load the request and verify ownership
  const [request] = await db
    .select()
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.requester_id !== requesterId) return res.status(403).json({ error: "Forbidden" });
  if (request.pledge_status !== "active" && request.pledge_status !== "defaulted") {
    return res.status(409).json({ error: "This pledge is already resolved." });
  }

  const outstanding = (request.pledge_amount ?? 0) - (request.pledge_paid ?? 0);
  if (outstanding <= 0) {
    return res.status(409).json({ error: "This pledge is already fully paid." });
  }

  // Authoritative count derived from plan_type — never trust client-supplied value
  const count = PLAN_INSTALLMENT_COUNT[plan_type]!;
  const safeTotal = Math.min(total_amount, outstanding);
  const amountPerInstallment = parseFloat((safeTotal / count).toFixed(2));
  const periodDays = PERIOD_DAYS[period]!;

  /**
   * Installment date formula:
   *   payment_i = startDate + round(i * periodDays / (count - 1))
   *
   * • i = 0         → day 0   (always startDate)
   * • i = count - 1 → day periodDays  (full span covered, not half)
   *
   * Examples:
   *   2 payments / 60 days → day 0, day 60
   *   4 payments / 14 days → day 0, day 5, day 9, day 14
   */
  const installmentDates: Date[] = Array.from({ length: count }, (_, i) => {
    const d = new Date(startDate);
    const offsetDays = count === 1 ? 0 : Math.round((i * periodDays) / (count - 1));
    d.setDate(d.getDate() + offsetDays);
    return d;
  });

  // Dynamic import for repaymentPlansTable (graceful degradation if migration 0058
  // has not yet been applied on older DB instances)
  let repaymentPlansTable: typeof RepaymentPlansTable | undefined;
  try {
    const dbModule = await import("@workspace/db");
    repaymentPlansTable = (dbModule as Record<string, unknown>)["repaymentPlansTable"] as
      typeof RepaymentPlansTable | undefined;
  } catch {
    // Fall back to plain scheduled_payments without a plan row
  }

  try {
    const result = await db.transaction(async (tx) => {
      let planId: number | undefined;

      // Insert repayment_plans header row when migration 0058 is present
      if (repaymentPlansTable) {
        const [planRow] = await tx.insert(repaymentPlansTable).values({
          user_id: requesterId,
          request_id: requestId,
          plan_type,
          period,
          total_amount: safeTotal,
          installment_count: count,
          amount_per_installment: amountPerInstallment,
          status: "active",
        }).returning({ id: repaymentPlansTable.id });
        planId = planRow?.id;
      }

      // Insert one scheduled_payment per installment
      const payments = await tx.insert(scheduledPaymentsTable).values(
        installmentDates.map((date, i) => ({
          user_id: requesterId,
          request_id: requestId,
          // Last installment absorbs penny rounding so the sum always equals safeTotal
          amount: i === count - 1
            ? parseFloat((safeTotal - amountPerInstallment * (count - 1)).toFixed(2))
            : amountPerInstallment,
          scheduled_date: date,
          status: "pending" as const,
          note: `Installment ${i + 1} of ${count} — ${plan_type} over ${period}`,
          ...(planId ? { plan_id: planId } : {}),
        }))
      ).returning({ id: scheduledPaymentsTable.id });

      return { plan_id: planId, scheduled_payment_ids: payments.map(p => p.id) };
    });

    logger.info(
      { request_id: requestId, requester_id: requesterId, plan_type, period, total: safeTotal, installments: count },
      "repayment-plan: created installment plan"
    );

    return res.status(201).json({
      success: true,
      plan_id: result.plan_id,
      scheduled_payment_ids: result.scheduled_payment_ids,
      total_amount: safeTotal,
      installment_count: count,
      amount_per_installment: amountPerInstallment,
      message: `Your ${count}-payment plan has been created. We'll remind you when each payment is due. 💙`,
    });
  } catch (err) {
    logger.error({ err, request_id: requestId, requester_id: requesterId }, "repayment-plan: failed to create plan");
    return res.status(500).json({ error: "Could not create repayment plan. Please try again." });
  }
});

// GET /requests/:id/helpers — list all chain members with basic profile info
router.get("/requests/:id/helpers", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  // Only participants (requester or assigned helper) or admins may list helpers
  const callerId = req.authenticatedUserId!;
  const [request] = await db
    .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });

  const isParticipant = request.requester_id === callerId || request.helper_id === callerId;
  const [caller] = await db.select({ is_admin: usersTable.is_admin }).from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
  if (!isParticipant && !caller?.is_admin) {
    return res.status(403).json({ error: "Only participants or admins may view helpers on this request" });
  }

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

// ── Chat Messages ─────────────────────────────────────────────────────────────

// GET /requests/:id/messages — load chat history for a request
// Returns the last 100 messages, newest last.
// Both the requester and the assigned helper can access this.
router.get("/requests/:id/messages", requireAuth, async (req, res) => {
  const requestId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const callerId = req.authenticatedUserId!;

  // Verify the caller is a participant or admin
  const [request] = await db
    .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });

  const isParticipant =
    request.requester_id === callerId ||
    request.helper_id === callerId;

  const [caller] = await db.select({ is_admin: usersTable.is_admin }).from(usersTable).where(eq(usersTable.id, callerId)).limit(1);
  if (!isParticipant && !caller?.is_admin) {
    return res.status(403).json({ error: "Not a participant of this request" });
  }

  // Fetch the NEWEST 100 messages (DESC) then reverse to chronological order for display.
  // This ensures long threads always show the current conversation, not the oldest 100.
  const rows = await db
    .select({
      id: chatMessagesTable.id,
      request_id: chatMessagesTable.request_id,
      sender_id: chatMessagesTable.sender_id,
      content: chatMessagesTable.content,
      sent_at: chatMessagesTable.sent_at,
      read_at: chatMessagesTable.read_at,
      sender_name: usersTable.name,
      sender_avatar: usersTable.avatar_url,
    })
    .from(chatMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, chatMessagesTable.sender_id))
    .where(eq(chatMessagesTable.request_id, requestId))
    .orderBy(desc(chatMessagesTable.sent_at))
    .limit(100);

  // Reverse so client receives oldest-first (natural chat order).
  // Normalize to the canonical ChatMessage API shape (body + created_at) so the response
  // matches the OpenAPI spec and what InAppChat.tsx expects from both REST and WS paths.
  const messages = rows.reverse().map(m => ({
    id: String(m.id),
    request_id: m.request_id,
    sender_id: m.sender_id,
    sender_name: m.sender_name,
    sender_avatar: m.sender_avatar,
    body: m.content,
    created_at: m.sent_at?.toISOString() ?? new Date().toISOString(),
    read: m.read_at != null,
  }));

  return res.json({ messages });
});

// POST /requests/:id/safety-ping — passive safety check-in during an active session.
// Called by the SafetyPanel component every 3 minutes so the server can confirm
// that the helper (or requester) is still reachable. Not stored persistently —
// just updates the request's updated_at timestamp and broadcasts to admins.
// Requires the caller to be a participant (requester or helper).
router.post("/requests/:id/safety-ping", requireAuth, async (req, res) => {
  const requestId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const callerId = req.authenticatedUserId!;
  const [request] = await db
    .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id, status: requestsTable.status })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  const isParticipant = request.requester_id === callerId || request.helper_id === callerId;
  if (!isParticipant) return res.status(403).json({ error: "Not a participant" });

  // Only meaningful for active statuses
  if (["completed", "cancelled"].includes(request.status)) {
    return res.status(409).json({ error: "Request is already finished" });
  }

  const pingedAt = new Date();

  // SAFETY: this ping is what lets the admin dashboard know a person mid-help-session
  // is still OK. If the DB write fails, we must NOT tell the client "ok: true" — a
  // false success here means the client's SafetyPanel stops retrying while nothing
  // was actually recorded, i.e. a user in danger gets false reassurance. So this is
  // now awaited and its result gates the response, instead of fire-and-forget.
  try {
    await db.update(requestsTable)
      .set({ updated_at: pingedAt })
      .where(eq(requestsTable.id, requestId));
  } catch (err) {
    logger.error({ err, requestId, callerId }, "safety-ping: updated_at write failed — reporting failure to client");
    return res.status(500).json({ error: "Safety ping failed to record. Please retry, or call 911 if this is an emergency." });
  }

  // Broadcast so the admin real-time panel reflects the ping immediately. This is
  // in-process (no network hop) so it cannot fail the way a DB write can, but we
  // still guard it — a broadcast bug must never mask that the ping WAS persisted.
  try {
    broadcast({
      type: "safety_ping",
      payload: { request_id: requestId, user_id: callerId, pinged_at: pingedAt.toISOString() },
    });
  } catch (err) {
    logger.error({ err, requestId, callerId }, "safety-ping: admin broadcast failed after successful DB write");
  }

  return res.json({ ok: true, pinged_at: pingedAt.toISOString() });
});

// POST /requests/:id/safety-sos — SOS trigger during an active help session.
// Broadcasts an urgent alert to all admins and the other participant so they can
// respond. The actual 911 call is handled client-side; this endpoint ensures the
// platform is notified regardless of network conditions during the call.
//
// Status gate: only in-progress sessions (claimed / en_route / arrived) may trigger
// an SOS. Completed and cancelled sessions can never fire new alerts — this prevents
// historical participants from spamming admins with false alerts.
router.post("/requests/:id/safety-sos", requireAuth, async (req, res) => {
  const requestId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const callerId = req.authenticatedUserId!;
  const { role } = (req.body ?? {}) as { role?: string };

  const [request] = await db
    .select({
      requester_id: requestsTable.requester_id,
      helper_id: requestsTable.helper_id,
      title: requestsTable.title,
      status: requestsTable.status,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });
  const isParticipant = request.requester_id === callerId || request.helper_id === callerId;
  if (!isParticipant) return res.status(403).json({ error: "Not a participant" });

  // Only permit SOS for genuinely active sessions. Completed/cancelled/open requests
  // are not in-person sessions — an SOS from them is either stale or abusive.
  const ACTIVE_STATUSES = ["claimed", "en_route", "arrived"];
  if (!ACTIVE_STATUSES.includes(request.status)) {
    return res.status(409).json({
      error: "SOS can only be triggered during an active help session (claimed, en-route, or arrived).",
      status: request.status,
    });
  }

  const callerName = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, callerId)).limit(1).then(r => r[0]?.name ?? "Unknown");

  // SAFETY: persist a durable "sos" report FIRST, before any broadcast/push attempt.
  // Broadcast only reaches admins who happen to be connected right now, and push can
  // fail silently — if either of those were the only record, an SOS could vanish
  // with no trace while the caller still got "ok: true". The reports table (visible
  // in the admin Reports/SOS queue) is the fallback of record. If this insert fails,
  // we tell the caller so — never a false "help is on the way".
  let reportId: number | undefined;
  try {
    const [inserted] = await db.insert(reportsTable).values({
      reporter_id: callerId,
      reported_request_id: requestId,
      type: "sos",
      description: `SOS triggered by ${callerName} (role: ${role ?? "unknown"}) on request "${request.title}".`,
      status: "pending",
    }).returning({ id: reportsTable.id });
    reportId = inserted?.id;
  } catch (err) {
    logger.error({ err, requestId, callerId }, "safety-sos: FAILED to persist SOS report — returning error, not false reassurance");
    return res.status(500).json({ error: "SOS could not be recorded. If this is an emergency, call 911 now." });
  }

  // Broadcast to all admin-connected clients — best-effort, already durably recorded above.
  try {
    broadcast({
      type: "safety_sos",
      payload: {
        request_id: requestId,
        report_id: reportId,
        request_title: request.title,
        triggered_by: callerId,
        triggered_by_name: callerName,
        role: role ?? "unknown",
        triggered_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    logger.error({ err, requestId, callerId, reportId }, "safety-sos: admin broadcast failed after durable persist");
  }

  // Notify the other participant — best-effort.
  const otherId = request.requester_id === callerId ? request.helper_id : request.requester_id;
  if (otherId) {
    try {
      sendToUser(otherId, {
        type: "safety_sos",
        payload: {
          request_id: requestId,
          message: `🚨 SOS activated by ${callerName} on request "${request.title}"`,
        },
      });
    } catch (err) {
      logger.error({ err, requestId, callerId, otherId }, "safety-sos: participant notify failed after durable persist");
    }
  }

  logger.warn({ requestId, callerId, role, reportId }, "SOS triggered during active help session");

  return res.json({ ok: true, report_id: reportId });
});

// POST /requests/:id/messages — send a chat message via REST (fallback if WS unavailable)
router.post("/requests/:id/messages", requireAuth, async (req, res) => {
  const requestId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const callerId = req.authenticatedUserId!;
  const { content } = req.body as { content?: string };
  if (!content?.trim()) return res.status(400).json({ error: "Message content required" });
  const body = content.trim().slice(0, 2000);

  // Verify the caller is a participant
  const [request] = await db
    .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });

  const isParticipant = request.requester_id === callerId || request.helper_id === callerId;
  if (!isParticipant) return res.status(403).json({ error: "Not a participant of this request" });

  const [sender] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url }).from(usersTable).where(eq(usersTable.id, callerId)).limit(1);

  const [saved] = await db
    .insert(chatMessagesTable)
    .values({ request_id: requestId, sender_id: callerId, content: body })
    .returning();

  if (!saved) return res.status(500).json({ error: "Failed to save message" });

  const messagePayload = {
    id: String(saved.id),
    request_id: requestId,
    sender_id: callerId,
    sender_name: sender?.name ?? "Unknown",
    sender_avatar: sender?.avatar_url ?? null,
    body,
    created_at: saved.sent_at?.toISOString() ?? new Date().toISOString(),
  };

  // Route to both participants via WS
  sendToRequestParticipants(request.requester_id, request.helper_id, {
    type: "chat_message",
    payload: { message: messagePayload, request_id: requestId },
  });

  return res.status(201).json({ message: messagePayload });
});


export default router;
