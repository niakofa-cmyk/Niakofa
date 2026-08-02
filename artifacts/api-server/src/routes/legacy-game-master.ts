/**
 * Niakofa — Phase 5: AI Game Master (Living Family Universe)
 *
 * The AI Game Master generates narration content for the Legacy Mode RPG:
 * scene intros, dialogue, quest prompts, chapter summaries, historical
 * context, and ancestor introductions. It uses the family's real vault data
 * and stays grounded — verified family history is immutable, narrative
 * interpretation is clearly labeled.
 *
 * Narrations are cached by prompt hash so identical requests don't re-call
 * the AI model. Model provenance is stored for every generation.
 *
 * Routes:
 *   GET  /api/legacy/game-master/:familyId/narration  — get/generate narration
 *   GET  /api/legacy/game-master/:familyId/history    — narration history
 */

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryPeopleTable,
  familyStoriesTable,
  familyPlacesTable,
  familyEventsTable,
  legacyGameMasterNarrationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { getConsentedMemberIds } from "../lib/legacy-consent";
import { createHash } from "crypto";

const router = Router();

const MODEL = "claude-3-5-haiku-20241022";
const NARRATION_TTL_MS = 86_400_000; // 24h cache

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

function hashPrompt(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

interface NarrationRequest {
  narrationType: "scene_intro" | "dialogue" | "quest_prompt" | "chapter_summary" | "historical_context" | "ancestor_introduction";
  sessionId?: number;
  chapterId?: number;
  ancestorName?: string;
  sceneContext?: string;
}

// GET /api/legacy/game-master/:familyId/narration
router.get(
  "/legacy/game-master/:familyId/narration",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const narrationType = String(req.query.type ?? "scene_intro") as NarrationRequest["narrationType"];
    const sessionId = req.query.sessionId ? parseInt(String(req.query.sessionId), 10) : undefined;
    const chapterId = req.query.chapterId ? parseInt(String(req.query.chapterId), 10) : undefined;
    const ancestorName = req.query.ancestorName ? String(req.query.ancestorName) : undefined;
    const sceneContext = req.query.sceneContext ? String(req.query.sceneContext) : undefined;

    const promptInput = JSON.stringify({ familyId, narrationType, sessionId, chapterId, ancestorName, sceneContext });
    const promptHash = hashPrompt(promptInput);

    try {
      // Check cache
      const [cached] = await db
        .select()
        .from(legacyGameMasterNarrationsTable)
        .where(
          and(
            eq(legacyGameMasterNarrationsTable.family_id, familyId),
            eq(legacyGameMasterNarrationsTable.prompt_hash, promptHash),
          ),
        )
        .orderBy(desc(legacyGameMasterNarrationsTable.created_at))
        .limit(1);

      if (cached && Date.now() - new Date(cached.created_at).getTime() < NARRATION_TTL_MS) {
        return res.json({ narration: cached, cached: true });
      }

      // Build context from real family data
      const consentedIds = await getConsentedMemberIds(familyId);

      // Fetch a wider window of memories/stories, then apply the consent gate
      // in application code. A memory/story is allowed only if every tagged
      // family member has consented (or none are tagged, e.g. a place/object
      // photo with no people). This mirrors getConsentedMemberIds' documented
      // rule: living members with a linked account must self-consent.
      const [rawMemories, rawStories, places, events] = await Promise.all([
        db.select({ id: familyMemoriesTable.id, story: familyMemoriesTable.story, memoryDate: familyMemoriesTable.memory_date })
          .from(familyMemoriesTable)
          .where(eq(familyMemoriesTable.family_id, familyId))
          .orderBy(desc(familyMemoriesTable.memory_date))
          .limit(30),
        db.select({ id: familyStoriesTable.id, title: familyStoriesTable.title, body: familyStoriesTable.body, tellerMemberId: familyStoriesTable.teller_member_id, aboutMemberId: familyStoriesTable.about_member_id })
          .from(familyStoriesTable)
          .where(eq(familyStoriesTable.family_id, familyId))
          .orderBy(desc(familyStoriesTable.created_at))
          .limit(15),
        db.select({ label: familyPlacesTable.label, placeType: familyPlacesTable.place_type, country: familyPlacesTable.country }).from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)).limit(5),
        db.select({ title: familyEventsTable.title, eventDate: familyEventsTable.event_date, description: familyEventsTable.description }).from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)).limit(5),
      ]);

      const memoryPeople = rawMemories.length > 0
        ? await db.select({ memoryId: familyMemoryPeopleTable.memory_id, memberId: familyMemoryPeopleTable.member_id })
            .from(familyMemoryPeopleTable)
            .where(inArray(familyMemoryPeopleTable.memory_id, rawMemories.map((m) => m.id)))
        : [];
      const taggedByMemory = new Map<number, number[]>();
      for (const row of memoryPeople) {
        if (row.memberId === null) continue;
        const list = taggedByMemory.get(row.memoryId) ?? [];
        list.push(row.memberId);
        taggedByMemory.set(row.memoryId, list);
      }

      const memories = rawMemories
        .filter((m) => {
          const tagged = taggedByMemory.get(m.id);
          return !tagged || tagged.every((id) => consentedIds.has(id));
        })
        .slice(0, 10);

      const stories = rawStories
        .filter((s) =>
          (s.tellerMemberId === null || consentedIds.has(s.tellerMemberId)) &&
          (s.aboutMemberId === null || consentedIds.has(s.aboutMemberId)),
        )
        .slice(0, 5);

      const contextSummary = {
        memories: memories.map((m) => ({ content: m.story?.slice(0, 200), year: m.memoryDate ? new Date(m.memoryDate).getFullYear() : null })),
        stories: stories.map((s) => ({ title: s.title, content: s.body?.slice(0, 200) })),
        places: places.map((p) => ({ label: p.label, type: p.placeType, country: p.country })),
        events: events.map((e) => ({ title: e.title, date: e.eventDate, description: e.description?.slice(0, 200) })),
      };

      let systemPrompt = `You are Nia, the AI Game Master for Niakofa, a living family RPG built from real family history.\n\nCRITICAL RULES:\n1. NEVER fabricate family facts. Only use the provided family data.\n2. Clearly distinguish VERIFIED FAMILY HISTORY from NARRATIVE INTERPRETATION.\n3. If information is missing, note it as a mystery to discover — do not invent.\n4. Keep narration immersive but grounded in the family's real history.\n5. Respect historical context — never alter documented events.\n\nFamily data:\n${JSON.stringify(contextSummary, null, 2)}`;

      let userPrompt = "";
      switch (narrationType) {
        case "scene_intro":
          userPrompt = `Write a vivid scene introduction for the family RPG. ${sceneContext ? `Scene context: ${sceneContext}` : "Use the earliest known family event."} Keep it under 150 words. Make it feel personal and grounded.`;
          break;
        case "dialogue":
          userPrompt = `Write a short dialogue snippet between the player and a family member. ${ancestorName ? `The family member is ${ancestorName}.` : "Use a family member from the data."} Keep it under 100 words. Include 2-3 choices for the player.`;
          break;
        case "quest_prompt":
          userPrompt = `Generate a quest prompt based on the family's real history. The quest should encourage the player to discover or preserve something real. Keep it under 80 words.`;
          break;
        case "chapter_summary":
          userPrompt = `Write a brief chapter summary for the family RPG. Summarize what the player experienced in this chapter. Keep it under 100 words.`;
          break;
        case "historical_context":
          userPrompt = `Provide historical context for the family's story. Use the family's locations and time periods to ground the narrative in real history. Keep it under 120 words. Clearly label this as HISTORICAL CONTEXT, not family history.`;
          break;
        case "ancestor_introduction":
          userPrompt = `Write an introduction for ${ancestorName ?? "an ancestor"} as a playable character. Use only verified family data. Include birth year, location, and known stories. Keep it under 100 words.`;
          break;
        default:
          userPrompt = "Generate a brief narration for the family RPG.";
      }

      let content: string;
      let modelUsed = MODEL;
      let metadata: Record<string, unknown> = {};

      try {
        const anthropic = new Anthropic();
        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 400,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        content = response.content[0]?.type === "text" ? response.content[0].text : "";
        metadata = { stop_reason: response.stop_reason, usage: response.usage };
      } catch (aiErr) {
        logger.warn({ err: aiErr, familyId }, "legacy-game-master: AI call failed, using fallback");
        content = generateFallbackNarration(narrationType, ancestorName, contextSummary);
        modelUsed = "fallback";
      }

      const [narration] = await db
        .insert(legacyGameMasterNarrationsTable)
        .values({
          family_id: familyId,
          session_id: sessionId ?? null,
          chapter_id: chapterId ?? null,
          narration_type: narrationType,
          content,
          content_metadata: metadata,
          model_used: modelUsed,
          prompt_hash: promptHash,
        })
        .returning();

      return res.json({ narration, cached: false });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: narration failed");
      return res.status(500).json({ error: "Failed to generate narration" });
    }
  },
);

// GET /api/legacy/game-master/:familyId/history
router.get(
  "/legacy/game-master/:familyId/history",
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
      const narrations = await db
        .select()
        .from(legacyGameMasterNarrationsTable)
        .where(eq(legacyGameMasterNarrationsTable.family_id, familyId))
        .orderBy(desc(legacyGameMasterNarrationsTable.created_at))
        .limit(50);

      return res.json({ narrations });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: history failed");
      return res.status(500).json({ error: "Failed to load narration history" });
    }
  },
);

function generateFallbackNarration(
  type: string,
  ancestorName: string | undefined,
  context: { memories: unknown[]; stories: unknown[]; places: unknown[]; events: unknown[] },
): string {
  const memoryCount = context.memories.length;
  const storyCount = context.stories.length;
  const placeCount = context.places.length;
  const eventCount = context.events.length;

  switch (type) {
    case "scene_intro":
      return `The morning air carries the scent of home. Your family has ${memoryCount} preserved memories, ${storyCount} stories, and ${placeCount} known places. Today, you walk in the footsteps of those who came before you. What will you discover?`;
    case "dialogue":
      return `${ancestorName ?? "Your elder"}: "There is so much of our story yet to be told. Will you listen?"\n\n[1] Yes, tell me everything\n[2] I want to hear about our home\n[3] Tell me about your life`;
    case "quest_prompt":
      return `Your family has preserved ${storyCount} stories across ${placeCount} locations. Visit a place tied to one of these stories and add a memory of your own.`;
    case "chapter_summary":
      return `You explored ${eventCount} family events and ${memoryCount} memories. The journey continues — each discovery adds to your family's living world.`;
    case "historical_context":
      return `HISTORICAL CONTEXT: Your family's ${placeCount} known locations span generations. Research the history of these places to understand the world your ancestors lived in.`;
    case "ancestor_introduction":
      return `${ancestorName ?? "Your ancestor"} — a figure preserved through ${memoryCount} memories and ${storyCount} stories. Their life is waiting to be experienced.`;
    default:
      return "Your family's story continues to unfold.";
  }
}

export default router;
