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
import { authLimiter, gpsLimiter, adminLimiter } from "../middlewares/rate-limit";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership, requireAdmin, resolveMeParam } from "../middlewares/authz";
import { signTokenById } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { requestSelect } from "../lib/request-select";
import { userSelect } from "../lib/user-select";

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
  // Include user_email and user_name so the frontend can pre-populate the
  // reset form without a separate lookup.
  if (!user.password_hash) {
    return res.status(403).json({
      error_code: "LEGACY_PASSWORD_REQUIRED",
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
    });
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
  // BUG-CRIT-01: account_type/organization_name/organization_description are
  // sent by the registration UI (login.tsx) but were never part of the
  // generated RegisterUserBody zod schema, so zod silently stripped them and
  // every account — individual or organization — was created with the DB
  // default account_type="individual". Read them directly off the raw body
  // (same established pattern as `password` below) until the openapi spec
  // is updated and codegen re-run to add them properly.
  const body = req.body as {
    password?: string;
    account_type?: string;
    organization_name?: string;
    organization_description?: string;
  };
  const password = body.password;
  // "business" and "sponsor" are valid self-reported account types the
  // frontend presents in the Join form. They require admin review before
  // the account can be used for their intended purpose (posting on behalf
  // of a business entity or making pool contributions as a county/gov
  // sponsor). "organization" is the legacy name for the same concept.
  const ALLOWED_ACCOUNT_TYPES = ["individual", "organization", "business", "sponsor"];
  const account_type = ALLOWED_ACCOUNT_TYPES.includes(body.account_type ?? "")
    ? (body.account_type as string)
    : "individual";

  // Password strength validated FIRST — before any DB queries or expensive
  // bcrypt work — so invalid passwords are rejected cheaply. This prevents a
  // bcrypt CPU-amplification attack where an abuser sends thousands of
  // registrations with bad passwords, each triggering an expensive hash.
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    // BUG-C01: Never return an existing user row to an arbitrary registrant — leaks PII.
    return res.status(409).json({ error: "An account with that email already exists. Please sign in instead." });
  }

  // bcrypt hash is AFTER validation so we only pay the cost for valid attempts.
  const password_hash = await bcrypt.hash(password, 12);

  // BUG-CRIT-01 (continued): approval_status defaults to "pending" at the DB
  // level for every row, and — until this fix — NOTHING in the codebase ever
  // set it to "approved". App.tsx gates the entire app on this field
  // (pending-approval.tsx), and no admin endpoint existed to advance it
  // (see CLAUDE.md Incident #19) — meaning every single person who ever
  // registered was permanently stuck on the pending-approval screen with no
  // way out. Individual accounts (the overwhelming majority — this is a
  // community help app, not an org directory) are auto-approved at
  // registration since there's no legitimate reason to gate a person asking
  // for or offering help. Organization accounts still require admin review
  // via the new PATCH /admin/accounts/:id/approval endpoint, since vetting a
  // claimed nonprofit/business identity is a real, intentional checkpoint.
  // Individual accounts auto-approved (no vetting needed for someone asking
  // for or offering community help). Organization/business/sponsor accounts
  // stay pending until an admin explicitly approves them.
  const REQUIRES_REVIEW = ["organization", "business", "sponsor"];
  const approval_status = REQUIRES_REVIEW.includes(account_type) ? "pending" : "approved";

  const [user] = await db.insert(usersTable).values({
    name, email,
    password_hash,
    avatar_url: avatar_url ?? null,
    is_helper: is_helper ?? false,
    neighborhood: neighborhood ?? null,
    account_type,
    organization_name: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_name ?? null) : null,
    organization_description: ["organization", "business", "sponsor"].includes(account_type) ? (body.organization_description ?? null) : null,
    approval_status,
  }).returning();
  const token = signTokenById(user.id, user.token_version);
  const { password_hash: _ph, ...safeUser } = user;

  // ── Post-registration side-effects (non-blocking) ─────────────────────────
  // Notify admin in real-time when a non-individual account or helper
  // application is created — they need to review/approve it.
  const needsAdminReview = REQUIRES_REVIEW.includes(account_type) || !!(is_helper);
  if (needsAdminReview) {
    const eventType = is_helper ? "new_helper_application" : "new_account_pending";
    broadcast({
      type: eventType,
      payload: {
        user_id: user.id,
        name: user.name,
        email: user.email,
        account_type,
        is_helper: user.is_helper,
        created_at: user.created_at,
      },
    });
  }

  // Send welcome email (non-blocking — failures must never break registration)
  import("../lib/mailer.js").then(({ sendAlertEmail }) => {
    const subject = approval_status === "pending"
      ? `Welcome to Niakofa, ${user.name}! Your application is under review`
      : `Welcome to Niakofa, ${user.name}! You're all set 💙`;
    const pendingNote = approval_status === "pending"
      ? `\n\nYour ${account_type} account is currently under admin review. We'll let you know once it's approved.`
      : "";
    sendAlertEmail({
      to: user.email,
      subject,
      title: "Welcome to Niakofa",
      body: `Hi ${user.name},\n\nThank you for joining Niakofa — a community where neighbors help neighbors and everyone pays it forward.\n\nYou can now sign in at any time to request help, offer your skills, and connect with your community.${pendingNote}\n\nWith community love,\nThe Niakofa Team`,
    }).catch(() => {}); // swallow — mailer may not be configured in dev
  }).catch(() => {});

  return res.status(201).json({ user: safeUser, token });
});

// POST /users/request-password-reset — emails a 6-digit code, used both for
// the legacy-account "set your first password" flow (login.tsx redirects
// here when POST /users/login returns LEGACY_PASSWORD_REQUIRED) and as a
// general forgot-password flow. BUG-CRIT-02: this endpoint was called by the
// frontend but never existed server-side at all — every "returning user"
// whose account predates password auth got a 404 here and never received an
// email, with no way to ever log in again. Always returns 200 regardless of
// whether the email exists, to avoid leaking which emails are registered.
// Registered under two paths: /users/request-password-reset is used by the
// LEGACY_PASSWORD_REQUIRED auto-redirect (see /users/login above);
// /users/forgot-password is what login.tsx's general "Forgot password?"
// link calls. Both need the exact same behavior, so one handler serves both
// instead of drifting into two copies.
router.post(["/users/request-password-reset", "/users/forgot-password"], authLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "Email required" });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await db.update(usersTable)
      .set({ password_reset_code: code, password_reset_expires_at: expiresAt })
      .where(eq(usersTable.id, user.id));

    const { sendAlertEmail } = await import("../lib/mailer.js");
    await sendAlertEmail({
      to: user.email,
      subject: "Your Niakofa sign-in code",
      title: "Your sign-in code",
      body: `Hi ${user.name}, use this code to finish setting up sign-in on Niakofa: <strong style="font-size:24px;letter-spacing:4px">${code}</strong><br><br>This code expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    });
  }

  return res.json({ ok: true });
});

// POST /users/set-initial-password — verifies the emailed code and writes a
// real password_hash, completing the legacy-account / reset flow above.
router.post(["/users/set-initial-password", "/users/reset-password"], authLimiter, async (req, res) => {
  const { user_id, email, code, new_password } = req.body as {
    user_id?: number; email?: string; code?: string; new_password?: string;
  };
  if (!email || !code || !new_password) {
    return res.status(400).json({ error: "email, code, and new_password are required" });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  // user_id is only ever sent by the LEGACY_PASSWORD_REQUIRED flow (login.tsx
  // has it from the /users/login response). The general "Forgot password?"
  // flow only has email — fall back to an email-only lookup in that case.
  // Identity is still verified by the random code + expiry check below either way.
  const [user] = user_id
    ? await db.select().from(usersTable)
        .where(and(eq(usersTable.id, user_id), eq(usersTable.email, email.trim().toLowerCase())))
        .limit(1)
    : await db.select().from(usersTable)
        .where(eq(usersTable.email, email.trim().toLowerCase()))
        .limit(1);
  // All failure paths (no account, wrong code, expired code) use the SAME
  // HTTP status (403) and the SAME generic message — an attacker must not be
  // able to distinguish "no account for this email" from "bad/expired code"
  // via either the status code or the response body.
  const RESET_FAIL = { status: 403, body: { error: "Invalid or expired code. Please request a new one." } } as const;

  if (!user) return res.status(RESET_FAIL.status).json(RESET_FAIL.body);

  if (!user.password_reset_code || user.password_reset_code !== code.trim()) {
    return res.status(RESET_FAIL.status).json(RESET_FAIL.body);
  }
  if (!user.password_reset_expires_at || user.password_reset_expires_at.getTime() < Date.now()) {
    return res.status(RESET_FAIL.status).json(RESET_FAIL.body);
  }

  const password_hash = await bcrypt.hash(new_password, 12);
  const [updated] = await db.update(usersTable)
    .set({
      password_hash,
      password_reset_code: null,
      password_reset_expires_at: null,
      token_version: sql`${usersTable.token_version} + 1`,
    })
    .where(eq(usersTable.id, user.id))
    .returning();

  const token = signTokenById(updated.id, updated.token_version);
  const { password_hash: _ph2, password_reset_code: _prc, ...safeUser } = updated;
  return res.json({ user: safeUser, token });
});

// POST /users/:id/change-password — authenticated password change.
// Requires the current password as proof of possession, distinct from the
// email-code reset flow above (which is for users who've lost access).
router.post("/users/:id/change-password", requireAuth, resolveMeParam, requireOwnership(), authLimiter, async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { current_password, new_password } = req.body as {
    current_password?: string; new_password?: string;
  };
  if (!current_password || !new_password) {
    return res.status(400).json({ error: "current_password and new_password are required" });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (new_password === current_password) {
    return res.status(400).json({ error: "New password must be different from current password" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!user.password_hash) {
    return res.status(403).json({ error_code: "LEGACY_PASSWORD_REQUIRED", user_id: user.id });
  }

  const matches = await bcrypt.compare(current_password, user.password_hash);
  if (!matches) return res.status(401).json({ error: "Current password is incorrect" });

  const password_hash = await bcrypt.hash(new_password, 12);
  const [updatedPw] = await db.update(usersTable)
    .set({
      password_hash,
      token_version: sql`${usersTable.token_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(usersTable.id, id))
    .returning();

  const pwToken = signTokenById(updatedPw.id, updatedPw.token_version);
  const { password_hash: _ph3, ...safePwUser } = updatedPw;
  return res.json({ user: safePwUser, token: pwToken });
});

router.get("/users/:id", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const parsed = GetUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

router.patch("/users/:id", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const pParsed = UpdateUserParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = UpdateUserBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { name, avatar_url, neighborhood, is_helper, city, specialties, phone_masked, quick_replies } = bParsed.data;

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

  // Extended profile fields — validated by UpdateUserBody Zod schema above,
  // read from bParsed.data so they go through the single schema-validation point.
  if (city !== undefined) (updates as any).city = city;
  if (specialties !== undefined) (updates as any).specialties = specialties;
  if (phone_masked !== undefined) (updates as any).phone_masked = phone_masked;
  if (quick_replies !== undefined) (updates as any).quick_replies = quick_replies;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, pParsed.data.id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

router.patch("/users/:id/location", requireAuth, resolveMeParam, requireOwnership(), gpsLimiter, async (req, res) => {
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
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

router.patch("/users/:id/helper-mode", requireAuth, resolveMeParam, requireApproved, requireOwnership(), async (req, res) => {
  const pParsed = UpdateHelperModeParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = UpdateHelperModeBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });

  // The Settings/Profile screens already hide the "Go Online" toggle from
  // anyone who isn't an approved helper, but that's a client-side
  // convenience, not enforcement — without this check, a direct API call
  // could flip helper_mode_active on for an unapproved account, and every
  // other system (push targeting, the map's online-helpers query,
  // auto-assign) trusts that flag alone with no second check of
  // helper_status. This is the actual enforcement boundary.
  if (bParsed.data.active) {
    const [existing] = await db.select({ helper_status: usersTable.helper_status })
      .from(usersTable).where(eq(usersTable.id, pParsed.data.id)).limit(1);
    if (existing?.helper_status !== "approved") {
      return res.status(403).json({ error: "Only approved helpers can go online. Apply to become a helper in your profile first." });
    }
  }

  const [user] = await db.update(usersTable)
    .set({ helper_mode_active: bParsed.data.active })
    .where(eq(usersTable.id, pParsed.data.id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  broadcast({
    type: bParsed.data.active ? "helper_online" : "helper_offline",
    payload: { id: user.id, name: user.name, lat: user.lat, lng: user.lng },
  });
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

router.post("/users/:id/pledge", requireAuth, requireApproved, requireOwnership(), async (req, res) => {
  const pParsed = MakePledgePaymentParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = MakePledgePaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { request_id, amount } = bParsed.data;
  const [request] = await db.select(requestSelect).from(requestsTable)
    .where(and(eq(requestsTable.id, request_id), eq(requestsTable.requester_id, pParsed.data.id)))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found or unauthorized" });

  // Dedup check: prevent double-submission from the same user on the same request
  // within a 10-second window (e.g. accidental double-tap). Must include user_id so
  // that User A's pledge doesn't block User B pledging the same amount on the same
  // request — a cross-user denial-of-service that a missing user_id filter would cause.
  const [recentDup] = await db.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.user_id, pParsed.data.id),
      eq(transactionsTable.request_id, request_id),
      eq(transactionsTable.type, "pledge_sent"),
      eq(transactionsTable.amount, -amount),
      sql`${transactionsTable.created_at} > NOW() - INTERVAL '10 seconds'`,
    ))
    .limit(1);
  if (recentDup) return res.status(409).json({ error: "Duplicate pledge — please wait a moment before pledging again." });

  // Atomic increment — never read-then-write pledge_paid; two concurrent pledges
  // on the same request reading the same original value and writing back would
  // make the second write silently overwrite the first. COALESCE handles NULL.
  const [updated] = await db.update(requestsTable)
    .set({ pledge_paid: sql`COALESCE(${requestsTable.pledge_paid}, 0) + ${amount}` })
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
router.get("/users/:id/transactions", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const txns = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.user_id, id))
    .orderBy(sql`${transactionsTable.created_at} DESC`)
    .limit(50);
  return res.json(txns);
});

// POST /users/:id/scheduled-payment — save a future repayment intent
router.post("/users/:id/scheduled-payment", requireAuth, requireApproved, requireOwnership(), async (req, res) => {
  const pParsed = CreateScheduledPaymentParams.safeParse({ id: parseInt(String(req.params.id)) });
  const bParsed = CreateScheduledPaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { request_id, amount, scheduled_date, note } = bParsed.data;
  const userId = pParsed.data.id;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
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
router.get("/users/:id/scheduled-payment", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const parsed = GetScheduledPaymentsParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(scheduledPaymentsTable)
    .where(eq(scheduledPaymentsTable.user_id, parsed.data.id))
    .orderBy(scheduledPaymentsTable.scheduled_date);
  return res.json(rows.map((r: (typeof rows)[number]) => ({ ...r, scheduled_date: r.scheduled_date.toISOString() })));
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
router.get("/users/:id/outstanding-pledges", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const requests = await db.select(requestSelect).from(requestsTable)
    .where(
      and(
        eq(requestsTable.requester_id, id),
        eq(requestsTable.payment_type, "pay_it_forward"),
        eq(requestsTable.status, "completed"),
      )
    );
  const outstanding = requests.filter((r: (typeof requests)[number]) => (r.pledge_amount ?? 0) > (r.pledge_paid ?? 0));
  return res.json(outstanding.map((r: (typeof outstanding)[number]) => ({
    ...r,
    requester_name: null,
    requester_avatar: null,
    helper_name: null,
    distance_miles: null,
    estimated_duration_min: null,
  })));
});

// POST /users/:id/avatar — update profile photo (base64 data URL)
router.post("/users/:id/avatar", requireAuth, resolveMeParam, requireApproved, requireOwnership(), async (req, res) => {
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
  const { password_hash, ...safeUser } = user;
  return res.json(safeUser);
});

// GET /users/:id/settings — fetch user notification + privacy prefs (upserts defaults if first visit)
router.get("/users/:id/settings", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) return res.json(existing);
  // First visit — create defaults
  const [created] = await db.insert(userSettingsTable).values({ user_id: id }).returning();
  return res.status(201).json(created);
});

// PUT /users/:id/settings — persist notification + privacy prefs
router.put("/users/:id/settings", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const allowed = [
    "notif_nearby_requests", "notif_emergency", "notif_task_accepted",
    "notif_wallet_updates", "notif_community_activity", "notif_pledge_reminders",
    "privacy_profile_visible", "privacy_live_location", "privacy_activity_sharing",
    "privacy_anonymous_giving", "service_radius_miles", "max_travel_miles", "specialties",
    "preferred_language",
  ];
  const VALID_LANGUAGES = ["en", "sw", "zu", "tw", "yo", "ha", "am", "so", "pcm", "lg"];
  const updates: Record<string, unknown> = { updated_at: new Date() };
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (key === "preferred_language" && !VALID_LANGUAGES.includes(req.body[key])) continue;
    updates[key] = req.body[key];
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


// Note: panic contacts are managed via PATCH /verification/panic-contacts/:userId
// (the route the frontend actually calls — see verification.ts). A duplicate
// PATCH /users/:id/panic-contacts route previously lived here with zero
// frontend callers and zero test coverage; removed rather than left as dead
// code that could silently drift from the real one.

// BUG-H03: Account deletion is admin-only. requireOwnership() would let any
// authenticated user delete any other account by crafting the path parameter.
router.delete("/users/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
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
    logger.error({ err: error }, "delete-account: failed");
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

router.patch("/users/:id/moderation", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { action } = req.body as { action: "warn" | "ban" | "suspend" };
  if (!["warn", "ban", "suspend"].includes(action)) return res.status(400).json({ error: "Invalid action" });

  if (action === "ban") {
    // Set trust_score to -1 as banned flag + hard suspension
    await db.update(usersTable)
      .set({ trust_score: -1, helper_mode_active: false, is_suspended: true, suspended_at: new Date(), suspended_reason: "Banned by admin" })
      .where(eq(usersTable.id, userId));
  } else if (action === "suspend") {
    // Soft suspension
    await db.update(usersTable)
      .set({ is_suspended: true, suspended_at: new Date(), suspended_reason: req.body.reason ?? "Suspended by admin", helper_mode_active: false })
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
router.put("/users/:id/availability", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
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
router.get("/users/:id/availability", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const windows = await db
    .select()
    .from(helperAvailabilityTable)
    .where(eq(helperAvailabilityTable.user_id, userId))
    .orderBy(helperAvailabilityTable.day_of_week, helperAvailabilityTable.start_min);
  return res.json(windows);
});

// POST /users/:id/logout — client-side sign-out signal only.
// NOT server-side token revocation, despite bumping token_version below.
// Auth tokens are stateless HMAC(userId) (see middlewares/auth.ts —
// signTokenById/verifyToken never read token_version, by deliberate design,
// to avoid a DB lookup on every authenticated request). Bumping
// token_version here does not invalidate any previously issued token; a
// token issued before this call remains valid until SESSION_SECRET itself
// changes. This endpoint exists so the client has a server round-trip to
// confirm before discarding its local token, and so token_version keeps
// incrementing for potential future use, but it provides no actual
// "log out everywhere" or stolen-token-revocation guarantee today.
router.post("/users/:id/logout", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  await db.update(usersTable)
    .set({ token_version: sql`${usersTable.token_version} + 1` })
    .where(eq(usersTable.id, userId));
  return res.json({ ok: true });
});

// GET all users (admin)
// Returns approval_status and account_type so admins can see pending/denied
// accounts and distinguish individual vs. organization vs. business accounts
// from the user list without needing separate fetches.
router.get("/users", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    is_helper: usersTable.is_helper,
    helper_status: usersTable.helper_status,
    helper_skills: usersTable.helper_skills,
    trust_score: usersTable.trust_score,
    help_count: usersTable.help_count,
    is_suspended: usersTable.is_suspended,
    suspended_at: usersTable.suspended_at,
    suspended_reason: usersTable.suspended_reason,
    created_at: usersTable.created_at,
    approval_status: usersTable.approval_status,
    account_type: usersTable.account_type,
    is_admin: usersTable.is_admin,
    // Background check fields — used by BackgroundCheckAdmin in the admin UI
    background_check_status: usersTable.background_check_status,
    background_check_completed_at: usersTable.background_check_completed_at,
  }).from(usersTable).limit(200);
  return res.json(users);
});

// PATCH /users/:id/helper-application
// Two modes:
//   1. User submitting their own application (sends helper_skills, helper_bio, etc.) — requireOwnership
//   2. Admin reviewing an application (sends status: approved|denied|rejected) — requireAdmin
//      "rejected" is accepted as an alias for "denied" since the admin UI's bulk-action
//      buttons send "rejected" while the single-review flow sends "denied" — both are
//      normalized to the same stored value.
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
    helper_social_links?: string[];
  };

  const authenticatedUserId = req.authenticatedUserId;
  if (!authenticatedUserId) return res.status(401).json({ error: "Authentication required" });

  // Admin status review path
  if (status !== undefined) {
    const [admin] = await db.select({ is_admin: usersTable.is_admin }).from(usersTable).where(eq(usersTable.id, authenticatedUserId)).limit(1);
    if (!admin?.is_admin) return res.status(403).json({ error: "Forbidden: Admin access required" });

    const normalizedStatus = status === "rejected" ? "denied" : status;
    if (!["pending", "approved", "denied"].includes(normalizedStatus)) {
      return res.status(400).json({ error: "status must be pending | approved | denied" });
    }

    const [updated] = await db
      .update(usersTable)
      .set({
        helper_status: normalizedStatus,
        is_helper: normalizedStatus === "approved",
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

  const [applicant] = await db
    .select({ is_suspended: usersTable.is_suspended, approval_status: usersTable.approval_status })
    .from(usersTable)
    .where(eq(usersTable.id, authenticatedUserId))
    .limit(1);
  if (applicant?.is_suspended) {
    return res.status(403).json({ error: "Account suspended — contact support" });
  }
  if (applicant?.approval_status !== "approved") {
    return res.status(403).json({ error: "Account pending approval", approval_status: applicant?.approval_status ?? "pending" });
  }

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

  // Notify admin in real time that a new helper application needs review.
  // (The register-time is_helper=true path also broadcasts this, but most
  // users submit their full application through this PATCH after registration.)
  broadcast({
    type: "new_helper_application",
    payload: {
      user_id: updated.id,
      name: updated.name,
      email: updated.email,
      helper_skills: updated.helper_skills,
      created_at: new Date().toISOString(),
    },
  });

  return res.json(safe);
});

// GET /users/:id/sponsor-history — contribution and payment history for a user.
// Owners only (requireOwnership). Returns up to 50 most recent payment transactions,
// joined with the request title/category so the UI can render meaningful rows.
router.get("/users/:id/sponsor-history", requireAuth, resolveMeParam, requireOwnership(), async (req, res) => {
  const userId = parseInt(String(req.params.id), 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  const history = await db
    .select({
      id: paymentTransactionsTable.id,
      request_id: paymentTransactionsTable.request_id,
      amount: paymentTransactionsTable.amount,
      state: paymentTransactionsTable.state,
      payment_type: paymentTransactionsTable.payment_type,
      sponsored_by: paymentTransactionsTable.sponsored_by,
      notes: paymentTransactionsTable.notes,
      created_at: paymentTransactionsTable.created_at,
      request_title: requestsTable.title,
      request_category: requestsTable.category,
    })
    .from(paymentTransactionsTable)
    .leftJoin(requestsTable, eq(requestsTable.id, paymentTransactionsTable.request_id))
    .where(eq(paymentTransactionsTable.requester_id, userId))
    .orderBy(sql`${paymentTransactionsTable.created_at} DESC`)
    .limit(50);

  return res.json(history);
});

// ── POST /users/me/accept-tos — record liability/community ToS acceptance ─────
// Called by the WaiverModal after the user scrolls through and checks all boxes.
// Stores the version string so future ToS updates can require re-acceptance.
// This is a best-effort server record — the frontend already shows and enforces
// the full ToS text, so a network failure here does NOT block the request post.
router.post("/users/me/accept-tos", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const { version } = req.body as { version?: string };

  if (!version) return res.status(400).json({ error: "version is required" });

  await db
    .update(usersTable)
    .set({
      tos_waiver_accepted_at: new Date(),
      tos_waiver_version: version,
    })
    .where(eq(usersTable.id, userId));

  return res.json({ ok: true, accepted_at: new Date().toISOString(), version });
});

export default router;
