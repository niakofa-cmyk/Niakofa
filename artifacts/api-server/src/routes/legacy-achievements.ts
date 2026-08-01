/**
 * Niakofa — Legacy Mode Achievements
 *
 * legacy_achievements existed as a real DB table (lib/db/src/schema/legacy-engine.ts)
 * but nothing ever wrote to it — the "Awards XP and updates achievement progress"
 * comment in legacy.ts's quest-complete handler was aspirational, not real, and
 * the frontend (legacy-achievements.tsx) was deriving achievement progress
 * client-side from generic /api/diaspora/dashboard counts. That's exactly the
 * "achievements are simulated" gap called out in the Legacy Mode design docs.
 *
 * This computes progress directly from source-of-truth tables at read time
 * (never incremented/decremented, so it can't drift) and upserts the result
 * into legacy_achievements so unlock state + unlocked_at persist.
 *
 * Routes:
 *   GET /api/legacy/achievements/:familyId — synced achievement list
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyPlacesTable,
  familyMemoryAssetsTable,
  legacyAchievementsTable,
  legacyChaptersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

interface AchievementDef {
  key: string;
  category: "vault_prompt" | "reconnection" | "gameplay" | "preservation";
  title: string;
  description: string;
  goal: number;
}

const CATALOG: AchievementDef[] = [
  {
    key: "story_keeper",
    category: "vault_prompt",
    title: "The Story Keeper",
    description: "Record 100 family memories in the vault.",
    goal: 100,
  },
  {
    key: "family_detective",
    category: "vault_prompt",
    title: "Family Detective",
    description: "Add 10 ancestors to your family tree.",
    goal: 10,
  },
  {
    key: "bridge_builder",
    category: "reconnection",
    title: "The Bridge Builder",
    description: "Reconnect 5 living relatives to this family on Niakofa.",
    goal: 5,
  },
  {
    key: "legacy_guardian",
    category: "vault_prompt",
    title: "Legacy Guardian",
    description: "Preserve 50 family photographs and documents.",
    goal: 50,
  },
  {
    key: "voice_of_elders",
    category: "preservation",
    title: "Voice of the Elders",
    description: "Publish 3 oral history interviews with family members.",
    goal: 3,
  },
  {
    key: "roots_traveler",
    category: "vault_prompt",
    title: "Roots Traveler",
    description: "Tag 10 family locations and landmarks.",
    goal: 10,
  },
  {
    key: "memory_restorer",
    category: "vault_prompt",
    title: "Memory Restorer",
    description: "Upload 25 historic family photographs.",
    goal: 25,
  },
  {
    key: "ancestor_walker",
    category: "gameplay",
    title: "Ancestor Walker",
    description: "Complete 5 Legacy Mode chapters.",
    goal: 5,
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

/** Computes real progress for every catalog entry from source tables. */
async function computeProgress(familyId: number): Promise<Record<string, number>> {
  const [
    [{ count: memoryCount }],
    [{ count: publishedInterviewCount }],
    [{ count: placeCount }],
    [{ count: connectedMemberCount }],
    [{ count: memberCount }],
    [{ count: completedChapterCount }],
    [{ count: assetCount }],
    [{ count: photoAssetCount }],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoriesTable)
      .where(eq(familyMemoriesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyInterviewsTable)
      .where(and(eq(familyInterviewsTable.family_id, familyId), eq(familyInterviewsTable.status, "published"))),
    db.select({ count: sql<number>`count(*)::int` }).from(familyPlacesTable)
      .where(eq(familyPlacesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        inArray(familyMembersTable.status, ["active"]),
        sql`${familyMembersTable.user_id} is not null`,
      )),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMembersTable)
      .where(and(eq(familyMembersTable.family_id, familyId), inArray(familyMembersTable.status, ["active"]))),
    db.select({ count: sql<number>`count(*)::int` }).from(legacyChaptersTable)
      .where(and(eq(legacyChaptersTable.family_id, familyId), eq(legacyChaptersTable.status, "completed"))),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoryAssetsTable)
      .innerJoin(familyMemoriesTable, eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id))
      .where(eq(familyMemoriesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoryAssetsTable)
      .innerJoin(familyMemoriesTable, eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id))
      .where(and(eq(familyMemoriesTable.family_id, familyId), eq(familyMemoryAssetsTable.asset_type, "photo"))),
  ]);

  return {
    story_keeper: memoryCount,
    family_detective: memberCount,
    bridge_builder: connectedMemberCount,
    legacy_guardian: assetCount,
    voice_of_elders: publishedInterviewCount,
    roots_traveler: placeCount,
    memory_restorer: photoAssetCount,
    ancestor_walker: completedChapterCount,
  };
}

/** Recomputes and persists achievement state for a family. Never decrements
 *  progress from a lower snapshot and never re-locks an unlocked achievement —
 *  progress reflects the current real count, but unlock state is sticky. */
export async function syncAchievements(familyId: number) {
  const [progress, existingRows] = await Promise.all([
    computeProgress(familyId),
    db.select().from(legacyAchievementsTable).where(eq(legacyAchievementsTable.family_id, familyId)),
  ]);

  const existingByKey = new Map(existingRows.map(r => [r.achievement_key, r]));
  const results = [];

  for (const def of CATALOG) {
    const currentProgress = Math.min(progress[def.key] ?? 0, def.goal);
    const existing = existingByKey.get(def.key);
    const wasUnlocked = existing?.unlocked ?? false;
    const nowUnlocked = wasUnlocked || currentProgress >= def.goal;

    if (!existing) {
      const [inserted] = await db
        .insert(legacyAchievementsTable)
        .values({
          family_id: familyId,
          achievement_key: def.key,
          category: def.category,
          title: def.title,
          description: def.description,
          progress: currentProgress,
          goal: def.goal,
          unlocked: nowUnlocked,
          unlocked_at: nowUnlocked ? new Date() : null,
        })
        .returning();
      results.push(inserted);
      continue;
    }

    if (existing.progress !== currentProgress || existing.unlocked !== nowUnlocked) {
      const [updated] = await db
        .update(legacyAchievementsTable)
        .set({
          progress: currentProgress,
          unlocked: nowUnlocked,
          unlocked_at: nowUnlocked && !wasUnlocked ? new Date() : existing.unlocked_at,
          updated_at: new Date(),
        })
        .where(eq(legacyAchievementsTable.id, existing.id))
        .returning();
      results.push(updated);
    } else {
      results.push(existing);
    }
  }

  return results;
}

// GET /api/legacy/achievements/:familyId
router.get(
  "/legacy/achievements/:familyId",
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
      const achievements = await syncAchievements(familyId);
      return res.json({ achievements });
    } catch (err) {
      logger.error({ err, familyId }, "legacy: achievements sync failed");
      return res.status(500).json({ error: "Failed to load achievements" });
    }
  },
);

export default router;
