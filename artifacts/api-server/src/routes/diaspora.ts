/**
 * Diaspora Platform — Extended Routes
 *
 * Routes (all under /api/diaspora/...):
 *
 *  GET  /diaspora/dashboard              — stats + recent activity for the dashboard
 *  GET  /diaspora/dna/connections        — DNA match list (mock/seed data for now)
 *  POST /diaspora/dna/import             — import DNA CSV from AncestryDNA / 23andMe
 *  GET  /diaspora/heritage               — curated heritage collection list
 *  GET  /diaspora/heritage/:slug         — single collection items
 *  GET  /diaspora/research/guides        — research guide list
 *  GET  /diaspora/preserve/cards         — preserve-the-culture card deck
 *  POST /diaspora/preserve/scan          — QR scan → link to memory
 *  GET  /family/:id/tree                 — family tree data (nodes + edges)
 *  POST /family/:id/tree/relations       — add a parent/child or spouse relation
 *  DELETE /family/:id/tree/relations/:relationId — remove a relation
 *  GET  /family/:id/timeline             — family legacy timeline events
 *  POST /family/:id/timeline             — add timeline event
 *  GET  /diaspora/activity               — recent activity across all user's families
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyTreeRelationsTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";

const router = Router();

// ─── Dashboard stats ───────────────────────────────────────────────────────────
router.get("/diaspora/dashboard", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;

    const memberRows = await db
      .select({ family_id: familyMembersTable.family_id })
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active")));

    const familyIds = memberRows.map(r => r.family_id);

    let vaultItems = 0;
    let memories: Array<{ id: number; title: string | null; created_at: string; family_id: number }> = [];
    let interviews: Array<{ id: number; family_id: number; created_at: string }> = [];
    let memberCount = 0;

    if (familyIds.length > 0) {
      const [memRows, ivRows] = await Promise.all([
        db.select({
          id: familyMemoriesTable.id,
          title: familyMemoriesTable.title,
          created_at: sql<string>`${familyMemoriesTable.created_at}::text`,
          family_id: familyMemoriesTable.family_id,
        })
        .from(familyMemoriesTable)
        .where(inArray(familyMemoriesTable.family_id, familyIds))
        .orderBy(desc(familyMemoriesTable.created_at))
        .limit(10),

        db.select({
          id: familyInterviewsTable.id,
          family_id: familyInterviewsTable.family_id,
          created_at: sql<string>`${familyInterviewsTable.created_at}::text`,
        })
        .from(familyInterviewsTable)
        .where(inArray(familyInterviewsTable.family_id, familyIds))
        .orderBy(desc(familyInterviewsTable.created_at))
        .limit(20),

        db.select({ count: sql<number>`count(*)` })
        .from(familyMembersTable)
        .where(inArray(familyMembersTable.family_id, familyIds))
        .then(rows => { memberCount = Number(rows[0]?.count ?? 0); }),
      ]);
      memories = memRows;
      interviews = ivRows;
      vaultItems = memories.length;
    }

    return res.json({
      stats: {
        family_spaces: familyIds.length,
        vault_items: vaultItems,
        oral_histories: interviews.length,
        family_tree_people: memberCount,
        dna_connections: 0,
        heritage_collections: 12,
      },
      recent_activity: memories.slice(0, 5).map(m => ({
        type: "memory",
        title: m.title ?? "Untitled memory",
        time: m.created_at,
        family_id: m.family_id,
      })),
    });
  } catch (err) {
    logger.error({ err }, "diaspora dashboard error");
    return res.status(500).json({ error: "Failed to load dashboard" });
  }
});

// ─── Recent activity across families ──────────────────────────────────────────
router.get("/diaspora/activity", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;
    const memberRows = await db
      .select({ family_id: familyMembersTable.family_id })
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active")));

    const familyIds = memberRows.map(r => r.family_id);
    if (!familyIds.length) return res.json({ activities: [] });

    const memories = await db.select({
      id: familyMemoriesTable.id,
      title: familyMemoriesTable.title,
      source: familyMemoriesTable.source,
      created_at: sql<string>`${familyMemoriesTable.created_at}::text`,
      family_id: familyMemoriesTable.family_id,
    })
    .from(familyMemoriesTable)
    .where(inArray(familyMemoriesTable.family_id, familyIds))
    .orderBy(desc(familyMemoriesTable.created_at))
    .limit(20);

    return res.json({
      activities: memories.map(m => ({
        type: m.source === "interview" ? "oral_history" : "memory",
        title: m.title ?? "Untitled",
        time: m.created_at,
        family_id: m.family_id,
        memory_id: m.id,
      })),
    });
  } catch (err) {
    logger.error({ err }, "diaspora activity error");
    return res.status(500).json({ error: "Failed to load activity" });
  }
});

// ─── DNA Connections (mock foundation — real import added later) ───────────────
router.get("/diaspora/dna/connections", requireAuth, generalApiLimiter, async (_req, res) => {
  return res.json({
    summary: {
      total_matches: 0,
      close_family: 0,
      distant_cousins: 0,
      unreviewed: 0,
    },
    matches: [],
    import_providers: ["AncestryDNA", "23andMe", "MyHeritage", "LivingDNA", "FamilyTreeDNA"],
    info: "Import your DNA data CSV to discover matches and relatives across the African diaspora.",
  });
});

router.post("/diaspora/dna/import", requireAuth, generalApiLimiter, async (req, res) => {
  const schema = z.object({
    provider: z.enum(["AncestryDNA", "23andMe", "MyHeritage", "LivingDNA", "FamilyTreeDNA"]),
    sample_id: z.string().optional(),
  });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid request" });

  return res.json({
    status: "queued",
    message: `DNA data from ${body.data.provider} queued for processing. You'll be notified when matches are found.`,
    estimated_time: "24-48 hours",
  });
});

// ─── Heritage Collections ──────────────────────────────────────────────────────
const HERITAGE_COLLECTIONS = [
  { slug: "great-migration", title: "Great Migration", description: "The movement of 6 million African Americans from the rural South to urban Northern and Western cities between 1910-1970.", item_count: 24, cover_image: null, tags: ["history", "migration", "1910s", "1970s"], themes: ["Movement", "Labor", "Urbanization"] },
  { slug: "black-cowboys", title: "Black Cowboys", description: "Celebrating the often-overlooked history of African American cowboys, ranchers, and horsemen of the American West.", item_count: 18, cover_image: null, tags: ["cowboys", "west", "rodeo"], themes: ["Identity", "Labor", "Land"] },
  { slug: "civil-rights", title: "Civil Rights Movement", description: "Documenting the struggle for equality through marches, sit-ins, legal battles, and everyday courage.", item_count: 31, cover_image: null, tags: ["civil rights", "equality", "1960s", "activism"], themes: ["Justice", "Community", "Resistance"] },
  { slug: "family-recipes", title: "Family Recipes", description: "Preserving the culinary traditions, flavors, and techniques passed down through generations of Black families.", item_count: 12, cover_image: null, tags: ["food", "culture", "tradition"], themes: ["Community", "Ancestry", "Joy"] },
  { slug: "church-history", title: "Church History", description: "The church as the heart of the Black community — from spirituals and sermons to social justice and education.", item_count: 16, cover_image: null, tags: ["church", "faith", "spirituals", "community"], themes: ["Faith", "Community", "Leadership"] },
  { slug: "military-service", title: "Military Service", description: "Honoring the service and sacrifice of Black military members from the Civil War through today.", item_count: 22, cover_image: null, tags: ["military", "veterans", "Buffalo Soldiers"], themes: ["Service", "Sacrifice", "Honor"] },
  { slug: "hbcu-legacy", title: "HBCU Legacy", description: "The history and impact of Historically Black Colleges and Universities in shaping generations of Black excellence.", item_count: 14, cover_image: null, tags: ["education", "HBCU", "excellence"], themes: ["Education", "Excellence", "Community"] },
  { slug: "land-ownership", title: "Land Ownership", description: "Documenting the history of Black land ownership, the Freedmen's Bureau, and the ongoing fight for generational wealth.", item_count: 9, cover_image: null, tags: ["land", "property", "Freedmen", "wealth"], themes: ["Wealth", "Freedom", "Heritage"] },
];

router.get("/diaspora/heritage", requireAuth, generalApiLimiter, (_req, res) => {
  return res.json({ collections: HERITAGE_COLLECTIONS });
});

router.get("/diaspora/heritage/:slug", requireAuth, generalApiLimiter, (req, res) => {
  const collection = HERITAGE_COLLECTIONS.find(c => c.slug === req.params.slug);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  return res.json({ collection, items: [], message: "Community members can contribute items from their personal Family Vaults to shared Heritage Collections." });
});

// ─── Research Center ───────────────────────────────────────────────────────────
const RESEARCH_GUIDES = [
  { id: "freedmens-bureau", title: "Freedmen's Bureau Records", description: "Tips for finding records of formerly enslaved ancestors through the Bureau of Refugees, Freedmen, and Abandoned Lands.", category: "Archives", difficulty: "intermediate", estimated_time: "2-4 hours", resources: [{ name: "Freedmen's Bureau Online", url: "https://freedmensbureau.com/" }, { name: "FamilySearch — Freedmen's Bureau", url: "https://www.familysearch.org/" }] },
  { id: "census-research", title: "Census Records Guide", description: "Step-by-step tips for tracing your family through federal census records from 1870 to 1940.", category: "Government Records", difficulty: "beginner", estimated_time: "1-2 hours", resources: [{ name: "Ancestry Census Search", url: "https://www.ancestry.com/" }, { name: "FamilySearch Census Records", url: "https://www.familysearch.org/" }] },
  { id: "land-records", title: "Land & Property Records", description: "Find historic land ownership records, deeds, and Freedmen's Bureau land grants to document your family's property history.", category: "Government Records", difficulty: "intermediate", estimated_time: "2-3 hours", resources: [{ name: "BLM GLO Records", url: "https://glorecords.blm.gov/" }] },
  { id: "military-records", title: "Military Service Records", description: "How to find service records for Black veterans from the Civil War's United States Colored Troops through Vietnam.", category: "Military", difficulty: "beginner", estimated_time: "1-2 hours", resources: [{ name: "National Archives", url: "https://www.archives.gov/" }] },
  { id: "church-records", title: "Church & Vital Records", description: "Using church records, birth, death, and marriage certificates to fill gaps in your family history.", category: "Vital Records", difficulty: "beginner", estimated_time: "1 hour", resources: [] },
  { id: "dna-research", title: "Using DNA for Genealogy", description: "A primer on using AncestryDNA, 23andMe, and other DNA tests to break through brick walls and find living relatives.", category: "DNA", difficulty: "intermediate", estimated_time: "3-5 hours", resources: [] },
  { id: "migration-routes", title: "African Diaspora Migration Routes", description: "Understanding the paths of the African diaspora — from West Africa to the Americas and beyond — to contextualize your family history.", category: "History", difficulty: "beginner", estimated_time: "1-2 hours", resources: [] },
];

router.get("/diaspora/research/guides", requireAuth, generalApiLimiter, (_req, res) => {
  return res.json({ guides: RESEARCH_GUIDES });
});

// ─── Preserve the Culture — Card Game ─────────────────────────────────────────
const CULTURE_CARDS = [
  { id: "card-001", title: "The Sunday Dinner", category: "Traditions", prompt: "Describe a Sunday dinner at your grandparents' house. What was cooked? Who was there? What was the conversation?", follow_up: "What recipe from that table do you most want to preserve?", color: "amber" },
  { id: "card-002", title: "The Migration Story", category: "Journey", prompt: "Tell the story of how your family came to be where they are. Who moved? When? Why?", follow_up: "What did your family leave behind — and what did they carry with them?", color: "teal" },
  { id: "card-003", title: "The Name Bearer", category: "Identity", prompt: "Tell the story of your name — your given name, your family name, or a nickname passed down through generations.", follow_up: "Who in your family are you named after, and what do you know about them?", color: "purple" },
  { id: "card-004", title: "The Elder's Lesson", category: "Wisdom", prompt: "Share the most important thing an elder in your family ever taught you — in their words, if you remember them.", follow_up: "How has that lesson shaped the way you live?", color: "gold" },
  { id: "card-005", title: "The Church Pew", category: "Faith", prompt: "Describe your family's relationship with faith — the church, the songs, the prayers that shaped you.", follow_up: "What spiritual tradition do you most want to pass on?", color: "emerald" },
  { id: "card-006", title: "The Hard Year", category: "Resilience", prompt: "Tell the story of the hardest year your family ever faced — and how they got through it.", follow_up: "What does that story tell you about your family's strength?", color: "red" },
  { id: "card-007", title: "The First", category: "Achievement", prompt: "Share the story of a 'first' in your family — the first to graduate, own land, start a business, or break a barrier.", follow_up: "How did that 'first' open doors for the generations that followed?", color: "blue" },
  { id: "card-008", title: "The Recipe", category: "Traditions", prompt: "Share a family recipe — not just the ingredients, but the story behind it. Who made it? When was it made?", follow_up: "Is there a version of this recipe only one person in your family knows how to make?", color: "orange" },
];

router.get("/diaspora/preserve/cards", requireAuth, generalApiLimiter, (_req, res) => {
  return res.json({ cards: CULTURE_CARDS });
});

router.post("/diaspora/preserve/scan", requireAuth, generalApiLimiter, async (req, res) => {
  const schema = z.object({ qr_code: z.string(), family_id: z.number().optional() });
  const body = schema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Invalid QR code" });

  const card = CULTURE_CARDS.find(c => body.data.qr_code.includes(c.id));
  if (card) {
    return res.json({ type: "card", card, action: "record_story" });
  }

  return res.json({
    type: "memory_link",
    message: "QR code recognized. Link it to a memory in your Family Vault to preserve this story.",
    action: "link_memory",
  });
});

// ─── Family Tree (visual data with relationship edges) ─────────────────────────
router.get("/family/:id/tree", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const familyId = Number(req.params.id);
    const userId = req.authenticatedUserId!;

    const membership = await db
      .select({ role: familyMembersTable.role })
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active")))
      .limit(1);

    if (!membership.length) return res.status(403).json({ error: "Not a member of this family" });

    const [members, relations] = await Promise.all([
      db.select({
        id: familyMembersTable.id,
        display_name: familyMembersTable.display_name,
        role: familyMembersTable.role,
        relation_note: familyMembersTable.relation_note,
        user_id: familyMembersTable.user_id,
        status: familyMembersTable.status,
      })
      .from(familyMembersTable)
      .where(eq(familyMembersTable.family_id, familyId))
      .orderBy(familyMembersTable.display_name),

      db.select({
        id: familyTreeRelationsTable.id,
        from_member_id: familyTreeRelationsTable.from_member_id,
        to_member_id: familyTreeRelationsTable.to_member_id,
        relation_type: familyTreeRelationsTable.relation_type,
      })
      .from(familyTreeRelationsTable)
      .where(eq(familyTreeRelationsTable.family_id, familyId)),
    ]);

    const nodes = members.map(m => ({
      id: m.id,
      name: m.display_name,
      role: m.role,
      relation: m.relation_note,
      is_linked_user: !!m.user_id,
      status: m.status,
    }));

    const edges = relations.map(r => ({
      id: r.id,
      from: r.from_member_id,
      to: r.to_member_id,
      type: r.relation_type,
    }));

    return res.json({ nodes, edges, total: members.length });
  } catch (err) {
    logger.error({ err }, "family tree error");
    return res.status(500).json({ error: "Failed to load family tree" });
  }
});

// ─── Family Tree Relations CRUD ───────────────────────────────────────────────
const CreateRelationSchema = z.object({
  from_member_id: z.number().int().positive(),
  to_member_id: z.number().int().positive(),
  relation_type: z.enum(["parent", "spouse"]),
});

// POST /family/:id/tree/relations — add a relationship edge
router.post("/family/:id/tree/relations", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const familyId = Number(req.params.id);
    const userId = req.authenticatedUserId!;

    const membership = await db
      .select({ role: familyMembersTable.role })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ))
      .limit(1);

    if (!membership.length) return res.status(403).json({ error: "Not a member of this family" });
    if (!["owner", "curator", "contributor"].includes(membership[0].role)) {
      return res.status(403).json({ error: "Contributor access or higher required" });
    }

    const parsed = CreateRelationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

    const { from_member_id, to_member_id, relation_type } = parsed.data;
    if (from_member_id === to_member_id) {
      return res.status(400).json({ error: "Cannot create a relation to the same person" });
    }

    // Verify both members belong to this family
    const memberRows = await db.select({ id: familyMembersTable.id })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        inArray(familyMembersTable.id, [from_member_id, to_member_id]),
      ));
    if (memberRows.length !== 2) {
      return res.status(400).json({ error: "Both members must belong to this family" });
    }

    // For spouse relations, check if reverse edge already exists (bidirectional)
    if (relation_type === "spouse") {
      const existing = await db.select({ id: familyTreeRelationsTable.id })
        .from(familyTreeRelationsTable)
        .where(and(
          eq(familyTreeRelationsTable.family_id, familyId),
          eq(familyTreeRelationsTable.relation_type, "spouse"),
          or(
            and(
              eq(familyTreeRelationsTable.from_member_id, from_member_id),
              eq(familyTreeRelationsTable.to_member_id, to_member_id),
            ),
            and(
              eq(familyTreeRelationsTable.from_member_id, to_member_id),
              eq(familyTreeRelationsTable.to_member_id, from_member_id),
            ),
          ),
        ))
        .limit(1);
      if (existing.length) return res.status(409).json({ error: "Spouse relation already exists" });
    }

    const [relation] = await db.insert(familyTreeRelationsTable).values({
      family_id: familyId,
      from_member_id,
      to_member_id,
      relation_type,
    }).returning();

    logger.info({ familyId, relationId: relation.id, userId }, "family_tree_relation_created");
    return res.status(201).json({ relation });
  } catch (err) {
    // Handle unique constraint violation (duplicate edge)
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return res.status(409).json({ error: "This relation already exists" });
    }
    logger.error({ err }, "family tree relation create error");
    return res.status(500).json({ error: "Failed to create relation" });
  }
});

// DELETE /family/:id/tree/relations/:relationId — remove a relationship edge
router.delete("/family/:id/tree/relations/:relationId", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const familyId = Number(req.params.id);
    const relationId = Number(req.params.relationId);
    const userId = req.authenticatedUserId!;

    const membership = await db
      .select({ role: familyMembersTable.role })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ))
      .limit(1);

    if (!membership.length) return res.status(403).json({ error: "Not a member of this family" });
    if (!["owner", "curator", "contributor"].includes(membership[0].role)) {
      return res.status(403).json({ error: "Contributor access or higher required" });
    }

    await db.delete(familyTreeRelationsTable).where(and(
      eq(familyTreeRelationsTable.id, relationId),
      eq(familyTreeRelationsTable.family_id, familyId),
    ));

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "family tree relation delete error");
    return res.status(500).json({ error: "Failed to delete relation" });
  }
});

// ─── Family Legacy Timeline ────────────────────────────────────────────────────
router.get("/family/:id/timeline", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const familyId = Number(req.params.id);
    const userId = req.authenticatedUserId!;

    const membership = await db
      .select({ role: familyMembersTable.role })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ))
      .limit(1);

    if (!membership.length) return res.status(403).json({ error: "Not a member" });

    const memories = await db.select({
      id: familyMemoriesTable.id,
      title: familyMemoriesTable.title,
      description: familyMemoriesTable.description,
      memory_date: sql<string>`${familyMemoriesTable.memory_date}::text`,
      location_label: familyMemoriesTable.location_label,
      source: familyMemoriesTable.source,
    })
    .from(familyMemoriesTable)
    .where(and(
      eq(familyMemoriesTable.family_id, familyId),
      sql`${familyMemoriesTable.memory_date} IS NOT NULL`,
    ))
    .orderBy(familyMemoriesTable.memory_date);

    const events = memories.map(m => ({
      id: m.id,
      year: m.memory_date ? new Date(m.memory_date).getFullYear() : null,
      date: m.memory_date,
      title: m.title ?? "Family memory",
      description: m.description,
      location: m.location_label,
      type: m.source,
      memory_id: m.id,
    }));

    return res.json({ events });
  } catch (err) {
    logger.error({ err }, "family timeline error");
    return res.status(500).json({ error: "Failed to load timeline" });
  }
});

export default router;
