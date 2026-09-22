import { Router } from "express";
import { db, crisisStateTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";

const router = Router();

export interface CrisisState {
  active: boolean;
  message: string;
  level: "info" | "warning" | "critical";
  activatedAt?: string;
  resources?: Array<{ label: string; phone?: string; url?: string }>;
}

const VALID_LEVELS: CrisisState["level"][] = ["info", "warning", "critical"];

const DEFAULT_STATE: CrisisState = {
  active: false,
  message: "",
  level: "warning",
  resources: [],
};

// BUG FIX: this route previously reused the generic `system_settings`
// key/value table for crisis state, even though a purpose-built
// `crisis_state` table (crisisStateTable) already existed in the schema —
// created in the initial migration specifically for this feature, with a
// DB-enforced check constraint on `level` and an append-only, one-row-per-
// change design for a real audit trail. That real table was never queried
// or inserted into by any route; this handler's own state silently drifted
// from it. Same drift pattern already caught and fixed for trust tiers
// (see CLAUDE.md Incident #21) — reusing the correct table instead of a
// second parallel implementation.
//
// Each activate/deactivate now inserts a new row (cheap, and gives a real
// history of past crisis windows for free) instead of upserting a single
// row and losing prior state. GET /crisis/status reads the most recent row.
async function getCrisisState(): Promise<CrisisState> {
  try {
    const [row] = await db
      .select()
      .from(crisisStateTable)
      .orderBy(desc(crisisStateTable.created_at))
      .limit(1);
    if (!row) return DEFAULT_STATE;
    return {
      active: row.active,
      message: row.message,
      level: row.level as CrisisState["level"],
      activatedAt: row.created_at.toISOString(),
      resources: row.resources ? (JSON.parse(row.resources) as CrisisState["resources"]) : [],
    };
  } catch (err) {
    logger.error({ err }, "crisis: failed to read state, defaulting to inactive");
    return DEFAULT_STATE;
  }
}

async function insertCrisisState(state: CrisisState, activatedBy: number): Promise<void> {
  await db.insert(crisisStateTable).values({
    active: state.active,
    message: state.message,
    level: state.level,
    resources: state.resources ? JSON.stringify(state.resources) : null,
    activated_by: String(activatedBy),
  });
}

router.get("/crisis/status", async (_req, res) => {
  const crisisState = await getCrisisState();
  return res.json(crisisState);
});

router.post("/crisis/activate", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { message, level, resources } = req.body as {
    message?: string;
    level?: string;
    resources?: CrisisState["resources"];
  };

  // BUG FIX: `level` was previously cast straight through with no validation
  // — a client could send any string, which the DB's own check constraint
  // would then reject with an opaque 500 (or, before this table was wired
  // up, would have silently written a bad value the frontend's hardcoded
  // info/warning/critical styling couldn't render). Validate explicitly up
  // front so a bad value gets a clear 400 instead.
  if (level !== undefined && !VALID_LEVELS.includes(level as CrisisState["level"])) {
    return res.status(400).json({ error: `level must be one of: ${VALID_LEVELS.join(", ")}` });
  }

  const crisisState: CrisisState = {
    active: true,
    message: message ?? "⚠️ Emergency situation active in your area. Check nearby requests and stay safe.",
    level: (level as CrisisState["level"]) ?? "warning",
    activatedAt: new Date().toISOString(),
    resources: resources ?? [
      { label: "Emergency Services (Police/Fire/Medical)", phone: "911" },
      { label: "United Way 211 (local resources)", phone: "211" },
      { label: "988 Suicide & Crisis Lifeline", phone: "988" },
      { label: "American Red Cross", url: "https://www.redcross.org" },
    ],
  };
  try {
    await insertCrisisState(crisisState, req.authenticatedUserId!);
  } catch (err) {
    logger.error({ err }, "crisis: failed to persist activation");
    return res.status(500).json({ error: "Failed to activate crisis mode" });
  }
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.warn({ crisisState }, "crisis: mode activated");
  return res.json(crisisState);
});

router.post("/crisis/deactivate", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const crisisState = DEFAULT_STATE;
  try {
    await insertCrisisState(crisisState, req.authenticatedUserId!);
  } catch (err) {
    logger.error({ err }, "crisis: failed to persist deactivation");
    return res.status(500).json({ error: "Failed to deactivate crisis mode" });
  }
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.info("crisis: mode deactivated");
  return res.json(crisisState);
});

export default router;
