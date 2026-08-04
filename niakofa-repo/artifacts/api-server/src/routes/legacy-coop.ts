/**
 * Niakofa — Phase 5: Live Co-op Readiness
 *
 * Checks which family members are currently online (via WebSocket presence)
 * and whether enough are available to start a live co-op mission.
 * The design docs specify: "Needing 2 or more Family members to be online
 * at the same time for live co-op Game."
 *
 * Routes:
 *   GET /api/legacy/coop/:familyId/readiness — online members + co-op ready
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { isUserOnline } from "../lib/ws-hub";
import { logger } from "../lib/logger";

const router = Router();

const MIN_COOP_MEMBERS = 2;

async function isMember(userId: number, familyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);
  return !!row;
}

// GET /api/legacy/coop/:familyId/readiness
router.get(
  "/legacy/coop/:familyId/readiness",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const members = await db
        .select({
          id: familyMembersTable.id,
          userId: familyMembersTable.user_id,
          displayName: familyMembersTable.display_name,
          role: familyMembersTable.role,
          avatarUrl: usersTable.avatar_url,
        })
        .from(familyMembersTable)
        .leftJoin(usersTable, eq(familyMembersTable.user_id, usersTable.id))
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            inArray(familyMembersTable.status, ["active"]),
          ),
        );

      const onlineMembers = members
        .filter((m) => m.userId !== null && isUserOnline(m.userId))
        .map((m) => ({
          memberId: m.id,
          displayName: m.displayName,
          role: m.role,
          avatarUrl: m.avatarUrl ?? null,
        }));

      const coopReady = onlineMembers.length >= MIN_COOP_MEMBERS;

      return res.json({
        minRequired: MIN_COOP_MEMBERS,
        onlineCount: onlineMembers.length,
        totalMembers: members.length,
        coopReady,
        onlineMembers,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-coop: readiness check failed");
      return res.status(500).json({ error: "Failed to check co-op readiness" });
    }
  },
);

export default router;
