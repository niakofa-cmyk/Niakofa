/**
 * Background Check Routes
 *
 * POST /background-checks/initiate        — authenticated helper starts a check
 * POST /background-checks/webhook         — Checkr webhook (signature verified)
 * GET  /background-checks/status          — authenticated: get own check status
 * POST /admin/users/:id/background-check  — admin manual override
 */

import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { authLimiter, adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import {
  initiateBackgroundCheck,
  processCheckrWebhook,
  adminOverrideBackgroundCheck,
  type CheckrWebhookPayload,
} from "../lib/background-check";
import crypto from "node:crypto";

const router = Router();
const CHECKR_WEBHOOK_SECRET = process.env["CHECKR_WEBHOOK_SECRET"] ?? "";

// ── GET /background-checks/status — own status ───────────────────────────────
router.get("/background-checks/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.authenticatedUserId!;
  const [user] = await db
    .select({
      background_check_status: usersTable.background_check_status,
      background_check_completed_at: usersTable.background_check_completed_at,
      background_check_id: usersTable.background_check_id,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return res.status(404).json({ error: "User not found" });

  return res.json({
    status: user.background_check_status ?? "not_started",
    completed_at: user.background_check_completed_at ?? null,
    has_provider_record: Boolean(user.background_check_id),
  });
});

// ── POST /background-checks/initiate — start a check ─────────────────────────
router.post("/background-checks/initiate", authLimiter, requireAuth, async (req: Request, res: Response) => {
  const userId = req.authenticatedUserId!;

  const [user] = await db
    .select({
      name: usersTable.name,
      email: usersTable.email,
      background_check_status: usersTable.background_check_status,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return res.status(404).json({ error: "User not found" });

  // Idempotent: already passed
  if (user.background_check_status === "passed") {
    return res.json({ status: "passed", message: "Your background check has already been cleared." });
  }

  // Already pending with a live provider record → don't re-initiate
  if (user.background_check_status === "pending") {
    return res.json({
      status: "pending",
      message: "Your background check is currently in progress. We'll notify you when it's complete.",
    });
  }

  const body = req.body as { dob?: string; zip_code?: string };

  try {
    const result = await initiateBackgroundCheck(userId, {
      name: user.name,
      email: user.email,
      dob: body.dob,
      zip_code: body.zip_code,
    });

    if (result.mode === "live") {
      return res.json({
        mode: "live",
        invitation_url: result.invitation_url,
        message: "Click the link below to complete your background check through our trusted provider, Checkr. The process takes 2–5 minutes.",
      });
    }

    return res.json({
      mode: "manual",
      message: result.message,
    });
  } catch (err) {
    logger.error({ err, userId }, "background-check: initiate failed");
    return res.status(500).json({ error: "Could not start background check. Please try again later." });
  }
});

// ── POST /background-checks/webhook — Checkr callback ────────────────────────
// Mounted with express.raw() in app.ts so req.body is a Buffer (raw bytes),
// which is needed for HMAC-SHA256 signature verification.
router.post("/background-checks/webhook", async (req: Request, res: Response) => {
  // Parse raw Buffer → JSON. express.raw() puts raw bytes in req.body.
  const rawBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  let payload: CheckrWebhookPayload;
  try {
    payload = JSON.parse(rawBuffer.toString("utf8")) as CheckrWebhookPayload;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  // Fail-closed: if CHECKR_WEBHOOK_SECRET is not configured, reject the request
  // outright rather than silently skipping signature verification. This endpoint
  // sets background_check_status = "passed" which gates access to childcare,
  // senior_care, and medical requests — a missing secret must never open that gate.
  if (!CHECKR_WEBHOOK_SECRET) {
    logger.error("CHECKR_WEBHOOK_SECRET is not configured — rejecting Checkr webhook to prevent unauthorized status changes");
    return res.status(503).json({ error: "Webhook endpoint not configured" });
  }

  // Verify Checkr webhook HMAC-SHA256 signature.
  // timingSafeEqual requires buffers of equal length — compare lengths first.
  const sigHeader = req.headers["x-checkr-signature"];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (!signature) {
    return res.status(401).json({ error: "Missing webhook signature" });
  }

  const expected = crypto
    .createHmac("sha256", CHECKR_WEBHOOK_SECRET)
    .update(rawBuffer)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  // Must check lengths first — timingSafeEqual throws if lengths differ
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  try {
    const updated = await processCheckrWebhook(payload);
    return res.json({ ok: true, user_updated: updated });
  } catch (err) {
    logger.error({ err, event_type: payload?.type }, "background-check: webhook processing failed");
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ── POST /admin/users/:id/background-check — manual override ─────────────────
router.post(
  "/admin/users/:id/background-check",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req: Request, res: Response) => {
    const targetId = parseInt(String(req.params["id"] ?? ""), 10);
    if (!targetId) return res.status(400).json({ error: "Invalid user ID" });

    const { status } = req.body as { status?: string };
    const allowed = ["not_started", "pending", "passed", "failed"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({
        error: "status must be one of: " + allowed.join(", "),
      });
    }

    const adminId = req.authenticatedUserId!;

    try {
      await adminOverrideBackgroundCheck(
        targetId,
        status as "not_started" | "pending" | "passed" | "failed",
        adminId
      );
      return res.json({ ok: true, user_id: targetId, status });
    } catch (err) {
      logger.error({ err, targetId }, "background-check: admin override failed");
      return res.status(500).json({ error: "Override failed" });
    }
  }
);

export default router;
