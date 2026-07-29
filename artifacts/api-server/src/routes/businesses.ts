import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { db, businessesTable, businessMembersTable, usersTable, requestsTable, systemSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";

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
router.post("/businesses", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  // Feature flag check — honour the global businesses_enabled killswitch.
  const [setting] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "businesses_enabled"))
    .limit(1);
  if (!setting || setting.value !== "true") {
    return res.status(503).json({ error: "Business accounts are not available at this time." });
  }

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
router.get("/businesses/mine", requireAuth, generalApiLimiter, async (req, res) => {
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

// ── GET /businesses/:id — get a single business (members only OR admin) ───────
// Admins always bypass the membership guard (needed for admin approval UI).
router.get("/businesses/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const [business] = await db
    .select()
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);
  if (!business) return res.status(404).json({ error: "Business not found." });

  // Check if caller is an admin — admins can view any business without membership.
  const [caller] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!caller?.is_admin) {
    const guard = await requireBusinessMember(businessId, userId);
    if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  }

  return res.json(business);
});

// ── PATCH /businesses/:id — update business details (owner only) ──────────────
router.patch("/businesses/:id", requireAuth, generalApiLimiter, async (req, res) => {
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
router.get("/businesses/:id/members", requireAuth, generalApiLimiter, async (req, res) => {
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
// Requires the business to be approved first — no inviting staff to a pending entity.
router.post("/businesses/:id/members", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, userId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  // Ensure the business is approved before staff can be invited.
  // Owners of a pending business cannot recruit staff until an admin approves.
  const [business] = await db
    .select({ approval_status: businessesTable.approval_status })
    .from(businessesTable)
    .where(eq(businessesTable.id, businessId))
    .limit(1);
  if (!business) return res.status(404).json({ error: "Business not found." });
  if (business.approval_status !== "approved") {
    return res.status(403).json({ error: "Business must be approved before inviting members." });
  }

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

  // Upsert — re-activates previously removed members instead of silently no-op'ing.
  // onConflictDoNothing would prevent re-inviting a user whose membership was revoked.
  const [member] = await db
    .insert(businessMembersTable)
    .values({
      business_id: businessId,
      user_id: invitee.id,
      role: memberRole,
      status: "pending",
      invited_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [businessMembersTable.business_id, businessMembersTable.user_id],
      set: { role: memberRole, status: "pending", invited_at: new Date(), accepted_at: null },
    })
    .returning();

  logger.info(
    { business_id: businessId, invitee_id: invitee.id, role: memberRole, invited_by: userId },
    "Business member invited",
  );
  return res.status(201).json(member);
});

// ── DELETE /businesses/:id/members/:userId — remove a member (owner only) ─────
router.delete("/businesses/:id/members/:memberId", requireAuth, generalApiLimiter, async (req, res) => {
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
router.post("/businesses/:id/members/:memberId/accept", requireAuth, generalApiLimiter, async (req, res) => {
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

// ── GET /businesses/:id/requests — owner dashboard of all business requests ─────
router.get("/businesses/:id/requests", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessMember(businessId, callerId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const rows = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      status: requestsTable.status,
      payment_type: requestsTable.payment_type,
      pay_it_forward_amount: requestsTable.pay_it_forward_amount,
      requester_id: requestsTable.requester_id,
      requester_name: usersTable.name,
      created_at: requestsTable.created_at,
    })
    .from(requestsTable)
    .leftJoin(usersTable, eq(requestsTable.requester_id, usersTable.id))
    .where(eq(requestsTable.business_id, businessId))
    .orderBy(requestsTable.created_at);

  return res.json(rows);
});

// ── GET /businesses/:id/pending-requests — staff posts awaiting owner approval ──
router.get("/businesses/:id/pending-requests", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, callerId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const rows = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      status: requestsTable.status,
      payment_type: requestsTable.payment_type,
      pay_it_forward_amount: requestsTable.pay_it_forward_amount,
      requester_id: requestsTable.requester_id,
      requester_name: usersTable.name,
      created_at: requestsTable.created_at,
    })
    .from(requestsTable)
    .leftJoin(usersTable, eq(requestsTable.requester_id, usersTable.id))
    .where(
      and(
        eq(requestsTable.business_id, businessId),
        eq(requestsTable.status, "pending_owner_approval"),
      ),
    )
    .orderBy(requestsTable.created_at);

  return res.json(rows);
});

// ── PATCH /businesses/:id/requests/:requestId/approve — owner approve/reject ─────
router.patch("/businesses/:id/requests/:requestId/approve", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  const requestId = parseInt(req.params.requestId as string, 10);
  if (isNaN(businessId) || isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, callerId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const { action } = req.body as { action?: "approve" | "reject" };
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'." });
  }

  const [request] = await db
    .select({ id: requestsTable.id, requester_id: requestsTable.requester_id })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.id, requestId),
        eq(requestsTable.business_id, businessId),
        eq(requestsTable.status, "pending_owner_approval"),
      ),
    )
    .limit(1);

  if (!request) return res.status(404).json({ error: "Pending request not found." });

  if (action === "reject") {
    await db
      .update(requestsTable)
      .set({ status: "cancelled", cancelled_at: new Date() })
      .where(eq(requestsTable.id, requestId));
    logger.info({ request_id: requestId, business_id: businessId, owner_id: callerId }, "Business request rejected by owner");
    return res.json({ ok: true, action: "rejected" });
  }

  await db
    .update(requestsTable)
    .set({ status: "open" })
    .where(eq(requestsTable.id, requestId));
  logger.info({ request_id: requestId, business_id: businessId, owner_id: callerId }, "Business request approved by owner");
  return res.json({ ok: true, action: "approved" });
});

// ── PATCH /businesses/:id/members/:memberId/cap — set staff spending cap ──────
router.patch("/businesses/:id/members/:memberId/cap", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  const targetUserId = parseInt(req.params.memberId as string, 10);
  if (isNaN(businessId) || isNaN(targetUserId)) return res.status(400).json({ error: "Invalid id" });

  const guard = await requireBusinessOwner(businessId, callerId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  if (targetUserId === callerId) {
    return res.status(400).json({ error: "Cannot set a spending cap on the owner." });
  }

  const { spending_cap_cents } = req.body as { spending_cap_cents?: number };
  if (spending_cap_cents === undefined || spending_cap_cents < 0 || !Number.isInteger(spending_cap_cents)) {
    return res.status(400).json({ error: "spending_cap_cents must be a non-negative integer (cents)." });
  }

  const [updated] = await db
    .update(businessMembersTable)
    .set({ spending_cap_cents: spending_cap_cents === 0 ? null : spending_cap_cents, updated_at: new Date() })
    .where(
      and(
        eq(businessMembersTable.business_id, businessId),
        eq(businessMembersTable.user_id, targetUserId),
        eq(businessMembersTable.status, "active"),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Active member not found." });
  logger.info({ business_id: businessId, member_id: targetUserId, cap_cents: spending_cap_cents, owner_id: callerId }, "Business member spending cap set");
  return res.json(updated);
});

// ── Admin: GET /admin/businesses — list all businesses for approval queue ─────
// Uses shared requireAdmin() middleware + adminLimiter per project rule: every admin
// endpoint must include the admin rate limiter after requireAdmin().
router.get("/admin/businesses", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  // Limit 500: admin approval queue; unbounded SELECT degrades as businesses grow.
  // Paginate in the UI if the queue ever exceeds this (unlikely for a community platform).
  const businesses = await db.select().from(businessesTable).orderBy(businessesTable.created_at).limit(500);
  return res.json(businesses);
});

// ── Admin: PATCH /admin/businesses/:id/approve — approve or reject ────────────
// Uses shared requireAdmin() middleware + adminLimiter per project rule: every admin
// endpoint must include the admin rate limiter after requireAdmin().
router.patch("/admin/businesses/:id/approve", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const caller = req.authenticatedUserId!;
  const businessId = parseInt(req.params.id as string, 10);
  if (isNaN(businessId)) return res.status(400).json({ error: "Invalid id" });

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
