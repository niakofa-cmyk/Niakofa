import { Router } from "express";
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

let crisisState: CrisisState = {
  active: false,
  message: "",
  level: "warning",
  resources: [],
};

router.get("/crisis/status", (_req, res) => {
  res.json(crisisState);
});

router.post("/crisis/activate", requireAuth, requireAdmin(), (req, res) => {
  const { message, level, resources } = req.body as {
    message?: string;
    level?: string;
    resources?: CrisisState["resources"];
  };
  crisisState = {
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
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.warn({ crisisState }, "crisis: mode activated");
  res.json(crisisState);
});

router.post("/crisis/deactivate", requireAuth, requireAdmin(), (_req, res) => {
  crisisState = { active: false, message: "", level: "warning", resources: [] };
  broadcast({ type: "crisis_update", payload: crisisState });
  logger.info("crisis: mode deactivated");
  res.json(crisisState);
});

export default router;
