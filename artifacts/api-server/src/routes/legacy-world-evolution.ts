/**
 * Niakofa — Phase 5: World Evolution Log (Living Family Universe)
 *
 * Tracks every change to the family world — new members, memories, stories,
 * interviews, places, events, relations, and full world regenerations. This
 * makes the "world regenerates" loop visible to families so they can see how
 * their game world has grown over time.
 *
 * Also provides a world-evolution summary: total changes, latest version,
 * and a timeline of significant events.
 *
 * Routes:
 *   GET   /api/legacy/world-evolution/:familyId       — evolution log + summary
 *   POST  /api/legacy/world-evolution/:familyId/log   — record a change
 *   GET   /api/legacy/world-evolution/:familyId/summary — summary stats
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyStoriesTable,
  familyInterviewsTable,
  familyPlacesTable,
  familyEventsTable,
  familyTreeRelationsTable,
  familyKnowledgeVersionsTable,
  legacyWorldEvolutionLogTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

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

// GET /api/legacy/world-evolution/:familyId
router.get(
  "/legacy/world-evolution/:familyId",
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
      const [logEntries, knowledgeVersions] = await Promise.all([
        db
          .select()
          .from(legacyWorldEvolutionLogTable)
          .where(eq(legacyWorldEvolutionLogTable.family_id, familyId))
          .orderBy(desc(legacyWorldEvolutionLogTable.created_at))
          .limit(100),
        db
          .select()
          .from(familyKnowledgeVersionsTable)
          .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
          .orderBy(desc(familyKnowledgeVersionsTable.version))
          .limit(5),
      ]);

      const latestVersion = knowledgeVersions[0] ?? null;
      const totalChanges = logEntries.length;
      const changesByType: Record<string, number> = {};
      for (const entry of logEntries) {
        changesByType[entry.change_type] = (changesByType[entry.change_type] ?? 0) + 1;
      }

      return res.json({
        log: logEntries,
        summary: {
          totalChanges,
          changesByType,
          latestVersion: latestVersion ? {
            version: latestVersion.version,
            fingerprint: latestVersion.fingerprint,
            createdAt: latestVersion.created_at,
          } : null,
          recentVersions: knowledgeVersions.map((v) => ({
            version: v.version,
            createdAt: v.created_at,
          })),
        },
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-world-evolution: read failed");
      return res.status(500).json({ error: "Failed to load world evolution" });
    }
  },
);

// GET /api/legacy/world-evolution/:familyId/summary
router.get(
  "/legacy/world-evolution/:familyId/summary",
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
      const [
        [{ count: memberCount }],
        [{ count: memoryCount }],
        [{ count: storyCount }],
        [{ count: interviewCount }],
        [{ count: placeCount }],
        [{ count: eventCount }],
        [{ count: relationCount }],
        [{ count: evolutionCount }],
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(familyMembersTable).where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active"))),
        db.select({ count: sql<number>`count(*)::int` }).from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(familyStoriesTable).where(eq(familyStoriesTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(familyInterviewsTable).where(eq(familyInterviewsTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(familyTreeRelationsTable).where(eq(familyTreeRelationsTable.family_id, familyId)),
        db.select({ count: sql<number>`count(*)::int` }).from(legacyWorldEvolutionLogTable).where(eq(legacyWorldEvolutionLogTable.family_id, familyId)),
      ]);

      const [latestVersion] = await db
        .select()
        .from(familyKnowledgeVersionsTable)
        .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
        .orderBy(desc(familyKnowledgeVersionsTable.version))
        .limit(1);

      return res.json({
        vaultStats: {
          members: memberCount,
          memories: memoryCount,
          stories: storyCount,
          interviews: interviewCount,
          places: placeCount,
          events: eventCount,
          relations: relationCount,
        },
        evolutionCount,
        latestVersion: latestVersion ? {
          version: latestVersion.version,
          fingerprint: latestVersion.fingerprint,
          createdAt: latestVersion.created_at,
        } : null,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-world-evolution: summary failed");
      return res.status(500).json({ error: "Failed to load world summary" });
    }
  },
);

// POST /api/legacy/world-evolution/:familyId/log
router.post(
  "/legacy/world-evolution/:familyId/log",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const { changeType, description, affectedCount, knowledgeVersionId } = req.body ?? {};

    if (!changeType || !["member_added", "memory_added", "story_added", "interview_added", "place_added", "event_added", "relation_added", "world_regenerated"].includes(changeType)) {
      return res.status(400).json({ error: "Valid changeType is required" });
    }

    try {
      const [entry] = await db
        .insert(legacyWorldEvolutionLogTable)
        .values({
          family_id: familyId,
          knowledge_version_id: knowledgeVersionId ?? null,
          change_type: changeType,
          change_description: description ?? null,
          affected_count: typeof affectedCount === "number" ? affectedCount : 1,
        })
        .returning();

      return res.status(201).json({ entry });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-world-evolution: log failed");
      return res.status(500).json({ error: "Failed to record change" });
    }
  },
);

export default router;
