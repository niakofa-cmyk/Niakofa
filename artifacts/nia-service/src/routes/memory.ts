/**
 * Nia Memory Routes
 *
 * GET  /memory/:userId  — returns user's full memory (narrative + structured)
 * DELETE /memory/:userId — clears user's memory entirely
 *
 * Both routes require a valid Bearer token, and the token's userId must
 * match the :userId param — users can only read/clear their own memory.
 * This mirrors the same ownership check pattern used in nia-proxy.ts on
 * the api-server side.
 *
 * nia-proxy.ts already proxies GET /api/nia/memory and
 * DELETE /api/nia/memory to these routes (strips /api/nia prefix,
 * adds userId from token). These routes are the nia-service implementation.
 */
import { Router, Request, Response } from "express";
import { getUserMemory, getStructuredMemory, upsertUserMemory, upsertStructuredMemory } from "../lib/db.js";
import { parseOptionalAuth } from "../lib/auth.js";
import { pino } from "pino";
import pg from "pg";

const logger = pino({ level: "info" });
const router = Router();

// Internal helper to delete memory rows directly
async function deleteUserMemory(pool: pg.Pool, userId: number): Promise<void> {
  await pool.query(`DELETE FROM nia_memories WHERE user_id = $1`, [userId]);
}

// GET /memory/:userId — read memory for a user
// Protected: Bearer token userId must match :userId
router.get("/memory/:userId", parseOptionalAuth, async (req: Request, res: Response) => {
  const paramId = parseInt(String(req.params.userId), 10);
  if (isNaN(paramId) || paramId <= 0) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const tokenUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  if (!tokenUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (tokenUserId !== paramId) {
    return res.status(403).json({ error: "You can only access your own memory" });
  }

  try {
    const [memory, structured] = await Promise.all([
      getUserMemory(paramId),
      getStructuredMemory(paramId),
    ]);
    return res.json({ memory, structured });
  } catch (err) {
    logger.error({ err, userId: paramId }, "nia-memory: GET failed");
    return res.status(500).json({ error: "Failed to retrieve memory" });
  }
});

// DELETE /memory/:userId — clear all memory for a user
router.delete("/memory/:userId", parseOptionalAuth, async (req: Request, res: Response) => {
  const paramId = parseInt(String(req.params.userId), 10);
  if (isNaN(paramId) || paramId <= 0) {
    return res.status(400).json({ error: "Invalid userId" });
  }

  const tokenUserId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  if (!tokenUserId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (tokenUserId !== paramId) {
    return res.status(403).json({ error: "You can only clear your own memory" });
  }

  try {
    // Import pool directly from db module
    const dbModule = await import("../lib/db.js");
    await dbModule.pool.query(`DELETE FROM nia_memories WHERE user_id = $1`, [paramId]);
    logger.info({ userId: paramId }, "nia-memory: cleared");
    return res.json({ cleared: true, userId: paramId });
  } catch (err) {
    logger.error({ err, userId: paramId }, "nia-memory: DELETE failed");
    return res.status(500).json({ error: "Failed to clear memory" });
  }
});

export default router;
