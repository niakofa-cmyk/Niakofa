import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  diasporaHubsTable,
  hubMembershipsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();

const membershipStatuses = ["requested", "approved", "suspended", "revoked", "left"] as const;
const membershipRoles = ["member", "representative", "leader"] as const;

type MembershipStatus = (typeof membershipStatuses)[number];
type MembershipRole = (typeof membershipRoles)[number];

function parsePositiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === "string" && membershipStatuses.includes(value as MembershipStatus);
}

function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && membershipRoles.includes(value as MembershipRole);
}

async function canManageHub(userId: number, hubId: number): Promise<boolean> {
  const [user] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (user?.is_admin) return true;

  const [leader] = await db
    .select({ id: hubMembershipsTable.id })
    .from(hubMembershipsTable)
    .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
    .where(and(
      eq(hubMembershipsTable.user_id, userId),
      eq(hubMembershipsTable.hub_id, hubId),
      eq(hubMembershipsTable.status, "approved"),
      eq(hubMembershipsTable.role, "leader"),
      eq(diasporaHubsTable.status, "approved"),
    ))
    .limit(1);
  return Boolean(leader);
}

const membershipProjection = {
  id: hubMembershipsTable.id,
  user_id: hubMembershipsTable.user_id,
  hub_id: hubMembershipsTable.hub_id,
  status: hubMembershipsTable.status,
  role: hubMembershipsTable.role,
  requested_at: hubMembershipsTable.requested_at,
  approved_at: hubMembershipsTable.approved_at,
  approved_by: hubMembershipsTable.approved_by,
  created_at: hubMembershipsTable.created_at,
  updated_at: hubMembershipsTable.updated_at,
  user_name: usersTable.name,
  hub_name: diasporaHubsTable.name,
  hub_display_name: diasporaHubsTable.display_name,
};

async function findMembership(userId: number, hubId: number) {
  const [membership] = await db
    .select(membershipProjection)
    .from(hubMembershipsTable)
    .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
    .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
    .where(and(
      eq(hubMembershipsTable.user_id, userId),
      eq(hubMembershipsTable.hub_id, hubId),
    ))
    .limit(1);
  return membership ?? null;
}

// GET /api/diaspora/hub-memberships
// With hub_id, returns the caller's current state and a manager-only queue.
// Without hub_id, returns the caller's own memberships.
router.get("/diaspora/hub-memberships", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = req.query.hub_id == null ? null : parsePositiveId(req.query.hub_id);
  if (req.query.hub_id != null && !hubId) {
    return res.status(400).json({ error: "Invalid Hub id." });
  }

  if (hubId == null) {
    const memberships = await db
      .select(membershipProjection)
      .from(hubMembershipsTable)
      .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
      .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
      .where(eq(hubMembershipsTable.user_id, userId))
      .orderBy(desc(hubMembershipsTable.updated_at));
    return res.json({ memberships });
  }

  const membership = await findMembership(userId, hubId);
  const can_manage = await canManageHub(userId, hubId);
  const response: {
    membership: typeof membership;
    can_manage: boolean;
    memberships?: typeof membership[];
  } = { membership, can_manage };

  if (can_manage) {
    response.memberships = await db
      .select(membershipProjection)
      .from(hubMembershipsTable)
      .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
      .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
      .where(eq(hubMembershipsTable.hub_id, hubId))
      .orderBy(desc(hubMembershipsTable.updated_at));
  }

  return res.json(response);
});

// POST /api/diaspora/hub-memberships
// A signed-in user can request membership in any approved Hub. Location and
// account identity never create this row automatically.
router.post("/diaspora/hub-memberships", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = parsePositiveId(req.body?.hub_id);
  if (!hubId) return res.status(400).json({ error: "A valid Hub id is required." });

  const [hub] = await db
    .select({ id: diasporaHubsTable.id })
    .from(diasporaHubsTable)
    .where(and(eq(diasporaHubsTable.id, hubId), eq(diasporaHubsTable.status, "approved")))
    .limit(1);
  if (!hub) return res.status(404).json({ error: "Approved Hub not found." });

  const existing = await findMembership(userId, hubId);
  if (existing?.status === "approved" || existing?.status === "requested") {
    return res.status(200).json({ membership: existing, already_active: existing.status === "approved" });
  }

  let membership;
  if (existing) {
    [membership] = await db
      .update(hubMembershipsTable)
      .set({
        status: "requested",
        requested_at: new Date(),
        approved_at: null,
        approved_by: null,
        updated_at: new Date(),
      })
      .where(eq(hubMembershipsTable.id, existing.id))
      .returning();
  } else {
    [membership] = await db
      .insert(hubMembershipsTable)
      .values({ user_id: userId, hub_id: hubId, status: "requested", role: "member" })
      .returning();
  }

  if (!membership) return res.status(500).json({ error: "Membership request could not be saved." });
  return res.status(existing ? 200 : 201).json({ membership });
});

// PATCH /api/diaspora/hub-memberships/:id
// Only an approved Hub leader or platform admin can approve, suspend, revoke,
// or change the representation role of another membership.
router.patch("/diaspora/hub-memberships/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const membershipId = parsePositiveId(req.params.id);
  if (!membershipId) return res.status(400).json({ error: "Invalid membership id." });

  const [existing] = await db
    .select()
    .from(hubMembershipsTable)
    .where(eq(hubMembershipsTable.id, membershipId))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Membership not found." });
  if (!(await canManageHub(userId, existing.hub_id))) {
    return res.status(403).json({ error: "Only an approved Hub leader or admin can manage membership." });
  }

  // V11 governance hardening:
  // - ordinary Hub leaders manage ordinary member participation only;
  // - only platform admins may change membership roles;
  // - leaders cannot manage another leader;
  // - leaders cannot mutate their own membership through this manager endpoint.
  const [actor] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const isAdmin = Boolean(actor?.is_admin);
  if (!isAdmin && existing.role === "leader") {
    return res.status(403).json({ error: "Only a platform admin can manage another Hub leader." });
  }
  if (!isAdmin && existing.user_id === userId) {
    return res.status(403).json({ error: "Hub leaders cannot modify their own membership through the manager endpoint." });
  }

  const status = req.body?.status;
  const role = req.body?.role;
  if (!isMembershipStatus(status) || status === "requested") {
    return res.status(400).json({ error: "Choose approved, suspended, revoked, or left." });
  }
  if (role !== undefined && !isMembershipRole(role)) {
    return res.status(400).json({ error: "Invalid Hub membership role." });
  }
  if (!isAdmin && role !== undefined) {
    return res.status(403).json({ error: "Only a platform admin can change Hub membership roles." });
  }

  const [updated] = await db
    .update(hubMembershipsTable)
    .set({
      status,
      role: role ?? existing.role,
      approved_at: status === "approved" ? (existing.approved_at ?? new Date()) : null,
      approved_by: status === "approved" ? userId : null,
      updated_at: new Date(),
    })
    .where(eq(hubMembershipsTable.id, membershipId))
    .returning();

  return res.json({ membership: updated });
});

// DELETE /api/diaspora/hub-memberships/:id
// A member may leave their own Hub without giving themselves representation.
router.delete("/diaspora/hub-memberships/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const membershipId = parsePositiveId(req.params.id);
  if (!membershipId) return res.status(400).json({ error: "Invalid membership id." });

  const [updated] = await db
    .update(hubMembershipsTable)
    .set({ status: "left", approved_at: null, approved_by: null, updated_at: new Date() })
    .where(and(
      eq(hubMembershipsTable.id, membershipId),
      eq(hubMembershipsTable.user_id, userId),
    ))
    .returning();
  if (!updated) return res.status(404).json({ error: "Membership not found." });
  return res.json({ membership: updated });
});

export default router;