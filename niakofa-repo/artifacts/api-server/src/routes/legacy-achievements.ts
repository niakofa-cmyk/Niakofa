import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyMemoryAssetsTable,
  familyTreeRelationsTable,
  legacyAchievementsTable,
  legacyChaptersTable,
  legacyPlaceDiscoveriesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
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
  { key: "memory_keeper", category: "vault_prompt", title: "Memory Keeper", description: "Preserve 5 family memories in the vault.", goal: 5 },
  { key: "family_detective", category: "vault_prompt", title: "Family Detective", description: "Connect 10 family relationships in the tree.", goal: 10 },
  { key: "bridge_builder", category: "reconnection", title: "Bridge Builder", description: "Connect 3 family members in the tree.", goal: 3 },
  { key: "roots_traveler", category: "gameplay", title: "Roots Traveler", description: "Visit 10 family landmarks in person and check in.", goal: 10 },
  { key: "legacy_guardian", category: "preservation", title: "Legacy Guardian", description: "Preserve 3 family artifacts (photos, documents).", goal: 3 },
  { key: "voice_of_elders", category: "preservation", title: "Voice of the Elders", description: "Publish 2 family interviews.", goal: 2 },
  { key: "memory_restorer", category: "vault_prompt", title: "Memory Restorer", description: "Upload 5 photos to family memories.", goal: 5 },
  { key: "ancestor_walker", category: "gameplay", title: "Ancestor Walker", description: "Complete 3 Legacy chapters.", goal: 3 },
];

async function computeProgress(familyId: number): Promise<Record<string, number>> {
  const [
    [{ count: memoryCount }],
    [{ count: publishedInterviewCount }],
    [{ count: discoveredPlaceCount }],
    [{ count: connectedMemberCount }],
    [{ count: completedChapterCount }],
    [{ count: assetCount }],
    [{ count: photoAssetCount }],
    [{ count: treeRelationCount }],
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyInterviewsTable).where(and(eq(familyInterviewsTable.family_id, familyId), eq(familyInterviewsTable.status, "published"))),
    db.select({ count: sql<number>`count(*)::int` }).from(legacyPlaceDiscoveriesTable).where(eq(legacyPlaceDiscoveriesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMembersTable).where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active"))),
    db.select({ count: sql<number>`count(*)::int` }).from(legacyChaptersTable).where(and(eq(legacyChaptersTable.family_id, familyId), eq(legacyChaptersTable.status, "completed"))),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoryAssetsTable).innerJoin(familyMemoriesTable, eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id)).where(eq(familyMemoriesTable.family_id, familyId)),
    db.select({ count: sql<number>`count(*)::int` }).from(familyMemoryAssetsTable).innerJoin(familyMemoriesTable, eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id)).where(and(eq(familyMemoriesTable.family_id, familyId), eq(familyMemoryAssetsTable.asset_type, "photo"))),
    db.select({ count: sql<number>`count(*)::int` }).from(familyTreeRelationsTable).where(eq(familyTreeRelationsTable.family_id, familyId)),
  ]);
  return {
    memory_keeper: memoryCount,
    family_detective: treeRelationCount,
    bridge_builder: connectedMemberCount,
    legacy_guardian: assetCount,
    voice_of_elders: publishedInterviewCount,
    roots_traveler: discoveredPlaceCount,
    memory_restorer: photoAssetCount,
    ancestor_walker: completedChapterCount,
  };
}

export async function syncAchievements(familyId: number): Promise<void> {
  const progress = await computeProgress(familyId);
  for (const def of CATALOG) {
    const current = progress[def.key] ?? 0;
    const unlocked = current >= def.goal;
    const [existing] = await db.select({ id: legacyAchievementsTable.id, unlocked: legacyAchievementsTable.unlocked, unlocked_at: legacyAchievementsTable.unlocked_at }).from(legacyAchievementsTable).where(and(eq(legacyAchievementsTable.family_id, familyId), eq(legacyAchievementsTable.achievement_key, def.key))).limit(1);
    if (existing) {
      // Only set unlocked_at the moment an achievement transitions from
      // locked -> unlocked. Once set, never clear it on subsequent syncs —
      // previously this always evaluated `!existing` inside the `if
      // (existing)` branch, which is always false, so unlocked_at was
      // silently wiped back to null on every single sync.
      const newlyUnlocked = unlocked && !existing.unlocked;
      await db.update(legacyAchievementsTable).set({
        progress: current,
        unlocked,
        unlocked_at: newlyUnlocked ? new Date() : existing.unlocked_at,
        updated_at: new Date(),
      }).where(eq(legacyAchievementsTable.id, existing.id));
    } else {
      await db.insert(legacyAchievementsTable).values({ family_id: familyId, achievement_key: def.key, category: def.category, title: def.title, description: def.description, progress: current, goal: def.goal, unlocked, unlocked_at: unlocked ? new Date() : null });
    }
  }
}

router.get("/legacy/achievements/:familyId", generalApiLimiter, requireAuth, async (req, res) => {
  const familyId = parseInt(String(req.params.familyId), 10);
  if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });
  try {
    await syncAchievements(familyId).catch((err) => logger.error({ err, familyId }, "legacy-achievements: sync failed during read"));
    const rows = await db.select().from(legacyAchievementsTable).where(eq(legacyAchievementsTable.family_id, familyId));
    return res.json({ achievements: rows });
  } catch (err) {
    logger.error({ err, familyId }, "legacy-achievements: read failed");
    return res.status(500).json({ error: "Failed to read achievements" });
  }
});

export default router;
