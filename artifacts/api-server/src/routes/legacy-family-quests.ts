/**
 * Niakofa — Legacy Mode: Family Quests (cooperative missions)
 *
 * "Family Quests" mode in legacy-home.tsx previously just re-rendered the
 * exact same single-player "Active Quest" card shown in Legacy Mode — an
 * AI-generated quest for the one active session, not anything cooperative.
 * That's the "Family Quests mode needs to become real" gap called out in
 * the Legacy Mode design docs: selecting the mode changed the label, not
 * the experience.
 *
 * This gives Family Quests its own real, cooperative content: a small set
 * of family-wide missions, each tied to a genuinely different vault table,
 * with progress computed live from real rows (same "derive from real data,
 * no fabricated numbers" approach legacy-reunion.ts already established —
 * see that file's comment for why a live-derived slice, not a full
 * persisted-challenge schema, is the honest scope for this pass).
 *
 * Quests:
 *   - "Memory Keepers"   — family_memories added, attributed via author_id
 *   - "Keeper of Stories"— family_stories recorded, attributed via teller_member_id
 *   - "Roots Mapped"     — family_places with real coordinates added (no
 *                          per-member attribution field exists on this table,
 *                          so this one is family-wide progress only, no
 *                          leaderboard — reported honestly as such)
 *
 * Routes:
 *   GET /api/legacy/family-quests/:familyId — real cooperative quest progress
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyStoriesTable,
  familyPlacesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, sql, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const MEMORY_GOAL = 15;
const STORY_GOAL = 5;
const PLACES_GOAL = 5;

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

// GET /api/legacy/family-quests/:familyId
router.get(
  "/legacy/family-quests/:familyId",
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
      // ── Memory Keepers: family_memories, attributed via author_id -> users.id
      //    -> family_members.user_id, scoped to this family only. ──────────────
      const memoryRows = await db
        .select({
          memberId: familyMembersTable.id,
          name:     familyMembersTable.display_name,
          count:    sql<number>`count(${familyMemoriesTable.id})::int`,
        })
        .from(familyMembersTable)
        .leftJoin(
          familyMemoriesTable,
          and(
            eq(familyMemoriesTable.author_id, familyMembersTable.user_id),
            eq(familyMemoriesTable.family_id, familyId),
          ),
        )
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            inArray(familyMembersTable.status, ["active"]),
          ),
        )
        .groupBy(familyMembersTable.id, familyMembersTable.display_name)
        .orderBy(sql`count(${familyMemoriesTable.id}) desc`);

      const memoryLeaderboard = memoryRows
        .filter((r) => r.count > 0)
        .slice(0, 10)
        .map((r) => ({ memberId: r.memberId, name: r.name, count: r.count }));
      const memoryProgress = memoryRows.reduce((sum, r) => sum + r.count, 0);

      // ── Keeper of Stories: family_stories, attributed via teller_member_id ──
      const storyRows = await db
        .select({
          memberId: familyMembersTable.id,
          name:     familyMembersTable.display_name,
          count:    sql<number>`count(${familyStoriesTable.id})::int`,
        })
        .from(familyMembersTable)
        .leftJoin(
          familyStoriesTable,
          and(
            eq(familyStoriesTable.teller_member_id, familyMembersTable.id),
            eq(familyStoriesTable.family_id, familyId),
          ),
        )
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            inArray(familyMembersTable.status, ["active"]),
          ),
        )
        .groupBy(familyMembersTable.id, familyMembersTable.display_name)
        .orderBy(sql`count(${familyStoriesTable.id}) desc`);

      const storyLeaderboard = storyRows
        .filter((r) => r.count > 0)
        .slice(0, 10)
        .map((r) => ({ memberId: r.memberId, name: r.name, count: r.count }));
      const storyProgress = storyRows.reduce((sum, r) => sum + r.count, 0);

      // ── Roots Mapped: family_places with real coordinates. No author/
      //    contributor column exists on this table, so this is a family-wide
      //    aggregate only — reported honestly with leaderboard: null rather
      //    than fabricating per-member attribution that doesn't exist. ──────
      const [{ placesWithCoords }] = await db
        .select({ placesWithCoords: sql<number>`count(*)::int` })
        .from(familyPlacesTable)
        .where(
          and(
            eq(familyPlacesTable.family_id, familyId),
            isNotNull(familyPlacesTable.lat),
            isNotNull(familyPlacesTable.lng),
          ),
        );

      return res.json({
        quests: [
          {
            key: "memory_keepers",
            title: "Memory Keepers",
            description: "Add photos, letters, and preserved memories to the Family Vault — together.",
            goal: MEMORY_GOAL,
            progress: Math.min(memoryProgress, MEMORY_GOAL),
            reward: "The Family Album chapter",
            completed: memoryProgress >= MEMORY_GOAL,
            leaderboard: memoryLeaderboard,
          },
          {
            key: "keeper_of_stories",
            title: "Keeper of Stories",
            description: "Record family stories — oral history, traditions, recipes, proverbs.",
            goal: STORY_GOAL,
            progress: Math.min(storyProgress, STORY_GOAL),
            reward: "A new Story Chapter",
            completed: storyProgress >= STORY_GOAL,
            leaderboard: storyLeaderboard,
          },
          {
            key: "roots_mapped",
            title: "Roots Mapped",
            description: "Add real locations — villages, homes, schools, landmarks — to the Family World Map.",
            goal: PLACES_GOAL,
            progress: Math.min(Number(placesWithCoords ?? 0), PLACES_GOAL),
            reward: "Full migration route on the World Map",
            completed: Number(placesWithCoords ?? 0) >= PLACES_GOAL,
            leaderboard: null, // no per-member attribution field on family_places
          },
        ],
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-family-quests: failed to compute quest progress");
      return res.status(500).json({ error: "Failed to load family quests" });
    }
  },
);

export default router;
