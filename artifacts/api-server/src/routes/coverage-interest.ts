/**
 * Coverage Interest — demand signal for counties without an active Community
 * Pool yet.
 *
 * When a requester posts outside coverage (request-new.tsx's "your area
 * doesn't have an active pool yet" banner), they can tap "Notify me when this
 * county activates" instead of just posting into the void. This captures that
 * interest so admins can see where to expand next — no pool machinery reads
 * this table yet, it's purely a demand signal.
 */
import { Router } from "express";
import { z } from "zod";
import { db, coverageInterestTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { generalApiLimiter, adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

const CoverageInterestBody = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  neighborhood: z.string().max(200).optional(),
  email: z.string().email().optional(),
});

// POST /coverage-interest — public (auth optional). If the caller is logged
// in, req.authenticatedUserId (set by the global parseAuth middleware) is
// captured automatically; anonymous callers may still supply an email.
router.post("/coverage-interest", generalApiLimiter, async (req, res) => {
  const parsed = CoverageInterestBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid coverage interest data", issues: parsed.error.issues });
  }

  const userId = req.authenticatedUserId ?? null;
  if (!userId && !parsed.data.email) {
    return res.status(400).json({ error: "Sign in or provide an email so we can notify you." });
  }

  const [row] = await db
    .insert(coverageInterestTable)
    .values({
      user_id: userId,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      neighborhood: parsed.data.neighborhood ?? null,
      email: parsed.data.email ?? null,
    })
    .returning({ id: coverageInterestTable.id });

  logger.info({ id: row?.id, userId, neighborhood: parsed.data.neighborhood }, "coverage-interest: captured");
  return res.status(201).json({ ok: true, id: row?.id });
});

// GET /admin/coverage-interest — admin-only view of aggregate demand, most
// recent first, so admins can see where to expand pool coverage next.
router.get("/admin/coverage-interest", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const rows = await db
    .select({
      id: coverageInterestTable.id,
      lat: coverageInterestTable.lat,
      lng: coverageInterestTable.lng,
      neighborhood: coverageInterestTable.neighborhood,
      email: coverageInterestTable.email,
      user_id: coverageInterestTable.user_id,
      created_at: coverageInterestTable.created_at,
      user_name: usersTable.name,
    })
    .from(coverageInterestTable)
    .leftJoin(usersTable, eq(usersTable.id, coverageInterestTable.user_id))
    .orderBy(desc(coverageInterestTable.created_at))
    .limit(500);

  return res.json({ interests: rows, total: rows.length });
});

export default router;
