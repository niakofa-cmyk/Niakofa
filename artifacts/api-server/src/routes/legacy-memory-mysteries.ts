/**
 * Niakofa — Phase 5: Memory Mysteries
 *
 * Collaborative investigations for unidentified vault content. The AI Game
 * Director identifies gaps — unknown faces in photos, unknown locations,
 * missing event details — and turns them into "Mystery Quests" the family
 * solves together. When solved, the resolution becomes real vault data.
 *
 * This is the "Mystery Quest" system from the design docs:
 *   "Suppose the AI discovers: Grandpa attended Lincoln High School.
 *    But we don't know: Why?
 *    The game creates: Mystery Quest — What happened at Lincoln High?
 *    Ask a relative. Upload a yearbook. Find a photograph."
 *
 * Routes:
 *   GET    /api/legacy/memory-mysteries/:familyId       — list mysteries
 *   POST   /api/legacy/memory-mysteries/:familyId       — create mystery
 *   POST   /api/legacy/memory-mysteries/:mysteryId/solve — resolve with answer
 *   DELETE /api/legacy/memory-mysteries/:mysteryId       — remove mystery
 */

import { Router } from "express";
import {
  db,
  familyMembersTable,
  legacyMemoryMysteriesTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

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

const MYSTERY_TYPE_LABELS: Record<string, string> = {
  unknown_person: "Unknown Person",
  unknown_place: "Unknown Location",
  unknown_date: "Unknown Date",
  unknown_document: "Unknown Document",
  unknown_event: "Unknown Event",
  missing_interview: "Missing Interview",
};

// GET /api/legacy/memory-mysteries/:familyId
router.get(
  "/legacy/memory-mysteries/:familyId",
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
      const mysteries = await db
        .select()
        .from(legacyMemoryMysteriesTable)
        .where(eq(legacyMemoryMysteriesTable.family_id, familyId))
        .orderBy(desc(legacyMemoryMysteriesTable.created_at));

      const openMysteries = mysteries.filter((m) => m.status === "open");
      const solvedMysteries = mysteries.filter((m) => m.status === "solved");

      return res.json({
        mysteries,
        openCount: openMysteries.length,
        solvedCount: solvedMysteries.length,
        typeLabels: MYSTERY_TYPE_LABELS,
      });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-memory-mysteries: list failed");
      return res.status(500).json({ error: "Failed to load mysteries" });
    }
  },
);

// POST /api/legacy/memory-mysteries/:familyId
router.post(
  "/legacy/memory-mysteries/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const { mysteryType, title, description, vaultItemType, vaultItemId, aiHint, suggestedActions } = req.body as {
      mysteryType: string;
      title: string;
      description?: string;
      vaultItemType?: string;
      vaultItemId?: number;
      aiHint?: string;
      suggestedActions?: string[];
    };

    const VALID_MYSTERY_TYPES = ["unknown_person", "unknown_place", "unknown_date", "unknown_document", "unknown_event", "missing_interview"] as const;
    if (!mysteryType || !title) {
      return res.status(400).json({ error: "mysteryType and title are required" });
    }
    if (!VALID_MYSTERY_TYPES.includes(mysteryType as typeof VALID_MYSTERY_TYPES[number])) {
      return res.status(400).json({ error: "Invalid mysteryType" });
    }

    try {
      const [created] = await db
        .insert(legacyMemoryMysteriesTable)
        .values({
          family_id: familyId,
          mystery_type: mysteryType as typeof VALID_MYSTERY_TYPES[number],
          status: "open",
          title,
          description: description ?? null,
          vault_item_type: vaultItemType ?? null,
          vault_item_id: vaultItemId ?? null,
          ai_hint: aiHint ?? null,
          suggested_actions: suggestedActions ?? null,
        })
        .returning();

      return res.json({ mystery: created });
    } catch (err) {
      logger.error({ err, familyId }, "legacy-memory-mysteries: create failed");
      return res.status(500).json({ error: "Failed to create mystery" });
    }
  },
);

// POST /api/legacy/memory-mysteries/:mysteryId/solve
router.post(
  "/legacy/memory-mysteries/:mysteryId/solve",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const mysteryId = parseInt(String(req.params.mysteryId), 10);
    if (isNaN(mysteryId)) return res.status(400).json({ error: "Invalid mystery ID" });

    try {
      const [mystery] = await db
        .select()
        .from(legacyMemoryMysteriesTable)
        .where(eq(legacyMemoryMysteriesTable.id, mysteryId))
        .limit(1);

      if (!mystery) return res.status(404).json({ error: "Mystery not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, mystery.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      const { resolution } = req.body as {
        resolution: string;
      };

      if (!resolution || resolution.trim().length < 3) {
        return res.status(400).json({ error: "resolution is required (min 3 characters)" });
      }
      if (resolution.length > 4000) {
        return res.status(400).json({ error: "resolution is too long (max 4000 characters)" });
      }

      // resolved_by FK references family_members.id, not users.id — resolve
      // the authenticated user's family member ID in this family.
      const [memberRow] = await db
        .select({ id: familyMembersTable.id })
        .from(familyMembersTable)
        .where(
          and(
            eq(familyMembersTable.family_id, mystery.family_id),
            eq(familyMembersTable.user_id, req.authenticatedUserId!),
          ),
        )
        .limit(1);

      const [updated] = await db
        .update(legacyMemoryMysteriesTable)
        .set({
          status: "solved",
          resolution,
          resolved_by: memberRow?.id ?? null,
          resolved_at: new Date(),
        })
        .where(eq(legacyMemoryMysteriesTable.id, mysteryId))
        .returning();

      // Solving a mystery adds real knowledge to the vault — log it so the
      // world evolution timeline reflects the family's collaborative
      // investigation and triggers a knowledge version bump.
      const { logWorldEvolution } = await import("../lib/legacy-world-evolution");
      logWorldEvolution(
        mystery.family_id,
        "story_added",
        `Mystery solved: "${mystery.title}" — ${resolution.slice(0, 80)}`,
      ).catch(() => {});

      return res.json({ mystery: updated });
    } catch (err) {
      logger.error({ err, mysteryId }, "legacy-memory-mysteries: solve failed");
      return res.status(500).json({ error: "Failed to solve mystery" });
    }
  },
);

// DELETE /api/legacy/memory-mysteries/:mysteryId
router.delete(
  "/legacy/memory-mysteries/:mysteryId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const mysteryId = parseInt(String(req.params.mysteryId), 10);
    if (isNaN(mysteryId)) return res.status(400).json({ error: "Invalid mystery ID" });

    try {
      const [mystery] = await db
        .select()
        .from(legacyMemoryMysteriesTable)
        .where(eq(legacyMemoryMysteriesTable.id, mysteryId))
        .limit(1);

      if (!mystery) return res.status(404).json({ error: "Mystery not found" });

      const userId = req.authenticatedUserId!;
      if (!(await isMember(userId, mystery.family_id))) {
        return res.status(403).json({ error: "Not a member of this family" });
      }

      await db
        .delete(legacyMemoryMysteriesTable)
        .where(eq(legacyMemoryMysteriesTable.id, mysteryId));

      return res.json({ success: true });
    } catch (err) {
      logger.error({ err, mysteryId }, "legacy-memory-mysteries: delete failed");
      return res.status(500).json({ error: "Failed to delete mystery" });
    }
  },
);

export default router;
