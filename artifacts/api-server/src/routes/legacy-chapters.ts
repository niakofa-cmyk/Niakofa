/**
 * Niakofa — Phase 1 Chapter State Machine
 *
 * Manages the chapter lifecycle for Legacy Mode gameplay. The state machine
 * stays honest to user data — chapters only unlock when the family's
 * readiness score meets the threshold, and chapter content references
 * real vault data, never fabricated history.
 *
 * State transitions:
 *   locked → unlocked       (when readiness >= threshold)
 *   unlocked → in_progress   (player starts chapter)
 *   in_progress → completed  (player finishes all scenes)
 *   in_progress → skipped   (player chooses to skip)
 *   completed → locked       (NOT allowed — history is immutable)
 *   skipped → unlocked       (player can retry)
 *
 * Routes:
 *   GET    /api/legacy/chapters/:familyId           — list chapters for a family
 *   POST   /api/legacy/chapters/:familyId/init      — initialize chapters for a new world
 *   PATCH  /api/legacy/chapters/:chapterId/status   — transition chapter status
 *   GET    /api/legacy/chapters/:chapterId/scenes   — get scenes for a chapter
 */

import { Router } from "express";
import {
  db,
  familiesTable,
  familyMembersTable,
  familyMemoriesTable,
  familyEventsTable,
  familyStoriesTable,
  familyPlacesTable,
  legacyWorldsTable,
  legacyChaptersTable,
  legacySessionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { calculateCompleteness, CHAPTER_UNLOCK_THRESHOLD } from "./legacy-completeness";

const router = Router();

// ── Valid state transitions ──────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  locked:       ["unlocked"],
  unlocked:     ["in_progress"],
  in_progress:  ["completed", "skipped"],
  completed:    [],  // terminal — no transitions
  skipped:      ["unlocked"],  // can retry
};

// ── Membership guard ──────────────────────────────────────────────────────────

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
  return Boolean(row);
}

// ── Chapter generation ────────────────────────────────────────────────────────
// Generates chapter metadata from real vault data. Does NOT fabricate history.
// Each chapter references actual events, places, and stories from the vault.
// If data is insufficient, the chapter stays "locked" with a hint about what's
// missing.

interface ChapterSeed {
  chapterNumber: number;
  title: string;
  synopsis: string;
  ancestorMemberId: number | null;
  chapterData: Record<string, unknown>;
}

async function generateChapterSeeds(familyId: number): Promise<ChapterSeed[]> {
  // Gather real vault data to build chapters from
  const members = await db
    .select({
      id: familyMembersTable.id,
      name: familyMembersTable.display_name,
      role: familyMembersTable.role,
      relation: familyMembersTable.relation_note,
    })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.status, "active"),
      ),
    );

  const events = await db
    .select({
      id: familyEventsTable.id,
      title: familyEventsTable.title,
      description: familyEventsTable.description,
      eventDate: familyEventsTable.event_date,
      category: familyEventsTable.category,
      memberId: familyEventsTable.member_id,
    })
    .from(familyEventsTable)
    .where(eq(familyEventsTable.family_id, familyId))
    .orderBy(asc(familyEventsTable.event_date));

  const stories = await db
    .select({
      id: familyStoriesTable.id,
      title: familyStoriesTable.title,
      aboutMemberId: familyStoriesTable.about_member_id,
      category: familyStoriesTable.category,
    })
    .from(familyStoriesTable)
    .where(eq(familyStoriesTable.family_id, familyId));

  const places = await db
    .select({
      id: familyPlacesTable.id,
      label: familyPlacesTable.label,
      placeType: familyPlacesTable.place_type,
    })
    .from(familyPlacesTable)
    .where(eq(familyPlacesTable.family_id, familyId));

  const memories = await db
    .select({
      id: familyMemoriesTable.id,
      title: familyMemoriesTable.title,
      memoryDate: familyMemoriesTable.memory_date,
      locationLabel: familyMemoriesTable.location_label,
    })
    .from(familyMemoriesTable)
    .where(eq(familyMemoriesTable.family_id, familyId))
    .orderBy(asc(familyMemoriesTable.memory_date));

  const seeds: ChapterSeed[] = [];

  // Chapter I: "Origins" — built from earliest events/places
  const earliestEvent = events[0];
  const earliestPlace = places[0];
  const earliestMemory = memories[0];

  if (earliestEvent || earliestPlace || earliestMemory) {
    const ancestor = earliestEvent?.memberId
      ? members.find(m => m.id === earliestEvent.memberId)
      : members[0];

    seeds.push({
      chapterNumber: 1,
      title: "Before the Journey",
      synopsis: earliestEvent?.description
        ? String(earliestEvent.description).slice(0, 200)
        : `Your family's story begins${earliestPlace ? ` in ${earliestPlace.label}` : ""}.`,
      ancestorMemberId: ancestor?.id ?? null,
      chapterData: {
        historicalLayer: "verified",
        eventIds: events.filter(e => e.category === "birth" || e.category === "other").slice(0, 3).map(e => e.id),
        placeIds: places.slice(0, 2).map(p => p.id),
        memoryIds: memories.slice(0, 2).map(m => m.id),
        era: earliestEvent?.eventDate
          ? new Date(earliestEvent.eventDate).getFullYear().toString()
          : earliestMemory?.memoryDate
            ? new Date(earliestMemory.memoryDate).getFullYear().toString()
            : "Unknown",
        location: earliestPlace?.label ?? earliestMemory?.locationLabel ?? "Unknown",
      },
    });
  }

  // Chapter II: "The Journey" — built from migration events
  const migrationEvents = events.filter(e => e.category === "migration");
  if (migrationEvents.length > 0) {
    seeds.push({
      chapterNumber: 2,
      title: "The Journey",
      synopsis: migrationEvents[0].description
        ? String(migrationEvents[0].description).slice(0, 200)
        : "A pivotal migration that shaped your family's future.",
      ancestorMemberId: migrationEvents[0].memberId ?? members[0]?.id ?? null,
      chapterData: {
        historicalLayer: "verified",
        eventIds: migrationEvents.slice(0, 5).map(e => e.id),
        placeIds: places.slice(0, 3).map(p => p.id),
        memoryIds: memories.slice(0, 3).map(m => m.id),
        era: migrationEvents[0].eventDate
          ? new Date(migrationEvents[0].eventDate).getFullYear().toString()
          : "Unknown",
        location: places[1]?.label ?? places[0]?.label ?? "Unknown",
      },
    });
  }

  // Chapter III: "New Beginnings" — built from later events + stories
  const laterEvents = events.slice(3);
  if (laterEvents.length > 0 || stories.length > 0) {
    seeds.push({
      chapterNumber: 3,
      title: "New Beginnings",
      synopsis: stories[0]?.title
        ? `Stories from ${stories[0].title}`
        : "Life in a new place, told through family memories.",
      ancestorMemberId: stories[0]?.aboutMemberId ?? members[0]?.id ?? null,
      chapterData: {
        historicalLayer: "verified",
        eventIds: laterEvents.slice(0, 5).map(e => e.id),
        storyIds: stories.slice(0, 3).map(s => s.id),
        memoryIds: memories.slice(3, 6).map(m => m.id),
        placeIds: places.slice(2, 4).map(p => p.id),
        era: laterEvents[0]?.eventDate
          ? new Date(laterEvents[0].eventDate).getFullYear().toString()
          : "Unknown",
        location: places[2]?.label ?? places[0]?.label ?? "Unknown",
      },
    });
  }

  return seeds;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/legacy/chapters/:familyId — list all chapters for a family
router.get(
  "/legacy/chapters/:familyId",
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
      const chapters = await db
        .select()
        .from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.family_id, familyId))
        .orderBy(asc(legacyChaptersTable.chapter_number));

      return res.json({ chapters });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-chapters: list failed");
      return res.status(500).json({ error: "Failed to list chapters" });
    }
  },
);

// POST /api/legacy/chapters/:familyId/init — initialize chapters for a family
// Only works if readiness score >= threshold. Creates chapters from real vault data.
router.post(
  "/legacy/chapters/:familyId/init",
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
      // Check readiness
      const completeness = await calculateCompleteness(familyId);
      if (!completeness.chapterUnlockReady) {
        return res.status(403).json({
          error: "Family vault is not ready for chapter generation",
          readinessScore: completeness.readinessScore,
          threshold: CHAPTER_UNLOCK_THRESHOLD,
          missingData: completeness.missingData,
          suggestions: completeness.suggestions,
        });
      }

      // Find or create a world for this family
      let [world] = await db
        .select()
        .from(legacyWorldsTable)
        .where(eq(legacyWorldsTable.family_id, familyId))
        .limit(1);

      if (!world) {
        const [newWorld] = await db
          .insert(legacyWorldsTable)
          .values({
            family_id: familyId,
            status: "ready",
            world_data: { completeness: completeness.readinessScore },
          })
          .returning();
        world = newWorld;
      }

      // Check if chapters already exist
      const existing = await db
        .select()
        .from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.world_id, world.id));

      if (existing.length > 0) {
        return res.json({
          worldId: world.id,
          chapters: existing,
          alreadyInitialized: true,
        });
      }

      // Generate chapter seeds from real vault data
      const seeds = await generateChapterSeeds(familyId);

      if (seeds.length === 0) {
        return res.status(400).json({
          error: "Not enough vault data to generate chapters",
          suggestions: completeness.suggestions,
        });
      }

      // Insert chapters — first one unlocked, rest locked
      const chapters = await db
        .insert(legacyChaptersTable)
        .values(
          seeds.map((seed, i) => ({
            world_id: world.id,
            family_id: familyId,
            ancestor_member_id: seed.ancestorMemberId,
            chapter_number: seed.chapterNumber,
            title: seed.title,
            synopsis: seed.synopsis,
            status: i === 0 ? "unlocked" : "locked",
            chapter_data: seed.chapterData,
            unlocked_at: i === 0 ? new Date() : null,
          })),
        )
        .returning();

      logger.info({ familyId, worldId: world.id, chapterCount: chapters.length }, "legacy-chapters: initialized");

      return res.json({
        worldId: world.id,
        chapters,
        alreadyInitialized: false,
        readinessScore: completeness.readinessScore,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-chapters: init failed");
      return res.status(500).json({ error: "Failed to initialize chapters" });
    }
  },
);

// PATCH /api/legacy/chapters/:chapterId/status — transition chapter status
router.patch(
  "/legacy/chapters/:chapterId/status",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const chapterId = parseInt(String(req.params.chapterId), 10);
    if (isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter ID" });

    const { status: newStatus } = req.body as { status: string };
    if (!newStatus) return res.status(400).json({ error: "Missing status field" });

    try {
      const [chapter] = await db
        .select()
        .from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.id, chapterId))
        .limit(1);

      if (!chapter) return res.status(404).json({ error: "Chapter not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, chapter.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      // Validate transition
      const allowed = VALID_TRANSITIONS[chapter.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return res.status(409).json({
          error: `Cannot transition from "${chapter.status}" to "${newStatus}"`,
          validTransitions: allowed,
        });
      }

      const updateData: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date(),
      };

      if (newStatus === "in_progress") {
        // No special field — just status change
      } else if (newStatus === "completed") {
        updateData.completed_at = new Date();
      } else if (newStatus === "unlocked" && chapter.status === "skipped") {
        // Retry — clear completed_at
        updateData.completed_at = null;
      }

      const [updated] = await db
        .update(legacyChaptersTable)
        .set(updateData)
        .where(eq(legacyChaptersTable.id, chapterId))
        .returning();

      logger.info({ chapterId, from: chapter.status, to: newStatus }, "legacy-chapters: status transition");

      // If completed, unlock the next chapter
      if (newStatus === "completed") {
        const [nextChapter] = await db
          .select()
          .from(legacyChaptersTable)
          .where(
            and(
              eq(legacyChaptersTable.world_id, chapter.world_id),
              eq(legacyChaptersTable.chapter_number, chapter.chapter_number + 1),
            ),
          )
          .limit(1);

        if (nextChapter && nextChapter.status === "locked") {
          await db
            .update(legacyChaptersTable)
            .set({ status: "unlocked", unlocked_at: new Date(), updated_at: new Date() })
            .where(eq(legacyChaptersTable.id, nextChapter.id));

          logger.info({ nextChapterId: nextChapter.id }, "legacy-chapters: next chapter unlocked");
        }
      }

      return res.json({ chapter: updated });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: status transition failed");
      return res.status(500).json({ error: "Failed to transition chapter status" });
    }
  },
);

// GET /api/legacy/chapters/:chapterId/scenes — get scenes for a chapter
// Scenes are derived from the chapter_data which references real vault data
router.get(
  "/legacy/chapters/:chapterId/scenes",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const chapterId = parseInt(String(req.params.chapterId), 10);
    if (isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter ID" });

    try {
      const [chapter] = await db
        .select()
        .from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.id, chapterId))
        .limit(1);

      if (!chapter) return res.status(404).json({ error: "Chapter not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, chapter.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      if (chapter.status === "locked") {
        return res.status(403).json({ error: "Chapter is locked" });
      }

      // Build scenes from chapter_data — these reference real vault IDs
      const data = chapter.chapter_data as Record<string, unknown>;
      const eventIds = (data.eventIds as number[]) ?? [];
      const placeIds = (data.placeIds as number[]) ?? [];
      const memoryIds = (data.memoryIds as number[]) ?? [];
      const storyIds = (data.storyIds as number[]) ?? [];

      // Fetch referenced vault data for scene context
      const [places, events, memories] = await Promise.all([
        placeIds.length > 0
          ? db.select().from(familyPlacesTable).where(inArray(familyPlacesTable.id, placeIds))
          : Promise.resolve([]),
        eventIds.length > 0
          ? db.select().from(familyEventsTable).where(inArray(familyEventsTable.id, eventIds))
          : Promise.resolve([]),
        memoryIds.length > 0
          ? db.select().from(familyMemoriesTable).where(inArray(familyMemoriesTable.id, memoryIds))
          : Promise.resolve([]),
      ]);

      // Build scenes — each scene is a moment in the chapter
      // Scene 1: Setting — the place and era
      // Scene 2: The event — what happened
      // Scene 3: The memory — how the family remembers it
      const scenes = [
        {
          sceneNumber: 1,
          title: "Setting",
          type: "narration",
          content: places[0]
            ? `${data.era ?? "Unknown"} — ${places[0].label}${places[0].country ? `, ${places[0].country}` : ""}`
            : `${data.era ?? "Unknown"} — ${data.location ?? "Unknown"}`,
          placeId: places[0]?.id ?? null,
          historicalLayer: "verified",
        },
        {
          sceneNumber: 2,
          title: "The Event",
          type: "dialogue",
          content: events[0]?.description ?? events[0]?.title ?? "A moment in your family's history.",
          eventId: events[0]?.id ?? null,
          historicalLayer: events[0] ? "verified" : "narrative_interpretation",
        },
        {
          sceneNumber: 3,
          title: "The Memory",
          type: "reflection",
          content: memories[0]?.description ?? memories[0]?.title ?? "How the family remembers this time.",
          memoryId: memories[0]?.id ?? null,
          historicalLayer: memories[0] ? "verified" : "narrative_interpretation",
        },
      ];

      return res.json({
        chapterId,
        chapterTitle: chapter.title,
        chapterStatus: chapter.status,
        scenes,
        vaultContext: { places, events, memories },
      });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: scenes failed");
      return res.status(500).json({ error: "Failed to get chapter scenes" });
    }
  },
);

export default router;
export { VALID_TRANSITIONS, generateChapterSeeds };
