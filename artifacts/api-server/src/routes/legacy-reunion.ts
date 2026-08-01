/**
 * Niakofa — Legacy Mode Reunion Challenge
 *
 * legacy-home.tsx's Reunion Mode panel rendered a "Family Reunion Challenge"
 * leaderboard, but every number in it was fabricated client-side:
 *   {(5 - i) * 400 + 200} XP
 * — literally derived from the member's position in the array, not from
 * anything the family actually did. That's exactly the "multiplayer is
 * currently not multiplayer" / "leaderboard derived from the family member
 * list" gap called out in the Legacy Mode design docs.
 *
 * This is a first real slice of that gap: a single family-wide challenge
 * ("record one elder's story each") with progress and a leaderboard computed
 * directly from real family_interviews rows (status = "published", the same
 * bar legacy-achievements.ts's "Voice of the Elders" achievement uses), no
 * fabricated numbers. It does not yet build the full "multiple concurrent
 * challenges with persisted rewards" infrastructure the design docs describe
 * (legacy_reunion_challenges / contributions would need their own schema and
 * design pass) — that remains a real, larger Phase 4 gap. This endpoint
 * replaces the fake data with real data for the one challenge already shown
 * in the UI.
 *
 * Routes:
 *   GET /api/legacy/reunion/:familyId — real challenge progress + leaderboard
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyInterviewsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// The one challenge currently surfaced in legacy-home.tsx's Reunion panel.
// Goal/reward text match what was previously hardcoded in the frontend, now
// served from the backend alongside real progress instead of being baked
// into the component.
const REUNION_GOAL = 5;
const REUNION_REWARD = "The Family Migration Story";

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

// GET /api/legacy/reunion/:familyId
router.get(
  "/legacy/reunion/:familyId",
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
      // Real leaderboard: published interviews grouped by the family member
      // who recorded them (interviewer_id -> family_members.user_id, scoped
      // to this family so a member's contributions to a *different* family
      // never leak in).
      const rows = await db
        .select({
          memberId:   familyMembersTable.id,
          name:       familyMembersTable.display_name,
          count:      sql<number>`count(${familyInterviewsTable.id})::int`,
        })
        .from(familyMembersTable)
        .leftJoin(
          familyInterviewsTable,
          and(
            eq(familyInterviewsTable.interviewer_id, familyMembersTable.user_id),
            eq(familyInterviewsTable.family_id, familyId),
            eq(familyInterviewsTable.status, "published"),
          ),
        )
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            inArray(familyMembersTable.status, ["active"]),
          ),
        )
        .groupBy(familyMembersTable.id, familyMembersTable.display_name)
        .orderBy(sql`count(${familyInterviewsTable.id}) desc`);

      const leaderboard = rows
        .filter((r) => r.count > 0)
        .slice(0, 10)
        .map((r) => ({ memberId: r.memberId, name: r.name, publishedInterviews: r.count }));

      const progress = rows.reduce((sum, r) => sum + r.count, 0);

      return res.json({
        challenge: {
          title: "Family Reunion Event",
          description: "Everyone must record one elder's story.",
          goal: REUNION_GOAL,
          progress: Math.min(progress, REUNION_GOAL),
          reward: REUNION_REWARD,
          completed: progress >= REUNION_GOAL,
        },
        leaderboard,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-reunion: failed to compute challenge state");
      return res.status(500).json({ error: "Failed to load reunion challenge" });
    }
  },
);

export default router;
