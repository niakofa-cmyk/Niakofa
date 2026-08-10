/**
 * Niakofa — Phase 5: Living Character Evolution
 *
 * Tracks how each family member's game character evolves as new stories,
 * memories, interviews, and photos are added. Characters never remain static
 * — they gain new dialogue, journal entries, quests, and stats as the family
 * preserves more about them.
 *
 * This is the "Living Characters" system from the design docs:
 *   "Grandfather — Yesterday: 5 known stories. Today: 18 known stories.
 *    New dialogue, new journal, new photos, new voice, new chapter.
 *    Same person. Completely richer."
 *
 * Routes:
 *   GET  /api/legacy/character-evolution/:familyId            — all characters
 *   GET  /api/legacy/character-evolution/:familyId/:memberId   — single character
 *   POST /api/legacy/character-evolution/:familyId/snapshot    — record snapshot
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyTreeRelationsTable,
  familyMemoryPeopleTable,
  legacyCharacterEvolutionTable,
  familyKnowledgeVersionsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getConsentedMemberIds } from "../lib/legacy-consent";

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

// Compute character stats from vault data
function computeStats(data: {
  stories: number;
  memories: number;
  interviews: number;
  events: number;
  places: number;
  relations: number;
}) {
  return {
    knowledge: Math.min(100, (data.stories * 10) + (data.memories * 5)),
    relationships: Math.min(100, data.relations * 15 + data.events * 5),
    culturalWisdom: Math.min(100, data.interviews * 25),
    courage: Math.min(100, data.events * 10),
    reputation: Math.min(100, data.memories * 8),
    legacy: Math.min(100, data.places * 15 + data.stories * 5),
    faith: Math.min(100, data.interviews * 15 + data.stories * 5),
  };
}

// GET /api/legacy/character-evolution/:familyId
router.get(
  "/legacy/character-evolution/:familyId",
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
      const consentedIds = await getConsentedMemberIds(familyId);
      if (consentedIds.size === 0) return res.json({ characters: [] });

      const members = await db
        .select()
        .from(familyMembersTable)
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            eq(familyMembersTable.status, "active"),
            inArray(familyMembersTable.id, Array.from(consentedIds)),
          ),
        );

      const [memories, interviews, stories, events, places, relations] = await Promise.all([
        db.select().from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)),
        db.select().from(familyInterviewsTable).where(eq(familyInterviewsTable.family_id, familyId)),
        db.select().from(familyStoriesTable).where(eq(familyStoriesTable.family_id, familyId)),
        db.select().from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)),
        db.select().from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)),
        db.select().from(familyTreeRelationsTable).where(eq(familyTreeRelationsTable.family_id, familyId)),
      ]);

      // Query memory-people junction to link memories to members
      const familyMemoryIds = memories.map((m) => m.id);
      const memoryPeople = familyMemoryIds.length > 0
        ? await db
            .select({ memory_id: familyMemoryPeopleTable.memory_id, member_id: familyMemoryPeopleTable.member_id })
            .from(familyMemoryPeopleTable)
            .where(inArray(familyMemoryPeopleTable.memory_id, familyMemoryIds))
        : [];

      // Derive verified life dates from member records/events. The member
      // record is preferred when present because it is the canonical profile
      // value; events remain a backwards-compatible source for imported data.
      const birthYearByMember = new Map<number, number>();
      const deathYearByMember = new Map<number, number>();
      for (const ev of events) {
        if (ev.category === 'birth' && ev.member_id !== null && ev.event_date) {
          const year = new Date(ev.event_date).getFullYear();
          if (Number.isInteger(year)) birthYearByMember.set(ev.member_id, year);
        }
        if (ev.category === 'death' && ev.member_id !== null && ev.event_date) {
          const year = new Date(ev.event_date).getFullYear();
          if (Number.isInteger(year)) deathYearByMember.set(ev.member_id, year);
        }
      }

      // Get latest evolution snapshot for each member
      const evolutionSnapshots = await db
        .select()
        .from(legacyCharacterEvolutionTable)
        .where(eq(legacyCharacterEvolutionTable.family_id, familyId))
        .orderBy(desc(legacyCharacterEvolutionTable.created_at));

      const latestSnapshotByMember = new Map<number, typeof evolutionSnapshots[0]>();
      for (const snap of evolutionSnapshots) {
        if (!latestSnapshotByMember.has(snap.member_id)) {
          latestSnapshotByMember.set(snap.member_id, snap);
        }
      }

      const characters = members.map((member) => {
        const memberStories = stories.filter((s) => s.about_member_id === member.id);
        const memberMemories = memories.filter((m) => {
          // Memories are linked via family_memory_people junction, not a direct column
          return memoryPeople.some((mp) => mp.memory_id === m.id && mp.member_id === member.id);
        });
        const memberInterviews = interviews.filter((i) => i.subject_member_id === member.id);
        const memberEvents = events.filter((e) => e.member_id === member.id);
        // Places are linked via events (place_id), not a direct member_id
        const memberPlaceIds = new Set<number>();
        for (const ev of memberEvents) {
          if (ev.place_id !== null) memberPlaceIds.add(ev.place_id);
        }
        const memberPlaces = places.filter((p) => memberPlaceIds.has(p.id));
        const memberRelations = relations.filter(
          (r) => r.from_member_id === member.id || r.to_member_id === member.id,
        );

        const stats = computeStats({
          stories: memberStories.length,
          memories: memberMemories.length,
          interviews: memberInterviews.length,
          events: memberEvents.length,
          places: memberPlaces.length,
          relations: memberRelations.length,
        });

        const latestSnapshot = latestSnapshotByMember.get(member.id);

        return {
          memberId: member.id,
          name: member.display_name,
          role: member.role,
          isLiving: member.is_living ?? true,
          birthYear: birthYearByMember.get(member.id) ?? null,
          deathYear: member.death_year ?? deathYearByMember.get(member.id) ?? null,
          stats,
          contentCounts: {
            stories: memberStories.length,
            memories: memberMemories.length,
            interviews: memberInterviews.length,
            events: memberEvents.length,
            places: memberPlaces.length,
            relations: memberRelations.length,
          },
          latestEvolution: latestSnapshot
            ? {
                summary: latestSnapshot.evolution_summary,
                newDialogue: latestSnapshot.new_dialogue_count,
                newJournal: latestSnapshot.new_journal_count,
                newQuests: latestSnapshot.new_quest_count,
                newMemories: latestSnapshot.new_memory_count,
                knowledgeVersionId: latestSnapshot.knowledge_version_id,
                createdAt: latestSnapshot.created_at,
              }
            : null,
        };
      });

      // Sort by total content (most evolved first)
      characters.sort((a, b) => {
        const aTotal = a.contentCounts.stories + a.contentCounts.memories + a.contentCounts.interviews;
        const bTotal = b.contentCounts.stories + b.contentCounts.memories + b.contentCounts.interviews;
        return bTotal - aTotal;
      });

      return res.json({ characters });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-character-evolution: list failed");
      return res.status(500).json({ error: "Failed to load characters" });
    }
  },
);

// GET /api/legacy/character-evolution/:familyId/:memberId
router.get(
  "/legacy/character-evolution/:familyId/:memberId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const memberId = parseInt(String(req.params.memberId), 10);
    if (isNaN(familyId) || isNaN(memberId)) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      // Get evolution history for this character
      const evolution = await db
        .select()
        .from(legacyCharacterEvolutionTable)
        .where(
          and(
            eq(legacyCharacterEvolutionTable.family_id, familyId),
            eq(legacyCharacterEvolutionTable.member_id, memberId),
          ),
        )
        .orderBy(desc(legacyCharacterEvolutionTable.created_at));

      return res.json({ evolution });
    } catch (err) {
      logger.error({ err, familyId, memberId }, "legacy-character-evolution: detail failed");
      return res.status(500).json({ error: "Failed to load character evolution" });
    }
  },
);

// POST /api/legacy/character-evolution/:familyId/snapshot
router.post(
  "/legacy/character-evolution/:familyId/snapshot",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const { memberId, stats, summary, newDialogue, newJournal, newQuests, newMemories } = req.body as {
      memberId: number;
      stats?: Record<string, unknown>;
      summary?: string;
      newDialogue?: number;
      newJournal?: number;
      newQuests?: number;
      newMemories?: number;
    };

    if (!memberId) return res.status(400).json({ error: "memberId is required" });

    // Verify the memberId belongs to this family (prevent cross-family snapshot injection)
    const [member] = await db
      .select({ id: familyMembersTable.id })
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.id, memberId), eq(familyMembersTable.family_id, familyId)))
      .limit(1);
    if (!member) return res.status(403).json({ error: "Member does not belong to this family" });

    try {
      const [latestVersion] = await db
        .select()
        .from(familyKnowledgeVersionsTable)
        .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
        .orderBy(desc(familyKnowledgeVersionsTable.version))
        .limit(1);

      const [created] = await db
        .insert(legacyCharacterEvolutionTable)
        .values({
          family_id: familyId,
          member_id: memberId,
          knowledge_version_id: latestVersion?.id ?? null,
          stats: stats ?? {},
          evolution_summary: summary ?? "Character updated",
          new_dialogue_count: newDialogue ?? 0,
          new_journal_count: newJournal ?? 0,
          new_quest_count: newQuests ?? 0,
          new_memory_count: newMemories ?? 0,
        })
        .returning();

      return res.json({ evolution: created });
    } catch (err) {
      logger.error({ err, familyId, memberId }, "legacy-character-evolution: snapshot failed");
      return res.status(500).json({ error: "Failed to record snapshot" });
    }
  },
);

export default router;
