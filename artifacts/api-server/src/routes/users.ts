import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable, requestsTable, transactionsTable, scheduledPaymentsTable, userSettingsTable, paymentTransactionsTable, stripeAccountsTable, pushSubscriptionsTable, recurringRequestsTable, ratingsTable, gratitudeLikesTable, gratitudePostsTable, chatMessagesTable, reportsTable, passwordResetCodesTable } from "@workspace/db";
import { createHash, randomInt } from "crypto";
import { eq, and, sql, inArray, or } from "drizzle-orm";
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
import { broadcast, broadcastToAdmins, sendToUser, disconnectUserSockets } from "../lib/ws-hub";
import { authLimiter, gpsLimiter } from "../middlewares/rate-limit";
import { requireAuth, signTokenById } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import { logger } from "../lib/logger";
import { sendHelperApplicationDecision, sendAlertEmail } from "../lib/mailer";

const BCRYPT_ROUNDS = 12;

const router = Router();

router.get("/users/register", (_req, res) => {
  res.json({ message: "Use POST /api/users/register" });
});

router.post("/users/login", authLimiter, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email) return res.status(400).json({ error: "Email required" });
  if (!password) return res.status(400).json({ error: "Password required" });

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.trim().toLowerCase()))
      .limit(1);
    user = rows[0];
  } catch (err) {
    logger.error({ err }, "login: database error");
    return res.status(500).json({ error: "Database error — please try again" });
  }

  if (!user) return res.status(401).json({ error: "No account found with that email" });

  if (user.password_hash) {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Incorrect password" });
  } else {
    // Legacy account (no password set) — do NOT issue a token.
    // The client must call POST /users/set-initial-password to create a
    // password before gaining access. There is no "skip" path.
    logger.warn({ user_id: user.id }, "login: legacy account must set password");
    return res.status(403).json({
      error_code: "LEGACY_PASSWORD_REQUIRED",
      error: "Please create a password to continue. Your account was created before passwords were required.",
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
    });
  }

  const token = signTokenById(user.id, user.token_version);
  const { password_hash: _ph, ...safeUser } = user;
  return res.json({ user: safeUser, token });
});

// POST /users/request-password-reset — DEPRECATED (BUG-029)
// This endpoint only works for legacy accounts that have no password_hash yet.
// All password-reset flows (including accounts that already have a password)
// should use POST /users/forgot-password instead — that endpoint handles all
// account types correctly. This legacy path is retained for old app versions
// still in the field but should not be used in new client code.
// TODO: remove once all clients are on a version that uses /forgot-password.
router.post("/users/request-password-reset", authLimiter, async (req, res) => {
  res.setHeader("Deprecation", "true");
  res.setHeader("Link", '</users/forgot-password>; rel="successor-version"');
  const { email } = req.body as { email?: string };
  const GENERIC_RESPONSE = { ok: true, message: "If that email has a legacy account, a code has been sent." };

  if (!email || typeof email !== "string") return res.json(GENERIC_RESPONSE);

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);

  if (!user || user.password_hash) return res.json(GENERIC_RESPONSE);

  const code = randomInt(100000, 999999).toString();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(passwordResetCodesTable).values({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  sendAlertEmail({
    to: user.email,
    subject: "Your Niakofa verification code",
    title: "Verify it's you",
    body: `Your one-time code is <strong style="color:#00d4ff;font-size:24px;letter-spacing:4px">${code}</strong>. It expires in 15 minutes. If you didn't request this, you can safely ignore this email.`,
  }).catch(() => {}); // already logs internally

  logger.info({ user_id: user.id }, "users: password reset code sent");
  return res.json(GENERIC_RESPONSE);
});

// POST /users/forgot-password — works for ANY account (with or without an
// existing password), unlike request-password-reset above which is
// legacy-only. Sends the same kind of one-time emailed code. Always
// returns the same generic message regardless of whether the email exists.
router.post("/users/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body as { email?: string };
  const GENERIC_RESPONSE = { ok: true, message: "If that email has an account, a code has been sent." };

  if (!email || typeof email !== "string") return res.json(GENERIC_RESPONSE);

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);

  if (!user) return res.json(GENERIC_RESPONSE);

  // Invalidate any prior outstanding (unused) codes so old codes can't be used
  // after a new one is requested. Orphaned codes also stop accumulating.
  await db.delete(passwordResetCodesTable)
    .where(and(
      eq(passwordResetCodesTable.user_id, user.id),
      sql`${passwordResetCodesTable.used_at} IS NULL`,
    ));

  const code = randomInt(100000, 999999).toString();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.insert(passwordResetCodesTable).values({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  sendAlertEmail({
    to: user.email,
    subject: "Your Niakofa password reset code",
    title: "Reset your password",
    body: `Your one-time code is <strong style="color:#00d4ff;font-size:24px;letter-spacing:4px">${code}</strong>. It expires in 15 minutes. If you didn't request this, you can safely ignore this email — your password has not been changed.`,
  }).catch(() => {});

  logger.info({ user_id: user.id }, "users: forgot-password code sent");
  return res.json(GENERIC_RESPONSE);
});

// POST /users/reset-password — completes a forgot-password flow for ANY
// account (with or without an existing password). Requires a valid code
// from forgot-password above. Same per-code attempt lockout as
// set-initial-password.
router.post("/users/reset-password", authLimiter, async (req, res) => {
  const { email, code, new_password } = req.body as {
    email?: string; code?: string; new_password?: string;
  };

  if (!email || !code || !new_password) {
    return res.status(400).json({ error: "email, code, and new_password are required" });
  }
  if (typeof new_password !== "string" || new_password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
  // Return 403 (not 404) regardless of whether the email exists — 404 leaks
  // account existence by differing from the "code wrong/expired" 403 response.
  if (!user) return res.status(403).json({ error: "Invalid or expired code. Please request a new one." });

  const MAX_CODE_ATTEMPTS = 5;
  const [latestCode] = await db.select().from(passwordResetCodesTable)
    .where(eq(passwordResetCodesTable.user_id, user.id))
    .orderBy(sql`${passwordResetCodesTable.created_at} DESC`)
    .limit(1);

  if (!latestCode || latestCode.used_at || latestCode.expires_at < new Date()) {
    return res.status(403).json({ error: "Invalid or expired code. Please request a new one." });
  }
  if (latestCode.failed_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
  }

  const codeHash = createHash("sha256").update(String(code).trim()).digest("hex");
  if (latestCode.code_hash !== codeHash) {
    await db.update(passwordResetCodesTable)
      .set({ failed_attempts: sql`${passwordResetCodesTable.failed_attempts} + 1` })
      .where(eq(passwordResetCodesTable.id, latestCode.id));
    return res.status(403).json({ error: "Invalid or expired code. Please request a new one." });
  }

  await db.update(passwordResetCodesTable)
    .set({ used_at: new Date() })
    .where(eq(passwordResetCodesTable.id, latestCode.id));

  const password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  const [updated] = await db.update(usersTable)
    .set({ password_hash, token_version: sql`${usersTable.token_version} + 1`, updated_at: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  if (!updated) return res.status(500).json({ error: "Failed to reset password" });

  logger.info({ user_id: user.id }, "users: password reset via forgot-password flow");
  const token = signTokenById(updated.id, updated.token_version);
  const { password_hash: _ph, ...safeUser } = updated;
  return res.json({ user: safeUser, token });
});

// POST /users/set-initial-password — unauthenticated, rate-limited one-time password setup.
// ONLY works for legacy accounts where password_hash is NULL (pre-password-era accounts).
// Requires a valid, unexpired, unused code from request-password-reset above —
// proving actual email ownership, not just knowledge of non-secret user_id+email.
// On success, returns a full auth token so the user lands directly in the app.
router.post("/users/set-initial-password", authLimiter, async (req, res) => {
  const { user_id, email, code, new_password } = req.body as {
    user_id?: number;
    email?: string;
    code?: string;
    new_password?: string;
  };

  if (!user_id || !email || !code || !new_password) {
    return res.status(400).json({ error: "user_id, email, code, and new_password are required" });
  }
  if (typeof new_password !== "string" || new_password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  let user: typeof usersTable.$inferSelect | undefined;
  try {
    const rows = await db.select().from(usersTable).where(eq(usersTable.id, Number(user_id))).limit(1);
    user = rows[0];
  } catch (err) {
    logger.error({ err }, "set-initial-password: database error");
    return res.status(500).json({ error: "Database error — please try again" });
  }

  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.email.toLowerCase() !== String(email).trim().toLowerCase()) {
    return res.status(403).json({ error: "Email does not match account" });
  }

  // This endpoint is only for legacy (no-password) accounts
  if (user.password_hash) {
    return res.status(409).json({
      error: "This account already has a password. Use the normal sign-in form.",
    });
  }

  // Per-code attempt lockout — closes the distributed-brute-force gap a
  // purely per-IP rate limit leaves open against a 6-digit (1M-combo) code.
  // Look up the most recent outstanding (unused, unexpired) code for this
  // user FIRST, regardless of whether the submitted code matches it — that
  // way failed attempts get tracked even when the code itself is wrong.
  const MAX_CODE_ATTEMPTS = 5;
  const [latestCode] = await db.select().from(passwordResetCodesTable)
    .where(eq(passwordResetCodesTable.user_id, user.id))
    .orderBy(sql`${passwordResetCodesTable.created_at} DESC`)
    .limit(1);

  if (!latestCode || latestCode.used_at || latestCode.expires_at < new Date()) {
    return res.status(403).json({ error: "Invalid or expired code. Please request a new one." });
  }

  if (latestCode.failed_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
  }

  const codeHash = createHash("sha256").update(String(code).trim()).digest("hex");
  if (latestCode.code_hash !== codeHash) {
    await db.update(passwordResetCodesTable)
      .set({ failed_attempts: sql`${passwordResetCodesTable.failed_attempts} + 1` })
      .where(eq(passwordResetCodesTable.id, latestCode.id));
    return res.status(403).json({ error: "Invalid or expired code. Please request a new one." });
  }

  await db.update(passwordResetCodesTable)
    .set({ used_at: new Date() })
    .where(eq(passwordResetCodesTable.id, latestCode.id));

  const password_hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  const [updated] = await db
    .update(usersTable)
    .set({ password_hash, updated_at: new Date(), token_version: sql`${usersTable.token_version} + 1` })
    .where(eq(usersTable.id, user.id))
    .returning();

  if (!updated) return res.status(500).json({ error: "Failed to update password" });

  logger.info({ user_id: user.id }, "users: legacy account initial password set");
  const token = signTokenById(updated.id, updated.token_version);
  const { password_hash: _ph, ...safeUser } = updated;
  return res.json({ user: safeUser, token });
});

router.post("/users/register", authLimiter, async (req, res) => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { name, email, avatar_url, is_helper, neighborhood } = parsed.data;
  // Accept optional fields from body (not part of OpenAPI spec to avoid codegen churn)
  const rawBody = req.body as Record<string, unknown>;
  const rawPassword = rawBody.password;

  // BUG-001: Enforce minimum 8-character password at registration, matching all
  // other password-change flows (forgot-password, set-initial-password).
  // Reject registration entirely if no password is provided — never create a
  // null-hash account that can never be changed via the standard UI.
  if (!rawPassword || typeof rawPassword !== "string") {
    return res.status(400).json({ error: "Password is required" });
  }
  if (rawPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const password_hash = await bcrypt.hash(rawPassword, BCRYPT_ROUNDS);

  const VALID_ACCOUNT_TYPES = ["individual", "business", "sponsor"];
  const rawAccountType = rawBody.account_type;
  const account_type = typeof rawAccountType === "string" && VALID_ACCOUNT_TYPES.includes(rawAccountType)
    ? rawAccountType
    : "individual";
  const organization_name = typeof rawBody.organization_name === "string" ? rawBody.organization_name.trim() || null : null;
  const organization_description = typeof rawBody.organization_description === "string" ? rawBody.organization_description.trim() || null : null;

  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email.trim().toLowerCase())).limit(1);
    if (existing.length > 0) return res.status(409).json({ error: "Email already registered" });

    // Every new account — individual, business, or sponsor — starts pending
    // admin approval and is fully locked out of the API until reviewed.
    const [user] = await db.insert(usersTable).values({
      name, email: email.trim().toLowerCase(),
      avatar_url: avatar_url ?? null,
      is_helper: is_helper ?? false,
      neighborhood: neighborhood ?? null,
      password_hash,
      account_type,
      organization_name,
      organization_description,
      approval_status: "pending",
    }).returning();
    const token = signTokenById(user.id, user.token_version);
    const { password_hash: _ph, ...safeUser } = user as Record<string, unknown>;
    logger.info({ user_id: user.id, account_type }, "register: new account pending approval");

    // BUG-003: Notify online admins in real-time so they can review the new
    // account application without polling. Previously admins had no live signal
    // and could miss pending registrations for hours.
    broadcastToAdmins({
      type: "new_account_application",
      payload: {
        user_id: user.id,
        name: user.name,
        account_type: user.account_type,
        created_at: user.created_at,
      },
    });

    return res.status(201).json({ user: safeUser, token });
  } catch (err) {
    logger.error({ err }, "register: database error");
    return res.status(500).json({ error: "Registration failed — please try again" });
  }
});

// Any authenticated user can view a profile (needed for public helper
// profiles, leaderboard, etc.) — but only the profile's OWNER sees private
// fields (email, phone, panic contacts, Stripe identity session). Other
// viewers get a public-safe subset only.
router.get("/users/:id", requireAuth, async (req, res) => {
  const parsed = GetUserParams.safeParse({ id: parseInt(req.params.id as string) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.id)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const isSelf = req.authenticatedUserId === user.id;
  const {
    password_hash: _ph,
    email: _email,
    phone_masked: _pm,
    panic_contacts: _pc,
    stripe_identity_session_id: _sid,
    ...publicUser
  } = user as Record<string, unknown>;

  if (isSelf) {
    return res.json({
      ...publicUser,
      email: user.email,
      phone_masked: user.phone_masked,
      panic_contacts: user.panic_contacts,
      stripe_identity_session_id: user.stripe_identity_session_id,
    });
  }
  return res.json(publicUser);
});

router.patch("/users/:id", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = UpdateUserParams.safeParse({ id: parseInt(req.params.id as string) });
  const bParsed = UpdateUserBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { name, avatar_url, neighborhood, is_helper } = bParsed.data;
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;
  if (neighborhood !== undefined) updates.neighborhood = neighborhood;
  if (is_helper !== undefined) updates.is_helper = is_helper;
  const { specialties, phone_masked, quick_replies } = bParsed.data;
  if (specialties !== undefined) updates.specialties = specialties;
  if (phone_masked !== undefined) updates.phone_masked = phone_masked;
  if (quick_replies !== undefined) updates.quick_replies = quick_replies;

  // ── Password change/set flow ──────────────────────────────────────────────
  // The client sends `new_password` (plaintext) either to create a password
  // for the first time (legacy account, password_hash currently null) or to
  // change an existing one. We hash it here — the plaintext never persists.
  const rawNewPassword = (req.body as Record<string, unknown>).new_password;
  if (rawNewPassword !== undefined) {
    if (typeof rawNewPassword !== "string" || rawNewPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const [existing] = await db.select({ password_hash: usersTable.password_hash })
      .from(usersTable).where(eq(usersTable.id, pParsed.data.id)).limit(1);
    if (!existing) return res.status(404).json({ error: "User not found" });

    // If a password already exists, this is a CHANGE, not a first-time set —
    // require proof of the current password before allowing it. Without
    // this, anyone holding a valid (e.g. stolen) bearer token could
    // permanently lock the legitimate owner out of their own account.
    if (existing.password_hash) {
      const rawCurrentPassword = (req.body as Record<string, unknown>).current_password;
      if (typeof rawCurrentPassword !== "string" || !rawCurrentPassword) {
        return res.status(400).json({ error: "current_password is required to change your password" });
      }
      const currentValid = await bcrypt.compare(rawCurrentPassword, existing.password_hash);
      if (!currentValid) {
        return res.status(403).json({ error: "Current password is incorrect" });
      }
    }

    updates.password_hash = await bcrypt.hash(rawNewPassword, BCRYPT_ROUNDS);
    // Changing the password invalidates every previously issued token for
    // this account, including ones an attacker may have stolen — bump the
    // version, then issue this request's own caller a fresh token below so
    // their current session keeps working.
    (updates as Record<string, unknown>).token_version = sql`${usersTable.token_version} + 1`;
    logger.info({ user_id: pParsed.data.id }, "users: password changed/set");
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, pParsed.data.id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  // Never return the password hash to the client
  const { password_hash: _ph, ...safeUser } = user;
  if (rawNewPassword !== undefined) {
    const token = signTokenById(user.id, user.token_version);
    return res.json({ ...safeUser, token });
  }
  return res.json(safeUser);
});

// POST /users/:id/logout — invalidate every previously issued token for
// this account (logout-everywhere). Coarse-grained by design: this token
// scheme has no per-device/session tracking, so there is no narrower unit
// of revocation available.
router.post("/users/:id/logout", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.update(usersTable)
    .set({ token_version: sql`${usersTable.token_version} + 1` })
    .where(eq(usersTable.id, id));
  logger.info({ user_id: id }, "users: logged out — all tokens revoked");
  return res.json({ ok: true });
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

  // Respect the user's own privacy_live_location preference before sharing
  // their position with anyone. Defaults to false (off) at the DB level,
  // matching the settings schema default — a person must explicitly opt in
  // via Settings to share live location, whether as a helper or requester.
  const [locSettings] = await db
    .select({ privacy_live_location: userSettingsTable.privacy_live_location })
    .from(userSettingsTable)
    .where(eq(userSettingsTable.user_id, user.id))
    .limit(1);
  const shareLiveLocation = locSettings?.privacy_live_location === true;

  if (shareLiveLocation && user.helper_mode_active) {
    broadcast({
      type: "helper_location",
      payload: { id: user.id, name: user.name, lat: user.lat, lng: user.lng, heading: user.heading },
    });
  } else if (shareLiveLocation) {
    // Requester live-location sharing — note the requester may not be at
    // the help location itself (e.g. requesting help for a relative's
    // apartment), so this is purely "where the requester currently is",
    // separate from the fixed request.lat/lng the helper navigates to.
    // Targeted only to the assigned helper on an active request — never a
    // public broadcast, since this is more sensitive than helper visibility.
    const [activeReq] = await db
      .select({ id: requestsTable.id, helper_id: requestsTable.helper_id })
      .from(requestsTable)
      .where(and(
        eq(requestsTable.requester_id, user.id),
        inArray(requestsTable.status, ["claimed", "en_route", "arrived"]),
      ))
      .limit(1);

    if (activeReq?.helper_id) {
      sendToUser(activeReq.helper_id, {
        type: "requester_location",
        payload: {
          request_id: activeReq.id,
          requester_id: user.id,
          lat: user.lat,
          lng: user.lng,
          heading: user.heading,
        },
      });
    }
  }
  return res.json(user);
});

router.patch("/users/:id/helper-mode", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = UpdateHelperModeParams.safeParse({ id: parseInt(req.params.id as string) });
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
  return res.json(user);
});

router.post("/users/:id/pledge", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = MakePledgePaymentParams.safeParse({ id: parseInt(req.params.id as string) });
  const bParsed = MakePledgePaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
  const { request_id, amount } = bParsed.data;
  const MAX_PLEDGE_AMOUNT = 10000; // $10,000 sanity cap
  if (amount <= 0 || amount > MAX_PLEDGE_AMOUNT) {
    return res.status(400).json({ error: `amount must be greater than 0 and no more than $${MAX_PLEDGE_AMOUNT}` });
  }
  const [request] = await db.select().from(requestsTable)
    .where(and(eq(requestsTable.id, request_id), eq(requestsTable.requester_id, pParsed.data.id)))
    .limit(1);
  if (!request) return res.status(404).json({ error: "Request not found or unauthorized" });

  // Dedup guard — a double-tap or client retry from the SAME USER with the
  // exact same request_id + amount within a short window is almost certainly
  // a duplicate submission. user_id is required so two different users
  // pledging the same amount on the same request within 10 seconds don't
  // block each other (a real, legitimate scenario on active requests).
  const [recentDuplicate] = await db.select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.user_id, pParsed.data.id),
      eq(transactionsTable.request_id, request_id),
      eq(transactionsTable.type, "pledge_sent"),
      eq(transactionsTable.amount, -amount),
      sql`${transactionsTable.created_at} > NOW() - INTERVAL '10 seconds'`,
    ))
    .limit(1);
  if (recentDuplicate) {
    return res.status(409).json({ error: "Duplicate pledge — please wait a moment before retrying" });
  }

  // Atomic increment — avoids TOCTOU race where two concurrent pledges both
  // read the same pledge_paid value, add their amounts, and the second write
  // silently overwrites the first. DB-level arithmetic is always consistent.
  const [updated] = await db.update(requestsTable)
    .set({ pledge_paid: sql`${requestsTable.pledge_paid} + ${amount}` })
    .where(eq(requestsTable.id, request_id))
    .returning();

  // BUG-009: Do NOT credit benevolence_wallet here or insert pledge_received/
  // pledge_sent transaction rows — the Stripe webhook (payment_intent.succeeded)
  // is the ONLY authoritative path for crediting the wallet. Crediting here
  // AND in the webhook causes a double-credit when both paths fire.
  //
  // The previous code immediately credited the wallet and also inserted a
  // payment_transactions row (below). If a Stripe webhook fired for the same
  // pledge, it would find the payment_transactions row and credit the wallet
  // again. The fix: only create the pending intent here; let the webhook credit.
  //
  // The `pledge_sent` transaction (requester's ledger) also moves to the webhook
  // handler so both sides of the ledger are always in sync with actual payment.

  await db.insert(paymentTransactionsTable).values({
    request_id: request_id,
    helper_id: request.helper_id ?? null,
    requester_id: pParsed.data.id,
    amount,
    state: "pending_contribution",
    payment_type: "pay_it_forward",
    notes: "Pay It Forward pledge — wallet credited on Stripe webhook success",
  });

  broadcast({ type: "request_updated", payload: { ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null } });
  broadcast({ type: "pledge_paid", payload: { user_id: pParsed.data.id, request_id, amount, request_title: request.title } });
  return res.json({ ...updated, requester_name: null, requester_avatar: null, helper_name: null, distance_miles: null, estimated_duration_min: null });
});

// GET /users/:id/transactions — real activity history
router.get("/users/:id/transactions", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const txns = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.user_id, id))
    .orderBy(sql`${transactionsTable.created_at} DESC`)
    .limit(50);
  return res.json(txns);
});

// POST /users/:id/scheduled-payment — save a future repayment intent
router.post("/users/:id/scheduled-payment", requireAuth, requireOwnership(), async (req, res) => {
  const pParsed = CreateScheduledPaymentParams.safeParse({ id: parseInt(req.params.id as string) });
  const bParsed = CreateScheduledPaymentBody.safeParse(req.body);
  if (!pParsed.success || !bParsed.success) return res.status(400).json({ error: "Invalid request" });
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
router.get("/users/:id/scheduled-payment", requireAuth, requireOwnership(), async (req, res) => {
  const parsed = GetScheduledPaymentsParams.safeParse({ id: parseInt(req.params.id as string) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });
  const rows = await db.select().from(scheduledPaymentsTable)
    .where(eq(scheduledPaymentsTable.user_id, parsed.data.id))
    .orderBy(scheduledPaymentsTable.scheduled_date);
  return res.json(rows.map(r => ({ ...r, scheduled_date: r.scheduled_date.toISOString() })));
});

// DELETE /users/:id/scheduled-payment/:paymentId — cancel a scheduled payment
router.delete("/users/:id/scheduled-payment/:paymentId", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  const paymentId = parseInt(req.params.paymentId as string);
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
  const id = parseInt(req.params.id as string);
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
// BUG-005 (partial mitigation): Avatars are stored as base64 data URLs directly
// in the users.avatar_url column. This inflates row size, adds pressure to DB
// read bandwidth, and is not suitable for large images. The correct fix is to
// store binary blobs in an object store (S3, Cloudflare R2, etc.) and persist
// a CDN URL here instead — but that requires external infrastructure.
// Until a CDN is added, we enforce a strict 5 MB cap (already ~3.75 MB decoded)
// and validate the content type prefix to limit damage.
router.post("/users/:id/avatar", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { dataUrl } = req.body as { dataUrl?: string };
  const ALLOWED_IMG = ["data:image/jpeg;","data:image/jpg;","data:image/png;","data:image/webp;","data:image/gif;"];
  if (!dataUrl || !ALLOWED_IMG.some(t => dataUrl.startsWith(t))) {
    return res.status(400).json({ error: "Invalid image — must be jpeg, png, webp, or gif" });
  }
  // BUG-005: 5 MB hard cap — base64 string length, not decoded bytes.
  // Decoded size = length * 0.75; a 5 MB string ≈ 3.75 MB image.
  if (dataUrl.length > 5 * 1024 * 1024) {
    return res.status(413).json({ error: "Image too large — max 5 MB" });
  }
  const [user] = await db
    .update(usersTable)
    .set({ avatar_url: dataUrl, updated_at: new Date() })
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(user);
});

// GET /users/:id/settings — fetch user notification + privacy prefs (upserts defaults if first visit)
router.get("/users/:id/settings", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const [existing] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.user_id, id)).limit(1);
  if (existing) return res.json(existing);
  const [created] = await db.insert(userSettingsTable).values({ user_id: id }).returning();
  return res.status(201).json(created);
});

// PUT /users/:id/settings — persist notification + privacy prefs
router.put("/users/:id/settings", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
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
  return res.json(user);
});

// DELETE /users/:id — permanently delete a user and all their data
router.delete("/users/:id", requireAuth, requireOwnership(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  try {
    // BUG-017: Wrap all deletion steps in a single DB transaction so that
    // a failure at any step does not leave the account in a partially
    // deleted state. Previously 14+ sequential deletes could fail mid-way
    // with no rollback.
    await db.transaction(async (tx) => {
      // Clean up every dependent table, not just 4 of ~13 — previously
      // requests, transactions, payment_transactions, reports,
      // recurring_requests, push_subscriptions, chat_messages, ratings, and
      // gratitude_posts were all left orphaned after account deletion.
      await tx.delete(scheduledPaymentsTable).where(eq(scheduledPaymentsTable.user_id, userId));
      await tx.delete(stripeAccountsTable).where(eq(stripeAccountsTable.user_id, userId));
      await tx.delete(userSettingsTable).where(eq(userSettingsTable.user_id, userId));
      await tx.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.user_id, userId));
      await tx.delete(recurringRequestsTable).where(eq(recurringRequestsTable.user_id, userId));
      await tx.delete(transactionsTable).where(eq(transactionsTable.user_id, userId));
      await tx.delete(ratingsTable).where(or(eq(ratingsTable.rater_id, userId), eq(ratingsTable.ratee_id, userId)));
      await tx.delete(gratitudeLikesTable).where(eq(gratitudeLikesTable.user_id, userId));
      await tx.delete(gratitudePostsTable).where(or(eq(gratitudePostsTable.author_id, userId), eq(gratitudePostsTable.helper_id, userId)));
      await tx.delete(chatMessagesTable).where(eq(chatMessagesTable.sender_id, userId));
      await tx.delete(reportsTable).where(or(eq(reportsTable.reporter_id, userId), eq(reportsTable.reported_user_id, userId)));
      await tx.delete(paymentTransactionsTable).where(or(eq(paymentTransactionsTable.requester_id, userId), eq(paymentTransactionsTable.helper_id, userId)));
      // Requests reference this user as requester or helper — null out the
      // helper_id reference (request stays, just unclaimed) but delete
      // requests this user actually created themselves.
      await tx.update(requestsTable).set({ helper_id: null }).where(eq(requestsTable.helper_id, userId));
      await tx.delete(requestsTable).where(eq(requestsTable.requester_id, userId));
      await tx.delete(usersTable).where(eq(usersTable.id, userId));
    });

    disconnectUserSockets(userId);
    return res.json({ ok: true, message: "Account deleted successfully" });
  } catch (error) {
    logger.error({ err: error, user_id: userId }, "users: failed to delete account");
    return res.status(500).json({ error: "Failed to delete account" });
  }
});

// PATCH /users/:id/helper-application — submit helper profile, sets status to pending
router.patch("/users/:id/helper-application", requireAuth, requireOwnership(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const {
    helper_skills, helper_languages, helper_qualifications,
    helper_bio, helper_vehicle, helper_social_links,
  } = req.body as {
    helper_skills?: string[];
    helper_languages?: string[];
    helper_qualifications?: string[];
    helper_bio?: string;
    helper_vehicle?: string;
    helper_social_links?: string;
  };
  if (!helper_skills || !Array.isArray(helper_skills) || helper_skills.length === 0) {
    return res.status(400).json({ error: "At least one skill is required" });
  }

  // MED-005: only force re-review if the helper isn't already approved —
  // editing skills/bio shouldn't silently demote an approved helper.
  const [currentHelperRow] = await db.select({ helper_status: usersTable.helper_status })
    .from(usersTable).where(eq(usersTable.id, id)).limit(1);
  const nextHelperStatus = currentHelperRow?.helper_status === "approved" ? "approved" : "pending";

  const updates: Partial<typeof usersTable.$inferInsert> = {
    is_helper: true,
    helper_status: nextHelperStatus,
    helper_skills: helper_skills ?? [],
    helper_languages: helper_languages ?? [],
    helper_qualifications: helper_qualifications ?? [],
    helper_bio: helper_bio ?? null,
    helper_vehicle: helper_vehicle ?? null,
    helper_social_links: helper_social_links ?? null,
    updated_at: new Date(),
  };
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });
  const { password_hash: _ph, ...safeUser } = user;
  logger.info({ user_id: id }, "users: helper application submitted");
  return res.json(safeUser);
});

// GET /admin/helper-applications — list helper applicants (admin only)
router.get("/admin/helper-applications", requireAuth, requireAdmin(), async (req, res) => {
  const { status } = req.query as { status?: string };
  const validStatuses = ["pending", "approved", "denied"];
  const filterStatus = status && validStatuses.includes(status) ? status : null;

  let query = db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    avatar_url: usersTable.avatar_url,
    is_helper: usersTable.is_helper,
    helper_mode_active: usersTable.helper_mode_active,
    helper_status: usersTable.helper_status,
    helper_skills: usersTable.helper_skills,
    helper_languages: usersTable.helper_languages,
    helper_qualifications: usersTable.helper_qualifications,
    helper_bio: usersTable.helper_bio,
    helper_vehicle: usersTable.helper_vehicle,
    helper_social_links: usersTable.helper_social_links,
    trust_score: usersTable.trust_score,
    help_count: usersTable.help_count,
    neighborhood: usersTable.neighborhood,
    benevolence_wallet: usersTable.benevolence_wallet,
    goodwill_score: usersTable.goodwill_score,
    identity_verified: usersTable.identity_verified,
    created_at: usersTable.created_at,
    updated_at: usersTable.updated_at,
  }).from(usersTable).$dynamic();

  const limit = Math.min(parseInt(req.query.limit as string) || 200, 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const rows = filterStatus
    ? await query.where(eq(usersTable.helper_status, filterStatus)).limit(limit).offset(offset)
    : await query.where(sql`${usersTable.helper_status} IS NOT NULL`).limit(limit).offset(offset);

  const [{ count: totalCount }] = filterStatus
    ? await db.select({ count: sql<number>`cast(count(*) as int)` }).from(usersTable).where(eq(usersTable.helper_status, filterStatus))
    : await db.select({ count: sql<number>`cast(count(*) as int)` }).from(usersTable).where(sql`${usersTable.helper_status} IS NOT NULL`);

  return res.json({
    data: rows,
    total: totalCount,
    limit,
    offset,
    has_more: offset + rows.length < totalCount,
  });
});

// PATCH /admin/helper-applications/:id/review — approve or deny a helper application
router.patch("/admin/helper-applications/:id/review", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { decision } = req.body as { decision?: string; admin_notes?: string };
  if (!decision || !["approved", "denied"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'denied'" });
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {
    helper_status: decision as "approved" | "denied",
    updated_at: new Date(),
  };

  if (decision === "approved") {
    updates.is_helper = true;
  } else {
    updates.is_helper = false;
    updates.helper_mode_active = false;
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "User not found" });

  const { password_hash: _ph, ...safeUser } = user;
  logger.info({ user_id: id, decision }, "admin: helper application reviewed");

  const wsEventType = decision === "approved" ? "helper_application_approved" : "helper_application_denied";

  // Targeted WS event to the specific user (real-time in-app update)
  sendToUser(id, {
    type: wsEventType,
    payload: { user_id: id, decision, helper_status: decision },
  });

  // Also broadcast so any admin views can update
  broadcast({
    type: wsEventType,
    payload: { user_id: id, decision },
  });

  // Email notification — fire-and-forget, non-blocking
  sendHelperApplicationDecision({
    to: user.email,
    applicantName: user.name,
    decision: decision as "approved" | "denied",
    appUrl: process.env["APP_URL"] ?? "https://niakofa.community",
  }).catch(() => {}); // already logs internally

  return res.json(safeUser);
});

// GET /admin/account-applications — list accounts by approval status (admin only)
router.get("/admin/account-applications", requireAuth, requireAdmin(), async (req, res) => {
  const { status, account_type } = req.query as { status?: string; account_type?: string };
  const validStatuses = ["pending", "approved", "denied"];
  const validAccountTypes = ["individual", "business", "sponsor"];
  const filterStatus = status && validStatuses.includes(status) ? status : null;
  const filterAccountType = account_type && validAccountTypes.includes(account_type) ? account_type : null;

  const query = db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    avatar_url: usersTable.avatar_url,
    account_type: usersTable.account_type,
    approval_status: usersTable.approval_status,
    organization_name: usersTable.organization_name,
    organization_description: usersTable.organization_description,
    neighborhood: usersTable.neighborhood,
    is_helper: usersTable.is_helper,
    identity_verified: usersTable.identity_verified,
    created_at: usersTable.created_at,
    updated_at: usersTable.updated_at,
  }).from(usersTable).$dynamic();

  const conditions = [];
  if (filterStatus) conditions.push(eq(usersTable.approval_status, filterStatus));
  if (filterAccountType) conditions.push(eq(usersTable.account_type, filterAccountType));

  const limit = Math.min(parseInt(req.query.limit as string) || 200, 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const rows = conditions.length > 0
    ? await query.where(and(...conditions)).orderBy(sql`${usersTable.created_at} DESC`).limit(limit).offset(offset)
    : await query.orderBy(sql`${usersTable.created_at} DESC`).limit(limit).offset(offset);

  return res.json(rows);
});

// PATCH /admin/account-applications/:id/review — approve or deny an account (individual/business/sponsor)
router.patch("/admin/account-applications/:id/review", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { decision } = req.body as { decision?: string };
  if (!decision || !["approved", "denied"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'denied'" });
  }

  // BUG-004: When an account is denied, bump token_version to immediately
  // revoke all outstanding tokens. Denied accounts keep valid tokens from
  // registration and could still make API calls until natural token expiry.
  // This matches the ban pattern in PATCH /users/:id/moderation.
  const updateSet: Partial<typeof usersTable.$inferInsert> & Record<string, unknown> = {
    approval_status: decision as "approved" | "denied",
    approval_reviewed_by: req.authenticatedUserId,
    approval_reviewed_at: new Date(),
    updated_at: new Date(),
  };
  if (decision === "denied") {
    (updateSet as Record<string, unknown>).token_version = sql`${usersTable.token_version} + 1`;
  }

  const [user] = await db.update(usersTable)
    .set(updateSet)
    .where(eq(usersTable.id, id))
    .returning();
  if (!user) return res.status(404).json({ error: "User not found" });

  const { password_hash: _ph, ...safeUser } = user;
  logger.info({ user_id: id, decision, account_type: user.account_type, reviewed_by: req.authenticatedUserId }, "admin: account application reviewed");

  const wsEventType = decision === "approved" ? "account_approved" : "account_denied";

  sendToUser(id, {
    type: wsEventType,
    payload: { user_id: id, decision, approval_status: decision },
  });

  broadcast({
    type: wsEventType,
    payload: { user_id: id, decision },
  });

  return res.json(safeUser);
});

// PATCH /users/:id/moderation — admin moderation actions
router.patch("/users/:id/moderation", requireAuth, requireAdmin(), async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { action } = req.body as { action: "warn" | "ban" };
  if (!["warn", "ban"].includes(action)) return res.status(400).json({ error: "Invalid action" });

  if (action === "ban") {
    await db.update(usersTable)
      .set({
        trust_score: -1,
        helper_mode_active: false,
        // Revoke every previously issued token immediately, not just future
        // logins — without this, a banned user's existing session(s) stay
        // valid until natural 30-day token expiry.
        token_version: sql`${usersTable.token_version} + 1`,
      })
      .where(eq(usersTable.id, userId));
  } else {
    await db.update(usersTable)
      .set({ trust_score: sql`GREATEST(0, ${usersTable.trust_score} - 10)` })
      .where(eq(usersTable.id, userId));
  }
  return res.json({ ok: true, action, user_id: userId });
});

// GET all users (admin)
router.get("/users", requireAuth, requireAdmin(), async (req, res) => {
  // Previously hard-capped at 200 with no way to see anything beyond that
  // as the user base grows. Optional ?limit=&offset= now supports paging.
  const limit = Math.min(parseInt(req.query.limit as string) || 200, 200);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    is_helper: usersTable.is_helper,
    trust_score: usersTable.trust_score,
    help_count: usersTable.help_count,
    created_at: usersTable.created_at,
  }).from(usersTable).orderBy(sql`${usersTable.created_at} DESC`).limit(limit).offset(offset);
  return res.json(users);
});

export default router;
