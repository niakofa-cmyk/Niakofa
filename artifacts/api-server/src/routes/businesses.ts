import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { db, businessesTable, businessMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Helper: verify caller is an active owner of the business ─────────────────
async function requireBusinessOwner(
  businessId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [membership] = await db
    .select({ role: businessMembersTable.role, status: businessMembersTable.status })
    .from(businessMembersTable)
    .where(
      and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, userId),
      ),
    )
    .limit(1);
  if (!membership || membership.status !== "active") {
    return { ok: false, status: 403, error: "You are not a member of this business." };
  }
  if (membership.role !== "owner") {
    return { ok: false, status: 403, error: "Only the business owner can perform this action." };
  }
  return { ok: true };
}

// ── Helper: verify caller is an active member (any role) ─────────────────────
async function requireBusinessMember(
  businessId: number,
  userId: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const [membership] = await db
    .select({ role: businessMembersTable.role, status: businessMembersTable.status })
    .from(businessMembersTable)
    .where(
      and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, userId),
      ),
    )
    .limit(1);
  if (!membership || membership.status !== "active") {
    return { ok: false, status: 403, error: "You are not an active member of this business." };
  }
  return { ok: true };
}

// ── POST /businesses — create a business application (starts pending) ─────────
// The creating user is automatically made the owner. Business goes live only
// after an admin approves it (approval_status: pending → approved).
// This reuses the existing admin approval queue pattern from users.approval_status.
router.post("/businesses", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const { legal_name, display_name, address, phone } = req.body as {
    legal_name?: string;
    display_name?: string;
    address?: string;
    phone?: string;
  };

  if (!legal_name?.trim() || !display_name?.trim()) {
    return res.status(400).json({ error: "legal_name and display_name are required." });
  }

  const [business] = await db
    .insert(businessesTable)
    .values({
      legal_name: legal_name.trim(),
      display_name: display_name.trim(),
      address: address?.trim() ?? null,
      phone: phone?.trim() ?? null,
      approval_status: "pending",
      created_by_user_id: userId,
    })
    .returning();

  // Creator becomes the owner automatically
  await db.insert(businessMembersTable).values({
    business_id: business.id,
    user_id: userId,
    role: "owner",
    status: "active",
    accepted_at: new Date(),
  });

  // Flip account_type on the user now that they've applied
  await db
    .update(usersTable)
    .set({ account_type: "business" })
    .where(eq(usersTable.id, userId));

  logger.info({ business_id: business.id, owner_id: userId }, "Business application submitted");
  return res.status(201).json(business);
});

// ── GET /businesses/mine — list businesses the caller belongs to ───────────────
router.get("/businesses/mine", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const rows = await db
    .select({
      business: businessesTable,
      role: businessMembersTable.role,
      status: businessMembersTable.status,
    })
    .from(businessMembersTable)
    .innerJoin(businessesTable, eq(businessesTable.id, businessMembersTable.business_id))
    .where(
      and(
        eq(businessMembersTable.user_id, userId),
        eq(businessMembersTable.status, "active"),
      ),
    );

  return res.json(
    rows.map(r => ({ ...r.business, member_role: r.role, member_status: r.status })),
  );
});

// ── GET /businesses/:id — get a single business (members only or admin) ───────
router.get("/businesses/:id", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);
  if (!business) return res.status(404).json({ error: "Business not found." });

  const guard = await requireBusinessMember(businessId, userId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  return res.json(business);
});

// ── PATCH /businesses/:id — update business details (owner only) ──────────────
router.patch("/businesses/:id", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, userId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const { legal_name, display_name, address, phone } = req.body as Record<string, string | undefined>;
  const updates: Record<string, string | Date> = { updated_at: new Date() };
  if (legal_name?.trim()) updates.legal_name = legal_name.trim();
  if (display_name?.trim()) updates.display_name = display_name.trim();
  if (address !== undefined) updates.address = address.trim();
  if (phone !== undefined) updates.phone = phone.trim();

  const [updated] = await db
    .update(businessesTable)
    .set(updates)
    .where(eq(businessesTable.id, businessId))
    .returning();

  return res.json(updated);
});

// ── GET /businesses/:id/members — list all members (members only) ─────────────
router.get("/businesses/:id/members", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessMember(businessId, userId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const members = await db
    .select({
      id: businessMembersTable.id,
      user_id: businessMembersTable.user_id,
      role: businessMembersTable.role,
      status: businessMembersTable.status,
      invited_at: businessMembersTable.invited_at,
      accepted_at: businessMembersTable.accepted_at,
      name: usersTable.name,
      email: usersTable.email,
      avatar_url: usersTable.avatar_url,
    })
    .from(businessMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, businessMembersTable.user_id))
    .where(eq(businessMembersTable.business_id, businessId));

  return res.json(members);
});

// ── POST /businesses/:id/members — invite a user by email (owner only) ────────
// Creates a pending business_members row. The invitee accepts on next login.
router.post("/businesses/:id/members", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, userId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const { email, role } = req.body as { email?: string; role?: string };
  if (!email?.trim()) return res.status(400).json({ error: "email is required." });

  const memberRole = role === "owner" ? "owner" : "staff";

  const [invitee] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()))
    .limit(1);
  if (!invitee) return res.status(404).json({ error: "No user found with that email." });
  if (invitee.id === userId) return res.status(400).json({ error: "You are already a member." });

  // Upsert — idempotent if already invited
  const [member] = await db
    .insert(businessMembersTable)
    .values({
      business_id: businessId,
      user_id: invitee.id,
      role: memberRole,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();

  logger.info(
    { business_id: businessId, invitee_id: invitee.id, role: memberRole, invited_by: userId },
    "Business member invited",
  );
  return res.status(201).json(member ?? { already_invited: true });
});

// ── DELETE /businesses/:id/members/:userId — remove a member (owner only) ─────
router.delete("/businesses/:id/members/:memberId", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  const targetUserId = parseInt(req.params.memberId as string, 10);
  if (isNaN(businessId) || isNaN(targetUserId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, callerId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  if (targetUserId === callerId) {
    return res.status(400).json({ error: "Owner cannot remove themselves. Transfer ownership first." });
  }

  await db
    .update(businessMembersTable)
    .set({ status: "removed" })
    .where(
      and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, targetUserId),
      ),
    );

  logger.info({ business_id: businessId, removed_user_id: targetUserId, by: callerId }, "Business member removed");
  return res.json({ ok: true });
});

// ── POST /businesses/:id/members/:memberId/accept — accept an invite ──────────
router.post("/businesses/:id/members/:memberId/accept", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  const targetUserId = parseInt(req.params.memberId as string, 10);
  if (isNaN(businessId) || isNaN(targetUserId)) return res.status(400).json({ error: "Invalid id" });
  if (userId !== targetUserId) return res.status(403).json({ error: "You can only accept your own invite." });

  const [updated] = await db
    .update(businessMembersTable)
    .set({ status: "active", accepted_at: new Date() })
    .where(
      and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, userId),
        eq(businessMembersTable.status, "pending"),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "No pending invite found." });

  await db.update(usersTable).set({ account_type: "business" }).where(eq(usersTable.id, userId));
  logger.info({ business_id: businessId, user_id: userId }, "Business invite accepted");
  return res.json(updated);
});

// ── Admin: GET /admin/businesses — list all businesses for approval queue ─────
router.get("/admin/businesses", requireAuth, async (req, res) => {
  const caller = req.authenticatedUserId!;
  const [user] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, caller))
    .limit(1);
  if (!user?.is_admin) return res.status(403).json({ error: "Admin only." });

  const businesses = await db.select().from(businessesTable).orderBy(businessesTable.created_at);
  return res.json(businesses);
});

// ── Admin: PATCH /admin/businesses/:id/approve — approve or reject ────────────
router.patch("/admin/businesses/:id/approve", requireAuth, async (req, res) => {
  const caller = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const [adminUser] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, caller))
    .limit(1);
  if (!adminUser?.is_admin) return res.status(403).json({ error: "Admin only." });

  const { approval_status } = req.body as { approval_status?: string };
  if (approval_status !== "approved" && approval_status !== "rejected") {
    return res.status(400).json({ error: "approval_status must be 'approved' or 'rejected'." });
  }

  const [updated] = await db
    .update(businessesTable)
    .set({ approval_status, updated_at: new Date() })
    .where(eq(businessesTable.id, businessId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Business not found." });
  logger.info({ business_id: businessId, approval_status, admin_id: caller }, "Business approval updated");
  return res.json(updated);
});

export default router;
