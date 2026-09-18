/**
 * V17.1 — Canonical Hub-scoped Community feed.
 *
 * GET /api/community/hubs/:hubId/feed
 *
 * This is an additive read model. It does not create membership, change
 * representation rights, or infer Hub membership from location.
 */
import { Router } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  diasporaHubsTable,
  gratitudePostsTable,
  hubMembershipsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function parseHubId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const approvedVisibleUser = and(
  eq(usersTable.approval_status, "approved"),
  eq(usersTable.is_suspended, false),
);

router.get("/community/hubs/:hubId/feed", requireAuth, async (req, res) => {
  const rawHubId = Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId;
  const hubId = parseHubId(rawHubId);
  if (!hubId) {
    return res.status(400).json({ error: "hubId must be a positive integer." });
  }

  // Globe Hubs are canonical roots only. Child/local Hubs remain discoverable
  // through their parent context and are not promoted to Globe feed roots.
  const [hub] = await db
    .select({
      id: diasporaHubsTable.id,
      name: diasporaHubsTable.name,
      display_name: diasporaHubsTable.display_name,
      region: diasporaHubsTable.region_label,
      country_code: diasporaHubsTable.country_code,
      subdivision_code: diasporaHubsTable.subdivision_code,
      hub_scope: diasporaHubsTable.hub_scope,
    })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);

  if (!hub) {
    return res.status(404).json({ error: "Canonical Hub not found." });
  }

  const memberWhere = and(
    eq(hubMembershipsTable.hub_id, hubId),
    eq(hubMembershipsTable.status, "approved"),
    eq(usersTable.approval_status, "approved"),
    eq(usersTable.is_suspended, false),
  );

  const gratitudeWhere = and(
    eq(gratitudePostsTable.moderation_status, "approved"),
    eq(usersTable.diaspora_hub_id, hubId),
    approvedVisibleUser,
  );

  const requestWhere = and(
    eq(requestsTable.status, "open"),
    eq(requestsTable.moderation_status, "approved"),
    or(
      eq(usersTable.diaspora_hub_id, hubId),
      eq(requestsTable.hub_id, hubId),
    ),
    approvedVisibleUser,
  );

  const [gratitude, openRequests, memberCountRows, gratitudeCountRows, requestCountRows] = await Promise.all([
    db
      .select({
        id: gratitudePostsTable.id,
        author_name: gratitudePostsTable.author_name,
        author_avatar: gratitudePostsTable.author_avatar,
        helper_name: gratitudePostsTable.helper_name,
        message: gratitudePostsTable.message,
        request_title: gratitudePostsTable.request_title,
        likes: gratitudePostsTable.likes,
        created_at: gratitudePostsTable.created_at,
      })
      .from(gratitudePostsTable)
      .innerJoin(usersTable, eq(usersTable.id, gratitudePostsTable.author_id))
      .where(gratitudeWhere)
      .orderBy(desc(gratitudePostsTable.created_at))
      .limit(30),

    db
      .select({
        id: requestsTable.id,
        title: requestsTable.title,
        category: requestsTable.category,
        urgency: requestsTable.urgency,
        status: requestsTable.status,
        created_at: requestsTable.created_at,
      })
      .from(requestsTable)
      .innerJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
      .where(requestWhere)
      .orderBy(desc(requestsTable.created_at))
      .limit(20),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hubMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
      .where(memberWhere),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gratitudePostsTable)
      .innerJoin(usersTable, eq(usersTable.id, gratitudePostsTable.author_id))
      .where(gratitudeWhere),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(requestsTable)
      .innerJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
      .where(requestWhere),
  ]);

  return res.json({
    hub: {
      id: hub.id,
      name: hub.name,
      display_name: hub.display_name ?? hub.name,
      region: hub.region,
      country_code: hub.country_code,
      subdivision_code: hub.subdivision_code,
      hub_scope: hub.hub_scope,
    },
    counts: {
      members: Number(memberCountRows[0]?.count ?? 0),
      open_requests: Number(requestCountRows[0]?.count ?? 0),
      gratitude: Number(gratitudeCountRows[0]?.count ?? 0),
    },
    gratitude,
    requests: openRequests,
    actions: {
      community: `/community?hubId=${hubId}`,
      messages: `/messages?mode=hub&sourceHub=${hubId}`,
      spirals: `/audio-spirals?hubId=${hubId}`,
    },
    context: {
      membership_is_not_inferred_from_location: true,
      spirals_are_curated: true,
    },
  });
});

export default router;
