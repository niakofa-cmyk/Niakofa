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
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryTagsTable,
  familyMemoryPeopleTable,
  familyEventsTable,
  familyStoriesTable,
  familyPlacesTable,
  legacyWorldsTable,
  legacyChaptersTable,
  legacySessionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, inArray, asc, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { calculateCompleteness, CHAPTER_UNLOCK_THRESHOLD } from "./legacy-completeness";
import { getConsentedMemberIds, filterConsentedMembers } from "../lib/legacy-consent";
import { getHistoricalContext } from "../lib/historical-context";

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

async function generateChapterSeeds(familyId: number, preferredAncestorMemberId?: number): Promise<ChapterSeed[]> {
  // Gather real vault data to build chapters from
  const members = await db
    .select({
      id: familyMembersTable.id,
      name: familyMembersTable.display_name,
      role: familyMembersTable.role,
      relation: familyMembersTable.relation_note,
      is_living: familyMembersTable.is_living,
      user_id: familyMembersTable.user_id,
    })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.status, "active"),
      ),
    );

  // ── Consent gate: only include members who have consented to storytelling ──
  const consentedIds = await getConsentedMemberIds(familyId);
  const consentedMembers = filterConsentedMembers(members, consentedIds);

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
      country: familyPlacesTable.country,
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
    const ancestor = preferredAncestorMemberId
      ? consentedMembers.find(m => m.id === preferredAncestorMemberId)
      : earliestEvent?.memberId
        ? consentedMembers.find(m => m.id === earliestEvent.memberId)
        : consentedMembers[0];

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
      ancestorMemberId: migrationEvents[0].memberId ?? consentedMembers[0]?.id ?? null,
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
      ancestorMemberId: stories[0]?.aboutMemberId ?? consentedMembers[0]?.id ?? null,
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

  // Chapter IV: "Traditions & Culture" — built from family stories about
  // traditions, cultural practices, and wisdom passed down through generations.
  const traditionStories = stories.filter(s => s.category === "tradition" || s.category === "cultural");
  const traditionMemories = memories.slice(6, 12);
  if (traditionStories.length > 0 || traditionMemories.length > 0 || stories.length >= 3) {
    const traditionAncestor = traditionStories[0]?.aboutMemberId
      ?? consentedMembers.find(m => m.is_living === false)?.id
      ?? consentedMembers[0]?.id
      ?? null;

    seeds.push({
      chapterNumber: 4,
      title: "Traditions & Culture",
      synopsis: traditionStories[0]?.title
        ? `The traditions your family holds dear, starting with "${traditionStories[0].title}".`
        : "The customs, recipes, songs, and wisdom passed down through your family.",
      ancestorMemberId: traditionAncestor,
      chapterData: {
        historicalLayer: "verified",
        storyIds: (traditionStories.length > 0 ? traditionStories : stories.slice(0, 3)).map(s => s.id),
        memoryIds: traditionMemories.map(m => m.id),
        placeIds: places.slice(0, 2).map(p => p.id),
        era: traditionMemories[0]?.memoryDate
          ? new Date(traditionMemories[0].memoryDate).getFullYear().toString()
          : "Unknown",
        location: places[0]?.label ?? "Unknown",
        theme: "cultural_preservation",
      },
    });
  }

  // Chapter V: "Diaspora Connections" — built from migration events and
  // multi-country places, exploring how the family spread across the world.
  const diasporaPlaces = places.filter(p => p.country !== null);
  const diasporaEvents = events.filter(e => e.category === "migration" || e.category === "marriage");
  if (diasporaPlaces.length >= 2 || diasporaEvents.length >= 2) {
    const diasporaAncestor = diasporaEvents[1]?.memberId
      ?? diasporaEvents[0]?.memberId
      ?? consentedMembers[1]?.id
      ?? consentedMembers[0]?.id
      ?? null;

    seeds.push({
      chapterNumber: 5,
      title: "Diaspora Connections",
      synopsis: diasporaPlaces.length >= 2
        ? `From ${diasporaPlaces[0].label} to ${diasporaPlaces[1].label} — how your family spread across the world.`
        : "The branches of your family tree that reached across oceans and borders.",
      ancestorMemberId: diasporaAncestor,
      chapterData: {
        historicalLayer: "verified",
        eventIds: diasporaEvents.slice(0, 5).map(e => e.id),
        placeIds: diasporaPlaces.slice(0, 4).map(p => p.id),
        memoryIds: memories.slice(6, 10).map(m => m.id),
        era: diasporaEvents[0]?.eventDate
          ? new Date(diasporaEvents[0].eventDate).getFullYear().toString()
          : "Unknown",
        location: diasporaPlaces[1]?.label ?? diasporaPlaces[0]?.label ?? "Unknown",
        theme: "diaspora_connections",
      },
    });
  }

  // Chapter VI: "Living Memory" — built from recent memories and living members,
  // connecting the player's own experiences to the family's ongoing story.
  const recentMemories = memories.slice(-5).reverse(); // most recent first
  const livingMembers = consentedMembers.filter(m => m.is_living !== false);
  if (recentMemories.length > 0 || livingMembers.length > 0) {
    const livingAncestor = livingMembers[0]?.id ?? consentedMembers[0]?.id ?? null;

    seeds.push({
      chapterNumber: 6,
      title: "Living Memory",
      synopsis: recentMemories[0]?.title
        ? `From "${recentMemories[0].title}" to today — your family's story is still being written.`
        : "The stories that connect your past to your present — and your role in carrying them forward.",
      ancestorMemberId: livingAncestor,
      chapterData: {
        historicalLayer: "verified",
        memoryIds: recentMemories.map(m => m.id),
        eventIds: events.slice(-3).map(e => e.id),
        placeIds: places.slice(-2).map(p => p.id),
        era: recentMemories[0]?.memoryDate
          ? new Date(recentMemories[0].memoryDate).getFullYear().toString()
          : new Date().getFullYear().toString(),
        location: recentMemories[0]?.locationLabel ?? places[0]?.label ?? "Unknown",
        theme: "living_memory",
      },
    });
  }

  // ── AI-Enhanced Synopsis ─────────────────────────────────────────────────────
  // After building data-driven chapter seeds, optionally enrich each synopsis
  // with AI-generated narrative text. The AI is given the verified vault data
  // as context and instructed to write immersive narration WITHOUT fabricating
  // family facts. If the AI call fails, the original data-driven synopsis is
  // kept as fallback. This makes chapters feel dynamic and alive while keeping
  // documented family facts immutable and clearly separated from narrative
  // interpretation.
  const enrichedSeeds = await enrichChapterSynopses(seeds, {
    members: consentedMembers,
    events: events.map(e => ({ title: e.title, description: e.description, date: e.eventDate, category: e.category })),
    places: places.map(p => ({ label: p.label, type: p.placeType })),
    stories: stories.map(s => ({ title: s.title, category: s.category })),
    memories: memories.map(m => ({ title: m.title, date: m.memoryDate, location: m.locationLabel })),
  });

  return enrichedSeeds;
}

async function enrichChapterSynopses(
  seeds: ChapterSeed[],
  vaultContext: Record<string, unknown>,
): Promise<ChapterSeed[]> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return seeds;

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic();

    const systemPrompt = `You are Nia, the AI Game Master for Niakofa, a living family RPG built from real family history.

CRITICAL RULES:
1. NEVER fabricate family facts. Only use the provided family data.
2. Write immersive narrative synopsis text for each chapter.
3. Clearly distinguish VERIFIED FAMILY HISTORY from NARRATIVE INTERPRETATION.
4. If information is missing, note it as a mystery to discover — do not invent.
5. Keep each synopsis under 200 words.
6. Make it feel like the beginning of a story, not a data report.

Family vault data:
${JSON.stringify(vaultContext, null, 2)}`;

    const userPrompt = `Write an immersive synopsis for each of these ${seeds.length} chapters. Return a JSON array of strings, one synopsis per chapter, in order. Each synopsis should feel like a narrator setting the scene for a chapter in a family history RPG.

Chapters:
${JSON.stringify(seeds.map(s => ({ number: s.chapterNumber, title: s.title, data: s.chapterData })), null, 2)}

Return ONLY a JSON array of ${seeds.length} strings, no other text.`;

    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const synopses = JSON.parse(match[0]) as string[];
      if (Array.isArray(synopses) && synopses.length === seeds.length) {
        return seeds.map((seed, i) => ({
          ...seed,
          synopsis: synopses[i] || seed.synopsis,
          chapterData: { ...seed.chapterData, ai_enriched: true },
        }));
      }
    }
    return seeds;
  } catch (err) {
    logger.warn({ err }, "legacy-chapters: AI synopsis enrichment failed, using data-driven fallback");
    return seeds;
  }
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

    const { preferredAncestorMemberId } = req.body as { preferredAncestorMemberId?: number };
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
      const seeds = await generateChapterSeeds(familyId, preferredAncestorMemberId);

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
            status: i === 0 ? ("unlocked" as const) : ("locked" as const),
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

      // If completed, unlock the next chapter and record character evolution
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

        // Log chapter completion to the world evolution timeline so the
        // family sees gameplay activity alongside vault changes.
        const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
        logWorldEvolution(
          chapter.family_id,
          "story_added",
          `Chapter completed: "${chapter.title}"`,
        ).catch(() => {});

        // Record a character evolution snapshot for the ancestor so their
        // biography grows as the family plays through their life chapters.
        if (chapter.ancestor_member_id) {
          try {
            const { legacyCharacterEvolutionTable, familyKnowledgeVersionsTable } = await import("@workspace/db");
            const [latestVersion] = await db
              .select()
              .from(familyKnowledgeVersionsTable)
              .where(eq(familyKnowledgeVersionsTable.family_id, chapter.family_id))
              .orderBy(desc(familyKnowledgeVersionsTable.version))
              .limit(1);

            // Pull the player's accumulated RPG stats from their active session
            // so the evolution snapshot reflects actual gameplay progression.
            const [playerSession] = await db
              .select()
              .from(legacySessionsTable)
              .where(
                and(
                  eq(legacySessionsTable.family_id, chapter.family_id),
                  eq(legacySessionsTable.current_chapter_id, chapterId),
                ),
              )
              .orderBy(desc(legacySessionsTable.updated_at))
              .limit(1);

            const sessionStats = (playerSession?.session_state as { stats?: Record<string, number> })?.stats ?? {};

            await db.insert(legacyCharacterEvolutionTable).values({
              family_id: chapter.family_id,
              member_id: chapter.ancestor_member_id,
              knowledge_version_id: latestVersion?.id ?? null,
              stats: sessionStats,
              evolution_summary: `Completed Chapter ${chapter.chapter_number}: "${chapter.title}"`,
              new_quest_count: 1,
            });
          } catch (evoErr) {
            logger.error({ err: evoErr, chapterId }, "legacy-chapters: evolution snapshot failed");
          }
        }
      }

      return res.json({ chapter: updated });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: status transition failed");
      return res.status(500).json({ error: "Failed to transition chapter status" });
    }
  },
);

// PATCH /api/legacy/sessions/:sessionId — update session status (pause/resume/abandon)
router.patch(
  "/legacy/sessions/:sessionId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const sessionId = parseInt(String(req.params.sessionId), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const { status } = req.body as { status: string };
    const validStatuses = ["active", "paused", "completed", "abandoned"] as const;
    if (!validStatuses.includes(status as typeof validStatuses[number])) {
      return res.status(400).json({ error: "Invalid status" });
    }

    try {
      const [session] = await db
        .select()
        .from(legacySessionsTable)
        .where(eq(legacySessionsTable.id, sessionId))
        .limit(1);

      if (!session) return res.status(404).json({ error: "Session not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, session.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const [updated] = await db
        .update(legacySessionsTable)
        .set({ status: status as typeof validStatuses[number], updated_at: new Date() })
        .where(eq(legacySessionsTable.id, sessionId))
        .returning();

      return res.json({ session: updated });
    } catch (err) {
      logger.error({ err, sessionId }, "legacy-chapters: session update failed");
      return res.status(500).json({ error: "Failed to update session" });
    }
  },
);

// Builds the scene list for a chapter from its chapter_data + real vault
// data. Extracted so both GET /scenes and GET /journal produce identical
// scene titles/content — the journal must describe exactly what the player
// actually saw, not a re-derived approximation.
interface ChapterScene {
  sceneNumber: number;
  title: string;
  type: string;
  content: string;
  placeId: number | null;
  eventId?: number | null;
  memoryId?: number | null;
  topics?: string[];
  historicalLayer: "verified" | "narrative_interpretation" | "historical_context";
}

async function buildChapterScenes(
  chapter: typeof legacyChaptersTable.$inferSelect,
): Promise<{
  scenes: ChapterScene[];
  vaultContext: { places: unknown[]; events: unknown[]; memories: unknown[] };
}> {
  const data = chapter.chapter_data as Record<string, unknown>;
  const eventIds = (data.eventIds as number[]) ?? [];
  const placeIds = (data.placeIds as number[]) ?? [];
  const memoryIds = (data.memoryIds as number[]) ?? [];

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

  const historicalContext = await getHistoricalContext({
    location: (data.location as string | undefined) ?? places[0]?.label ?? "Unknown",
    era:      (data.era as string | undefined) ?? "Unknown",
    country:  places[0]?.country ?? null,
  });

  // ── Build scenes from ALL available vault data, not just the first item ──
  // Each place, event, and memory becomes its own scene when available,
  // creating a richer, more varied chapter that uses the full family vault.
  const scenes: ChapterScene[] = [];
  let sceneNum = 1;

  // Scene 1: Setting — time and place
  scenes.push({
    sceneNumber: sceneNum++,
    title: "Setting",
    type: "narration",
    content: places[0]
      ? `${data.era ?? "Unknown"} — ${places[0].label}${places[0].country ? `, ${places[0].country}` : ""}${places[0].place_type ? ` (${places[0].place_type})` : ""}`
      : `${data.era ?? "Unknown"} — ${data.location ?? "Unknown"}`,
    placeId: places[0]?.id ?? null,
    historicalLayer: "verified",
  });

  // Scene 2: Historical context (if available)
  if (historicalContext) {
    scenes.push({
      sceneNumber: sceneNum++,
      title: "The World Around Them",
      type: "context",
      content: historicalContext.summary,
      topics: historicalContext.topics,
      placeId: places[0]?.id ?? null,
      eventId: null,
      memoryId: null,
      historicalLayer: "historical_context",
    });
  }

  // Scenes 3..N: Each event becomes a dialogue scene
  for (const event of events.slice(0, 4)) {
    scenes.push({
      sceneNumber: sceneNum++,
      title: event.title ?? "A Moment in History",
      type: "dialogue",
      content: event.description ?? event.title ?? "A moment in your family's history.",
      eventId: event.id,
      placeId: null,
      historicalLayer: "verified",
    });
  }

  // If no events, add a narrative placeholder
  if (events.length === 0) {
    scenes.push({
      sceneNumber: sceneNum++,
      title: "The Event",
      type: "dialogue",
      content: `The story of this moment is still waiting to be told. Perhaps someone in your family remembers — ask an elder, find a letter, or record a memory to bring this scene to life.`,
      eventId: null,
      placeId: null,
      historicalLayer: "narrative_interpretation",
    });
  }

  // Scenes N+1..M: Each memory becomes a reflection scene
  for (const memory of memories.slice(0, 3)) {
    scenes.push({
      sceneNumber: sceneNum++,
      title: memory.title ?? "A Family Memory",
      type: "reflection",
      content: memory.description ?? memory.title ?? "How the family remembers this time.",
      memoryId: memory.id,
      placeId: null,
      historicalLayer: "verified",
    });
  }

  // If no memories, add a reflection placeholder
  if (memories.length === 0) {
    scenes.push({
      sceneNumber: sceneNum++,
      title: "The Memory",
      type: "reflection",
      content: `This is where your family's memories of this time would come alive. Record a memory, share a story, or ask a relative what they remember — every detail you add makes this chapter richer for the next generation.`,
      memoryId: null,
      placeId: null,
      historicalLayer: "narrative_interpretation",
    });
  }

  // Final scene: Looking forward — additional places as discovery prompts
  if (places.length > 1) {
    for (const place of places.slice(1, 3)) {
      scenes.push({
        sceneNumber: sceneNum++,
        title: place.label,
        type: "narration",
        content: `${place.label}${place.country ? `, ${place.country}` : ""}${place.place_type ? ` — ${place.place_type}` : ""}`,
        placeId: place.id,
        historicalLayer: "verified",
      });
    }
  }

  return { scenes, vaultContext: { places, events, memories } };
}

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

      const { scenes, vaultContext } = await buildChapterScenes(chapter);

      return res.json({
        chapterId,
        familyId: chapter.family_id,
        chapterTitle: chapter.title,
        chapterStatus: chapter.status,
        scenes,
        vaultContext,
      });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: scenes failed");
      return res.status(500).json({ error: "Failed to get chapter scenes" });
    }
  },
);

// POST /api/legacy/chapters/:chapterId/mystery-quest — "Ask a question" made real
//
// Previously the "Ask a question" dialogue choice in legacy-chapter.tsx only
// showed flavor text ("A new mystery quest is created...") — nothing was
// persisted. This is exactly the "responses need consequences" and "the game
// should ask the family for missing information" gaps called out in the
// Legacy Mode design docs (Mystery Quest pattern). This endpoint writes a
// real family_stories row (category "mystery_quest") tied to the chapter's
// ancestor and scene, so the open question becomes a durable, filterable
// vault item other relatives can answer — and because family_stories already
// feeds the world-regeneration fingerprint (see legacy.ts's FamilyReservoir),
// answering it will actually cause the family's world to regenerate.
//
// The question body is derived server-side from the same scene data the
// GET /scenes route builds (never trusts arbitrary client-supplied prose
// into the vault) — the client only supplies which scene it was on.
router.post(
  "/legacy/chapters/:chapterId/mystery-quest",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const chapterId = parseInt(String(req.params.chapterId), 10);
    if (isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter ID" });

    const { sceneNumber } = req.body as { sceneNumber?: number };
    if (!sceneNumber || sceneNumber < 1 || sceneNumber > 50) {
      return res.status(400).json({ error: "Valid sceneNumber is required" });
    }

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

      // Idempotent: re-clicking "Ask a question" on the same scene returns
      // the existing mystery quest rather than spamming duplicates.
      const dedupeTag = `chapter:${chapterId}:scene:${sceneNumber}`;
      const existingRows = await db
        .select()
        .from(familyStoriesTable)
        .where(
          and(
            eq(familyStoriesTable.family_id, chapter.family_id),
            eq(familyStoriesTable.category, "mystery_quest"),
          ),
        );
      const existing = existingRows.find(
        (r) => Array.isArray(r.tags) && (r.tags as string[]).includes(dedupeTag),
      );
      if (existing) {
        return res.json({ mysteryQuest: existing, created: false });
      }

      // Rebuild this scene's real content (same source data as GET /scenes)
      // so the question is grounded in the family's actual chapter, not
      // free-form client text.
      const data = chapter.chapter_data as Record<string, unknown>;
      const eventIds = (data.eventIds as number[]) ?? [];
      const memoryIds = (data.memoryIds as number[]) ?? [];
      const [events, memories] = await Promise.all([
        eventIds.length > 0
          ? db.select().from(familyEventsTable).where(inArray(familyEventsTable.id, eventIds))
          : Promise.resolve([]),
        memoryIds.length > 0
          ? db.select().from(familyMemoriesTable).where(inArray(familyMemoriesTable.id, memoryIds))
          : Promise.resolve([]),
      ]);

      const focus =
        events[0]?.title ?? memories[0]?.title ?? chapter.title ?? "this moment";
      const era = (data.era as string | undefined) ?? "an undated time";
      const location = (data.location as string | undefined) ?? "an unknown place";

      const body =
        `During "${chapter.title}" (${era}, ${location}), the family's record of ` +
        `${focus} isn't fully documented yet. What really happened here? ` +
        `A relative's memory, a photo, or a recorded interview could fill this in.`;

      const [inserted] = await db
        .insert(familyStoriesTable)
        .values({
          family_id: chapter.family_id,
          about_member_id: chapter.ancestor_member_id,
          title: `Mystery Quest: ${chapter.title}`,
          body,
          category: "mystery_quest",
          tags: ["mystery_quest", "open_question", dedupeTag],
        })
        .returning();

      logger.info(
        { chapterId, sceneNumber, familyId: chapter.family_id, storyId: inserted.id },
        "legacy-chapters: mystery quest created",
      );

      return res.status(201).json({ mysteryQuest: inserted, created: true });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: mystery quest creation failed");
      return res.status(500).json({ error: "Failed to create mystery quest" });
    }
  },
);

// POST /api/legacy/chapters/:chapterId/record-memory — "Record a memory" made real
//
// Companion to the mystery-quest endpoint above, but the inverse shape: where
// "Ask a question" writes a server-authored prompt (the player supplies no
// text), "Record a memory" is the reflection-scene choice where the player
// contributes their OWN new memory. Unlike mystery-quest, this is genuinely
// user-authored content, so it is not idempotent/deduped by scene — a player
// can record more than one memory against the same reflection beat, same as
// they could write more than one memory anywhere else in the Family Vault.
//
// The new row lands in the same familyMemoriesTable every other memory-
// capture path in the app writes to (see routes/diaspora.ts's
// POST /family/:id/timeline), tagged so it's traceable back to the chapter/
// scene it was recorded from, and linked to the chapter's ancestor via
// family_memory_people when that ancestor is a real member (not every
// chapter's ancestor_member_id resolves to a family_members row — some
// chapters are seeded from historical/placeholder ancestors).
//
// Because family_memories already feeds the world-regeneration fingerprint
// (see legacy.ts's FamilyReservoir), recording a memory here will cause the
// family's world to regenerate next session, same as any other vault edit.
router.post(
  "/legacy/chapters/:chapterId/record-memory",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const chapterId = parseInt(String(req.params.chapterId), 10);
    if (isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter ID" });

    const { sceneNumber, title, body } = req.body as {
      sceneNumber?: number;
      title?: string;
      body?: string;
    };
    if (!sceneNumber || sceneNumber < 1 || sceneNumber > 50) {
      return res.status(400).json({ error: "Valid sceneNumber is required" });
    }
    const trimmedBody = typeof body === "string" ? body.trim() : "";
    if (trimmedBody.length < 3) {
      return res.status(400).json({ error: "Memory text is required" });
    }
    if (trimmedBody.length > 4000) {
      return res.status(400).json({ error: "Memory text is too long (max 4000 characters)" });
    }
    const trimmedTitle = typeof title === "string" ? title.trim().slice(0, 200) : "";

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

      const [inserted] = await db
        .insert(familyMemoriesTable)
        .values({
          family_id:   chapter.family_id,
          author_id:   userId,
          title:       trimmedTitle || `Memory from "${chapter.title}"`,
          description: trimmedBody,
          source:      "upload",
          visibility:  "family",
        })
        .returning();

      const dedupeTag = `chapter:${chapterId}:scene:${sceneNumber}`;
      await db.insert(familyMemoryTagsTable).values([
        { memory_id: inserted.id, tag: "legacy_recorded_memory" },
        { memory_id: inserted.id, tag: dedupeTag },
      ]);

      // Link to the chapter's ancestor if they resolve to a real member row
      // (best-effort — not every chapter ancestor is a real family_members
      // record, and this link is a nice-to-have, not a correctness gate).
      if (chapter.ancestor_member_id) {
        const [ancestorMember] = await db
          .select({ id: familyMembersTable.id })
          .from(familyMembersTable)
          .where(eq(familyMembersTable.id, chapter.ancestor_member_id))
          .limit(1);
        if (ancestorMember) {
          await db.insert(familyMemoryPeopleTable).values({
            memory_id: inserted.id,
            member_id: ancestorMember.id,
          });
        }
      }

      logger.info(
        { chapterId, sceneNumber, familyId: chapter.family_id, memoryId: inserted.id },
        "legacy-chapters: memory recorded from reflection scene",
      );

      // Log to world evolution so the family sees this new memory in the
      // living world timeline and the knowledge version bumps.
      const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
      logWorldEvolution(
        chapter.family_id,
        "memory_added",
        `New memory recorded during "${chapter.title}": ${trimmedTitle || "Untitled"}`,
      ).catch(() => {});

      return res.status(201).json({ memory: inserted, created: true });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: record-memory failed");
      return res.status(500).json({ error: "Failed to record memory" });
    }
  },
);

export default router;
export { VALID_TRANSITIONS, generateChapterSeeds };

// GET /api/legacy/journal/:familyId — the Dynamic Journal
//
// Compiles a player's own play history into a readable log: for every scene
// where they made a choice (persisted via POST /sessions/progress →
// session_state.decisions), show what the scene actually said and what they
// chose. This is deliberately NOT AI-narrated — every line is either real
// scene content (built the same way GET /scenes builds it) or the player's
// own recorded choice. Journal is personal (this user's sessions in this
// family), not shared across the family, since session_state is per-user.
router.get(
  "/legacy/journal/:familyId",
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
      const sessions = await db
        .select()
        .from(legacySessionsTable)
        .where(
          and(
            eq(legacySessionsTable.family_id, familyId),
            eq(legacySessionsTable.user_id, userId),
          ),
        )
        .orderBy(asc(legacySessionsTable.updated_at));

      // Merge decisions across all of this user's sessions for this family,
      // keeping the most recent decision if a scene was somehow replayed
      // across separate sessions.
      type Decision = { action: string; text: string; decidedAt: string; statChanges?: Record<string, number> };
      const merged = new Map<string, Decision>(); // "chapterId:sceneNumber" -> decision
      for (const session of sessions) {
        const state = session.session_state as { decisions?: Record<string, Decision> };
        for (const [key, decision] of Object.entries(state.decisions ?? {})) {
          const prior = merged.get(key);
          if (!prior || new Date(decision.decidedAt) >= new Date(prior.decidedAt)) {
            merged.set(key, decision);
          }
        }
      }

      if (merged.size === 0) {
        return res.json({ entries: [] });
      }

      // Group decision keys by chapterId so each chapter's scenes are only
      // rebuilt once regardless of how many scenes in it have decisions.
      const chapterIdToSceneDecisions = new Map<number, Map<number, Decision>>();
      for (const [key, decision] of merged) {
        const [chapterIdStr, sceneNumberStr] = key.split(":");
        const cId = parseInt(chapterIdStr, 10);
        const sNum = parseInt(sceneNumberStr, 10);
        if (isNaN(cId) || isNaN(sNum)) continue;
        if (!chapterIdToSceneDecisions.has(cId)) chapterIdToSceneDecisions.set(cId, new Map());
        chapterIdToSceneDecisions.get(cId)!.set(sNum, decision);
      }

      const chapterIds = Array.from(chapterIdToSceneDecisions.keys());
      const chapters = await db
        .select()
        .from(legacyChaptersTable)
        .where(inArray(legacyChaptersTable.id, chapterIds));

      const entries: Array<{
        chapterId: number;
        chapterNumber: number;
        chapterTitle: string;
        sceneNumber: number;
        sceneTitle: string;
        sceneExcerpt: string;
        historicalLayer: string;
        choiceText: string;
        decidedAt: string;
        statChanges: Record<string, number>;
      }> = [];

      for (const chapter of chapters) {
        const sceneDecisions = chapterIdToSceneDecisions.get(chapter.id);
        if (!sceneDecisions || sceneDecisions.size === 0) continue;

        const { scenes } = await buildChapterScenes(chapter);
        const sceneByNumber = new Map(scenes.map((s) => [s.sceneNumber, s]));

        for (const [sceneNumber, decision] of sceneDecisions) {
          const scene = sceneByNumber.get(sceneNumber);
          entries.push({
            chapterId: chapter.id,
            chapterNumber: chapter.chapter_number,
            chapterTitle: chapter.title,
            sceneNumber,
            sceneTitle: scene?.title ?? `Scene ${sceneNumber}`,
            sceneExcerpt: (scene?.content ?? "").slice(0, 240),
            historicalLayer: scene?.historicalLayer ?? "narrative_interpretation",
            choiceText: decision.text,
            decidedAt: decision.decidedAt,
            statChanges: decision.statChanges ?? {},
          });
        }
      }

      // Chronological read order: by chapter number, then scene number.
      entries.sort((a, b) =>
        a.chapterNumber !== b.chapterNumber
          ? a.chapterNumber - b.chapterNumber
          : a.sceneNumber - b.sceneNumber,
      );

      return res.json({ entries });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-chapters: journal failed");
      return res.status(500).json({ error: "Failed to build journal" });
    }
  },
);

// ── Session & Progress API ────────────────────────────────────────────────────
// Tracks per-user session state so gameplay can be saved and resumed.

// POST /api/legacy/sessions — create a new play session
router.post(
  "/legacy/sessions",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const { familyId, worldId, ancestorMemberId, chapterId } = req.body as {
      familyId: number; worldId: number; ancestorMemberId?: number; chapterId?: number;
    };

    if (!familyId || !worldId) {
      return res.status(400).json({ error: "familyId and worldId are required" });
    }

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      // End any existing active sessions for this user+family
      await db
        .update(legacySessionsTable)
        .set({ status: "abandoned", ended_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(legacySessionsTable.family_id, familyId),
            eq(legacySessionsTable.user_id, userId),
            eq(legacySessionsTable.status, "active"),
          ),
        );

      const [session] = await db
        .insert(legacySessionsTable)
        .values({
          family_id: familyId,
          world_id: worldId,
          user_id: userId,
          ancestor_member_id: ancestorMemberId ?? null,
          current_chapter_id: chapterId ?? null,
          status: "active",
          session_state: { completedScenes: [] },
        })
        .returning();

      logger.info({ sessionId: session.id, familyId, userId }, "legacy-sessions: created");
      return res.json({ session });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-sessions: create failed");
      return res.status(500).json({ error: "Failed to create session" });
    }
  },
);

// GET /api/legacy/sessions/active/:familyId — get the user's active session
// Also supports ?chapterId= query param to find session by chapter instead of family
router.get(
  "/legacy/sessions/active/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const chapterId = req.query.chapterId ? parseInt(String(req.query.chapterId), 10) : null;

    const userId = req.authenticatedUserId!;

    try {
      if (chapterId) {
        // Look up session by chapter ID
        const [session] = await db
          .select()
          .from(legacySessionsTable)
          .where(
            and(
              eq(legacySessionsTable.current_chapter_id, chapterId),
              eq(legacySessionsTable.user_id, userId),
              eq(legacySessionsTable.status, "active"),
            ),
          )
          .orderBy(desc(legacySessionsTable.updated_at))
          .limit(1);

        return res.json({ session: session ?? null });
      }

      if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });
      if (!(await isMember(userId, familyId))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const [session] = await db
        .select()
        .from(legacySessionsTable)
        .where(
          and(
            eq(legacySessionsTable.family_id, familyId),
            eq(legacySessionsTable.user_id, userId),
            eq(legacySessionsTable.status, "active"),
          ),
        )
        .limit(1);

      return res.json({ session: session ?? null });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-sessions: get active failed");
      return res.status(500).json({ error: "Failed to get active session" });
    }
  },
);

// POST /api/legacy/sessions/progress — save scene progress
router.post(
  "/legacy/sessions/progress",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const { chapterId, sceneNumber, completed, choiceAction, choiceText, statChanges } = req.body as {
      chapterId: number; sceneNumber: number; completed: boolean;
      choiceAction?: string; choiceText?: string;
      statChanges?: Record<string, number>;
    };

    if (!chapterId || sceneNumber === undefined) {
      return res.status(400).json({ error: "chapterId and sceneNumber are required" });
    }

    const userId = req.authenticatedUserId!;

    try {
      const [chapter] = await db
        .select()
        .from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.id, chapterId))
        .limit(1);

      if (!chapter) return res.status(404).json({ error: "Chapter not found" });

      if (!(await isMember(userId, chapter.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      // Find or create an active session for this user+family
      let [session] = await db
        .select()
        .from(legacySessionsTable)
        .where(
          and(
            eq(legacySessionsTable.family_id, chapter.family_id),
            eq(legacySessionsTable.user_id, userId),
            eq(legacySessionsTable.status, "active"),
          ),
        )
        .limit(1);

      // Decisions are keyed by "chapterId:sceneNumber" so a session spanning
      // multiple chapters keeps each scene's choice distinct. This is the
      // durable half of "decision-based narrative" — replaying a chapter
      // (or a future dynamic journal) can see what was actually chosen,
      // instead of the choice only ever existing in transient React state.
      const decisionKey = `${chapterId}:${sceneNumber}`;
      const newDecision =
        choiceAction && choiceText
          ? { action: choiceAction, text: choiceText, decidedAt: new Date().toISOString(), statChanges: statChanges ?? {} }
          : null;

      // Accumulate RPG stats across all choices in this session
      const STAT_KEYS = ["knowledge", "relationships", "culturalWisdom", "courage", "reputation", "legacy", "faith"] as const;
      type StatKey = typeof STAT_KEYS[number];
      type SessionStats = Record<StatKey, number>;

      function clampStats(stats: SessionStats): SessionStats {
        const result: SessionStats = { ...stats };
        for (const k of STAT_KEYS) {
          result[k] = Math.max(0, Math.min(100, result[k]));
        }
        return result;
      }

      if (!session) {
        const initialStats: SessionStats = clampStats(
          STAT_KEYS.reduce((acc, k) => {
            acc[k] = statChanges?.[k] ?? 0;
            return acc;
          }, {} as SessionStats),
        );
        const [newSession] = await db
          .insert(legacySessionsTable)
          .values({
            family_id: chapter.family_id,
            world_id: chapter.world_id,
            user_id: userId,
            current_chapter_id: chapterId,
            status: "active",
            session_state: {
              completedScenes: [sceneNumber],
              decisions: newDecision ? { [decisionKey]: newDecision } : {},
              stats: initialStats,
            },
          })
          .returning();
        session = newSession;
      } else {
        // Update session state with completed scene + this scene's decision + accumulated stats
        const currentState = session.session_state as {
          completedScenes?: number[];
          decisions?: Record<string, { action: string; text: string; decidedAt: string; statChanges?: Record<string, number> }>;
          stats?: SessionStats;
        };
        const completedScenes = new Set(currentState.completedScenes ?? []);
        if (completed) completedScenes.add(sceneNumber);
        const decisions = { ...(currentState.decisions ?? {}) };
        if (newDecision) decisions[decisionKey] = newDecision;

        // Accumulate stat changes from this choice into session stats
        const currentStats: SessionStats = currentState.stats ?? { knowledge: 0, relationships: 0, culturalWisdom: 0, courage: 0, reputation: 0, legacy: 0, faith: 0 };
        const updatedStats: SessionStats = { ...currentStats };
        if (statChanges) {
          for (const k of STAT_KEYS) {
            const delta = statChanges[k];
            if (typeof delta === "number") {
              updatedStats[k] = currentStats[k] + delta;
            }
          }
        }

        const [updated] = await db
          .update(legacySessionsTable)
          .set({
            current_chapter_id: chapterId,
            session_state: { completedScenes: Array.from(completedScenes), decisions, stats: clampStats(updatedStats) },
            updated_at: new Date(),
          })
          .where(eq(legacySessionsTable.id, session.id))
          .returning();
        session = updated;
      }

      return res.json({ session, sceneCompleted: completed });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-sessions: progress save failed");
      return res.status(500).json({ error: "Failed to save progress" });
    }
  },
);

// PATCH /api/legacy/sessions/:sessionId/end — end a session (pause or complete)
router.patch(
  "/legacy/sessions/:sessionId/end",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const sessionId = parseInt(String(req.params.sessionId), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const { status } = req.body as { status: "paused" | "completed" | "abandoned" };

    try {
      const [session] = await db
        .select()
        .from(legacySessionsTable)
        .where(eq(legacySessionsTable.id, sessionId))
        .limit(1);

      if (!session) return res.status(404).json({ error: "Session not found" });

      const userId = req.authenticatedUserId!;
      if (session.user_id !== userId) {
        return res.status(403).json({ error: "Not your session" });
      }

      const [updated] = await db
        .update(legacySessionsTable)
        .set({
          status: status ?? "completed",
          ended_at: status === "paused" ? null : new Date(),
          updated_at: new Date(),
        })
        .where(eq(legacySessionsTable.id, sessionId))
        .returning();

      return res.json({ session: updated });
    } catch (err) {
      logger.error({ err, sessionId }, "legacy-sessions: end failed");
      return res.status(500).json({ error: "Failed to end session" });
    }
  },
);

// ── Mystery Quests ────────────────────────────────────────────────────────────
// When the AI discovers missing information about an ancestor, it creates a
// "Mystery Quest" — a durable vault entry that prompts the player to ask a
// relative, upload a yearbook, find a photograph, or record an interview.
// The answer then becomes part of the family world.
//
//   GET /api/legacy/chapters/:chapterId/mystery-quests — list mystery quests
//   POST /api/legacy/chapters/:chapterId/mystery-quests — create a mystery quest

router.get(
  "/legacy/chapters/:chapterId/mystery-quests",
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

      // Mystery quests are stored as stories with a special tag
      const mysteries = await db
        .select()
        .from(familyStoriesTable)
        .where(
          and(
            eq(familyStoriesTable.family_id, chapter.family_id),
            eq(familyStoriesTable.category, "mystery_quest"),
          ),
        )
        .orderBy(desc(familyStoriesTable.created_at))
        .limit(20);

      return res.json({ mysteries });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: mystery quests failed");
      return res.status(500).json({ error: "Failed to get mystery quests" });
    }
  },
);

router.post(
  "/legacy/chapters/:chapterId/mystery-quests",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const chapterId = parseInt(String(req.params.chapterId), 10);
    if (isNaN(chapterId)) return res.status(400).json({ error: "Invalid chapter ID" });

    const { question, sceneNumber } = req.body as { question?: string; sceneNumber?: number };
    // If no question provided but sceneNumber is, generate one from the chapter context
    let finalQuestion = question;
    if (!finalQuestion || finalQuestion.trim().length < 5) {
      if (sceneNumber === undefined) {
        return res.status(400).json({ error: "Either a question (min 5 chars) or a sceneNumber is required" });
      }
      finalQuestion = `What more can our family discover about scene ${sceneNumber} of this chapter?`;
    }

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

      // Idempotent: don't create duplicate mystery quests for the same chapter+scene
      const dedupeTag = `mystery:chapter:${chapterId}:scene:${sceneNumber ?? 0}`;

      // Check if this question already exists (simple text match)
      const allMysteries = await db
        .select()
        .from(familyStoriesTable)
        .where(
          and(
            eq(familyStoriesTable.family_id, chapter.family_id),
            eq(familyStoriesTable.category, "mystery_quest"),
          ),
        );

      const duplicate = allMysteries.find(
        (m) => m.body?.includes(dedupeTag) || m.title === finalQuestion.slice(0, 120),
      );

      if (duplicate) {
        return res.json({ mystery: duplicate, alreadyExists: true });
      }

      // Create the mystery quest as a family story
      const [inserted] = await db
        .insert(familyStoriesTable)
        .values({
          family_id: chapter.family_id,
          title: finalQuestion.slice(0, 200),
          body: `${dedupeTag}\n\n${finalQuestion}`,
          category: "mystery_quest",
          teller_member_id: null,
          about_member_id: chapter.ancestor_member_id,
        })
        .returning();

      // Log to world evolution
      const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
      logWorldEvolution(chapter.family_id, "story_added", `New mystery quest: ${finalQuestion.slice(0, 80)}`).catch(() => {});

      return res.json({ mystery: inserted, created: true });
    } catch (err) {
      logger.error({ err, chapterId }, "legacy-chapters: create mystery quest failed");
      return res.status(500).json({ error: "Failed to create mystery quest" });
    }
  },
);
