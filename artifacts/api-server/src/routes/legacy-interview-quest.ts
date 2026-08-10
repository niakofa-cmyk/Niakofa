/**
 * Niakofa — Interview Quest System
 *
 * Transforms the microphone from a utility into a core gameplay mechanic.
 * Instead of "Record Story", players embark on "Interview Quests":
 *
 *   Interview Quest → AI Transcribes → Extracts Facts → Updates Timeline
 *     → Updates Family Tree → Creates Dialogue → Unlocks Chapter
 *     → Expands Map → Generates Achievement
 *
 * This is the Memory→AI→World Changes→Player Notices→New Gameplay loop
 * made tangible through every interview.
 *
 * Routes:
 *   GET    /api/legacy/interview-quests/:familyId            — list available quests
 *   POST   /api/legacy/interview-quests/:familyId/start     — start a quest (assigns target)
 *   POST   /api/legacy/interview-quests/:questId/submit     — submit recorded audio
 *   GET    /api/legacy/interview-quests/:questId/result     — get extraction results
 *   POST   /api/legacy/interview-quests/:questId/complete   — finalize & trigger world regen
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryAssetsTable,
  familyInterviewsTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyMemoryPeopleTable,
  legacyWorldsTable,
  legacyChaptersTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getConsentedMemberIds } from "../lib/legacy-consent";
import { legacyAI } from "../lib/legacy-ai-gateway";
import { logWorldEvolution } from "../lib/legacy-world-evolution";
import { getAssetUrl, getStorageBackend, putAsset } from "../lib/storage";
import { normalizeQuestResult, type InterviewExtraction } from "../lib/legacy-interview-result";
import { requestTimeout } from "../middlewares/timeout";

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

interface QuestTemplate {
  type: string;
  title: string;
  description: string;
  suggestedQuestions: string[];
  rewardXp: number;
  worldChanges: string[];
  unlocks: string[];
}

const QUEST_TEMPLATES: QuestTemplate[] = [
  {
    type: "elder_interview",
    title: "Interview an Elder",
    description: "Sit with an elder and record their story. Their words will become the foundation of new chapters.",
    suggestedQuestions: [
      "What was your childhood like?",
      "Who was the most important person in your early life?",
      "What traditions did your family keep?",
      "What place meant the most to you growing up?",
      "What do you want the next generation to remember?",
    ],
    rewardXp: 150,
    worldChanges: ["timeline_updated", "dialogue_created", "chapter_unlocked"],
    unlocks: ["New dialogue with this ancestor", "Timeline events extracted", "New chapter seeded"],
  },
  {
    type: "family_origin",
    title: "Trace Your Family Origin",
    description: "Interview a relative about where the family comes from. Every place name will expand your map.",
    suggestedQuestions: [
      "Where was our family originally from?",
      "How did our family get to where we live now?",
      "What was the journey like?",
      "Who made the decision to move?",
      "What did we leave behind?",
    ],
    rewardXp: 120,
    worldChanges: ["map_expanded", "place_discovered", "migration_event_added"],
    unlocks: ["New map location", "Migration story chapter", "Origin place unlocked"],
  },
  {
    type: "tradition_keeper",
    title: "Preserve a Family Tradition",
    description: "Record someone performing or describing a family tradition — a recipe, a song, a ceremony.",
    suggestedQuestions: [
      "Can you describe this tradition step by step?",
      "Who taught you this?",
      "Why is this important to our family?",
      "How has it changed over the years?",
      "What does it mean to you?",
    ],
    rewardXp: 100,
    worldChanges: ["cultural_tradition_added", "achievement_generated", "dialogue_created"],
    unlocks: ["Cultural Wisdom achievement", "Tradition dialogue unlocked", "Recipe/ceremony preserved"],
  },
  {
    type: "photo_identification",
    title: "Identify Old Photographs",
    description: "Show old photographs to a relative and record them identifying people, places, and events.",
    suggestedQuestions: [
      "Who is in this photo?",
      "Where was this taken?",
      "When was this taken?",
      "What was happening that day?",
      "Who else was there?",
    ],
    rewardXp: 80,
    worldChanges: ["people_identified", "memory_enriched", "connections_strengthened"],
    unlocks: ["Family connections strengthened", "Memory enriched with names", "Relationship graph updated"],
  },
  {
    type: "missing_ancestor",
    title: "Discover a Missing Ancestor",
    description: "Interview a relative about someone in the family tree who has no stories yet.",
    suggestedQuestions: [
      "Tell me about [ancestor name]",
      "What were they like as a person?",
      "What did they do for a living?",
      "How were they related to us?",
      "What's your strongest memory of them?",
    ],
    rewardXp: 200,
    worldChanges: ["character_created", "dialogue_created", "timeline_updated", "chapter_unlocked"],
    unlocks: ["New playable character", "New dialogue unlocked", "Timeline enriched", "New chapter available"],
  },
];

router.get(
  "/legacy/interview-quests/:familyId",
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
      if (consentedIds.size === 0) {
        return res.json({ quests: [], message: "Add family members to unlock interview quests" });
      }

      const [members, memories, interviews, stories, _events, places] = await Promise.all([
        db.select().from(familyMembersTable).where(
          and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active")),
        ),
        db.select().from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)).limit(200),
        db.select().from(familyInterviewsTable).where(eq(familyInterviewsTable.family_id, familyId)).limit(50),
        db.select().from(familyStoriesTable).where(eq(familyStoriesTable.family_id, familyId)).limit(200),
        db.select().from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)).limit(200),
        db.select().from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)).limit(100),
      ]);

      const quests: Array<{
        questType: string;
        title: string;
        description: string;
        suggestedQuestions: string[];
        rewardXp: number;
        worldChanges: string[];
        unlocks: string[];
        targetMemberId: number | null;
        targetMemberName: string | null;
        urgency: "high" | "medium" | "low";
      }> = [];

      const livingMembersWithoutInterviews = members.filter(
        (m) => m.is_living !== false &&
        !interviews.some((i) => i.subject_member_id === m.id),
      );

      for (const member of livingMembersWithoutInterviews.slice(0, 3)) {
        const template = QUEST_TEMPLATES.find((t) => t.type === "elder_interview")!;
        quests.push({
          ...template,
          questType: template.type,
          targetMemberId: member.id,
          targetMemberName: member.display_name,
          urgency: "high",
        });
      }

      const familyMemoryIds = memories.map((m) => m.id);
      const memoryPeople = familyMemoryIds.length > 0
        ? await db
            .select({ member_id: familyMemoryPeopleTable.member_id })
            .from(familyMemoryPeopleTable)
            .where(inArray(familyMemoryPeopleTable.memory_id, familyMemoryIds))
        : [];
      const taggedMemberIds = new Set(memoryPeople.map((mp) => mp.member_id));

      for (const member of members) {
        if (!consentedIds.has(member.id)) continue;
        const hasStories = stories.some((s) => s.about_member_id === member.id);
        const hasMemories = taggedMemberIds.has(member.id);
        if (!hasStories && !hasMemories) {
          const template = QUEST_TEMPLATES.find((t) => t.type === "missing_ancestor")!;
          quests.push({
            ...template,
            questType: template.type,
            title: `Discover ${member.display_name}'s Story`,
            targetMemberId: member.id,
            targetMemberName: member.display_name,
            urgency: "high",
          });
        }
      }

      if (places.length === 0) {
        const template = QUEST_TEMPLATES.find((t) => t.type === "family_origin")!;
        quests.push({ ...template, questType: template.type, targetMemberId: null, targetMemberName: null, urgency: "medium" });
      }

      if (memories.length > stories.length && stories.length < 5) {
        const template = QUEST_TEMPLATES.find((t) => t.type === "tradition_keeper")!;
        quests.push({ ...template, questType: template.type, targetMemberId: null, targetMemberName: null, urgency: "low" });
      }

      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      quests.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      return res.json({ quests: quests.slice(0, 6), totalAvailable: quests.length });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-interview-quests: list failed");
      return res.status(500).json({ error: "Failed to load interview quests" });
    }
  },
);

router.post(
  "/legacy/interview-quests/:familyId/start",
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
      const { questType, targetMemberId, title } = req.body as {
        questType: string;
        targetMemberId?: number;
        title?: string;
      };

      const template = QUEST_TEMPLATES.find((t) => t.type === questType);
      if (!template) return res.status(400).json({ error: "Unknown quest type" });

      const [interview] = await db
        .insert(familyInterviewsTable)
        .values({
          family_id: familyId,
          subject_member_id: targetMemberId ?? null,
          title: title ?? template.title,
          status: "in_progress",
          interview_type: questType,
          conducted_by: userId,
        })
        .returning();

      return res.json({ interviewId: interview.id, quest: template, status: "in_progress" });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-interview-quests: start failed");
      return res.status(500).json({ error: "Failed to start interview quest" });
    }
  },
);

router.post(
  "/legacy/interview-quests/:questId/submit",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const questId = parseInt(String(req.params.questId), 10);
    if (isNaN(questId)) return res.status(400).json({ error: "Invalid quest ID" });

    try {
      const [interview] = await db
        .select()
        .from(familyInterviewsTable)
        .where(eq(familyInterviewsTable.id, questId))
        .limit(1);

      if (!interview) return res.status(404).json({ error: "Interview quest not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, interview.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const { transcript } = req.body as { transcript: string };

      if (!transcript || transcript.trim().length < 10) {
        return res.status(400).json({ error: "Transcript too short for extraction" });
      }

      // A client may retry after a timeout while the first request is still
      // finishing. Reuse the existing canonical memory instead of rerunning
      // extraction and duplicating places, events, stories, and evolution log
      // entries.
      if (interview.resulting_memory_id) {
        return res.json({
          questId,
          status: interview.status,
          extraction: interview.extraction_result,
          worldChanges: [],
          memoryId: interview.resulting_memory_id,
          result: normalizeQuestResult(
            interview.transcript,
            interview.extraction_result as InterviewExtraction | null,
          ),
          nextSteps: [
            "Review extracted facts in your Family Vault",
            "New dialogue is being generated for this ancestor",
            "Your world map has been updated with discovered places",
            "Timeline events have been added",
          ],
        });
      }

      const extractionPrompt = `You are Nia, the AI guardian of a family's legacy. Analyze this interview transcript and extract structured facts.

Transcript:
"${transcript.slice(0, 3000)}"

Extract:
1. People mentioned (with relationships if stated)
2. Places mentioned (with country/region if stated)
3. Events mentioned (with dates if stated)
4. Traditions or cultural practices mentioned
5. Emotional themes (e.g., loss, migration, resilience, joy)
6. Key quotes (most memorable 1-2 sentences)

Return as JSON:
{
  "people": [{"name": "...", "relationship": "...", "context": "..."}],
  "places": [{"label": "...", "country": "...", "context": "..."}],
  "events": [{"title": "...", "date": "...", "description": "..."}],
  "traditions": [{"name": "...", "description": "..."}],
  "emotionalThemes": ["..."],
  "keyQuotes": ["..."],
  "summary": "2-3 sentence narrative summary of this interview"
}`;

      let extraction: {
        people: Array<{ name: string; relationship: string; context: string }>;
        places: Array<{ label: string; country: string; context: string }>;
        events: Array<{ title: string; date: string; description: string }>;
        traditions: Array<{ name: string; description: string }>;
        emotionalThemes: string[];
        keyQuotes: string[];
        summary: string;
      };

      try {
        const aiResponse = await legacyAI.generate({
          system: "You are Nia, the AI guardian of a family's legacy. Extract structured facts from interview transcripts. Always return valid JSON only.",
          userPrompt: extractionPrompt,
          maxTokens: 1200,
        });
        extraction = JSON.parse(aiResponse.content);
      } catch {
        extraction = {
          people: [], places: [], events: [], traditions: [],
          emotionalThemes: [], keyQuotes: [], summary: transcript.slice(0, 200),
        };
      }

      await db
        .update(familyInterviewsTable)
        .set({
          transcript: transcript.slice(0, 10000),
          status: "transcribed",
          extraction_result: extraction,
          completed_at: new Date(),
        })
        .where(eq(familyInterviewsTable.id, questId));

      // Every completed interview also becomes a canonical Family Vault memory.
      // The interview row remains the extraction record; the memory is the
      // durable player-facing object that can receive audio/video assets.
      const [memory] = await db
        .insert(familyMemoriesTable)
        .values({
          family_id: interview.family_id,
          author_id: userId,
          title: `Interview: ${interview.title ?? "Legacy Interview"}`,
          description: extraction.summary || "Preserved oral history interview",
          story: transcript.slice(0, 50_000),
          source: "interview",
          interview_id: questId,
        })
        .returning();

      await db
        .update(familyInterviewsTable)
        .set({ resulting_memory_id: memory.id, updated_at: new Date() })
        .where(eq(familyInterviewsTable.id, questId));

      const worldChanges: string[] = [];

      for (const place of extraction.places.slice(0, 5)) {
        const existing = await db
          .select()
          .from(familyPlacesTable)
          .where(and(eq(familyPlacesTable.family_id, interview.family_id), eq(familyPlacesTable.label, place.label)))
          .limit(1);

        if (existing.length === 0 && place.label) {
          await db.insert(familyPlacesTable).values({
            family_id: interview.family_id,
            label: place.label,
            place_type: "other",
            country: place.country || null,
            notes: place.context || null,
          });
          worldChanges.push(`New place discovered: ${place.label}`);
        }
      }

      for (const event of extraction.events.slice(0, 10)) {
        if (!event.title) continue;
        await db.insert(familyEventsTable).values({
          family_id: interview.family_id,
          member_id: interview.subject_member_id,
          title: event.title,
          description: event.description || null,
          event_date: event.date ? new Date(event.date) : null,
          category: "other",
        });
        worldChanges.push(`Timeline event added: ${event.title}`);
      }

      if (extraction.summary) {
        await db.insert(familyStoriesTable).values({
          family_id: interview.family_id,
          about_member_id: interview.subject_member_id,
          title: `Interview: ${interview.title ?? "Legacy Interview"}`,
          body: extraction.summary,
          category: "oral_history",
        });
        worldChanges.push("New story preserved in vault");
      }

      await logWorldEvolution(
        interview.family_id,
        "interview_added",
        `Interview completed: ${interview.title}. ${worldChanges.length} world changes applied.`,
        worldChanges.length + 1,
      );

      return res.json({
        questId, status: "transcribed", extraction, worldChanges,
        memoryId: memory.id,
        result: normalizeQuestResult(transcript, extraction),
        nextSteps: [
          "Review extracted facts in your Family Vault",
          "New dialogue is being generated for this ancestor",
          "Your world map has been updated with discovered places",
          "Timeline events have been added",
        ],
      });
    } catch (err) {
      logger.error({ err, questId }, "legacy-interview-quests: submit failed");
      return res.status(500).json({ error: "Failed to process interview" });
    }
  },
);

// POST /legacy/interview-quests/:questId/media
// Stores the captured audio/video in the canonical Family Vault memory created
// by the transcript submission above. Raw media never enters Postgres.
router.post(
  "/legacy/interview-quests/:questId/media",
  generalApiLimiter,
  requestTimeout(120_000),
  requireAuth,
  async (req, res) => {
    const questId = parseInt(String(req.params.questId), 10);
    if (isNaN(questId)) return res.status(400).json({ error: "Invalid quest ID" });

    const [interview] = await db
      .select()
      .from(familyInterviewsTable)
      .where(eq(familyInterviewsTable.id, questId))
      .limit(1);
    if (!interview) return res.status(404).json({ error: "Interview quest not found" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, interview.family_id))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }
    if (!interview.resulting_memory_id) {
      return res.status(409).json({ error: "Submit the interview transcript before uploading media" });
    }

    const media = req.body as Buffer;
    const mimeType = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0];
    const assetType = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : null;
    if (!assetType || !Buffer.isBuffer(media) || media.length === 0) {
      return res.status(400).json({ error: "Audio or video data is required" });
    }
    if (media.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: "Recording exceeds the 20 MB limit" });
    }

    const filename = String(req.headers["x-filename"] ?? `interview-${questId}.${assetType === "video" ? "webm" : "webm"}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 120);
    const storageKey = `families/${interview.family_id}/memories/${interview.resulting_memory_id}/interviews/${questId}_${filename}`;
    await putAsset(storageKey, media, mimeType);

    const [asset] = await db
      .insert(familyMemoryAssetsTable)
      .values({
        memory_id: interview.resulting_memory_id,
        asset_type: assetType,
        storage_key: storageKey,
        mime_type: mimeType,
        byte_size: media.length,
        transcript: interview.transcript,
        processing_status: "ready",
      })
      .returning();

    logger.info(
      { questId, familyId: interview.family_id, assetId: asset.id, assetType, backend: getStorageBackend() },
      "legacy_interview_media_stored",
    );
    await logWorldEvolution(
      interview.family_id,
      "interview_added",
      `${assetType === "video" ? "Video" : "Audio"} interview recording preserved in the Family Vault.`,
      1,
    );

    return res.status(201).json({
      asset: { ...asset, url: await getAssetUrl(storageKey) },
      memoryId: interview.resulting_memory_id,
    });
  },
);

router.get(
  "/legacy/interview-quests/:questId/result",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const questId = parseInt(String(req.params.questId), 10);
    if (isNaN(questId)) return res.status(400).json({ error: "Invalid quest ID" });

    try {
      const [interview] = await db
        .select().from(familyInterviewsTable)
        .where(eq(familyInterviewsTable.id, questId)).limit(1);

      if (!interview) return res.status(404).json({ error: "Interview quest not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, interview.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      return res.json({
        interview: {
          id: interview.id, title: interview.title, status: interview.status,
          transcript: interview.transcript, extraction: interview.extraction_result,
          completedAt: interview.completed_at,
        },
        result: normalizeQuestResult(
          interview.transcript,
          interview.extraction_result as InterviewExtraction | null,
        ),
      });
    } catch (err) {
      logger.error({ err, questId }, "legacy-interview-quests: result failed");
      return res.status(500).json({ error: "Failed to load interview results" });
    }
  },
);

router.post(
  "/legacy/interview-quests/:questId/complete",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const questId = parseInt(String(req.params.questId), 10);
    if (isNaN(questId)) return res.status(400).json({ error: "Invalid quest ID" });

    try {
      const [interview] = await db
        .select().from(familyInterviewsTable)
        .where(eq(familyInterviewsTable.id, questId)).limit(1);

      if (!interview) return res.status(404).json({ error: "Interview quest not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, interview.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      await db.update(familyInterviewsTable)
        .set({ status: "completed", completed_at: new Date() })
        .where(eq(familyInterviewsTable.id, questId));

      try {
        const { syncAchievements } = await import("./legacy-achievements");
        await syncAchievements(interview.family_id);
      } catch (e) {
        logger.warn({ err: e, questId }, "legacy-interview-quests: syncAchievements failed (non-fatal)");
      }

      await logWorldEvolution(
        interview.family_id, "interview_added",
        `Interview quest completed: ${interview.title}. World regenerated.`, 1,
      );

      const [world] = await db
        .select().from(legacyWorldsTable)
        .where(eq(legacyWorldsTable.family_id, interview.family_id))
        .orderBy(desc(legacyWorldsTable.created_at)).limit(1);

      const chapters = await db
        .select().from(legacyChaptersTable)
        .where(eq(legacyChaptersTable.world_id, world?.id ?? 0))
        .orderBy(legacyChaptersTable.chapter_number).limit(10);

      return res.json({
        questId, status: "completed", worldUpdated: true,
        newContentAvailable: chapters.filter((c) => c.status === "unlocked").length > 0,
        availableChapters: chapters.filter((c) => c.status === "unlocked").map((c) => ({
          id: c.id, title: c.title, chapterNumber: c.chapter_number,
        })),
        message: "Your world has evolved. New stories, places, and chapters await.",
      });
    } catch (err) {
      logger.error({ err, questId }, "legacy-interview-quests: complete failed");
      return res.status(500).json({ error: "Failed to complete interview quest" });
    }
  },
);

export default router;
