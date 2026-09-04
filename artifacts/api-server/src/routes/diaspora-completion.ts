import { createHash } from "node:crypto";
import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  diasporaPreserveLinksTable,
  familyDnaProfilesTable,
  familyInterviewsTable,
  familyMembersTable,
  familyMemoriesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

const CULTURE_CARDS = [
  { id: "card-001", title: "The Sunday Dinner", category: "Traditions", prompt: "Describe a Sunday dinner at your grandparents' house. What was cooked? Who was there? What was the conversation?", follow_up: "What recipe from that table do you most want to preserve?", color: "amber" },
  { id: "card-002", title: "The Migration Story", category: "Journey", prompt: "Tell the story of how your family came to be where they are. Who moved? When? Why?", follow_up: "What did your family leave behind — and what did they carry with them?", color: "teal" },
  { id: "card-003", title: "The Name Bearer", category: "Identity", prompt: "Tell the story of your name — your given name, your family name, or a nickname passed down through generations.", follow_up: "Who in your family are you named after, and what do you know about them?", color: "purple" },
  { id: "card-004", title: "The Elder's Lesson", category: "Wisdom", prompt: "Share the most important thing an elder in your family ever taught you — in their words, if you remember them.", follow_up: "How has that lesson shaped the way you live?", color: "gold" },
  { id: "card-005", title: "The Church Pew", category: "Faith", prompt: "Describe your family's relationship with faith — the church, the songs, the prayers that shaped you.", follow_up: "What spiritual tradition do you most want to pass on?", color: "emerald" },
  { id: "card-006", title: "The Hard Year", category: "Resilience", prompt: "Tell the story of the hardest year your family ever faced — and how they got through it.", follow_up: "What does that story tell you about your family's strength?", color: "red" },
  { id: "card-007", title: "The First", category: "Achievement", prompt: "Share the story of a 'first' in your family — the first to graduate, own land, start a business, or break a barrier.", follow_up: "How did that 'first' open doors for the generations that followed?", color: "blue" },
  { id: "card-008", title: "The Recipe", category: "Traditions", prompt: "Share a family recipe — not just the ingredients, but the story behind it. Who made it? When was it made?", follow_up: "Is there a version of this recipe only one person in your family knows how to make?", color: "orange" },
] as const;

const ScanSchema = z.object({
  qr_code: z.string().trim().min(1).max(4000),
  family_id: z.number().int().positive().optional(),
  memory_id: z.number().int().positive().optional(),
});

const LinkSchema = z.object({
  family_id: z.number().int().positive(),
  memory_id: z.number().int().positive(),
});

async function activeFamilyIds(userId: number) {
  const rows = await db
    .select({ family_id: familyMembersTable.family_id })
    .from(familyMembersTable)
    .where(and(eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active")));
  return rows.map((row) => row.family_id);
}

async function assertFamilyMember(userId: number, familyId: number) {
  const [membership] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.family_id, familyId),
      eq(familyMembersTable.user_id, userId),
      eq(familyMembersTable.status, "active"),
    ))
    .limit(1);
  return Boolean(membership);
}

router.get("/diaspora/dashboard", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;
    const familyIds = await activeFamilyIds(userId);

    if (familyIds.length === 0) {
      return res.json({
        stats: { family_spaces: 0, vault_items: 0, oral_histories: 0, family_tree_people: 0, dna_connections: 0, heritage_collections: 9 },
        recent_activity: [],
        stats_source: "aggregate",
      });
    }

    const [memoryCount, interviewCount, memberCount, dnaCount, recentMemories] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(familyMemoriesTable)
        .where(inArray(familyMemoriesTable.family_id, familyIds)),
      db.select({ count: sql<number>`count(*)::int` })
        .from(familyInterviewsTable)
        .where(inArray(familyInterviewsTable.family_id, familyIds)),
      db.select({ count: sql<number>`count(*)::int` })
        .from(familyMembersTable)
        .where(and(
          inArray(familyMembersTable.family_id, familyIds),
          eq(familyMembersTable.status, "active"),
        )),
      db.select({ count: sql<number>`count(*)::int` })
        .from(familyDnaProfilesTable)
        .where(and(
          eq(familyDnaProfilesTable.user_id, userId),
          eq(familyDnaProfilesTable.status, "ready"),
          inArray(familyDnaProfilesTable.family_id, familyIds),
        )),
      db.select({
        title: familyMemoriesTable.title,
        created_at: sql<string>`${familyMemoriesTable.created_at}::text`,
        family_id: familyMemoriesTable.family_id,
      })
        .from(familyMemoriesTable)
        .where(inArray(familyMemoriesTable.family_id, familyIds))
        .orderBy(desc(familyMemoriesTable.created_at))
        .limit(5),
    ]);

    return res.json({
      stats: {
        family_spaces: familyIds.length,
        vault_items: Number(memoryCount[0]?.count ?? 0),
        oral_histories: Number(interviewCount[0]?.count ?? 0),
        family_tree_people: Number(memberCount[0]?.count ?? 0),
        dna_connections: Number(dnaCount[0]?.count ?? 0),
        heritage_collections: 9,
      },
      recent_activity: recentMemories.map((memory) => ({
        type: "memory",
        title: memory.title ?? "Untitled memory",
        time: memory.created_at,
        family_id: memory.family_id,
      })),
      stats_source: "aggregate",
    });
  } catch (err) {
    logger.error({ err, userId: req.authenticatedUserId }, "diaspora aggregate dashboard error");
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.post("/diaspora/preserve/scan", requireAuth, generalApiLimiter, async (req, res) => {
  const parsed = ScanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid QR code" });

  const userId = req.authenticatedUserId!;
  const { qr_code: qrCode, family_id: requestedFamilyId, memory_id: requestedMemoryId } = parsed.data;
  const qrDigest = createHash("sha256").update(qrCode).digest("hex");
  const card = CULTURE_CARDS.find((candidate) => qrCode.includes(candidate.id));
  const resolvedType = card ? "card" : "memory_link";

  try {
    let familyId = requestedFamilyId;
    if (familyId !== undefined && !(await assertFamilyMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this Family Space" });
    }

    if (requestedMemoryId !== undefined) {
      const [memory] = await db
        .select({ family_id: familyMemoriesTable.family_id })
        .from(familyMemoriesTable)
        .where(eq(familyMemoriesTable.id, requestedMemoryId))
        .limit(1);
      if (!memory) return res.status(404).json({ error: "Memory not found" });
      if (familyId !== undefined && memory.family_id !== familyId) {
        return res.status(400).json({ error: "Memory does not belong to the selected Family Space" });
      }
      familyId = memory.family_id;
      if (!(await assertFamilyMember(userId, familyId))) {
        return res.status(403).json({ error: "Not a member of this Family Space" });
      }
    }

    const [existing] = await db
      .select()
      .from(diasporaPreserveLinksTable)
      .where(and(
        eq(diasporaPreserveLinksTable.user_id, userId),
        eq(diasporaPreserveLinksTable.qr_digest, qrDigest),
        requestedMemoryId !== undefined
          ? eq(diasporaPreserveLinksTable.memory_id, requestedMemoryId)
          : isNull(diasporaPreserveLinksTable.memory_id),
      ))
      .orderBy(desc(diasporaPreserveLinksTable.id))
      .limit(1);

    if (existing) {
      if (card) {
        return res.json({
          type: "card",
          card,
          action: existing.memory_id !== null ? "linked_memory" : "record_story",
          scan_id: existing.id,
          persisted: existing.memory_id !== null,
          idempotent: true,
        });
      }
      return res.json({
        type: "memory_link",
        message: existing.memory_id !== null
          ? "QR code linked to the selected Family Vault memory."
          : "QR code recognized. Choose a Family Space and memory to preserve this story.",
        action: existing.memory_id !== null ? "linked_memory" : "link_memory",
        scan_id: existing.id,
        persisted: existing.memory_id !== null,
        idempotent: true,
      });
    }

    const [scan] = await db.insert(diasporaPreserveLinksTable).values({
      user_id: userId,
      family_id: familyId ?? null,
      memory_id: requestedMemoryId ?? null,
      qr_digest: qrDigest,
      card_id: card?.id ?? null,
      resolved_type: resolvedType,
      linked_at: requestedMemoryId !== undefined ? new Date() : null,
    }).returning({ id: diasporaPreserveLinksTable.id });

    if (card) {
      return res.json({
        type: "card",
        card,
        action: requestedMemoryId !== undefined ? "linked_memory" : "record_story",
        scan_id: scan.id,
        persisted: requestedMemoryId !== undefined,
        idempotent: false,
      });
    }

    return res.json({
      type: "memory_link",
      message: requestedMemoryId !== undefined
        ? "QR code linked to the selected Family Vault memory."
        : "QR code recognized. Choose a Family Space and memory to preserve this story.",
      action: requestedMemoryId !== undefined ? "linked_memory" : "link_memory",
      scan_id: scan.id,
      persisted: requestedMemoryId !== undefined,
      idempotent: false,
    });
  } catch (err) {
    logger.error({ err, userId }, "diaspora preserve scan error");
    return res.status(500).json({ error: "Failed to persist QR scan" });
  }
});

router.post("/diaspora/preserve/links/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const linkId = Number(req.params.id);
  const parsed = LinkSchema.safeParse(req.body);
  if (!Number.isInteger(linkId) || linkId <= 0 || !parsed.success) {
    return res.status(400).json({ error: "Valid scan id, family id, and memory id are required" });
  }

  const userId = req.authenticatedUserId!;
  const { family_id: familyId, memory_id: memoryId } = parsed.data;

  try {
    if (!(await assertFamilyMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this Family Space" });
    }

    const [memory] = await db
      .select({ family_id: familyMemoriesTable.family_id })
      .from(familyMemoriesTable)
      .where(eq(familyMemoriesTable.id, memoryId))
      .limit(1);
    if (!memory) return res.status(404).json({ error: "Memory not found" });
    if (memory.family_id !== familyId) {
      return res.status(400).json({ error: "Memory does not belong to the selected Family Space" });
    }

    const [existing] = await db
      .select({ id: diasporaPreserveLinksTable.id })
      .from(diasporaPreserveLinksTable)
      .where(and(
        eq(diasporaPreserveLinksTable.id, linkId),
        eq(diasporaPreserveLinksTable.user_id, userId),
      ))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Preserve scan not found" });

    const [link] = await db.update(diasporaPreserveLinksTable).set({
      family_id: familyId,
      memory_id: memoryId,
      linked_at: new Date(),
    }).where(eq(diasporaPreserveLinksTable.id, linkId)).returning();

    return res.json({ link, persisted: true });
  } catch (err) {
    logger.error({ err, userId, linkId }, "diaspora preserve memory link error");
    return res.status(500).json({ error: "Failed to link QR scan to memory" });
  }
});

router.get("/diaspora/preserve/links/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const linkId = Number(req.params.id);
  if (!Number.isInteger(linkId) || linkId <= 0) return res.status(400).json({ error: "Invalid scan id" });
  const userId = req.authenticatedUserId!;

  const [link] = await db
    .select()
    .from(diasporaPreserveLinksTable)
    .where(and(eq(diasporaPreserveLinksTable.id, linkId), eq(diasporaPreserveLinksTable.user_id, userId)))
    .limit(1);
  if (!link) return res.status(404).json({ error: "Preserve scan not found" });
  return res.json({ link });
});

export default router;
