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
  // Default resources are configurable via CRISIS_DEFAULT_RESOURCES (JSON
  // array) so a deployment outside Tarrant County/Fort Worth isn't
  // permanently hardcoded to the wrong emergency contacts. Falls back to
  // the original Fort Worth defaults if unset or malformed.
  // Validate that a parsed value is an array of { label, phone?, url? } objects —
  // the TypeScript cast alone does not check the runtime shape.
  function isValidResources(val: unknown): val is CrisisState["resources"] {
    return Array.isArray(val) && val.every(
      (r) => r !== null && typeof r === "object" && typeof (r as Record<string, unknown>).label === "string",
    );
  }
  const envDefaults = (() => {
    try {
      const raw = process.env["CRISIS_DEFAULT_RESOURCES"];
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isValidResources(parsed)) {
        logger.warn("crisis: CRISIS_DEFAULT_RESOURCES is not a valid resource array — ignoring");
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  })();
  const finalResources = resources ?? envDefaults ?? [
    { label: "Fort Worth Emergency Mgmt", phone: "817-392-6100" },
    { label: "Tarrant County 211", phone: "211" },
    { label: "Red Cross North TX", url: "https://www.redcross.org" },
  ];
  // Allow deployments outside Tarrant County / Fort Worth to set a custom
  // default message via CRISIS_DEFAULT_MESSAGE env var.
  const finalMessage = message ?? process.env["CRISIS_DEFAULT_MESSAGE"] ?? "⚠️ Emergency situation active in Tarrant County. Check nearby requests and stay safe.";
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
