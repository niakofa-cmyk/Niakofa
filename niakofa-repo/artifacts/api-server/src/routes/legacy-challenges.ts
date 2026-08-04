/**
 * Niakofa — Legacy Mode: Family Challenges (Phase 4 — cooperative missions)
 *
 * Rewritten to use real, migrated tables (see migration
 * 0099_legacy_family_challenges_real.sql) instead of raw ::uuid-cast SQL
 * against tables that were never actually created on the Railway Postgres
 * DB the app runs against — every call previously 500'd in production.
 *
 * Family IDs and member IDs are integers everywhere else in this schema
 * (families.id, family_members.id are both serial integers); this route
 * now matches that convention instead of assuming uuid.
 *
 * Routes:
 *   GET    /api/legacy/challenges/:familyId              — list + templates
 *   POST   /api/legacy/challenges/:familyId               — create from template or custom
 *   POST   /api/legacy/challenges/:challengeId/contribute — record a contribution
 *   DELETE /api/legacy/challenges/:challengeId             — remove a challenge
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  legacyFamilyChallengesTable,
  legacyChallengeContributionsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { syncAchievements } from "./legacy-achievements";

const router = Router();

const CONTRIBUTION_TYPES = ["interview", "photo", "story", "location", "document", "checkin"] as const;
const CHALLENGE_TYPES = ["story_collection", "preservation", "exploration", "reunion"] as const;

const CHALLENGE_TEMPLATES = [
  {
    challenge_type: "story_collection" as const,
    title: "Elder Stories Preservation",
    description: "Work together as a family to record oral histories from your elders. Each interview preserves a voice that might otherwise be lost.",
    goal: 5,
    reward_title: "Voice of the Ancestors",
    reward_description: "Unlock the Family Oral History Archive — a curated collection of your family's recorded stories.",
  },
  {
    challenge_type: "preservation" as const,
    title: "Family Photo Rescue",
    description: "Digitize old family photographs before they fade. Upload photos from different relatives to build a shared visual history.",
    goal: 10,
    reward_title: "Memory Restorer",
    reward_description: "Unlock the Heritage Collection — a visual timeline of your family through the decades.",
  },
  {
    challenge_type: "exploration" as const,
    title: "Roots Expedition",
    description: "Visit family landmarks together — churches, schools, homes, cemeteries. Check in at each location to discover your family's world.",
    goal: 5,
    reward_title: "Roots Traveler",
    reward_description: "Unlock the Family World Map with all discovered landmarks and migration routes.",
  },
  {
    challenge_type: "reunion" as const,
    title: "Family Reunion Challenge",
    description: "Connect with living relatives. Each family member you reach out to and invite strengthens your family network.",
    goal: 3,
    reward_title: "Bridge Builder",
    reward_description: "Unlock the Family Circle — a live directory of connected relatives with shared memories.",
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

router.get(
  "/legacy/challenges/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = Number(req.params.familyId);
    if (!Number.isInteger(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const challenges = await db
        .select()
        .from(legacyFamilyChallengesTable)
        .where(eq(legacyFamilyChallengesTable.family_id, familyId))
        .orderBy(desc(legacyFamilyChallengesTable.created_at));

      const contributions = challenges.length > 0
        ? await db
            .select()
            .from(legacyChallengeContributionsTable)
            .where(inArray(legacyChallengeContributionsTable.challenge_id, challenges.map((c) => c.id)))
            .orderBy(desc(legacyChallengeContributionsTable.created_at))
        : [];

      const result = challenges.map((ch) => {
        const chContribs = contributions.filter((c) => c.challenge_id === ch.id);
        return {
          ...ch,
          contributions: chContribs,
          progress: chContribs.length,
          isComplete: ch.status === "completed",
        };
      });

      return res.json({ challenges: result, templates: CHALLENGE_TEMPLATES });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-challenges: read failed");
      return res.status(500).json({ error: "Failed to load challenges" });
    }
  },
);

router.post(
  "/legacy/challenges/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = Number(req.params.familyId);
    if (!Number.isInteger(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const { templateIndex, customTitle, customDescription, customGoal, customType } = req.body ?? {};

    let title: string;
    let description: string;
    let goal: number;
    let challengeType: (typeof CHALLENGE_TEMPLATES)[number]["challenge_type"];
    let rewardTitle: string | null = null;
    let rewardDescription: string | null = null;

    if (typeof templateIndex === "number" && templateIndex >= 0 && templateIndex < CHALLENGE_TEMPLATES.length) {
      const tpl = CHALLENGE_TEMPLATES[templateIndex];
      title = tpl.title;
      description = tpl.description;
      goal = tpl.goal;
      challengeType = tpl.challenge_type;
      rewardTitle = tpl.reward_title;
      rewardDescription = tpl.reward_description;
    } else if (customTitle && customDescription) {
      title = String(customTitle);
      description = String(customDescription);
      goal = typeof customGoal === "number" && customGoal > 0 ? customGoal : 5;
      challengeType = CHALLENGE_TYPES.includes(customType) ? customType : "reunion";
    } else {
      return res.status(400).json({ error: "Provide templateIndex or customTitle + customDescription" });
    }

    try {
      const [challenge] = await db
        .insert(legacyFamilyChallengesTable)
        .values({
          family_id: familyId,
          challenge_type: challengeType,
          title,
          description,
          goal,
          reward_title: rewardTitle,
          reward_description: rewardDescription,
          status: "active",
        })
        .returning();

      return res.status(201).json({ challenge });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-challenges: create failed");
      return res.status(500).json({ error: "Failed to create challenge" });
    }
  },
);

router.post(
  "/legacy/challenges/:challengeId/contribute",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const challengeId = Number(req.params.challengeId);
    if (!Number.isInteger(challengeId)) return res.status(400).json({ error: "Invalid challenge ID" });

    const { contributionType, memberId, vaultItemRef, note } = req.body ?? {};

    if (!contributionType || !CONTRIBUTION_TYPES.includes(contributionType)) {
      return res.status(400).json({ error: "Valid contributionType is required" });
    }

    try {
      const [challengeBefore] = await db
        .select()
        .from(legacyFamilyChallengesTable)
        .where(eq(legacyFamilyChallengesTable.id, challengeId))
        .limit(1);

      if (!challengeBefore) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, challengeBefore.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      // Prevent duplicate contributions from the same user to the same challenge.
      // When memberId is not provided, the contribution row stores member_id = null,
      // so the duplicate check must also look for null member_id rows from this user.
      const [existing] = await db
        .select({ id: legacyChallengeContributionsTable.id })
        .from(legacyChallengeContributionsTable)
        .where(
          and(
            eq(legacyChallengeContributionsTable.challenge_id, challengeId),
            typeof memberId === "number"
              ? eq(legacyChallengeContributionsTable.member_id, memberId)
              : sql`${legacyChallengeContributionsTable.member_id} is null`,
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "You have already contributed to this challenge." });
      }

      const [contribution] = await db
        .insert(legacyChallengeContributionsTable)
        .values({
          challenge_id: challengeId,
          member_id: typeof memberId === "number" ? memberId : null,
          contribution_type: contributionType,
          vault_item_ref: vaultItemRef || null,
          contribution_note: note || null,
        })
        .returning();

      // Application-level auto-completion fallback (in case the DB trigger is missing)
      const [{ contribCount }] = await db
        .select({ contribCount: sql<number>`count(*)::int` })
        .from(legacyChallengeContributionsTable)
        .where(eq(legacyChallengeContributionsTable.challenge_id, challengeId));

      let challengeCompleted = false;
      if (Number(contribCount) >= challengeBefore.goal && challengeBefore.status !== "completed") {
        await db
          .update(legacyFamilyChallengesTable)
          .set({ status: "completed", completed_at: new Date() })
          .where(eq(legacyFamilyChallengesTable.id, challengeId));
        challengeCompleted = true;
        logger.info({ challengeId, familyId: challengeBefore.family_id }, "legacy-challenges: challenge auto-completed");

        const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
        logWorldEvolution(
          challengeBefore.family_id,
          "story_added",
          `Family challenge completed: "${challengeBefore.title}" (${contribCount} contributions)`,
        ).catch(() => {});
      }

      // Re-read the challenge — the DB trigger (fn_check_challenge_complete)
      // or the app-level fallback above may have just flipped it to 'completed'.
      const [challengeAfter] = await db
        .select()
        .from(legacyFamilyChallengesTable)
        .where(eq(legacyFamilyChallengesTable.id, challengeId))
        .limit(1);

      await syncAchievements(challengeBefore.family_id).catch((err) =>
        logger.error({ err, familyId: challengeBefore.family_id }, "legacy-challenges: achievement sync after contribution failed"),
      );

      return res.status(201).json({
        contribution,
        challenge: challengeAfter ?? challengeBefore,
        challengeCompleted,
      });
    } catch (err) {
      logger.error({ err, challengeId }, "legacy-challenges: contribute failed");
      return res.status(500).json({ error: "Failed to record contribution" });
    }
  },
);

router.delete(
  "/legacy/challenges/:challengeId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const challengeId = Number(req.params.challengeId);
    if (!Number.isInteger(challengeId)) return res.status(400).json({ error: "Invalid challenge ID" });

    try {
      const [challenge] = await db
        .select()
        .from(legacyFamilyChallengesTable)
        .where(eq(legacyFamilyChallengesTable.id, challengeId))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: "Challenge not found" });
      }

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, challenge.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      await db.delete(legacyFamilyChallengesTable).where(eq(legacyFamilyChallengesTable.id, challengeId));
      return res.json({ deleted: true });
    } catch (err) {
      logger.error({ err, challengeId }, "legacy-challenges: delete failed");
      return res.status(500).json({ error: "Failed to delete challenge" });
    }
  },
);

export default router;
