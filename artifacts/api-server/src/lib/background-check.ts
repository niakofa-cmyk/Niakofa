/**
 * Niakofa — Background Check Integration (Checkr)
 *
 * Wraps the Checkr API for initiating background checks and processing
 * their webhook results. Gracefully degrades to admin-manual-only mode
 * when CHECKR_API_KEY is not set (development / before contract is signed).
 *
 * Flow:
 *   1. Helper calls POST /background-checks/initiate
 *   2. We create a Checkr candidate + invitation → return the invitation URL
 *   3. Checkr POSTs to POST /background-checks/webhook when the report is ready
 *   4. We map Checkr's "clear"/"consider"/"suspended" → our "passed"/"failed"
 *   5. Admin can manually override via POST /admin/users/:id/background-check
 *
 * Env vars required for live mode:
 *   CHECKR_API_KEY       — API key from Checkr dashboard (required for live)
 *   CHECKR_PACKAGE       — Checkr package slug (default: "tasker_standard")
 *   CHECKR_WEBHOOK_SECRET — webhook secret for signature verification
 */

import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const CHECKR_API_KEY = process.env["CHECKR_API_KEY"] ?? "";
const CHECKR_PACKAGE = process.env["CHECKR_PACKAGE"] ?? "tasker_standard";
const CHECKR_BASE = "https://api.checkr.com/v1";

export const isCheckrConfigured = (): boolean => Boolean(CHECKR_API_KEY);

// ── Checkr API helpers ────────────────────────────────────────────────────────

async function checkrFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const credentials = Buffer.from(`${CHECKR_API_KEY}:`).toString("base64");
  const res = await fetch(`${CHECKR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`Checkr API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export type InitiateResult =
  | { mode: "live"; invitation_url: string; candidate_id: string }
  | { mode: "manual"; message: string };

/**
 * Start a background check for a user.
 * In live mode: creates a Checkr candidate + invitation and returns the URL.
 * In manual mode: returns a message directing the admin to update the status.
 */
export async function initiateBackgroundCheck(userId: number, opts: {
  name: string;
  email: string;
  dob?: string;          // YYYY-MM-DD (optional — Checkr can collect on their form)
  zip_code?: string;
}): Promise<InitiateResult> {
  if (!isCheckrConfigured()) {
    logger.warn({ userId }, "background-check: CHECKR_API_KEY not set — manual mode");
    return {
      mode: "manual",
      message:
        "Background checks are currently processed manually. Your request has been noted — " +
        "an admin will update your status after reviewing your application. " +
        "This usually takes 1–3 business days.",
    };
  }

  // 1. Create or retrieve a Checkr candidate
  const candidate = await checkrFetch<{ id: string }>("/candidates", {
    method: "POST",
    body: JSON.stringify({
      first_name: opts.name.split(" ")[0] ?? opts.name,
      last_name: opts.name.split(" ").slice(1).join(" ") || undefined,
      email: opts.email,
      dob: opts.dob,
      zipcode: opts.zip_code,
    }),
  });

  // 2. Create an invitation so Checkr collects consent + SSN on their hosted page
  const invitation = await checkrFetch<{ id: string; invitation_url: string }>("/invitations", {
    method: "POST",
    body: JSON.stringify({
      candidate_id: candidate.id,
      package: CHECKR_PACKAGE,
    }),
  });

  // 3. Store candidate ID on the user row so we can match the webhook later
  await db
    .update(usersTable)
    .set({
      background_check_id: candidate.id,
      background_check_status: "pending",
    })
    .where(eq(usersTable.id, userId));

  logger.info({ userId, candidate_id: candidate.id }, "background-check: initiated");

  return {
    mode: "live",
    invitation_url: invitation.invitation_url,
    candidate_id: candidate.id,
  };
}

// ── Webhook processing ────────────────────────────────────────────────────────

/**
 * Maps Checkr's report adjudication to our internal status.
 * "clear"     → "passed"   (cleared, no disqualifying records)
 * "consider"  → "failed"   (records found; Checkr flags for review)
 * suspended   → "failed"   (candidate suspended the check)
 * anything else → "pending" (report still running)
 */
function mapCheckrStatus(
  reportStatus: string,
  adjudication: string | null
): "pending" | "passed" | "failed" {
  if (reportStatus === "complete") {
    return adjudication === "clear" ? "passed" : "failed";
  }
  if (reportStatus === "suspended") return "failed";
  return "pending";
}

export interface CheckrWebhookPayload {
  type: string;
  data: {
    object: {
      id: string;            // report ID
      candidate_id: string;
      status: string;
      adjudication: string | null;
      package: string;
    };
  };
}

/**
 * Process a Checkr webhook event. Returns true if a user record was updated.
 */
export async function processCheckrWebhook(payload: CheckrWebhookPayload): Promise<boolean> {
  const { type, data } = payload;

  // Only care about report completion / adjudication change events
  if (!type.startsWith("report.")) return false;

  const { candidate_id, status, adjudication } = data.object;
  const ourStatus = mapCheckrStatus(status, adjudication);

  // Find the user by candidate ID
  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.background_check_id, candidate_id))
    .limit(1);

  if (!user) {
    logger.warn({ candidate_id, type }, "background-check: webhook for unknown candidate");
    return false;
  }

  await db
    .update(usersTable)
    .set({
      background_check_status: ourStatus,
      background_check_completed_at: ourStatus !== "pending" ? new Date() : undefined,
    })
    .where(eq(usersTable.id, user.id));

  logger.info(
    { user_id: user.id, candidate_id, checkr_status: status, adjudication, our_status: ourStatus },
    "background-check: status updated from webhook"
  );

  return true;
}

/**
 * Admin manual override — set background_check_status directly.
 * Used when Checkr isn't integrated yet, or for edge-case corrections.
 */
export async function adminOverrideBackgroundCheck(
  userId: number,
  status: "not_started" | "pending" | "passed" | "failed",
  adminId: number
): Promise<void> {
  await db
    .update(usersTable)
    .set({
      background_check_status: status,
      background_check_completed_at: status === "passed" || status === "failed" ? new Date() : undefined,
    })
    .where(eq(usersTable.id, userId));

  logger.info({ user_id: userId, status, override_by: adminId }, "background-check: admin override");
}
