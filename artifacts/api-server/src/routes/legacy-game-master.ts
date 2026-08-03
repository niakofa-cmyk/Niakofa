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
  familyInterviewsTable,
  familyTreeRelationsTable,
  familyKnowledgeVersionsTable,
  legacyGameMasterNarrationsTable,
  legacyWorldEvolutionLogTable,
  legacyChaptersTable,
  legacyCharacterEvolutionTable,
} from "@workspace/db";
import { eq, and, desc, inArray, sql, asc } from "drizzle-orm";
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

async function getKnowledgeVersion(familyId: number): Promise<number> {
  try {
    const [latest] = await db
      .select({ version: familyKnowledgeVersionsTable.version })
      .from(familyKnowledgeVersionsTable)
      .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
      .orderBy(desc(familyKnowledgeVersionsTable.version))
      .limit(1);
    return latest?.version ?? 0;
  } catch {
    return 0;
  }
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

    const VALID_NARRATION_TYPES = ["scene_intro", "dialogue", "quest_prompt", "chapter_summary", "historical_context", "ancestor_introduction"] as const;
    const rawType = String(req.query.type ?? "scene_intro");
    if (!VALID_NARRATION_TYPES.includes(rawType as typeof VALID_NARRATION_TYPES[number])) {
      return res.status(400).json({ error: "Invalid narration type" });
    }
    const narrationType = rawType as NarrationRequest["narrationType"];
    const sessionId = req.query.sessionId ? parseInt(String(req.query.sessionId), 10) : undefined;
    const chapterId = req.query.chapterId ? parseInt(String(req.query.chapterId), 10) : undefined;
    const ancestorName = req.query.ancestorName ? String(req.query.ancestorName) : undefined;
    const sceneContext = req.query.sceneContext ? String(req.query.sceneContext) : undefined;

    const knowledgeVersion = await getKnowledgeVersion(familyId);
    const promptInput = JSON.stringify({ familyId, narrationType, sessionId, chapterId, ancestorName, sceneContext, knowledgeVersion });
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

// ── Today's Journey ──────────────────────────────────────────────────────────
// Daily ancestor selection — deterministic per family per day so the same
// ancestor shows all day (not random per refresh). Picks the ancestor with the
// richest vault data who hasn't been featured recently, then generates a
// short "today's goal" narration.
//
//   GET /api/legacy/game-master/:familyId/today — today's journey

router.get(
  "/legacy/game-master/:familyId/today",
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

      // Fetch members with consent
      const members = (await db
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
        )).filter((m) => consentedIds.has(m.id));

      if (members.length === 0) {
        return res.json({ journey: null, message: "Add family members to begin your journey." });
      }

      // Score each member by data richness
      const scored: Array<{ member: typeof members[0]; score: number; storyCount: number; eventCount: number; placeCount: number }> = [];
      for (const member of members) {
        const [{ sc }] = await db.select({ sc: sql`count(*)::int` }).from(familyStoriesTable).where(eq(familyStoriesTable.about_member_id, member.id));
        const [{ ec }] = await db.select({ ec: sql`count(*)::int` }).from(familyEventsTable).where(eq(familyEventsTable.member_id, member.id));
        const [{ pc }] = await db.select({ pc: sql`count(DISTINCT ${familyEventsTable.place_id})::int` }).from(familyEventsTable).where(and(eq(familyEventsTable.member_id, member.id), sql`${familyEventsTable.place_id} IS NOT NULL`));
        const score = Number(sc) * 3 + Number(ec) * 2 + Number(pc) * 2;
        scored.push({ member, score, storyCount: Number(sc), eventCount: Number(ec), placeCount: Number(pc) });
      }

      // Deterministic daily pick: hash the date + familyId to pick from sorted candidates
      const today = new Date().toISOString().slice(0, 10);
      const dayHash = createHash("sha256").update(`${familyId}:${today}`).digest("hex");
      const hashNum = parseInt(dayHash.slice(0, 8), 16);
      // Sort by score descending, then pick by hash
      scored.sort((a, b) => b.score - a.score);
      const topCandidates = scored.filter((s) => s.score > 0).length > 0
        ? scored.filter((s) => s.score > 0)
        : scored;
      const picked = topCandidates[hashNum % topCandidates.length];

      if (!picked) {
        return res.json({ journey: null, message: "No ancestors with enough data yet." });
      }

      // Get birth year
      const [birthEvent] = await db
        .select({ eventDate: familyEventsTable.event_date })
        .from(familyEventsTable)
        .where(and(eq(familyEventsTable.member_id, picked.member.id), eq(familyEventsTable.category, "birth")))
        .orderBy(asc(familyEventsTable.event_date))
        .limit(1);

      const birthYear = birthEvent?.eventDate ? new Date(birthEvent.eventDate).getFullYear() : null;

      // Generate a short "today's goal" narration
      const narrationType = "scene_intro" as const;
      const knowledgeVersion = await getKnowledgeVersion(familyId);
      const promptInput = JSON.stringify({ familyId, narrationType, ancestorName: picked.member.name, sceneContext: "daily journey introduction", date: today, knowledgeVersion });
      const promptHash = hashPrompt(promptInput);

      // Check cache (daily — same narration all day)
      const [cached] = await db
        .select()
        .from(legacyGameMasterNarrationsTable)
        .where(
          and(
            eq(legacyGameMasterNarrationsTable.family_id, familyId),
            eq(legacyGameMasterNarrationsTable.prompt_hash, promptHash),
          ),
        )
        .limit(1);

      let narration: string;
      let narrationId: number | null = null;
      let cachedFlag = false;

      if (cached && Date.now() - new Date(cached.created_at).getTime() < NARRATION_TTL_MS) {
        narration = cached.content;
        narrationId = cached.id;
        cachedFlag = true;
      } else {
        // Fetch context
        const [memories, places] = await Promise.all([
          db.select({ story: familyMemoriesTable.story, memoryDate: familyMemoriesTable.memory_date })
            .from(familyMemoriesTable)
            .where(eq(familyMemoriesTable.family_id, familyId))
            .orderBy(desc(familyMemoriesTable.memory_date))
            .limit(5),
          db.select({ label: familyPlacesTable.label, country: familyPlacesTable.country })
            .from(familyPlacesTable)
            .where(eq(familyPlacesTable.family_id, familyId))
            .limit(3),
        ]);

        const contextSummary = {
          ancestorName: picked.member.name,
          ancestorRole: picked.member.role,
          birthYear,
          memories: memories.map((m) => ({ content: m.story?.slice(0, 150), year: m.memoryDate ? new Date(m.memoryDate).getFullYear() : null })),
          places: places.map((p) => ({ label: p.label, country: p.country })),
        };

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (apiKey) {
          try {
            const anthropic = new Anthropic({ apiKey });
            const response = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 200,
              messages: [{
                role: "user",
                content: `You are Nia, the AI Game Master for Niakofa. Write a brief, evocative "Today's Journey" introduction for the player.

Family data:
${JSON.stringify(contextSummary, null, 2)}

Rules:
- Under 80 words
- Address the player directly ("You awaken as...")
- Use ONLY real family data — never fabricate
- If birth year is known, mention it; if not, skip it
- End with a sense of purpose for today

Write the introduction:`,
              }],
            });
            narration = response.content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("")
              .trim();
          } catch {
            narration = `You awaken as ${picked.member.name}${birthYear ? `, born ${birthYear}` : ""}. ${picked.member.role ? `Their role: ${picked.member.role}.` : ""} Today, your family's stories await discovery.`;
          }
        } else {
          narration = `You awaken as ${picked.member.name}${birthYear ? `, born ${birthYear}` : ""}. ${picked.member.role ? `Their role: ${picked.member.role}.` : ""} Today, your family's stories await discovery.`;
        }

        // Persist narration
        const [inserted] = await db
          .insert(legacyGameMasterNarrationsTable)
          .values({
            family_id: familyId,
            narration_type: narrationType,
            prompt_hash: promptHash,
            content: narration,
            model_used: MODEL,
            content_metadata: contextSummary,
          })
          .returning();
        narrationId = inserted?.id ?? null;
      }

      return res.json({
        journey: {
          ancestor: {
            memberId: picked.member.id,
            name: picked.member.name,
            role: picked.member.role,
            relation: picked.member.relation,
            birthYear,
          },
          storyCount: picked.storyCount,
          eventCount: picked.eventCount,
          placeCount: picked.placeCount,
          narration,
          narrationId,
          date: today,
        },
        cached: cachedFlag,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: today's journey failed");
      return res.status(500).json({ error: "Failed to generate today's journey" });
    }
  },
);

// ── Daily Legacy Welcome ──────────────────────────────────────────────────────
// Returns a "welcome back" summary: new memories since last visit, whether
// the world has evolved, and if new chapters are available. This powers the
// "Welcome Back — your world has changed" experience from the design docs.
//
//   GET /api/legacy/game-master/:familyId/daily-welcome

router.get(
  "/legacy/game-master/:familyId/daily-welcome",
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
      // Get world version info
      const [latestVersion] = await db
        .select()
        .from(familyKnowledgeVersionsTable)
        .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
        .orderBy(desc(familyKnowledgeVersionsTable.version))
        .limit(1);

      // Get recent evolution changes (last 24h)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentChanges = await db
        .select()
        .from(legacyWorldEvolutionLogTable)
        .where(
          and(
            eq(legacyWorldEvolutionLogTable.family_id, familyId),
            sql`${legacyWorldEvolutionLogTable.created_at} >= ${yesterday}`,
          ),
        )
        .orderBy(desc(legacyWorldEvolutionLogTable.created_at))
        .limit(10);

      // Count new memories in last 24h
      const newMemResult = await db
        .select({ cnt: sql`count(*)::int` })
        .from(familyMemoriesTable)
        .where(
          and(
            eq(familyMemoriesTable.family_id, familyId),
            sql`${familyMemoriesTable.created_at} >= ${yesterday}`,
          ),
        );
      const newMemoryCount = Number(newMemResult[0]?.cnt ?? 0);

      // Count new members in last 24h
      const newMemberResult = await db
        .select({ cnt: sql`count(*)::int` })
        .from(familyMembersTable)
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            sql`${familyMembersTable.created_at} >= ${yesterday}`,
          ),
        );
      const newMemberCount = Number(newMemberResult[0]?.cnt ?? 0);

      // Check for new chapters (unlocked but not yet played)
      const newChapters = await db
        .select()
        .from(legacyChaptersTable)
        .where(
          and(
            eq(legacyChaptersTable.family_id, familyId),
            eq(legacyChaptersTable.status, "unlocked"),
          ),
        )
        .orderBy(asc(legacyChaptersTable.chapter_number))
        .limit(3);

      // Check for upcoming emotional calendar events (next 7 days)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      const upcomingEvents = await db
        .select()
        .from(familyEventsTable)
        .where(
          and(
            eq(familyEventsTable.family_id, familyId),
            sql`${familyEventsTable.event_date} >= ${today}`,
            sql`${familyEventsTable.event_date} <= ${weekFromNow}`,
          ),
        )
        .orderBy(asc(familyEventsTable.event_date))
        .limit(5);

      // Count new places in last 24h
      const newPlaceResult = await db
        .select({ cnt: sql`count(*)::int` })
        .from(familyPlacesTable)
        .where(
          and(
            eq(familyPlacesTable.family_id, familyId),
            sql`${familyPlacesTable.created_at} >= ${yesterday}`,
          ),
        );
      const newPlaceCount = Number(newPlaceResult[0]?.cnt ?? 0);

      // Count new character evolution snapshots in last 24h
      const newCharacterResult = await db
        .select({ cnt: sql`count(*)::int` })
        .from(legacyCharacterEvolutionTable)
        .where(
          and(
            eq(legacyCharacterEvolutionTable.family_id, familyId),
            sql`${legacyCharacterEvolutionTable.created_at} >= ${yesterday}`,
          ),
        );
      const newCharacterCount = Number(newCharacterResult[0]?.cnt ?? 0);

      const hasChanges = recentChanges.length > 0 || newMemoryCount > 0 || newMemberCount > 0 || newPlaceCount > 0 || newCharacterCount > 0;

      return res.json({
        hasChanges,
        worldVersion: latestVersion?.version ?? 0,
        newMemoryCount,
        newMemberCount,
        newPlaceCount,
        newCharacterCount,
        recentChanges: recentChanges.map((c) => ({
          changeType: c.change_type,
          description: c.change_description,
          createdAt: c.created_at,
        })),
        newChapters: newChapters.map((c) => ({
          id: c.id,
          title: c.title,
          chapterNumber: c.chapter_number,
        })),
        upcomingEvents: upcomingEvents.map((e) => ({
          id: e.id,
          title: e.title,
          eventDate: e.event_date,
          category: e.category,
        })),
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: daily welcome failed");
      return res.status(500).json({ error: "Failed to get daily welcome" });
    }
  },
);

// ── Emotional Calendar ────────────────────────────────────────────────────────
// Returns family emotional milestones: birthdays, anniversaries, migration
// anniversaries, and memorial days. These trigger special quests and
// remembrance activities from the design docs.
//
//   GET /api/legacy/game-master/:familyId/emotional-calendar

router.get(
  "/legacy/game-master/:familyId/emotional-calendar",
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

      // Get all events for this family
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

      // Get members for names
      const members = await db
        .select({
          id: familyMembersTable.id,
          name: familyMembersTable.display_name,
          is_living: familyMembersTable.is_living,
        })
        .from(familyMembersTable)
        .where(
          and(
            eq(familyMembersTable.family_id, familyId),
            eq(familyMembersTable.status, "active"),
          ),
        );

      const memberMap = new Map(members.map((m) => [m.id, m]));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentMonth = today.getMonth();
      const currentDay = today.getDate();

      // Build emotional calendar entries
      interface CalendarEntry {
        id: number;
        type: string;
        title: string;
        description: string | null;
        date: string | null;
        memberName: string | null;
        isToday: boolean;
        isUpcoming: boolean;
        daysUntil: number;
        yearsAgo: number | null;
      }

      const entries: CalendarEntry[] = [];

      for (const event of events) {
        // Only include events for consented members
        if (event.memberId && !consentedIds.has(event.memberId)) continue;

        if (!event.eventDate) continue;
        const eventDate = new Date(event.eventDate);
        const member = event.memberId ? memberMap.get(event.memberId) : null;

        // Check if this event's anniversary is today or upcoming
        const anniversaryThisYear = new Date(today.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const diffTime = anniversaryThisYear.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Only include events within +/- 30 days
        if (diffDays < -30 || diffDays > 30) continue;

        const isToday = anniversaryThisYear.getMonth() === currentMonth && anniversaryThisYear.getDate() === currentDay;
        const isUpcoming = diffDays >= 0 && diffDays <= 7;
        const yearsAgo = today.getFullYear() - eventDate.getFullYear();

        let type = "memorial";
        let title = event.title ?? "Family Event";

        if (event.category === "birth") {
          type = "birthday";
          title = member ? `${member.name}'s Birthday` : "Birthday";
        } else if (event.category === "marriage" || event.category === "wedding") {
          type = "anniversary";
          title = member ? `${member.name}'s Anniversary` : "Anniversary";
        } else if (event.category === "migration") {
          type = "migration_anniversary";
          title = member ? `${member.name}'s Migration` : "Migration Anniversary";
        } else if (event.category === "death") {
          type = "memorial";
          title = member ? `In Memory of ${member.name}` : "Memorial";
        }

        entries.push({
          id: event.id,
          type,
          title,
          description: event.description,
          date: event.eventDate ? event.eventDate.toISOString() : null,
          memberName: member?.name ?? null,
          isToday,
          isUpcoming,
          daysUntil: diffDays,
          yearsAgo: yearsAgo > 0 ? yearsAgo : null,
        });
      }

      // Sort by daysUntil (closest first)
      entries.sort((a, b) => {
        if (a.daysUntil < 0 && b.daysUntil >= 0) return 1;
        if (a.daysUntil >= 0 && b.daysUntil < 0) return -1;
        return Math.abs(a.daysUntil) - Math.abs(b.daysUntil);
      });

      return res.json({ calendar: entries.slice(0, 20) });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: emotional calendar failed");
      return res.status(500).json({ error: "Failed to get emotional calendar" });
    }
  },
);

// ── Character Biography ───────────────────────────────────────────────────────
// Returns a rich character profile for a family member: their stories,
// events, places, memories, interviews, photos, and relationships —
// everything the game needs to render a living character instead of a
// static profile.
//
//   GET /api/legacy/game-master/:familyId/character/:memberId

router.get(
  "/legacy/game-master/:familyId/character/:memberId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const memberId = parseInt(String(req.params.memberId), 10);
    if (isNaN(familyId) || isNaN(memberId)) return res.status(400).json({ error: "Invalid IDs" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const consentedIds = await getConsentedMemberIds(familyId);
      if (!consentedIds.has(memberId)) {
        return res.status(403).json({ error: "This family member has not consented to storytelling" });
      }

      // Get member info
      const [member] = await db
        .select({
          id: familyMembersTable.id,
          name: familyMembersTable.display_name,
          role: familyMembersTable.role,
          relation: familyMembersTable.relation_note,
          is_living: familyMembersTable.is_living,
        })
        .from(familyMembersTable)
        .where(and(eq(familyMembersTable.id, memberId), eq(familyMembersTable.family_id, familyId)))
        .limit(1);

      if (!member) return res.status(404).json({ error: "Family member not found" });

      // Get events for this member
      const events = await db
        .select({
          id: familyEventsTable.id,
          title: familyEventsTable.title,
          description: familyEventsTable.description,
          eventDate: familyEventsTable.event_date,
          category: familyEventsTable.category,
          placeId: familyEventsTable.place_id,
        })
        .from(familyEventsTable)
        .where(eq(familyEventsTable.member_id, memberId))
        .orderBy(asc(familyEventsTable.event_date));

      // Get stories about this member
      const stories = await db
        .select({
          id: familyStoriesTable.id,
          title: familyStoriesTable.title,
          body: familyStoriesTable.body,
          category: familyStoriesTable.category,
          createdAt: familyStoriesTable.created_at,
        })
        .from(familyStoriesTable)
        .where(eq(familyStoriesTable.about_member_id, memberId))
        .orderBy(desc(familyStoriesTable.created_at))
        .limit(10);

      // Get memories mentioning this member
      const memoryPeople = await db
        .select({ memoryId: familyMemoryPeopleTable.memory_id })
        .from(familyMemoryPeopleTable)
        .where(eq(familyMemoryPeopleTable.member_id, memberId));

      const memoryIds = memoryPeople.map((mp) => mp.memoryId);
      const memories = memoryIds.length > 0
        ? await db
            .select({
              id: familyMemoriesTable.id,
              title: familyMemoriesTable.title,
              description: familyMemoriesTable.description,
              memoryDate: familyMemoriesTable.memory_date,
              locationLabel: familyMemoriesTable.location_label,
            })
            .from(familyMemoriesTable)
            .where(inArray(familyMemoriesTable.id, memoryIds))
            .orderBy(desc(familyMemoriesTable.memory_date))
            .limit(10)
        : [];

      // Get interviews with this member
      const interviews = await db
        .select({
          id: familyInterviewsTable.id,
          status: familyInterviewsTable.status,
          createdAt: familyInterviewsTable.created_at,
        })
        .from(familyInterviewsTable)
        .where(eq(familyInterviewsTable.subject_member_id, memberId))
        .orderBy(desc(familyInterviewsTable.created_at))
        .limit(5);

      // Get places linked to this member's events (via event.place_id)
      const placeIds = events
        .map((e) => e.placeId)
        .filter((pid): pid is number => pid !== null)
        .slice(0, 5);
      const places = placeIds.length > 0
        ? await db
            .select({
              id: familyPlacesTable.id,
              label: familyPlacesTable.label,
              placeType: familyPlacesTable.place_type,
              country: familyPlacesTable.country,
            })
            .from(familyPlacesTable)
            .where(inArray(familyPlacesTable.id, placeIds))
            .limit(5)
        : [];

      // Get relationships
      const relations = await db
        .select()
        .from(familyTreeRelationsTable)
        .where(
          and(
            eq(familyTreeRelationsTable.family_id, familyId),
            sql`${familyTreeRelationsTable.from_member_id} = ${memberId} OR ${familyTreeRelationsTable.to_member_id} = ${memberId}`,
          ),
        )
        .limit(20);

      // Build character profile
      const birthEvent = events.find((e) => e.category === "birth");
      const deathEvent = events.find((e) => e.category === "death");
      const birthYear = birthEvent?.eventDate ? new Date(birthEvent.eventDate).getFullYear() : null;
      const deathYear = deathEvent?.eventDate ? new Date(deathEvent.eventDate).getFullYear() : null;

      // RPG stats derived from real vault data
      const stats = {
        knowledge: Math.min(100, (stories.length * 10) + (memories.length * 5)),
        relationships: Math.min(100, events.length * 15),
        culturalWisdom: Math.min(100, interviews.length * 25),
        courage: Math.min(100, (stories.length * 5) + (events.length * 5) + (memories.length * 5)),
        reputation: Math.min(100, events.filter((e) => e.category !== "birth" && e.category !== "death").length * 20),
        legacy: Math.min(100, places.length * 15),
      };

      return res.json({
        character: {
          memberId: member.id,
          name: member.name,
          role: member.role,
          relation: member.relation,
          isLiving: member.is_living,
          birthYear,
          deathYear,
          stats,
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
            eventDate: e.eventDate ? e.eventDate.toISOString() : null,
            category: e.category,
          })),
          stories: stories.map((s) => ({
            id: s.id,
            title: s.title,
            excerpt: s.body?.slice(0, 200) ?? "",
            category: s.category,
          })),
          memories: memories.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            memoryDate: m.memoryDate ? m.memoryDate.toISOString() : null,
            locationLabel: m.locationLabel,
          })),
          interviews: interviews.map((i) => ({
            id: i.id,
            title: `Interview #${i.id}`,
            status: i.status,
          })),
          places: places.map((p) => ({
            id: p.id,
            label: p.label,
            placeType: p.placeType,
            country: p.country,
          })),
          relationships: relations.map((r) => ({
            id: r.id,
            fromMemberId: r.from_member_id,
            toMemberId: r.to_member_id,
            relationType: r.relation_type,
          })),
        },
      });
    } catch (err) {
      logger.error({ err, familyId, memberId }, "legacy-game-master: character bio failed");
      return res.status(500).json({ error: "Failed to get character biography" });
    }
  },
);
