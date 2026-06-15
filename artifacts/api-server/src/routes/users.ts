import { Router } from "express";
import { db, usersTable, requestsTable, transactionsTable, scheduledPaymentsTable, userSettingsTable, paymentTransactionsTable } from "@workspace/db";
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
import { requireAuth, isSelf, signTokenById } from "../middlewares/auth";
import bcrypt from "bcryptjs";


/** Strip the bcrypt hash from any user row before sending it to the client. */
function safeUser<T extends { password_hash?: string | null }>(user: T): Omit<T, "password_hash"> {
  const { password_hash: _h, ...rest } = user;
  return rest;
}

const router = Router();

router.get("/users/register", (_req, res) => {
  res.json({ message: "Use POST /api/users/register" });
});

// Register — creates a new user and issues an auth token.
// Password is required and hashed with bcrypt (cost factor 12) before storage.
// Returns 409 if the email is already registered to prevent account takeover
// via re-registration.
router.post("/users/register", authLimiter, async (req, res) => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { name, email, password, avatar_url, is_helper, neighborhood } = parsed.data;

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
  if (existing.length > 0) {
    // Email already registered — do not issue a token; tell the user to sign in.
    // Do NOT silently return the existing user's token here — that would allow
    // anyone who knows an email address to re-register and get a valid token.
    return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password_hash,
    avatar_url: avatar_url ?? null,
    is_helper: is_helper ?? false,
    neighborhood: neighborhood ?? null,
  }).returning();

  // Never expose the password hash in the response
  const { password_hash: _h, ...safeUser } = user;
  return res.status(201).json({ user: safeUser, token: signTokenById(user.id) });
});

// Login — verify email + password and issue a fresh token.
// Uses bcrypt.compare for constant-time password comparison.
// Returns a generic 401 for both "no account" and "wrong password" to prevent
// user enumeration (an attacker should not be able to tell whether an email
// is registered by observing different error messages).
router.post("/users/login", authLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .limit(1);

  // Deliberate: same error message whether the user doesn't exist or the password
  // is wrong. This prevents attackers from enumerating registered email addresses.
  if (!user || !user.password_hash) {
    // Dummy comparison with a real 60-char bcrypt hash so response time is
    // identical whether the account exists or not — prevents timing-based
    // user-enumeration attacks.
    await bcrypt.compare(password, "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewohGTDZ2mFBkFui");
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Never expose the password hash in the response
  const { password_hash: _h, ...safeUser } = user;
  return res.json({ user: safeUser, token: signTokenById(user.id) });
});

router.get("/users/:id", async (req, res) => {
  const parsed = GetUserParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(safeUser(user));
});

// Mutating user routes — require authentication and self-only access.
router.patch("/users/:id", requireAuth, async (req, res) => {
  const pParsed = UpdateUserParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = UpdateUserBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!isSelf(req, pParsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only update your own profile" });

  const { name, avatar_url, neighborhood, is_helper } = bParsed.data;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (neighborhood !== undefined) updates.neighborhood = neighborhood;
  if (is_helper !== undefined) updates.is_helper = is_helper;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, pParsed.data.id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(safeUser(user));
});

router.patch("/users/:id/location", requireAuth, gpsLimiter, async (req, res) => {
  const pParsed = UpdateUserLocationParams.safeParse({ id: parseInt(req.params.id as string) });
  const bParsed = UpdateUserLocationBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!isSelf(req, pParsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only update your own location" });

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
  return res.json(safeUser(user));
});

router.patch("/users/:id/helper-mode", requireAuth, async (req, res) => {
  const pParsed = UpdateHelperModeParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = UpdateHelperModeBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!isSelf(req, pParsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only update your own helper mode" });

  const [user] = await db.update(usersTable)
    .set({ helper_mode_active: bParsed.data.active })
    .where(eq(usersTable.id, pParsed.data.id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  broadcast({
    type: bParsed.data.active ? "helper_online" : "helper_offline",
    payload: { id: user.id, name: user.name, lat: user.lat, lng: user.lng },
  });
  return res.json(safeUser(user));
});

router.post("/users/:id/pledge", requireAuth, async (req, res) => {
  const pParsed = MakePledgePaymentParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = MakePledgePaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!isSelf(req, pParsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only pledge on your own behalf" });

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

  if (request.helper_id && amount > 0) {
    await db.update(usersTable)
      .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
      .where(eq(usersTable.id, request.helper_id));
    await db.insert(transactionsTable).values({
      user_id: request.helper_id,
      request_id: request_id,
      type: "pledge_received",
      amount: amount,
      description: request.title,
    });
  }
  await db.insert(transactionsTable).values({
    user_id: pParsed.data.id,
    request_id: request_id,
    type: "pledge_sent",
    amount: -amount,
    description: request.title,
  });

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
router.get("/users/:id/transactions", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, id)) return res.status(403).json({ error: "Forbidden — you can only view your own transactions" });

  const txns = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.user_id, id))
    .orderBy(sql`${transactionsTable.created_at} DESC`)
    .limit(50);
  return res.json(txns);
});

// POST /users/:id/scheduled-payment — save a future repayment intent
router.post("/users/:id/scheduled-payment", requireAuth, async (req, res) => {
  const pParsed = CreateScheduledPaymentParams.safeParse({ id: parseInt(req.params.id) });
  const bParsed = CreateScheduledPaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  if (!isSelf(req, pParsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only schedule payments for yourself" });

  const { request_id, amount, scheduled_date, note } = bParsed.data;
  const userId = pParsed.data.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
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
router.get("/users/:id/scheduled-payment", requireAuth, async (req, res) => {
  const parsed = GetScheduledPaymentsParams.safeParse({ id: parseInt(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, parsed.data.id)) return res.status(403).json({ error: "Forbidden — you can only view your own scheduled payments" });

  const rows = await db.select().from(scheduledPaymentsTable)
    .where(eq(scheduledPaymentsTable.user_id, parsed.data.id))
    .orderBy(scheduledPaymentsTable.scheduled_date);
  return res.json(rows.map(r => ({ ...r, scheduled_date: r.scheduled_date.toISOString() })));
});

// DELETE /users/:id/scheduled-payment/:paymentId — cancel a scheduled payment
router.delete("/users/:id/scheduled-payment/:paymentId", requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  if (isNaN(userId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, userId)) return res.status(403).json({ error: "Forbidden — you can only cancel your own scheduled payments" });

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
router.get("/users/:id/outstanding-pledges", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, id)) return res.status(403).json({ error: "Forbidden — you can only view your own pledges" });

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
router.post("/users/:id/avatar", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, id)) return res.status(403).json({ error: "Forbidden — you can only update your own avatar" });

  const { dataUrl } = req.body as { dataUrl?: string };
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "Invalid image data — must be a base64 data URL starting with data:image/" });
  }
  if (dataUrl.length > 7 * 1024 * 1024) {
    return res.status(413).json({ error: "Image too large — max 5 MB" });
  }
  const [user] = await db
    .update(usersTable)
    .set({ avatar_url: dataUrl, updated_at: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(safeUser(user));
});

// GET /users/:id/settings — fetch user notification + privacy prefs
router.get("/users/:id/settings", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, id)) return res.status(403).json({ error: "Forbidden — you can only view your own settings" });

  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) return res.json(existing);
  const [created] = await db.insert(userSettingsTable).values({ user_id: id }).returning();
  return res.status(201).json(created);
});

// PUT /users/:id/settings — persist notification + privacy prefs
router.put("/users/:id/settings", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  if (!isSelf(req, id)) return res.status(403).json({ error: "Forbidden — you can only update your own settings" });

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
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) {
    const [updated] = await db.update(userSettingsTable).set(updates).where(eq(userSettingsTable.user_id, id)).returning();
    return res.json(updated);
  } else {
    const [created] = await db.insert(userSettingsTable).values({ user_id: id, ...updates }).returning();
    return res.json(created);
  }
});

export default router;
