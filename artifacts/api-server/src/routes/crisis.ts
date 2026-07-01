import { Router } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";

const router = Router();

const CRISIS_STATE_KEY = "crisis_state";

export interface CrisisState {
  active: boolean;
  message: string;
  level: "info" | "warning" | "critical";
  activatedAt?: string;
  resources?: Array<{ label: string; phone?: string; url?: string }>;
}

const DEFAULT_STATE: CrisisState = {
  active: false,
  message: "",
  level: "warning",
  resources: [],
};

// BUG FIX: crisisState used to be a plain in-memory module variable. Any
// deploy, crash, or Railway redeploy silently reset an active crisis broadcast
// to inactive with no warning, and it would desync across multiple server
// instances. system_settings already solves exactly this problem for the Nia
// killswitch (see its schema comment) — reusing the same key/value table here.
async function getCrisisState(): Promise<CrisisState> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, CRISIS_STATE_KEY))
      .limit(1);
    if (!row?.value) return DEFAULT_STATE;
    return JSON.parse(row.value) as CrisisState;
  } catch (err) {
    logger.error({ err }, "crisis: failed to read state, defaulting to inactive");
    return DEFAULT_STATE;
  }
}

async function setCrisisState(state: CrisisState): Promise<void> {
  const value = JSON.stringify(state);
  await db
    .insert(systemSettingsTable)
    .values({ key: CRISIS_STATE_KEY, value })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value, updated_at: new Date() },
    });
}

router.get("/crisis/status", async (_req, res) => {
  const crisisState = await getCrisisState();
  res.json(crisisState);
});

router.post("/crisis/activate", requireAuth, requireAdmin(), async (req, res) => {
  const { message, level, resources } = req.body as {
    message?: string;
    level?: string;
    resources?: CrisisState["resources"];
  };
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
    await setCrisisState(crisisState);
  } catch (err) {
    logger.error({ err }, "crisis: failed to persist activation");
    return res.status(500).json({ error: "Failed to activate crisis mode" });
  }
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.warn({ crisisState }, "crisis: mode activated");
  res.json(crisisState);
});

router.post("/crisis/deactivate", requireAuth, requireAdmin(), async (_req, res) => {
  const crisisState = DEFAULT_STATE;
  try {
    await setCrisisState(crisisState);
  } catch (err) {
    logger.error({ err }, "crisis: failed to persist deactivation");
    return res.status(500).json({ error: "Failed to deactivate crisis mode" });
  }
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.info("crisis: mode deactivated");
  res.json(crisisState);
});

export default router;
