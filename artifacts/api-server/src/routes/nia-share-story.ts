/**
 * Dedicated share-story route — Phase 7c voice story crafting.
 * Proxies POST /api/nia/share-story → nia-service /share-story
 */
import { Router, type Request, type Response } from "express";
import { parseAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { niaEnabled } from "./admin-analytics";

const router = Router();

const getNiaUrl = () =>
  (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");

router.post("/nia/share-story", parseAuth, async (req: Request, res: Response) => {
  if (!niaEnabled) return res.status(503).json({ error: "Nia is temporarily unavailable." });
  const userId = req.authenticatedUserId;
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const body = req.body as Record<string, unknown>;
  const transcript = typeof body.transcript === "string" ? body.transcript.slice(0, 3000) : "";
  if (!transcript || transcript.length < 10) {
    return res.status(400).json({ error: "transcript is required" });
  }

  try {
    const upstream = await fetch(`${getNiaUrl()}/share-story`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
      body: JSON.stringify({
        transcript,
        userName: typeof body.userName === "string" ? body.userName.slice(0, 100) : "A neighbor",
        helperName: typeof body.helperName === "string" ? body.helperName.slice(0, 100) : null,
        category: typeof body.category === "string" ? body.category : "",
        userId,
      }),
    });
    if (!upstream.ok) return res.status(upstream.status).json({ error: "Failed to craft story" });
    return res.json(await upstream.json());
  } catch (err) {
    logger.error({ err }, "nia-share-story: upstream failed");
    return res.status(500).json({ error: "Failed to craft story" });
  }
});

export default router;
