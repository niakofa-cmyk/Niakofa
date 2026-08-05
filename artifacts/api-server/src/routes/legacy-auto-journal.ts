/**
 * Niakofa — Auto-Journal System
 *
 * The journal should be written automatically after each play session.
 * It becomes a narrative summary of what the player experienced, creating
 * a persistent emotional record.
 *
 * Routes:
 *   POST /api/legacy/journal/:sessionId/auto-generate — generate & save auto-journal
 *   GET  /api/legacy/journal/:familyId/auto          — list auto-generated entries
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  legacySessionsTable,
  legacyChaptersTable,
  familyStoriesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { legacyAI } from "../lib/legacy-ai-gateway";

const router = Router();

async function isMember(userId: number, familyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.user_id, userId)))
    .limit(1);
  return !!row;
}

router.post(
  "/legacy/journal/:sessionId/auto-generate",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const sessionId = parseInt(String(req.params.sessionId), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    try {
      const [session] = await db
        .select().from(legacySessionsTable)
        .where(eq(legacySessionsTable.id, sessionId)).limit(1);

      if (!session) return res.status(404).json({ error: "Session not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, session.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const [chapter] = session.current_chapter_id
        ? await db.select().from(legacyChaptersTable)
            .where(eq(legacyChaptersTable.id, session.current_chapter_id)).limit(1)
        : [null];

      const sessionState = (session.session_state ?? {}) as {
        decisions?: Array<{
          sceneNumber: number;
          sceneTitle: string;
          choiceText: string;
          statChanges: Record<string, number>;
          decidedAt: string;
        }>;
        scenesCompleted?: number[];
      };

      const decisions = sessionState.decisions ?? [];
      if (decisions.length === 0) {
        return res.json({ generated: false, message: "No decisions recorded in this session yet." });
      }

      const decisionSummary = decisions
        .map((d) => {
          const statChanges = Object.entries(d.statChanges ?? {})
            .filter(([, v]) => v !== 0)
            .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`)
            .join(", ");
          return `Scene ${d.sceneNumber} (${d.sceneTitle}): You chose "${d.choiceText}"${statChanges ? ` [${statChanges}]` : ""}`;
        })
        .join("\n");

      const totalStatChanges: Record<string, number> = {};
      for (const d of decisions) {
        for (const [stat, delta] of Object.entries(d.statChanges ?? {})) {
          totalStatChanges[stat] = (totalStatChanges[stat] ?? 0) + delta;
        }
      }

      const prompt = `You are Nia, writing a journal entry for a family member who just played a chapter of their Legacy journey.

Chapter: ${chapter?.title ?? "Unknown chapter"}
Scenes Completed: ${sessionState.scenesCompleted?.length ?? decisions.length}
Decisions Made:
${decisionSummary}

Total Stat Changes: ${Object.entries(totalStatChanges).map(([k, v]) => `${k}: ${v > 0 ? "+" : ""}${v}`).join(", ")}

Write a personal, emotional journal entry (2-3 paragraphs, first person "I") that:
1. Narrates what happened in this chapter as a personal reflection
2. Mentions the key choices the player made and how they felt
3. Connects the experience to family heritage and legacy
4. Ends with a forward-looking sentence about what comes next

Keep it intimate, warm, and grounded in the actual decisions. Do not invent events that didn't happen in the scenes.`;

      let journalText: string;
      try {
        journalText = await legacyAI.generate(prompt, { maxTokens: 500, temperature: 0.7 });
      } catch {
        journalText = `Today, I walked through ${chapter?.title ?? "a chapter of our family story"}. ` +
          `I made ${decisions.length} choices along the way. ` +
          decisions.slice(0, 3).map((d) => `I chose to ${d.choiceText.toLowerCase()}.`).join(" ") +
          ` Each step brought me closer to understanding where we come from. ` +
          `The journey continues — there is more to discover.`;
      }

      const [story] = await db
        .insert(familyStoriesTable)
        .values({
          family_id: session.family_id,
          title: `Journal — ${chapter?.title ?? "Legacy Session"} — ${new Date().toLocaleDateString()}`,
          content: journalText,
          category: "journal",
          about_member_id: session.ancestor_member_id,
        })
        .returning();

      const updatedState = { ...sessionState, lastJournalEntryId: story.id, lastJournalGeneratedAt: new Date().toISOString() };
      await db.update(legacySessionsTable)
        .set({ session_state: updatedState })
        .where(eq(legacySessionsTable.id, sessionId));

      return res.json({
        generated: true,
        journalEntry: { id: story.id, title: story.title, content: journalText, createdAt: story.created_at },
        statsSummary: totalStatChanges, decisionsCount: decisions.length,
      });
    } catch (err) {
      logger.error({ err, sessionId }, "legacy-auto-journal: generate failed");
      return res.status(500).json({ error: "Failed to generate journal entry" });
    }
  },
);

router.get(
  "/legacy/journal/:familyId/auto",
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
      const entries = await db
        .select().from(familyStoriesTable)
        .where(and(eq(familyStoriesTable.family_id, familyId), eq(familyStoriesTable.category, "journal")))
        .orderBy(desc(familyStoriesTable.created_at)).limit(50);

      return res.json({
        entries: entries.map((e) => ({ id: e.id, title: e.title, content: e.content,
          createdAt: e.created_at, aboutMemberId: e.about_member_id })),
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-auto-journal: list failed");
      return res.status(500).json({ error: "Failed to load journal entries" });
    }
  },
);

export default router;
