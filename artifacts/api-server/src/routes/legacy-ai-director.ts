/**
 * Niakofa — Phase 5: AI Game Director
 *
 * The AI Game Director wakes up each day, scans the family's knowledge graph,
 * and generates targeted missions that drive preservation. Instead of generic
 * "do this" prompts, the Director identifies what's actually missing in the
 * vault and creates missions to fill those gaps.
 *
 * Uses the enhanced gap analysis from legacy-ai-director-enhanced.ts which
 * detects: missing ancestors, incomplete branches, unanswered questions,
 * undocumented locations, missing interviews, missing birth/death dates,
 * unidentified people in memories, and incomplete family trees.
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
import { analyzeVaultGapsEnhanced, type VaultGap } from "../lib/legacy-ai-director-enhanced";

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

// Use the enhanced gap analysis from the lib module
const analyzeVaultGaps = analyzeVaultGapsEnhanced;

// ── GET /api/legacy/ai-director/:familyId/missions ───────────────────────────

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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const missions = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(
          and(
            eq(legacyAiDirectorMissionsTable.family_id, familyId),
            eq(legacyAiDirectorMissionsTable.status, "active"),
          ),
        )
        .orderBy(desc(legacyAiDirectorMissionsTable.created_at))
        .limit(10);

      return res.json({
        missions: missions.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          missionType: m.mission_type,
          rewardXp: m.reward_xp,
          rewardDescription: m.reward_description,
          status: m.status,
          targetMemberId: m.target_member_id,
          targetMemberName: m.target_member_name,
          emotionalWeight: m.emotional_weight,
          createdAt: m.created_at,
        })),
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-ai-director: missions failed");
      return res.status(500).json({ error: "Failed to load missions" });
    }
  },
);

// ── POST /api/legacy/ai-director/:familyId/generate ───────────────────────────

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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await db
        .select()
        .from(legacyAiDirectorMissionsTable)
        .where(
          and(
            eq(legacyAiDirectorMissionsTable.family_id, familyId),
            eq(legacyAiDirectorMissionsTable.status, "active"),
          ),
        )
        .limit(10);

      if (existing.length >= 5) {
        return res.json({
          missions: existing.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            missionType: m.mission_type,
            rewardXp: m.reward_xp,
            rewardDescription: m.reward_description,
            status: m.status,
            targetMemberId: m.target_member_id,
            targetMemberName: m.target_member_name,
            emotionalWeight: m.emotional_weight,
          })),
          message: "You already have active missions. Complete them first.",
        });
      }

      const gaps = await analyzeVaultGaps(familyId);
      const topGaps = gaps.slice(0, 5);

      const newMissions = [];
      for (const gap of topGaps) {
        const [mission] = await db
          .insert(legacyAiDirectorMissionsTable)
          .values({
            family_id: familyId,
            title: gap.suggestedMission,
            description: gap.description,
            mission_type: gap.missionType,
            reward_xp: gap.rewardXp,
            reward_description: gap.rewardDescription,
            status: "active",
            target_member_id: gap.targetMemberId ?? null,
            target_member_name: gap.targetMemberName ?? null,
            emotional_weight: gap.emotionalWeight ?? null,
          })
          .returning();

        newMissions.push({
          id: mission.id,
          title: mission.title,
          description: mission.description,
          missionType: mission.mission_type,
          rewardXp: mission.reward_xp,
          rewardDescription: mission.reward_description,
          status: mission.status,
          targetMemberId: mission.target_member_id,
          targetMemberName: mission.target_member_name,
          emotionalWeight: mission.emotional_weight,
        });
      }

      return res.json({ missions: newMissions, totalGaps: gaps.length });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-ai-director: generate failed");
      return res.status(500).json({ error: "Failed to generate missions" });
    }
  },
);

// ── POST /api/legacy/ai-director/:missionId/complete ─────────────────────────

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

      await db
        .update(legacyAiDirectorMissionsTable)
        .set({ status: "completed", completed_at: new Date() })
        .where(eq(legacyAiDirectorMissionsTable.id, missionId));

      return res.json({
        missionId,
        status: "completed",
        rewardXp: mission.reward_xp,
        rewardDescription: mission.reward_description,
      });
    } catch (err) {
      logger.error({ err, missionId }, "legacy-ai-director: complete failed");
      return res.status(500).json({ error: "Failed to complete mission" });
    }
  },
);

// ── POST /api/legacy/ai-director/:missionId/skip ─────────────────────────────

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

      await db
        .update(legacyAiDirectorMissionsTable)
        .set({ status: "skipped" })
        .where(eq(legacyAiDirectorMissionsTable.id, missionId));

      return res.json({ missionId, status: "skipped" });
    } catch (err) {
      logger.error({ err, missionId }, "legacy-ai-director: skip failed");
      return res.status(500).json({ error: "Failed to skip mission" });
    }
  },
);

// ── GET /api/legacy/ai-director/:familyId/gaps ───────────────────────────────

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

export default router;
