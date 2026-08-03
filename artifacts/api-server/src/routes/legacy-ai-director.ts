/**
 * Niakofa — Phase 5: AI Game Director
 *
 * The AI Game Director wakes up each day, scans the family's knowledge graph,
 * and generates targeted missions that drive preservation. Instead of generic
 * "do this" prompts, the Director identifies what's actually missing in the
 * vault and creates missions to fill those gaps.
 *
 * This is the "AI Director" from the design docs:
 *   "Every morning the AI asks: What family information is missing?
 *    What chapter is incomplete? What photos are unidentified?
 *    What interviews are unfinished? Generate today's missions."
 *
 * Routes:
 *   GET  /api/legacy/ai-director/:familyId/missions   — get today's missions
 *   POST /api/legacy/ai-director/:familyId/generate    — generate new missions
 *   POST /api/legacy/ai-director/:missionId/complete   — mark mission done
 *   POST /api/legacy/ai-director/:missionId/skip       — skip a mission
 *   GET  /api/legacy/ai-director/:familyId/gaps        — vault gap analysis
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
  legacyAiDirectorMissionsTable,
  legacyMemoryMysteriesTable,
  familyKnowledgeVersionsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
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

// ── Vault Gap Analysis ───────────────────────────────────────────────────────
// Scans the family vault and identifies what's missing. This is the engine
// that powers the AI Director — it doesn't call an LLM, it uses real DB data
// to find concrete gaps.

interface VaultGap {
  type: string;
  description: string;
  severity: "high" | "medium" | "low";
  targetMemberId?: number;
  targetMemberName?: string;
  suggestedMission: string;
  missionType: "record_interview" | "identify_photo" | "add_ancestor" | "tag_location" | "add_event" | "upload_document" | "reconnect_relative" | "complete_chapter" | "preserve_tradition";
  rewardXp: number;
  rewardDescription: string;
}

async function analyzeVaultGaps(familyId: number): Promise<VaultGap[]> {
  const gaps: VaultGap[] = [];

  const consentedIds = await getConsentedMemberIds(familyId);
  if (consentedIds.size === 0) return gaps;

  const [members, memories, interviews, stories, places, events, relations] = await Promise.all([
    db.select().from(familyMembersTable).where(
      and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active")),
    ),
    db.select().from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)),
    db.select().from(familyInterviewsTable).where(eq(familyInterviewsTable.family_id, familyId)),
    db.select().from(familyStoriesTable).where(eq(familyStoriesTable.family_id, familyId)),
    db.select().from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)),
    db.select().from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)),
    db.select().from(familyTreeRelationsTable).where(eq(familyTreeRelationsTable.family_id, familyId)),
  ]);

  // Gap 1: Members without any stories or memories
  // Memories are linked to members via the family_memory_people junction,
  // not a direct about_member_id column.
  const familyMemoryIds = memories.map((m) => m.id);
  const memoryPeople = familyMemoryIds.length > 0
    ? await db
        .select({ memory_id: familyMemoryPeopleTable.memory_id, member_id: familyMemoryPeopleTable.member_id })
        .from(familyMemoryPeopleTable)
        .where(inArray(familyMemoryPeopleTable.memory_id, familyMemoryIds))
    : [];
  const memoriesByMember = new Map<number, number>();
  for (const mp of memoryPeople) {
    if (mp.member_id !== null) {
      memoriesByMember.set(mp.member_id, (memoriesByMember.get(mp.member_id) ?? 0) + 1);
    }
  }

  for (const member of members) {
    if (!consentCheck(consentedIds, member.id)) continue;
    const memberMemoryCount = memoriesByMember.get(member.id) ?? 0;
    const memberStories = stories.filter((s) => s.about_member_id === member.id);
    if (memberMemoryCount === 0 && memberStories.length === 0) {
      gaps.push({
        type: "missing_stories",
        description: `${member.display_name} has no recorded stories or memories yet.`,
        severity: "high",
        targetMemberId: member.id,
        targetMemberName: member.display_name,
        suggestedMission: `Record a story or memory about ${member.display_name}`,
        missionType: "record_interview",
        rewardXp: 75,
        rewardDescription: `Unlock a new chapter about ${member.display_name}'s life`,
      });
    }
  }

  // Gap 2: Members without interviews (living members only)
  for (const member of members) {
    if (member.is_living === false) continue;
    if (!consentCheck(consentedIds, member.id)) continue;
    const memberInterviews = interviews.filter((i) => i.subject_member_id === member.id);
    if (memberInterviews.length === 0) {
      gaps.push({
        type: "missing_interview",
        description: `${member.display_name} hasn't been interviewed yet.`,
        severity: "medium",
        targetMemberId: member.id,
        targetMemberName: member.display_name,
        suggestedMission: `Record an oral history interview with ${member.display_name}`,
        missionType: "record_interview",
        rewardXp: 100,
        rewardDescription: "Voice of the Elders achievement progress",
      });
    }
  }

  // Gap 3: Members without birth/death dates
  // family_members has no birth_year column — derive from events.
  const birthEvents = events.filter((e) => e.category === 'birth' && e.member_id !== null);
  const birthYearByMember = new Map<number, number>();
  for (const ev of birthEvents) {
    if (ev.member_id !== null && ev.event_date) {
      birthYearByMember.set(ev.member_id, new Date(ev.event_date).getFullYear());
    }
  }

  for (const member of members) {
    if (!consentCheck(consentedIds, member.id)) continue;
    if (!birthYearByMember.has(member.id)) {
      gaps.push({
        type: "missing_birth_date",
        description: `${member.display_name}'s birth date is unknown.`,
        severity: "low",
        targetMemberId: member.id,
        targetMemberName: member.display_name,
        suggestedMission: `Find ${member.display_name}'s birth date — ask a relative or find a document`,
        missionType: "add_event",
        rewardXp: 25,
        rewardDescription: "Timeline accuracy improvement",
      });
    }
  }

  // Gap 4: Members without locations
  // Places are linked to members via events (place_id), not a direct member_id.
  const memberPlaceIds = new Map<number, Set<number>>();
  for (const ev of events) {
    if (ev.member_id !== null && ev.place_id !== null) {
      const set = memberPlaceIds.get(ev.member_id) ?? new Set<number>();
      set.add(ev.place_id);
      memberPlaceIds.set(ev.member_id, set);
    }
  }

  for (const member of members) {
    if (!consentCheck(consentedIds, member.id)) continue;
    const memberPlaceCount = memberPlaceIds.get(member.id)?.size ?? 0;
    if (memberPlaceCount === 0) {
      gaps.push({
        type: "missing_location",
        description: `No locations tagged for ${member.display_name}.`,
        severity: "medium",
        targetMemberId: member.id,
        targetMemberName: member.display_name,
        suggestedMission: `Tag a location connected to ${member.display_name} — a home, school, or workplace`,
        missionType: "tag_location",
        rewardXp: 50,
        rewardDescription: "New map location unlocked",
      });
    }
  }

  // Gap 5: Memories without people tagged
  // Reuse memoryPeople from Gap 1 (already queried with full family scope).
  const taggedMemoryIds = new Set(memoryPeople.map((mp) => mp.memory_id));
  const untagged = memories.filter((m) => !taggedMemoryIds.has(m.id));
  if (untagged.length > 0) {
    gaps.push({
      type: "unidentified_people",
      description: `${untagged.length} ${untagged.length === 1 ? "memory has" : "memories have"} no people tagged. Who are they about?`,
      severity: "medium",
      suggestedMission: `Identify people in ${untagged.length === 1 ? "this memory" : "these memories"} — who are they about?`,
      missionType: "identify_photo",
      rewardXp: 40,
      rewardDescription: "Family connections strengthened",
    });
  }

  // Gap 6: Tree with fewer than 3 generations
  if (members.length >= 3 && relations.length < members.length) {
    gaps.push({
      type: "incomplete_tree",
      description: `Your family tree has ${members.length} members but only ${relations.length} connections. Some relationships are missing.`,
      severity: "medium",
      suggestedMission: "Add parent or spouse connections to complete your family tree",
      missionType: "add_ancestor",
      rewardXp: 60,
      rewardDescription: "Family Detective achievement progress",
    });
  }

  // Gap 7: No places at all
  if (places.length === 0) {
    gaps.push({
      type: "no_places",
      description: "Your family world map is empty. Tag your first family landmark.",
      severity: "high",
      suggestedMission: "Tag your first family landmark — a home, church, school, or cemetery",
      missionType: "tag_location",
      rewardXp: 75,
      rewardDescription: "World Map unlocked",
    });
  }

  // Gap 8: Members without events — check ALL consented members, not just
  // the first 5, so every ancestor with a gap can generate a mission.
  for (const member of members) {
    if (!consentCheck(consentedIds, member.id)) continue;
    const memberEvents = events.filter((e) => e.member_id === member.id);
    if (memberEvents.length === 0) {
      gaps.push({
        type: "missing_events",
        description: `${member.display_name} has no life events recorded.`,
        severity: "low",
        targetMemberId: member.id,
        targetMemberName: member.display_name,
        suggestedMission: `Add a life event for ${member.display_name} — birth, graduation, marriage, or migration`,
        missionType: "add_event",
        rewardXp: 30,
        rewardDescription: "Timeline enrichment",
      });
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return gaps;
}

function consentCheck(consentedIds: Set<number>, memberId: number): boolean {
  return consentedIds.has(memberId);
}

// GET /api/legacy/ai-director/:familyId/missions
router.get(
  "/legacy/ai-director/:familyId/missions",
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
      // Get today's missions
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let missions = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(
          and(
            eq(legacyAiDirectorMissionsTable.family_id, familyId),
            eq(legacyAiDirectorMissionsTable.status, "active"),
            sql`${legacyAiDirectorMissionsTable.generated_at} >= ${today}`,
          ),
        )
        .orderBy(desc(legacyAiDirectorMissionsTable.generated_at))
        .limit(10);

      // AUTO-GENERATE: If no missions exist for today, the AI Director "wakes up"
      // and generates them automatically. This makes the AI Director feel alive —
      // every morning it scans the vault, finds gaps, and creates missions without
      // the user having to press a button. This is the "every morning the AI asks"
      // behavior from the design document.
      if (missions.length === 0) {
        const gaps = await analyzeVaultGaps(familyId);

        const [latestVersion] = await db
          .select()
          .from(familyKnowledgeVersionsTable)
          .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
          .orderBy(desc(familyKnowledgeVersionsTable.version))
          .limit(1);

        const topGaps = gaps.slice(0, 5);
        const missionsToCreate = topGaps.map((gap) => ({
          family_id: familyId,
          mission_type: gap.missionType,
          status: "active" as const,
          title: gap.suggestedMission,
          description: gap.description,
          gap_description: gap.description,
          target_member_id: gap.targetMemberId ?? null,
          target_vault_item: null,
          reward_xp: gap.rewardXp,
          reward_description: gap.rewardDescription,
          knowledge_version_id: latestVersion?.id ?? null,
          generated_at: new Date(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        }));

        if (missionsToCreate.length > 0) {
          const inserted = await db
            .insert(legacyAiDirectorMissionsTable)
            .values(missionsToCreate)
            .returning();
          missions = inserted;

          // Also create Memory Mysteries for unidentified content
          const mysteryGaps = gaps.filter((g) => g.type === "unidentified_people" || g.type === "missing_stories");
          for (const gap of mysteryGaps.slice(0, 3)) {
            const mysteryType = gap.type === "unidentified_people" ? "unknown_person" : "missing_interview";
            const existingMystery = await db
              .select()
              .from(legacyMemoryMysteriesTable)
              .where(
                and(
                  eq(legacyMemoryMysteriesTable.family_id, familyId),
                  eq(legacyMemoryMysteriesTable.status, "open"),
                  eq(legacyMemoryMysteriesTable.mystery_type, mysteryType),
                ),
              )
              .limit(1);

            if (existingMystery.length === 0) {
              await db.insert(legacyMemoryMysteriesTable).values({
                family_id: familyId,
                mystery_type: mysteryType,
                status: "open",
                title: gap.suggestedMission,
                description: gap.description,
                ai_hint: gap.description,
                suggested_actions: [
                  "Ask a relative who might know",
                  "Upload a photo or document",
                  "Record an interview",
                ],
              });
            }
          }
        }
      }

      // Get recently completed missions (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentCompleted = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(
          and(
            eq(legacyAiDirectorMissionsTable.family_id, familyId),
            eq(legacyAiDirectorMissionsTable.status, "completed"),
            sql`${legacyAiDirectorMissionsTable.completed_at} >= ${weekAgo}`,
          ),
        )
        .orderBy(desc(legacyAiDirectorMissionsTable.completed_at))
        .limit(5);

      return res.json({
        todayMissions: missions,
        recentCompleted,
        totalActive: missions.length,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-ai-director: get missions failed");
      return res.status(500).json({ error: "Failed to load missions" });
    }
  },
);

// GET /api/legacy/ai-director/:familyId/gaps
router.get(
  "/legacy/ai-director/:familyId/gaps",
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
      const gaps = await analyzeVaultGaps(familyId);
      return res.json({ gaps, totalGaps: gaps.length });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-ai-director: gap analysis failed");
      return res.status(500).json({ error: "Failed to analyze vault" });
    }
  },
);

// POST /api/legacy/ai-director/:familyId/generate
router.post(
  "/legacy/ai-director/:familyId/generate",
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
      // Check if missions were already generated today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(
          and(
            eq(legacyAiDirectorMissionsTable.family_id, familyId),
            eq(legacyAiDirectorMissionsTable.status, "active"),
            sql`${legacyAiDirectorMissionsTable.generated_at} >= ${today}`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return res.json({
          missions: existing,
          message: "Today's missions already generated",
        });
      }

      // Analyze vault gaps and generate missions
      const gaps = await analyzeVaultGaps(familyId);

      // Get latest knowledge version
      const [latestVersion] = await db
        .select()
        .from(familyKnowledgeVersionsTable)
        .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
        .orderBy(desc(familyKnowledgeVersionsTable.version))
        .limit(1);

      // Convert top gaps to missions (max 5 per day)
      const topGaps = gaps.slice(0, 5);
      const missionsToCreate = topGaps.map((gap) => ({
        family_id: familyId,
        mission_type: gap.missionType,
        status: "active" as const,
        title: gap.suggestedMission,
        description: gap.description,
        gap_description: gap.description,
        target_member_id: gap.targetMemberId ?? null,
        target_vault_item: null,
        reward_xp: gap.rewardXp,
        reward_description: gap.rewardDescription,
        knowledge_version_id: latestVersion?.id ?? null,
        generated_at: new Date(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }));

      const createdMissions: typeof legacyAiDirectorMissionsTable.$inferSelect[] = [];
      if (missionsToCreate.length > 0) {
        const inserted = await db
          .insert(legacyAiDirectorMissionsTable)
          .values(missionsToCreate)
          .returning();
        createdMissions.push(...inserted);
      }

      // Also create Memory Mysteries for unidentified content
      const mysteryGaps = gaps.filter((g) => g.type === "unidentified_people" || g.type === "missing_stories");
      for (const gap of mysteryGaps.slice(0, 3)) {
        const mysteryType = gap.type === "unidentified_people" ? "unknown_person" : "missing_interview";
        const existingMystery = await db
          .select()
          .from(legacyMemoryMysteriesTable)
          .where(
            and(
              eq(legacyMemoryMysteriesTable.family_id, familyId),
              eq(legacyMemoryMysteriesTable.status, "open"),
              eq(legacyMemoryMysteriesTable.mystery_type, mysteryType),
            ),
          )
          .limit(1);

        if (existingMystery.length === 0) {
          await db.insert(legacyMemoryMysteriesTable).values({
            family_id: familyId,
            mystery_type: mysteryType,
            status: "open",
            title: gap.suggestedMission,
            description: gap.description,
            ai_hint: gap.description,
            suggested_actions: [
              "Ask a relative who might know",
              "Upload a photo or document",
              "Record an interview",
            ],
          });
        }
      }

      return res.json({
        missions: createdMissions,
        gapsFound: gaps.length,
        message: createdMissions.length > 0
          ? `${createdMissions.length} new mission${createdMissions.length === 1 ? "" : "s"} generated`
          : "Your vault is looking great — no urgent missions today",
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-ai-director: generate failed");
      return res.status(500).json({ error: "Failed to generate missions" });
    }
  },
);

// POST /api/legacy/ai-director/:missionId/complete
router.post(
  "/legacy/ai-director/:missionId/complete",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const missionId = parseInt(String(req.params.missionId), 10);
    if (isNaN(missionId)) return res.status(400).json({ error: "Invalid mission ID" });

    try {
      const [mission] = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(eq(legacyAiDirectorMissionsTable.id, missionId))
        .limit(1);

      if (!mission) return res.status(404).json({ error: "Mission not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, mission.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const [updated] = await db
        .update(legacyAiDirectorMissionsTable)
        .set({
          status: "completed",
          completed_at: new Date(),
          completed_by: req.authenticatedUserId ?? null,
        })
        .where(eq(legacyAiDirectorMissionsTable.id, missionId))
        .returning();

      // Log to world evolution so the family sees the AI Director's
      // contribution to the living world timeline.
      const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
      logWorldEvolution(
        mission.family_id,
        "story_added",
        `AI Director mission completed: ${mission.title} (+${mission.reward_xp} XP)`,
      ).catch(() => {});

      return res.json({ mission: updated });
    } catch (err) {
      logger.error({ err, missionId }, "legacy-ai-director: complete failed");
      return res.status(500).json({ error: "Failed to complete mission" });
    }
  },
);

// POST /api/legacy/ai-director/:missionId/skip
router.post(
  "/legacy/ai-director/:missionId/skip",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const missionId = parseInt(String(req.params.missionId), 10);
    if (isNaN(missionId)) return res.status(400).json({ error: "Invalid mission ID" });

    try {
      const [mission] = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(eq(legacyAiDirectorMissionsTable.id, missionId))
        .limit(1);

      if (!mission) return res.status(404).json({ error: "Mission not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, mission.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const [updated] = await db
        .update(legacyAiDirectorMissionsTable)
        .set({ status: "skipped" })
        .where(eq(legacyAiDirectorMissionsTable.id, missionId))
        .returning();

      return res.json({ mission: updated });
    } catch (err) {
      logger.error({ err, missionId }, "legacy-ai-director: skip failed");
      return res.status(500).json({ error: "Failed to skip mission" });
    }
  },
);

export default router;
