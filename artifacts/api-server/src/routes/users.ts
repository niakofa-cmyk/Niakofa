import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, requestsTable, transactionsTable, scheduledPaymentsTable, userSettingsTable, paymentTransactionsTable, stripeAccountsTable, helperAvailabilityTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import {
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserLocationParams,
  UpdateUserLocationBody,
  UpdateHelperModeParams,
  UpdateHelperModeBody,
  RegisterUserBody,
  MakePledgePaymentParams,
  MakePledgePaymentBody,
  CreateScheduledPaymentParams,
  CreateScheduledPaymentBody,
  GetScheduledPaymentsParams,
} from "@workspace/api-zod";
import { broadcast } from "../lib/ws-hub";
import { authLimiter, gpsLimiter } from "../middlewares/rate-limit";
import { requireAuth } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import { signTokenById } from "../middlewares/auth";

const router = Router();

router.get("/users/register", (_req, res) => {
  res.json({ message: "Use POST /api/users/register" });
});

router.post("/users/login", authLimiter, async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  if (!email) return res.status(400).json({ error: "Email required" });
  if (!password) return res.status(400).json({ error: "Password required" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
  if (!user) return res.status(401).json({ error: "No account found with that email" });

  // Legacy accounts created before password auth was added have no
  // password_hash at all — distinct from "wrong password" so the client
  // can route them through a password-setup flow instead of a dead end.
  if (!user.password_hash) {
    return res.status(403).json({ error_code: "LEGACY_PASSWORD_REQUIRED", user_id: user.id });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const token = signTokenById(user.id, user.token_version);
  const { password_hash, ...safeUser } = user;
  return res.json({ user: safeUser, token });
});

router.post("/users/register", authLimiter, async (req, res) => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { name, email, avatar_url, is_helper, neighborhood } = parsed.data;
  const password = (req.body as any).password as string | undefined;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    // BUG-C01: Never return an existing user row to an arbitrary registrant — leaks PII.
    return res.status(409).json({ error: "An account with that email already exists. Please sign in instead." });
  }

  const password_hash = password ? await bcrypt.hash(password, 12) : null;

  const [user] = await db.insert(usersTable).values({
    name, email,
    password_hash,
    avatar_url: avatar_url ?? null,
    is_helper: is_helper ?? false,
    neighborhood: neighborhood ?? null,
  }).returning();
  const token = signTokenById(user.id, user.token_version);
  const { password_hash: _ph, ...safeUser } = user;
  return res.status(201).json({ user: safeUser, token });
});

router.get("/users/:id", requireAuth, requireOwnership(), async (req, res) => {
  const parsed = GetUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

router.patch("/users/:id", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = UpdateUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = UpdateUserBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { name, avatar_url, neighborhood, is_helper } = bParsed.data;

  // BUG-5-H02: Build the update object from an explicit allowlist of safe
  // fields only. Never allow is_admin, role, trust_score, token_version, or
  // any other privileged column to be set via this user-facing endpoint, even
  // if they somehow appear in the Zod-parsed body (the `as any` cast below
  // was a potential vector for privilege escalation if the schema drifted).
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (neighborhood !== undefined) updates.neighborhood = neighborhood;
  if (is_helper !== undefined) updates.is_helper = is_helper;

  // Extended profile fields — still allowlisted individually, never spread
  const raw = req.body as Record<string, unknown>;
  if (typeof raw.city === "string" && raw.city.length <= 100) (updates as any).city = raw.city;
  if (Array.isArray(raw.specialties)) (updates as any).specialties = (raw.specialties as string[]).slice(0, 20).map(String);
  if (typeof raw.phone_masked === "string") (updates as any).phone_masked = raw.phone_masked.slice(0, 20);
  if (Array.isArray(raw.quick_replies)) (updates as any).quick_replies = (raw.quick_replies as string[]).slice(0, 10).map(String);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, pParsed.data.id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  // BUG-C02: strip password_hash before returning
  const { password_hash: _ph2, ...safeUser } = user;
  return res.json(safeUser);
});

router.patch("/users/:id/location", requireAuth, requireOwnership(), gpsLimiter, async (req, res) => {
  const pParsed = UpdateUserLocationParams.safeParse({ id: parseInt(req.params.id as string) });
  const bParsed = UpdateUserLocationBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { lat, lng, heading, speed } = bParsed.data;
  const [user] = await db.update(usersTable)
    .set({ lat, lng, heading: heading ?? null, speed: speed ?? null })
    .where(eq(usersTable.id, pParsed.data.id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.helper_mode_active) {
    broadcast({
      type: "helper_location",
      payload: { id: user.id, name: user.name, lat: user.lat, lng: user.lng, heading: user.heading },
    });
  }
  // BUG-C03: strip password_hash before returning
  const { password_hash: _phLoc, ...safeLocUser } = user;
  return res.json(safeLocUser);
});

router.patch("/users/:id/helper-mode", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = UpdateHelperModeParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = UpdateHelperModeBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const [user] = await db.update(usersTable)
    .set({ helper_mode_active: bParsed.data.active })
    .where(eq(usersTable.id, pParsed.data.id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  broadcast({
    type: bParsed.data.active ? "helper_online" : "helper_offline",
    payload: { id: user.id, name: user.name, lat: user.lat, lng: user.lng },
  });
  // BUG-C04: strip password_hash before returning
  const { password_hash: _phHM, ...safeHMUser } = user;
  return res.json(safeHMUser);
});

router.post("/users/:id/pledge", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = MakePledgePaymentParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = MakePledgePaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { request_id, amount } = bParsed.data;
  const [request] = await db.select().from(requestsTable)
    .where(and(eq(requestsTable.id, request_id), eq(requestsTable.requester_id, pParsed.data.id)))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found or unauthorized" });
  const newPledgePaid = (request.pledge_paid || 0) + amount;
  const [updated] = await db.update(requestsTable)
    .set({ pledge_paid: newPledgePaid })
    .where(eq(requestsTable.id, request_id))
    .returning();

  // BUG-C07/C08: Do NOT credit benevolence_wallet or insert pledge_received here.
  // The Stripe webhook (payment_intent.succeeded) is the sole authoritative path
  // for crediting the helper's wallet. Doing it here causes double-credit when
  // the webhook fires for the same payment.
  await db.insert(transactionsTable).values({
    user_id: pParsed.data.id,
    request_id: request_id,
    type: "pledge_sent",
    amount: -amount,
    description: request.title,
  });

  // Record payment_transactions row so this pledge appears in the financial ledger.
  // state = "pending_contribution" — a real Stripe charge may have already been confirmed
  // by the frontend (PaymentIntent flow) or will be fulfilled on the honor system.
  await db.insert(paymentTransactionsTable).values({
    request_id: request_id,
    helper_id: request.helper_id ?? null,
    requester_id: pParsed.data.id,
    amount,
    state: "pending_contribution",
    payment_type: "pay_it_forward",
    notes: "Pay It Forward pledge",
  });

  broadcast({ type: "request_updated", payload: { ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null } });
  broadcast({ type: "pledge_paid", payload: { user_id: pParsed.data.id, request_id, amount, request_title: request.title } });
  return res.json({ ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null });
});

// GET /users/:id/transactions — real activity history
router.get("/users/:id/transactions", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const txns = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.user_id, id))
    .orderBy(sql`${transactionsTable.created_at} DESC`)
    .limit(50);
  return res.json(txns);
});

// POST /users/:id/scheduled-payment — save a future repayment intent
router.post("/users/:id/scheduled-payment", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = CreateScheduledPaymentParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = CreateScheduledPaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { request_id, amount, scheduled_date, note } = bParsed.data;
  const userId = pParsed.data.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  // BUG-H07: Verify the requester owns the request they're scheduling a payment for
  const [requestRow] = await db.select({ requester_id: requestsTable.requester_id })
    .from(requestsTable).where(eq(requestsTable.id, request_id)).limit(1);
  if (!requestRow) return res.status(404).json({ error: "Request not found" });
  if (requestRow.requester_id !== userId) return res.status(403).json({ error: "You can only schedule payments for your own requests" });
  const [scheduled] = await db.insert(scheduledPaymentsTable).values({
    user_id: userId,
    request_id,
    amount,
    scheduled_date: new Date(scheduled_date),
    status: "pending",
    note: note ?? null,
  }).returning();
  broadcast({
    type: "pledge_scheduled",
    payload: { user_id: userId, request_id, amount, scheduled_date },
  });
  return res.status(201).json({ ...scheduled, scheduled_date: scheduled.scheduled_date.toISOString() });
});

// GET /users/:id/scheduled-payment — list future payment intents
router.get("/users/:id/scheduled-payment", requireAuth, requireOwnership(), async (req, res) => {
  const parsed = GetScheduledPaymentsParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(scheduledPaymentsTable)
    .where(eq(scheduledPaymentsTable.user_id, parsed.data.id))
    .orderBy(scheduledPaymentsTable.scheduled_date);
  return res.json(rows.map(r => ({ ...r, scheduled_date: r.scheduled_date.toISOString() })));
});

// DELETE /users/:id/scheduled-payment/:paymentId — cancel a scheduled payment
router.delete("/users/:id/scheduled-payment/:paymentId", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  const paymentId = parseInt(String(req.params.paymentId));
  if (isNaN(userId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid id" });
  const [deleted] = await db.delete(scheduledPaymentsTable)
    .where(and(
      eq(scheduledPaymentsTable.id, paymentId),
      eq(scheduledPaymentsTable.user_id, userId)
    ))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Scheduled payment not found or does not belong to this user" });
  return res.json({ ok: true, deleted_id: paymentId });
});

// GET /users/:id/outstanding-pledges — requests with unpaid pledge balance
router.get("/users/:id/outstanding-pledges", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const requests = await db.select().from(requestsTable)
    .where(
      and(
        eq(requestsTable.requester_id, id),
        eq(requestsTable.payment_type, "pay_it_forward"),
        eq(requestsTable.status, "completed"),
      )
    );
  const outstanding = requests.filter(r => (r.pledge_amount ?? 0) > (r.pledge_paid ?? 0));
  return res.json(outstanding.map(r => ({
    ...r,
    requester_name: null,
    requester_avatar: null,
    helper_name: null,
    distance_miles: null,
    estimated_duration_min: null,
  })));
});

// POST /users/:id/avatar — update profile photo (base64 data URL)
router.post("/users/:id/avatar", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { dataUrl } = req.body as { dataUrl?: string };
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "Invalid image data — must be a base64 data URL starting with data:image/" });
  }
  // Enforce reasonable size limit (~5 MB base64)
  if (dataUrl.length > 7 * 1024 * 1024) {
    return res.status(413).json({ error: "Image too large — max 5 MB" });
  }
  const [user] = await db
    .update(usersTable)
    .set({ avatar_url: dataUrl, updated_at: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  // BUG-C06: strip password_hash before returning
  const { password_hash: _phAv, ...safeAvUser } = user;
  return res.json(safeAvUser);
});

// GET /users/:id/settings — fetch user notification + privacy prefs (upserts defaults if first visit)
router.get("/users/:id/settings", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) return res.json(existing);
  // First visit — create defaults
  const [created] = await db.insert(userSettingsTable).values({ user_id: id }).returning();
  return res.status(201).json(created);
});

// PUT /users/:id/settings — persist notification + privacy prefs
router.put("/users/:id/settings", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const allowed = [
    "notif_nearby_requests", "notif_emergency", "notif_task_accepted",
    "notif_wallet_updates", "notif_community_activity", "notif_pledge_reminders",
    "privacy_profile_visible", "privacy_live_location", "privacy_activity_sharing",
    "privacy_anonymous_giving", "service_radius_miles", "max_travel_miles", "specialties",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // Upsert
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) {
    const [updated] = await db.update(userSettingsTable).set(updates).where(eq(userSettingsTable.user_id, id)).returning();
    return res.json(updated);
  } else {
    const [created] = await db.insert(userSettingsTable).values({ user_id: id, ...updates }).returning();
    return res.json(created);
  }
});


// PATCH /users/:id/panic-contacts — update emergency contacts
router.patch("/users/:id/panic-contacts", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { contacts } = req.body as { contacts?: string[] };
  if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts must be an array" });
  if (contacts.length > 5) return res.status(400).json({ error: "Max 5 panic contacts" });
  const [user] = await db.update(usersTable)
    .set({ panic_contacts: contacts })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  // BUG-C05: strip password_hash before returning
  const { password_hash: _phPC, ...safePCUser } = user;
  return res.json(safePCUser);
});

// BUG-H03: Account deletion is admin-only. requireOwnership() would let any
// authenticated user delete any other account by crafting the path parameter.
router.delete("/users/:id", requireAuth, requireAdmin(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  try {
    // Delete user from all related tables
    await db.delete(scheduledPaymentsTable).where(eq(scheduledPaymentsTable.user_id, userId));
    await db.delete(stripeAccountsTable).where(eq(stripeAccountsTable.user_id, userId));
    await db.delete(userSettingsTable).where(eq(userSettingsTable.user_id, userId));
    // requestsTable and transactionsTable should handle CASCADE DELETE if configured in schema
    // Otherwise, explicit deletion would be needed here.
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    return res.json({ ok: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error("Error deleting user account:", error);
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

router.patch("/users/:id/moderation", requireAuth, requireAdmin(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { action } = req.body as { action: "warn" | "ban" };
  if (!["warn", "ban"].includes(action)) return res.status(400).json({ error: "Invalid action" });

  if (action === "ban") {
    // Set trust_score to -1 as banned flag
    await db.update(usersTable)
      .set({ trust_score: -1, helper_mode_active: false })
      .where(eq(usersTable.id, userId));
  } else {
    // Reduce trust score by 10 for a warning
    await db.update(usersTable)
      .set({ trust_score: sql`GREATEST(0, ${usersTable.trust_score} - 10)` })
      .where(eq(usersTable.id, userId));
  }
  return res.json({ ok: true, action, user_id: userId });
});

// PUT /users/:id/availability
router.put("/users/:id/availability", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { windows } = req.body as { windows: Array<{ day_of_week: number; start_min: number; end_min: number }> };
  if (!Array.isArray(windows)) return res.status(400).json({ error: "windows must be an array" });
  for (const w of windows) {
    if (w.day_of_week < 0 || w.day_of_week > 6) return res.status(400).json({ error: "day_of_week must be 0-6" });
    if (w.start_min < 0 || w.start_min > 1439) return res.status(400).json({ error: "start_min must be 0-1439" });
    if (w.end_min < 1 || w.end_min > 1440) return res.status(400).json({ error: "end_min must be 1-1440" });
    if (w.start_min >= w.end_min) return res.status(400).json({ error: "start_min must be less than end_min" });
  }
  await db.delete(helperAvailabilityTable).where(eq(helperAvailabilityTable.user_id, userId));
  if (windows.length > 0) {
    await db.insert(helperAvailabilityTable).values(
      windows.map(w => ({ user_id: userId, day_of_week: w.day_of_week, start_min: w.start_min, end_min: w.end_min }))
    );
  }
  return res.json({ ok: true, count: windows.length });
});

// GET /users/:id/availability
router.get("/users/:id/availability", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const windows = await db
    .select()
    .from(helperAvailabilityTable)
    .where(eq(helperAvailabilityTable.user_id, userId))
    .orderBy(helperAvailabilityTable.day_of_week, helperAvailabilityTable.start_min);
  return res.json(windows);
});

// POST /users/:id/logout — server-side token revocation.
// Bumps token_version so every previously issued token for this user
// is immediately invalid, even ones that haven't expired yet.
router.post("/users/:id/logout", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  await db.update(usersTable)
    .set({ token_version: sql`${usersTable.token_version} + 1` })
    .where(eq(usersTable.id, userId));
  return res.json({ ok: true });
});

// GET all users (admin)
router.get("/users", requireAuth, requireAdmin(), async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    is_helper: usersTable.is_helper,
    trust_score: usersTable.trust_score,
    help_count: usersTable.help_count,
    created_at: usersTable.created_at,
  }).from(usersTable).limit(200);
  return res.json(users);
});

// BUG-H02: moved export default to AFTER this route so it is registered
// before the module is consumed by routes/index.ts.

// PATCH /users/:id/helper-application
// Two modes:
//   1. User submitting their own application (sends helper_skills, helper_bio, etc.) — requireOwnership
//   2. Admin reviewing an application (sends status: approved|denied) — requireAdmin
router.patch("/users/:id/helper-application", requireAuth, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid user id" });

  const {
    status,
    helper_skills,
    helper_languages,
    helper_qualifications,
    helper_bio,
    helper_vehicle,
    helper_social_links,
  } = req.body as {
    status?: string;
    helper_skills?: string[];
    helper_languages?: string[];
    helper_qualifications?: string[];
    helper_bio?: string;
    helper_vehicle?: string;
    helper_social_links?: string;
  };

  const authenticatedUserId = req.authenticatedUserId;
  if (!authenticatedUserId) return res.status(401).json({ error: "Authentication required" });

  // Admin status review path
  if (status !== undefined) {
    const [admin] = await db.select({ is_admin: usersTable.is_admin }).from(usersTable).where(eq(usersTable.id, authenticatedUserId)).limit(1);
    if (!admin?.is_admin) return res.status(403).json({ error: "Forbidden: Admin access required" });

    if (!["pending", "approved", "denied"].includes(status)) {
      return res.status(400).json({ error: "status must be pending | approved | denied" });
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        helper_status: status,
        is_helper: status === "approved",
        updated_at: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "User not found" });
    const { password_hash, ...safe } = updated;
    return res.json(safe);
  }

  // User submitting their own helper application
  if (authenticatedUserId !== id) return res.status(403).json({ error: "Forbidden: You can only update your own application" });

  if (!helper_skills || helper_skills.length === 0) {
    return res.status(400).json({ error: "At least one skill is required" });
  }

  const [updated] = await db
    .update(usersTable)
    .set({
      helper_skills,
      helper_languages: helper_languages ?? [],
      helper_qualifications: helper_qualifications ?? [],
      helper_bio: helper_bio ?? null,
      helper_vehicle: helper_vehicle ?? null,
      helper_social_links: helper_social_links ?? null,
      helper_status: "pending",
      updated_at: new Date(),
    })
    .where(eq(usersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safe } = updated;
  return res.json(safe);
});

export default router;
