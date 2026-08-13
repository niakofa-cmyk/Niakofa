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
 *   GET  /api/legacy/game-master/:familyId/character/:memberId — rich character bio
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  legacyGameMasterNarrationsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { legacyAI } from "../lib/legacy-ai-gateway";
import { generateRichCharacterProfile } from "../lib/legacy-character-profile";
import { createHash } from "crypto";

const router = Router();

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

// ── Narration prompt templates ────────────────────────────────────────────────

const NARRATION_PROMPTS: Record<string, (ctx: Record<string, string>) => string> = {
  scene_intro: (ctx) =>
    `Write a vivid 2-3 sentence scene introduction for a family legacy RPG. Scene title: "${ctx.sceneTitle}". Historical layer: ${ctx.historicalLayer}. Family context: ${ctx.vaultContext}. Set the scene with sensory details. Stay grounded in verified family history. Do not fabricate specific facts.`,

  dialogue: (ctx) =>
    `Write a line of dialogue for ${ctx.characterName ?? "an ancestor"} in a family legacy RPG. Context: ${ctx.sceneContext}. The character should speak in a warm, authentic voice that reflects their generation and cultural background. Keep it to 1-2 sentences. Do not fabricate specific facts not in the family vault.`,

  quest_prompt: (ctx) =>
    `Write a brief quest prompt for a family legacy RPG. Quest type: ${ctx.questType}. Context: ${ctx.vaultContext}. Make it feel personal and urgent. 2-3 sentences. Do not fabricate specific facts.`,

  chapter_summary: (ctx) =>
    `Write a reflective 3-4 sentence chapter summary for a family legacy RPG. Chapter: "${ctx.chapterTitle}". The player explored ${ctx.sceneCount ?? "several"} scenes. Summarize the emotional journey. Stay grounded. Do not fabricate specific facts.`,

  historical_context: (ctx) =>
    `Write 2-3 sentences of historical context for a family legacy RPG scene. Time period: ${ctx.timePeriod}. Location: ${ctx.location ?? "unknown"}. Connect the family's story to broader historical events. Do not fabricate family-specific facts.`,

  ancestor_intro: (ctx) =>
    `Write an introduction for ${ctx.ancestorName ?? "an ancestor"} as a playable character. Use only verified family data. Include birth year, location, and known stories. Keep it under 100 words.`,
};

// ── GET /api/legacy/game-master/:familyId/narration ──────────────────────────

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

    try {
      const type = String(req.query.type ?? "scene_intro");
      const promptFn = NARRATION_PROMPTS[type];
      if (!promptFn) return res.status(400).json({ error: "Unknown narration type" });

      const ctx: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "string") ctx[k] = v;
      }

      const userPrompt = promptFn(ctx);
      const promptHash = createHash("sha256").update(userPrompt).digest("hex");

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

      if (cached && Date.now() - cached.created_at.getTime() < NARRATION_TTL_MS) {
        return res.json({
          narration: {
            id: cached.id,
            type: cached.narration_type,
            content: cached.content,
            modelProvenance: cached.model_used,
            createdAt: cached.created_at,
          },
        });
      }

      // Generate new narration
      const content: string = aiResponse.content || "The ancestors' voices echo softly through time...";
      const modelUsed: string = aiResponse.model;
      const aiResponse = await legacyAI.generate({
        system: "You are Nia, the AI Game Master for the Niakofa Legacy RPG. Generate vivid, emotionally resonant narration grounded in real family history. Never fabricate specific facts.",
        userPrompt,
        maxTokens: 300,
      });

      const [narration] = await db
        .insert(legacyGameMasterNarrationsTable)
        .values({
          family_id: familyId,
          narration_type: type as "scene_intro" | "dialogue" | "quest_prompt" | "chapter_summary" | "historical_context" | "ancestor_introduction",
          prompt_hash: promptHash,
          content,
          model_used: modelUsed,
        })
        .returning();

      return res.json({
        narration: {
          id: narration.id,
          type: narration.narration_type,
          content: narration.content,
          modelProvenance: narration.model_used,
          createdAt: narration.created_at,
        },
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: narration failed");
      return res.status(500).json({ error: "Failed to generate narration" });
    }
  },
);

// ── GET /api/legacy/game-master/:familyId/history ────────────────────────────

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

      return res.json({
        narrations: narrations.map((n) => ({
          id: n.id,
          type: n.narration_type,
          content: n.content,
          modelProvenance: n.model_used,
          createdAt: n.created_at,
        })),
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-game-master: history failed");
      return res.status(500).json({ error: "Failed to load narration history" });
    }
  },
);

// ── GET /api/legacy/game-master/:familyId/character/:memberId ────────────────
// Returns a rich AI-enhanced character profile for a family member: their
// stories, events, places, memories, interviews, photos, relationships,
// personality traits, speech style, emotional profile, beliefs, skills,
// reputation, legacy score, and lineage — everything the game needs to
// render a living character instead of a static profile.

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
      const richProfile = await generateRichCharacterProfile(familyId, memberId);
      if (!richProfile) {
        return res.status(404).json({ error: "Family member not found or not consented" });
      }

      return res.json({ character: richProfile });
    } catch (err) {
      logger.error({ err, familyId, memberId }, "legacy-game-master: character bio failed");
      return res.status(500).json({ error: "Failed to get character biography" });
    }
  },
);

export default router;
