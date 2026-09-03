/**
 * Diaspora Platform — Extended Routes
 *
 * Routes (all under /api/diaspora/...):
 *
 *  GET  /diaspora/dashboard              — stats + recent activity for the dashboard
 *  GET  /diaspora/dna/connections        — connected DNA data status
 *  POST /diaspora/dna/import             — parse a provider export in memory
 *  DELETE /diaspora/dna/connections/:id  — delete the caller's derived profile
 *  GET  /diaspora/heritage               — curated heritage collection list
 *  GET  /diaspora/heritage/:slug         — single collection + published items
 *  GET  /diaspora/heritage/:slug/items   — published community contributions
 *  POST /diaspora/heritage/:slug/contributions — submit a pending contribution
 *  PATCH /diaspora/heritage/contributions/:id/moderate — publish/reject (admin)
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
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryTagsTable,
  familyInterviewsTable,
  familyTreeRelationsTable,
  heritageContributionsTable,
  familiesTable,
  familyDnaProfilesTable,
  dnaMatchResultsTable,
  dnaMatchingConsentTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, or, like, lt } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import { logWorldEvolution } from "../lib/legacy-world-evolution";
import {
  DNA_PROVIDERS,
  DNA_RETENTION_DAYS,
  DnaImportError,
  MAX_DNA_FILE_BYTES,
  parseDnaExport,
} from "../lib/dna-ingestion";

const router = Router();

function pathParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

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
    let dnaConnections = 0;

    if (familyIds.length > 0) {
      const [memRows, ivRows, memberCountRows, dnaRows] = await Promise.all([
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
        .where(inArray(familyMembersTable.family_id, familyIds)),

        db.select({ id: familyDnaProfilesTable.id })
          .from(familyDnaProfilesTable)
          .where(and(
            eq(familyDnaProfilesTable.user_id, userId),
            eq(familyDnaProfilesTable.status, "ready"),
            inArray(familyDnaProfilesTable.family_id, familyIds),
          )),
      ]);
      memories = memRows;
      interviews = ivRows;
      memberCount = Number(memberCountRows[0]?.count ?? 0);
      dnaConnections = dnaRows.length;
      vaultItems = memories.length;
    }

    return res.json({
      stats: {
        family_spaces: familyIds.length,
        vault_items: vaultItems,
        oral_histories: interviews.length,
        family_tree_people: memberCount,
        dna_connections: dnaConnections,
        heritage_collections: 9,
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

function publicDnaProfile(profile: typeof familyDnaProfilesTable.$inferSelect) {
  return {
    id: profile.id,
    family_id: profile.family_id,
    provider: profile.provider,
    status: profile.status,
    source_file_name: profile.source_file_name,
    source_format: profile.source_format,
    marker_count: profile.marker_count,
    raw_data_retained: profile.raw_data_retained,
    ethnicity_available: profile.ethnicity_available,
    match_count: profile.match_count,
    imported_at: profile.created_at,
    retention_expires_at: profile.retention_expires_at,
  };
}

async function activeFamilyIdsForUser(userId: number) {
  const memberships = await db
    .select({ family_id: familyMembersTable.family_id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.user_id, userId),
      eq(familyMembersTable.status, "active"),
    ));
  return memberships.map((membership) => membership.family_id);
}

router.get("/diaspora/dna/connections", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const userId = req.authenticatedUserId!;
    const familyIds = await activeFamilyIdsForUser(userId);

    if (familyIds.length > 0) {
      // Retention is enforced opportunistically as well as by the indexed
      // expiry column. Expired derived profiles cannot be presented.
      await db.delete(familyDnaProfilesTable).where(and(
        lt(familyDnaProfilesTable.retention_expires_at, new Date()),
        inArray(familyDnaProfilesTable.family_id, familyIds),
      ));
    }

    const [families, profiles] = familyIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select({
            id: familiesTable.id,
            name: familiesTable.name,
          }).from(familiesTable).where(inArray(familiesTable.id, familyIds)),
          db.select().from(familyDnaProfilesTable).where(and(
            eq(familyDnaProfilesTable.user_id, userId),
            inArray(familyDnaProfilesTable.family_id, familyIds),
          )),
        ]);

    const readyProfile = profiles.find((profile) => profile.status === "ready");
    const latestProfile = readyProfile ?? profiles[0];
    const connected = Boolean(readyProfile);
    const familyData = families.map((family) => {
      const profile = profiles.find((candidate) => candidate.family_id === family.id);
      return {
        id: family.id,
        name: family.name,
        profile: profile ? publicDnaProfile(profile) : null,
      };
    });

    return res.json({
      status: connected ? "ready" : (latestProfile?.status ?? "not_connected"),
      has_parsed_dataset: connected,
      match_count: connected ? readyProfile?.match_count ?? null : null,
      ethnicity_available: connected && readyProfile?.ethnicity_available === true,
      marker_count: connected ? readyProfile?.marker_count ?? null : null,
      summary: {
        // A parsed genotype export is not a relative-match database. Keep
        // these null until a real matching source produces provenance-backed
        // results.
        total_matches: null,
        close_family: null,
        distant_cousins: null,
        unreviewed: null,
      },
      matches: [],
      families: familyData,
      import_providers: DNA_PROVIDERS,
      raw_data_retained: false,
      retention_days: DNA_RETENTION_DAYS,
      info: connected
        ? "Your provider export was validated and reduced to a derived marker summary. Niakofa has not generated relative or ethnicity results because no supported matching source is connected."
        : "Upload a supported raw genotype export to connect it to one of your active Family Spaces. Niakofa will not show match counts or ethnicity results without a real parsed result.",
    });
  } catch (err) {
    logger.error({ err, userId: req.authenticatedUserId }, "diaspora DNA connections error");
    return res.status(500).json({ error: "Failed to load DNA connections" });
  }
});

router.post("/diaspora/dna/import", requireAuth, generalApiLimiter, async (req, res) => {
  const rawProvider = req.headers["x-dna-provider"];
  const provider = Array.isArray(rawProvider) ? rawProvider[0] : rawProvider;
  const rawFamilyId = req.headers["x-dna-family-id"] ?? req.query.family_id;
  const familyId = Number(Array.isArray(rawFamilyId) ? rawFamilyId[0] : rawFamilyId);
  const rawFileName = req.headers["x-dna-file-name"];
  const fileName = Array.isArray(rawFileName) ? rawFileName[0] : rawFileName;
  const buffer = req.body;

  if (!Number.isInteger(familyId) || familyId <= 0) {
    return res.status(400).json({ error: "A valid Family Space is required", code: "FAMILY_REQUIRED" });
  }
  if (!provider || !fileName || !Buffer.isBuffer(buffer)) {
    return res.status(400).json({
      error: "Send the raw DNA file bytes with x-dna-provider, x-dna-family-id, and x-dna-file-name headers.",
      code: "DNA_FILE_REQUIRED",
    });
  }
  if (fileName.length > 200 || fileName.includes("/") || fileName.includes("\\")) {
    return res.status(400).json({ error: "Invalid DNA file name", code: "DNA_FILE_NAME_INVALID" });
  }
  if (buffer.length > MAX_DNA_FILE_BYTES) {
    return res.status(413).json({ error: "DNA files must be 30 MB or smaller.", code: "DNA_FILE_TOO_LARGE" });
  }

  const userId = req.authenticatedUserId!;
  const [membership] = await db.select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.family_id, familyId),
      eq(familyMembersTable.user_id, userId),
      eq(familyMembersTable.status, "active"),
    ))
    .limit(1);
  if (!membership) return res.status(403).json({ error: "Not a member of this Family Space" });

  try {
    const parsed = parseDnaExport(provider, fileName, buffer);
    const retentionExpiresAt = new Date(Date.now() + DNA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const [profile] = await db.insert(familyDnaProfilesTable).values({
      family_id: familyId,
      user_id: userId,
      provider: parsed.provider,
      status: "ready",
      source_file_name: fileName,
      source_format: parsed.sourceFormat,
      dataset_fingerprint: parsed.fingerprint,
      marker_count: parsed.markerCount,
      marker_sketch: parsed.markerSketch,
      raw_data_retained: false,
      ethnicity_available: false,
      match_count: null,
      error_code: null,
      retention_expires_at: retentionExpiresAt,
      updated_at: new Date(),
    }).onConflictDoUpdate({
      target: [familyDnaProfilesTable.family_id, familyDnaProfilesTable.user_id],
      set: {
        provider: parsed.provider,
        status: "ready",
        source_file_name: fileName,
        source_format: parsed.sourceFormat,
        dataset_fingerprint: parsed.fingerprint,
        marker_count: parsed.markerCount,
        raw_data_retained: false,
        ethnicity_available: false,
        match_count: null,
        error_code: null,
        retention_expires_at: retentionExpiresAt,
        updated_at: new Date(),
      },
    }).returning();

    logger.info(
      { userId, familyId, provider: parsed.provider, markerCount: parsed.markerCount },
      "diaspora_dna_import_parsed",
    );
    return res.status(201).json({
      profile: profile ? publicDnaProfile(profile) : null,
      message: "DNA export validated. The raw file was discarded after in-memory parsing.",
      matches_available: false,
      ethnicity_available: false,
    });
  } catch (err) {
    if (err instanceof DnaImportError) {
      return res.status(err.code === "DNA_FILE_TOO_LARGE" ? 413 : 422).json({
        error: err.message,
        code: err.code,
        raw_data_retained: false,
      });
    }
    logger.error({ err, userId, familyId }, "diaspora DNA import failed");
    return res.status(500).json({ error: "DNA import failed without retaining the file" });
  }
});

router.delete("/diaspora/dna/connections/:profileId", requireAuth, generalApiLimiter, async (req, res) => {
  const profileId = Number(req.params.profileId);
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return res.status(400).json({ error: "Invalid DNA profile id" });
  }
  const userId = req.authenticatedUserId!;
  const [profile] = await db.select({
    id: familyDnaProfilesTable.id,
    family_id: familyDnaProfilesTable.family_id,
    user_id: familyDnaProfilesTable.user_id,
  }).from(familyDnaProfilesTable).where(and(
    eq(familyDnaProfilesTable.id, profileId),
    eq(familyDnaProfilesTable.user_id, userId),
  ));
  if (!profile) return res.status(404).json({ error: "DNA profile not found" });

  await db.transaction(async (tx) => {
    // A result can reference this profile as either the requesting user or the
    // matched candidate. Remove both directions so deletion is complete even
    // when another Family Space refreshed its results first.
    await tx.delete(dnaMatchResultsTable).where(or(
      and(
        eq(dnaMatchResultsTable.family_id, profile.family_id),
        eq(dnaMatchResultsTable.user_id, profile.user_id),
      ),
      and(
        eq(dnaMatchResultsTable.matched_family_id, profile.family_id),
        eq(dnaMatchResultsTable.matched_user_id, profile.user_id),
      ),
    ));
    await tx.delete(dnaMatchingConsentTable).where(and(
      eq(dnaMatchingConsentTable.family_id, profile.family_id),
      eq(dnaMatchingConsentTable.user_id, profile.user_id),
    ));
    await tx.delete(familyDnaProfilesTable).where(eq(familyDnaProfilesTable.id, profile.id));
  });

  logger.info({ userId: req.authenticatedUserId, profileId }, "diaspora_dna_profile_deleted");
  return res.status(204).send();
});

// ─── Heritage Collections ──────────────────────────────────────────────────────
const HERITAGE_COLLECTIONS = [
  { slug: "great-migration", title: "Great Migration", description: "The movement of 6 million African Americans from the rural South to urban Northern and Western cities between 1910-1970.", item_count: 24, cover_image: "https://images.pexels.com/photos/9151751/pexels-photo-9151751.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["history", "migration", "1910s", "1970s"], themes: ["Movement", "Labor", "Urbanization"] },
  { slug: "black-cowboys", title: "Black Cowboys", description: "Celebrating the often-overlooked history of African American cowboys, ranchers, and horsemen of the American West.", item_count: 18, cover_image: "https://images.pexels.com/photos/9151750/pexels-photo-9151750.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["cowboys", "west", "rodeo"], themes: ["Identity", "Labor", "Land"] },
  { slug: "civil-rights", title: "Civil Rights Movement", description: "Documenting the struggle for equality through marches, sit-ins, legal battles, and everyday courage.", item_count: 31, cover_image: "https://images.pexels.com/photos/16156767/pexels-photo-16156767.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["civil rights", "equality", "1960s", "activism"], themes: ["Justice", "Community", "Resistance"] },
  { slug: "family-recipes", title: "Family Recipes", description: "Preserving the culinary traditions, flavors, and techniques passed down through generations of Black families.", item_count: 12, cover_image: "https://images.pexels.com/photos/6004140/pexels-photo-6004140.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["food", "culture", "tradition"], themes: ["Community", "Ancestry", "Joy"] },
  { slug: "church-history", title: "Church History", description: "The church as the heart of the Black community — from spirituals and sermons to social justice and education.", item_count: 16, cover_image: "https://images.pexels.com/photos/7520351/pexels-photo-7520351.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["church", "faith", "spirituals", "community"], themes: ["Faith", "Community", "Leadership"] },
  { slug: "fort-worth-stories", title: "Fort Worth Stories", description: "Local stories from the Fort Worth African American community — families, businesses, and landmarks that shaped the city.", item_count: 8, cover_image: "https://images.pexels.com/photos/4262426/pexels-photo-4262426.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["fort worth", "local", "texas"], themes: ["Community", "Heritage", "Local"] },
  { slug: "military-service", title: "Military Service", description: "Honoring the service and sacrifice of Black military members from the Civil War through today.", item_count: 22, cover_image: "https://images.pexels.com/photos/5214869/pexels-photo-5214869.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["military", "veterans", "Buffalo Soldiers"], themes: ["Service", "Sacrifice", "Honor"] },
  { slug: "hbcu-legacy", title: "HBCU Legacy", description: "The history and impact of Historically Black Colleges and Universities in shaping generations of Black excellence.", item_count: 14, cover_image: "https://images.pexels.com/photos/8790740/pexels-photo-8790740.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["education", "HBCU", "excellence"], themes: ["Education", "Excellence", "Community"] },
  { slug: "land-ownership", title: "Land Ownership", description: "Documenting the history of Black land ownership, the Freedmen's Bureau, and the ongoing fight for generational wealth.", item_count: 9, cover_image: "https://images.pexels.com/photos/3234896/pexels-photo-3234896.jpeg?auto=compress&cs=tinysrgb&h=400&w=600", tags: ["land", "property", "Freedmen", "wealth"], themes: ["Wealth", "Freedom", "Heritage"] },
];

router.get("/diaspora/heritage", requireAuth, generalApiLimiter, (_req, res) => {
  return res.json({ collections: HERITAGE_COLLECTIONS });
});

router.get("/diaspora/heritage/:slug", requireAuth, generalApiLimiter, (req, res) => {
  const slug = pathParam(req.params.slug);
  const collection = HERITAGE_COLLECTIONS.find(c => c.slug === slug);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  return listPublishedHeritageItems(slug).then(items => {
    return res.json({
      collection,
      items,
      message: "Community members can contribute items from their personal Family Vaults to shared Heritage Collections.",
    });
  }).catch(err => {
    logger.error({ err, slug }, "heritage collection detail error");
    return res.status(500).json({ error: "Failed to load heritage collection" });
  });
});

const contributionSchema = z.object({
  kind: z.enum(["photo", "story", "note", "link"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(8000).optional(),
  media_url: z.string().url().optional(),
  family_id: z.number().int().positive().optional(),
}).refine(
  (data) => data.kind !== "link" || Boolean(data.media_url),
  { message: "A URL is required for link contributions", path: ["media_url"] },
);

async function listPublishedHeritageItems(slug: string) {
  const rows = await db
    .select({
      id: heritageContributionsTable.id,
      title: heritageContributionsTable.title,
      body: heritageContributionsTable.body,
      kind: heritageContributionsTable.kind,
      media_url: heritageContributionsTable.media_url,
      created_at: heritageContributionsTable.created_at,
    })
    .from(heritageContributionsTable)
    .where(and(
      eq(heritageContributionsTable.collection_slug, slug),
      eq(heritageContributionsTable.status, "published"),
    ))
    .orderBy(desc(heritageContributionsTable.created_at))
    .limit(50);

  return rows.map(item => ({
    id: item.id,
    title: item.title,
    description: item.body,
    media_type: item.kind,
    source_name: "Community contribution",
    media_url: item.media_url,
    created_at: item.created_at.toISOString(),
  }));
}

router.get("/diaspora/heritage/:slug/items", requireAuth, generalApiLimiter, async (req, res) => {
  const slug = pathParam(req.params.slug);
  const collection = HERITAGE_COLLECTIONS.find(c => c.slug === slug);
  if (!collection) return res.status(404).json({ error: "Collection not found" });
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const items = await listPublishedHeritageItems(slug);
    const start = (page - 1) * pageSize;
    return res.json({ items: items.slice(start, start + pageSize), page, pageSize, total: items.length });
  } catch (err) {
    logger.error({ err, slug }, "heritage contribution list error");
    return res.status(500).json({ error: "Failed to load contributions" });
  }
});

router.post("/diaspora/heritage/:slug/contributions", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const slug = pathParam(req.params.slug);
    const collection = HERITAGE_COLLECTIONS.find(c => c.slug === slug);
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    const parsed = contributionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid contribution" });
    }

    const userId = req.authenticatedUserId!;
    const { kind, title, body, media_url, family_id } = parsed.data;
    if (family_id != null) {
      const membership = await db
        .select({ role: familyMembersTable.role })
        .from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.family_id, family_id),
          eq(familyMembersTable.user_id, userId),
          eq(familyMembersTable.status, "active"),
        ))
        .limit(1);
      if (!membership.length) return res.status(403).json({ error: "Not a member of this family" });
    }

    const [contribution] = await db.insert(heritageContributionsTable).values({
      collection_slug: slug,
      family_id: family_id ?? null,
      user_id: userId,
      kind,
      title,
      body: body || null,
      media_url: media_url ?? null,
      status: "pending",
    }).returning();

    logger.info({ userId, contributionId: contribution.id, collectionSlug: slug }, "heritage_contribution_created");
    return res.status(201).json({ contribution });
  } catch (err) {
    logger.error({ err }, "heritage contribution create error");
    return res.status(500).json({ error: "Failed to create contribution" });
  }
});

router.patch("/diaspora/heritage/contributions/:id/moderate", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const contributionId = Number(req.params.id);
  const parsed = z.object({
    status: z.enum(["published", "rejected"]),
    rejection_reason: z.string().trim().max(1000).optional(),
  }).safeParse(req.body);
  if (!Number.isInteger(contributionId) || contributionId <= 0 || !parsed.success) {
    return res.status(400).json({ error: "Valid status and contribution id are required" });
  }

  try {
    const [contribution] = await db.update(heritageContributionsTable).set({
      status: parsed.data.status,
      moderated_by: req.authenticatedUserId!,
      moderated_at: new Date(),
      rejection_reason: parsed.data.status === "rejected" ? parsed.data.rejection_reason ?? null : null,
    }).where(eq(heritageContributionsTable.id, contributionId)).returning();
    if (!contribution) return res.status(404).json({ error: "Contribution not found" });
    logger.info({ contributionId, status: parsed.data.status, moderatorId: req.authenticatedUserId }, "heritage_contribution_moderated");
    return res.json({ contribution });
  } catch (err) {
    logger.error({ err, contributionId }, "heritage contribution moderation error");
    return res.status(500).json({ error: "Failed to moderate contribution" });
  }
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
  { id: "tarrant-county-records", title: "Tarrant County Land Records", description: "How to access land and property records specific to Tarrant County, Texas for local genealogy research.", category: "Government Records", difficulty: "intermediate", estimated_time: "2-3 hours", resources: [{ name: "Tarrant County Clerk", url: "https://www.tarrantcounty.com/" }] },
  { id: "fort-worth-directories", title: "Fort Worth City Directories", description: "Using historical Fort Worth city directories to trace African American residences, businesses, and occupations from the 1800s onward.", category: "Archives", difficulty: "beginner", estimated_time: "1-2 hours", resources: [] },
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
        birth_year: familyMembersTable.birth_year,
        death_year: familyMembersTable.death_year,
        gender: familyMembersTable.gender,
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
      // These three were previously missing from this endpoint's SELECT
      // entirely — the frontend TreeNode type has referenced birth_year
      // for sorting/living-status display since this route existed, but
      // it was always undefined at runtime because the query never
      // fetched it. Fixed alongside adding death_year/gender (the latter
      // added in migration 0106 for Legacy Mode character appearance).
      birth_year: m.birth_year !== null ? String(m.birth_year) : null,
      death_year: m.death_year !== null ? String(m.death_year) : null,
      gender: m.gender,
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
    logWorldEvolution(familyId, "relation_added", `A new ${relation_type} relationship was added to the family tree`).catch(() => {});
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

    // Fetch explicit event_type tags for these memories
    const memoryIds = memories.map(m => m.id);
    const tagMap: Record<number, string> = {};
    if (memoryIds.length > 0) {
      const tags = await db.select({
        memory_id: familyMemoryTagsTable.memory_id,
        tag:       familyMemoryTagsTable.tag,
      })
      .from(familyMemoryTagsTable)
      .where(and(
        inArray(familyMemoryTagsTable.memory_id, memoryIds),
        like(familyMemoryTagsTable.tag, "event_type:%"),
      ));
      for (const t of tags) {
        tagMap[t.memory_id] = t.tag.replace("event_type:", "");
      }
    }

    const events = memories.map(m => ({
      id:          m.id,
      year:        m.memory_date ? new Date(m.memory_date).getFullYear() : null,
      date:        m.memory_date,
      title:       m.title ?? "Family memory",
      description: m.description,
      location:    m.location_label,
      type:        m.source,
      event_type:  tagMap[m.id] ?? null,
      memory_id:   m.id,
      family_id:   familyId,
    }));

    return res.json({ events });
  } catch (err) {
    logger.error({ err }, "family timeline error");
    return res.status(500).json({ error: "Failed to load timeline" });
  }
});

// ─── Add Family Timeline Event ─────────────────────────────────────────────
router.post("/family/:id/timeline", requireAuth, generalApiLimiter, async (req, res) => {
  try {
    const familyId = Number(req.params.id);
    const userId   = req.authenticatedUserId!;
    const { title, description, year, location, event_type } = req.body;

    if (!title || !year) {
      return res.status(400).json({ error: "title and year are required" });
    }
    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 1600 || yearNum > new Date().getFullYear()) {
      return res.status(400).json({ error: "year must be between 1600 and current year" });
    }

    // Verify the user is an active member of this family
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

    const memoryDate = new Date(`${yearNum}-01-01T00:00:00Z`);

    const [memory] = await db.insert(familyMemoriesTable).values({
      family_id:             familyId,
      author_id:             userId,
      title:                 String(title).trim(),
      description:           description ? String(description).trim() : null,
      memory_date:           memoryDate,
      memory_date_precision: "year",
      location_label:        location ? String(location).trim() : null,
      source:                "import",
      visibility:             "family",
    }).returning();

    // Store the event_type as a tag for future filtering
    if (event_type && typeof event_type === "string" && event_type !== "upload") {
      await db.insert(familyMemoryTagsTable).values({
        memory_id: memory.id,
        tag:       `event_type:${event_type}`,
      });
    }

    logWorldEvolution(familyId, "event_added", memory.title ?? undefined).catch(() => {});

    return res.status(201).json({
      event: {
        id:          memory.id,
        year:        yearNum,
        date:        memoryDate.toISOString(),
        title:       memory.title,
        description: memory.description,
        location:    memory.location_label,
        type:        memory.source,
        event_type:  event_type ?? null,
        memory_id:   memory.id,
        family_id:   familyId,
      },
    });
  } catch (err) {
    logger.error({ err }, "add timeline event error");
    return res.status(500).json({ error: "Failed to add timeline event" });
  }
});

export default router;
