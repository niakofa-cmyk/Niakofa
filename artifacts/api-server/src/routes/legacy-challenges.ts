import { Router } from "express";
import { db } from "@workspace/db";
import { legacyAchievementsTable, legacyPlaceDiscoveriesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { syncAchievements } from "./legacy-achievements";

const router = Router();

interface ChallengeRow {
  id: string;
  family_id: string;
  challenge_type: string;
  title: string;
  description: string;
  goal: number;
  reward_title: string | null;
  reward_description: string | null;
  status: string;
  deadline: string | null;
  created_by_member_id: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ContributionRow {
  id: string;
  challenge_id: string;
  member_id: string | null;
  contribution_type: string;
  vault_item_ref: string | null;
  contribution_note: string | null;
  created_at: string;
}

const CHALLENGE_TEMPLATES = [
  {
    challenge_type: "story_collection",
    title: "Elder Stories Preservation",
    description: "Work together as a family to record oral histories from your elders. Each interview preserves a voice that might otherwise be lost.",
    goal: 5,
    reward_title: "Voice of the Ancestors",
    reward_description: "Unlock the Family Oral History Archive — a curated collection of your family's recorded stories.",
  },
  {
    challenge_type: "preservation",
    title: "Family Photo Rescue",
    description: "Digitize old family photographs before they fade. Upload photos from different relatives to build a shared visual history.",
    goal: 10,
    reward_title: "Memory Restorer",
    reward_description: "Unlock the Heritage Collection — a visual timeline of your family through the decades.",
  },
  {
    challenge_type: "exploration",
    title: "Roots Expedition",
    description: "Visit family landmarks together — churches, schools, homes, cemeteries. Check in at each location to discover your family's world.",
    goal: 5,
    reward_title: "Roots Traveler",
    reward_description: "Unlock the Family World Map with all discovered landmarks and migration routes.",
  },
  {
    challenge_type: "reunion",
    title: "Family Reunion Challenge",
    description: "Connect with living relatives. Each family member you reach out to and invite strengthens your family network.",
    goal: 3,
    reward_title: "Bridge Builder",
    reward_description: "Unlock the Family Circle — a live directory of connected relatives with shared memories.",
  },
];

router.get(
  "/legacy/challenges/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = String(req.params.familyId);
    if (!familyId) return res.status(400).json({ error: "Invalid family ID" });

    try {
      const challenges = await db.execute(sql`
        SELECT * FROM legacy_family_challenges
        WHERE family_id = ${familyId}::uuid
        ORDER BY created_at DESC
      `);

      const contributions = await db.execute(sql`
        SELECT c.* FROM legacy_challenge_contributions c
        JOIN legacy_family_challenges ch ON c.challenge_id = ch.id
        WHERE ch.family_id = ${familyId}::uuid
        ORDER BY c.created_at DESC
      `);

      const challengesList = challenges.rows as ChallengeRow[];
      const contributionsList = contributions.rows as ContributionRow[];

      const result = challengesList.map((ch) => {
        const chContribs = contributionsList.filter((c) => c.challenge_id === ch.id);
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
    const familyId = String(req.params.familyId);
    if (!familyId) return res.status(400).json({ error: "Invalid family ID" });

    const { templateIndex, customTitle, customDescription, customGoal } = req.body ?? {};

    let title: string;
    let description: string;
    let goal: number;
    let challengeType: string;
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
      challengeType = "reunion";
    } else {
      return res.status(400).json({ error: "Provide templateIndex or customTitle + customDescription" });
    }

    try {
      const result = await db.execute(sql`
        INSERT INTO legacy_family_challenges
          (family_id, challenge_type, title, description, goal, reward_title, reward_description, status)
        VALUES
          (${familyId}::uuid, ${challengeType}::legacy_challenge_type, ${title}, ${description}, ${goal}, ${rewardTitle}, ${rewardDescription}, 'active')
        RETURNING *
      `);

      return res.status(201).json({ challenge: result.rows[0] });
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
    const challengeId = String(req.params.challengeId);
    if (!challengeId) return res.status(400).json({ error: "Invalid challenge ID" });

    const { contributionType, memberId, vaultItemRef, note } = req.body ?? {};

    if (!contributionType || !["interview", "photo", "story", "location", "document", "checkin"].includes(contributionType)) {
      return res.status(400).json({ error: "Valid contributionType is required" });
    }

    try {
      const result = await db.execute(sql`
        INSERT INTO legacy_challenge_contributions
          (challenge_id, member_id, contribution_type, vault_item_ref, contribution_note)
        VALUES
          (${challengeId}::uuid, ${memberId ? memberId + "::uuid" : null}, ${contributionType}::legacy_contribution_type, ${vaultItemRef || null}, ${note || null})
        RETURNING *
      `);

      const challengeResult = await db.execute(sql`
        SELECT * FROM legacy_family_challenges WHERE id = ${challengeId}::uuid
      `);

      const challenge = challengeResult.rows[0] as ChallengeRow | undefined;
      if (challenge) {
        await syncAchievements(challenge.family_id).catch((err) =>
          logger.error({ err, familyId: challenge.family_id }, "legacy-challenges: achievement sync after contribution failed"),
        );
      }

      return res.status(201).json({
        contribution: result.rows[0],
        challenge: challenge,
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
    const challengeId = String(req.params.challengeId);
    if (!challengeId) return res.status(400).json({ error: "Invalid challenge ID" });

    try {
      await db.execute(sql`
        DELETE FROM legacy_family_challenges WHERE id = ${challengeId}::uuid
      `);
      return res.json({ deleted: true });
    } catch (err) {
      logger.error({ err, challengeId }, "legacy-challenges: delete failed");
      return res.status(500).json({ error: "Failed to delete challenge" });
    }
  },
);

export default router;
