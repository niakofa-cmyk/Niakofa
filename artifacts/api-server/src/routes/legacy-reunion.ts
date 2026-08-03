/**
 * Niakofa — Legacy Mode Reunion Challenges
 *
 * Replaces the single hardcoded reunion challenge with a template-based
 * system that generates multiple real challenges from family vault data.
 * Each challenge tracks real progress from family_interviews, family_memories,
 * family_places, and family_members — no fabricated numbers.
 *
 * Routes:
 *   GET /api/legacy/reunion/:familyId — all active challenges + leaderboard
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyPlacesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Challenge templates ─────────────────────────────────────────────────────
// Each template defines how a challenge's progress is computed from real DB
// data. Templates are parameterized by family, not hardcoded to one shape.
interface ReunionTemplate {
  id: string;
  title: string;
  description: string;
  reward: string;
  goal: number;
  metric: "interviews" | "memories" | "places" | "members";
}

const TEMPLATES: ReunionTemplate[] = [
  {
    id: "elder_stories",
    title: "Family Reunion Event",
    description: "Everyone must record one elder's story.",
    reward: "The Family Migration Story",
    goal: 5,
    metric: "interviews",
  },
  {
    id: "memory_drive",
    title: "Memory Drive",
    description: "Collect family photos and stories together.",
    reward: "Family Heritage Collection",
    goal: 10,
    metric: "memories",
  },
  {
    id: "landmark_quest",
    title: "Landmark Quest",
    description: "Tag family landmarks and places of significance.",
    reward: "Family World Map Expansion",
    goal: 5,
    metric: "places",
  },
  {
    id: "family_circle",
    title: "Family Circle",
    description: "Invite and connect more family members.",
    reward: "Bridge Builder Achievement",
    goal: 5,
    metric: "members",
  },
];

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
      // Compute real counts for each metric in one pass
      const [
        [{ count: interviewCount }],
        [{ count: memoryCount }],
        [{ count: placeCount }],
        [{ count: memberCount }],
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` })
          .from(familyInterviewsTable)
          .where(and(eq(familyInterviewsTable.family_id, familyId), eq(familyInterviewsTable.status, "published"))),
        db.select({ count: sql<number>`count(*)::int` })
          .from(familyMemoriesTable)
          .where(and(eq(familyMemoriesTable.family_id, familyId), inArray(familyMemoriesTable.visibility, ["family", "branch"]))),
        db.select({ count: sql<number>`count(*)::int` })
          .from(familyPlacesTable)
          .where(eq(familyPlacesTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` })
          .from(familyMembersTable)
          .where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active"))),
      ]);

      const metricCounts: Record<ReunionTemplate["metric"], number> = {
        interviews: interviewCount,
        memories: memoryCount,
        places: placeCount,
        members: memberCount,
      };

      // Build challenges from templates with real progress
      const challenges = TEMPLATES.map((t) => {
        const progress = metricCounts[t.metric];
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          goal: t.goal,
          progress: Math.min(progress, t.goal),
          reward: t.reward,
          completed: progress >= t.goal,
          metric: t.metric,
        };
      });

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

      // Primary challenge (first template) for backwards compatibility with
      // legacy-home.tsx which reads challenge.goal / challenge.progress / etc.
      const primary = challenges[0];

      return res.json({
        challenge: primary,
        challenges,
        leaderboard,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-reunion: failed to compute challenge state");
      return res.status(500).json({ error: "Failed to load reunion challenges" });
    }
  },
);

export default router;
