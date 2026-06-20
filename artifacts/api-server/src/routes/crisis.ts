import { Router } from "express";
import { db, crisisStateTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
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

const DEFAULT_STATE: CrisisState = { active: false, message: "", level: "warning", resources: [] };

async function getCurrentCrisisState(): Promise<CrisisState> {
  const [row] = await db.select().from(crisisStateTable).orderBy(desc(crisisStateTable.created_at)).limit(1);
  if (!row) return DEFAULT_STATE;
  return {
    active: row.active,
    message: row.message,
    level: row.level as CrisisState["level"],
    activatedAt: row.created_at.toISOString(),
    resources: row.resources ? JSON.parse(row.resources) : [],
  };
}

router.get("/crisis/status", async (_req, res) => {
  try {
    res.json(await getCurrentCrisisState());
  } catch (err) {
    logger.error({ err }, "crisis/status: DB read failed");
    res.json(DEFAULT_STATE);
  }
});

router.post("/crisis/activate", requireAuth, requireAdmin(), async (req, res) => {
  const { message, level, resources } = req.body as {
    message?: string;
    level?: string;
    resources?: CrisisState["resources"];
  };
  const finalResources = resources ?? [
    { label: "Fort Worth Emergency Mgmt", phone: "817-392-6100" },
    { label: "Tarrant County 211", phone: "211" },
    { label: "Red Cross North TX", url: "https://www.redcross.org" },
  ];
  const finalMessage = message ?? "⚠️ Emergency situation active in Tarrant County. Check nearby requests and stay safe.";
  const finalLevel = (level as CrisisState["level"]) ?? "warning";

  const [row] = await db.insert(crisisStateTable).values({
    active: true,
    message: finalMessage,
    level: finalLevel,
    resources: JSON.stringify(finalResources),
    activated_by: req.authenticatedUserId ? String(req.authenticatedUserId) : null,
  }).returning();

  const state: CrisisState = {
    active: true,
    message: finalMessage,
    level: finalLevel,
    activatedAt: row.created_at.toISOString(),
    resources: finalResources,
  };

  broadcast({ type: "crisis_update", payload: state });
  logger.warn({ state }, "crisis: mode activated");
  res.json(state);
});

router.post("/crisis/deactivate", requireAuth, requireAdmin(), async (req, res) => {
  await db.insert(crisisStateTable).values({
    active: false,
    message: "",
    level: "warning",
    resources: JSON.stringify([]),
    activated_by: req.authenticatedUserId ? String(req.authenticatedUserId) : null,
  });

  broadcast({ type: "crisis_update", payload: DEFAULT_STATE });
  logger.info("crisis: mode deactivated");
  res.json(DEFAULT_STATE);
});

export default router;
