/**
 * Niakofa — Phase 5: Seasonal Events (Living Family Universe)
 *
 * Shared seasonal events tied to anniversaries, reunions, cultural holidays,
 * birthdays, and migration anniversaries. Family members contribute to
 * events together; when the goal is met, the event auto-completes and a
 * reward unlocks.
 *
 * Routes:
 *   GET    /api/legacy/seasonal-events/:familyId          — list events
 *   POST   /api/legacy/seasonal-events/:familyId          — create event
 *   POST   /api/legacy/seasonal-events/:eventId/participate — contribute
 *   DELETE /api/legacy/seasonal-events/:eventId             — remove event
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  legacySeasonalEventsTable,
  legacySeasonalEventParticipationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { syncAchievements } from "./legacy-achievements";

const router = Router();

const EVENT_TEMPLATES = [
  {
    event_type: "reunion" as const,
    title: "Family Reunion Story Drive",
    description: "Everyone records one elder's story before the next reunion.",
    goal: 5,
    reward_title: "Reunion Chronicle",
    reward_description: "A dedicated chapter preserving stories from your last gathering.",
  },
  {
    event_type: "cultural_holiday" as const,
    title: "Heritage Holiday Preservation",
    description: "Share photos, recipes, and traditions from a cultural celebration.",
    goal: 8,
    reward_title: "Tradition Keeper",
    reward_description: "A curated collection of your family's holiday traditions.",
  },
  {
    event_type: "birthday" as const,
    title: "Birthday Memory Burst",
    description: "Each family member adds a memory about the birthday person.",
    goal: 3,
    reward_title: "Birthday Tribute",
    reward_description: "A personalized memory album for the birthday celebrant.",
  },
  {
    event_type: "migration_anniversary" as const,
    title: "Migration Journey Remembrance",
    description: "Trace the family's migration route with stories, photos, and locations.",
    goal: 5,
    reward_title: "Migration Map",
    reward_description: "An illustrated map of your family's journey across generations.",
  },
  {
    event_type: "anniversary" as const,
    title: "Anniversary Tribute",
    description: "Collect memories and photos celebrating a couple's milestone.",
    goal: 5,
    reward_title: "Love Story Chapter",
    reward_description: "A dedicated story chapter about the couple's journey together.",
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

// GET /api/legacy/seasonal-events/:familyId
router.get(
  "/legacy/seasonal-events/:familyId",
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
      const events = await db
        .select()
        .from(legacySeasonalEventsTable)
        .where(eq(legacySeasonalEventsTable.family_id, familyId))
        .orderBy(desc(legacySeasonalEventsTable.created_at));

      const eventIds = events.map((e) => e.id);
      let participations: typeof legacySeasonalEventParticipationsTable.$inferSelect[] = [];
      if (eventIds.length > 0) {
        participations = await db
          .select()
          .from(legacySeasonalEventParticipationsTable)
          .where(inArray(legacySeasonalEventParticipationsTable.event_id, eventIds));
      }

      const result = events.map((e) => {
        const parts = participations.filter((p) => p.event_id === e.id);
        return {
          ...e,
          participations: parts,
          progress: parts.length,
          isComplete: e.status === "completed",
        };
      });

      return res.json({ events: result, templates: EVENT_TEMPLATES });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-seasonal-events: read failed");
      return res.status(500).json({ error: "Failed to load seasonal events" });
    }
  },
);

// POST /api/legacy/seasonal-events/:familyId
router.post(
  "/legacy/seasonal-events/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const { templateIndex, customTitle, customDescription, customGoal, eventType, triggerDate, targetMemberId } = req.body ?? {};

    let title: string;
    let description: string;
    let goal: number;
    let typeValue: "anniversary" | "reunion" | "cultural_holiday" | "birthday" | "migration_anniversary" | "custom";
    let rewardTitle: string | null = null;
    let rewardDescription: string | null = null;

    if (typeof templateIndex === "number" && templateIndex >= 0 && templateIndex < EVENT_TEMPLATES.length) {
      const tpl = EVENT_TEMPLATES[templateIndex];
      title = tpl.title;
      description = tpl.description;
      goal = tpl.goal;
      typeValue = tpl.event_type;
      rewardTitle = tpl.reward_title;
      rewardDescription = tpl.reward_description;
    } else if (customTitle) {
      title = String(customTitle);
      description = String(customDescription ?? "");
      goal = typeof customGoal === "number" && customGoal > 0 ? customGoal : 5;
      typeValue = (eventType ?? "custom") as typeof typeValue;
    } else {
      return res.status(400).json({ error: "Provide templateIndex or customTitle" });
    }

    try {
      const [event] = await db
        .insert(legacySeasonalEventsTable)
        .values({
          family_id: familyId,
          event_type: typeValue,
          title,
          description,
          goal,
          reward_title: rewardTitle,
          reward_description: rewardDescription,
          status: "active",
          trigger_date: triggerDate ? new Date(triggerDate).toISOString().slice(0, 10) : null,
          target_member_id: targetMemberId ?? null,
        })
        .returning();

      return res.status(201).json({ event });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-seasonal-events: create failed");
      return res.status(500).json({ error: "Failed to create event" });
    }
  },
);

// POST /api/legacy/seasonal-events/:eventId/participate
router.post(
  "/legacy/seasonal-events/:eventId/participate",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const eventId = parseInt(String(req.params.eventId), 10);
    if (isNaN(eventId)) return res.status(400).json({ error: "Invalid event ID" });

    const { contributionType, memberId, note } = req.body ?? {};
    if (!contributionType || !["interview", "photo", "story", "location", "document", "checkin", "recipe", "tradition"].includes(contributionType)) {
      return res.status(400).json({ error: "Valid contributionType is required" });
    }
    const parsedMemberId = memberId != null ? parseInt(String(memberId), 10) : null;

    try {
      const [event] = await db
        .select()
        .from(legacySeasonalEventsTable)
        .where(eq(legacySeasonalEventsTable.id, eventId))
        .limit(1);

      if (!event) return res.status(404).json({ error: "Event not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, event.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      // Prevent duplicate contributions from the same user to the same event
      const [existing] = await db
        .select({ id: legacySeasonalEventParticipationsTable.id })
        .from(legacySeasonalEventParticipationsTable)
        .where(
          and(
            eq(legacySeasonalEventParticipationsTable.event_id, eventId),
            eq(legacySeasonalEventParticipationsTable.user_id, userId),
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "You have already contributed to this event." });
      }

      const [participation] = await db
        .insert(legacySeasonalEventParticipationsTable)
        .values({
          event_id: eventId,
          member_id: parsedMemberId,
          user_id: userId,
          contribution_type: String(contributionType),
          contribution_note: note ?? null,
        })
        .returning();

      // Auto-complete the event when the goal is met
      const [{ participationCount }] = await db
        .select({ participationCount: sql<number>`count(*)::int` })
        .from(legacySeasonalEventParticipationsTable)
        .where(eq(legacySeasonalEventParticipationsTable.event_id, eventId));

      let eventCompleted = false;
      if (Number(participationCount) >= event.goal && event.status !== "completed") {
        await db
          .update(legacySeasonalEventsTable)
          .set({ status: "completed", completed_at: new Date(), updated_at: new Date() })
          .where(eq(legacySeasonalEventsTable.id, eventId));
        eventCompleted = true;
        logger.info({ eventId, familyId: event.family_id }, "legacy-seasonal-events: event auto-completed");
      }

      await syncAchievements(event.family_id).catch((err) =>
        logger.error({ err, familyId: event.family_id }, "legacy-seasonal-events: achievement sync failed"),
      );

      const [updatedEvent] = await db
        .select()
        .from(legacySeasonalEventsTable)
        .where(eq(legacySeasonalEventsTable.id, eventId))
        .limit(1);

      return res.status(201).json({ participation, event: updatedEvent, eventCompleted });
    } catch (err) {
      logger.error({ err, eventId }, "legacy-seasonal-events: participate failed");
      return res.status(500).json({ error: "Failed to record participation" });
    }
  },
);

// DELETE /api/legacy/seasonal-events/:eventId
router.delete(
  "/legacy/seasonal-events/:eventId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const eventId = parseInt(String(req.params.eventId), 10);
    if (isNaN(eventId)) return res.status(400).json({ error: "Invalid event ID" });

    try {
      const [event] = await db
        .select()
        .from(legacySeasonalEventsTable)
        .where(eq(legacySeasonalEventsTable.id, eventId))
        .limit(1);

      if (!event) return res.status(404).json({ error: "Event not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, event.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      await db.delete(legacySeasonalEventsTable).where(eq(legacySeasonalEventsTable.id, eventId));
      return res.json({ deleted: true });
    } catch (err) {
      logger.error({ err, eventId }, "legacy-seasonal-events: delete failed");
      return res.status(500).json({ error: "Failed to delete event" });
    }
  },
);

export default router;
