/**
 * Diaspora Platform — Family Vault API
 *
 * Routes (all under /api/family/...):
 *
 *  POST   /family                                          — create a Family Space
 *  GET    /family/mine                                     — families the caller belongs to
 *  GET    /family/:id                                      — family detail + members summary
 *  PATCH  /family/:id                                      — update name/description (owner/curator)
 *  DELETE /family/:id                                      — delete (owner only)
 *
 *  POST   /family/:id/members                              — invite a member
 *  GET    /family/:id/members                              — list members
 *  PATCH  /family/:id/members/:memberId                    — change role/status
 *  DELETE /family/:id/members/:memberId                    — remove member
 *
 *  GET    /family/:id/memories                             — list/search memories
 *  POST   /family/:id/memories                             — create memory (metadata only)
 *  GET    /family/:id/memories/:memoryId                   — memory detail (assets/tags/people/comments)
 *  PATCH  /family/:id/memories/:memoryId                   — edit memory
 *  DELETE /family/:id/memories/:memoryId                   — delete memory
 *
 *  POST   /family/:id/memories/:memoryId/assets/upload-url — get presigned S3/R2 upload URL
 *  POST   /family/:id/memories/:memoryId/assets            — confirm asset after direct upload
 *  DELETE /family/:id/memories/:memoryId/assets/:assetId   — delete an asset
 *
 *  POST   /family/:id/memories/:memoryId/comments          — add comment
 *  GET    /family/:id/memories/:memoryId/comments          — list comments
 *
 *  POST   /family/:id/interviews                           — start an interview session
 *  GET    /family/:id/interviews                           — list interviews
 *  GET    /family/:id/interviews/:interviewId              — interview detail
 *  PATCH  /family/:id/interviews/:interviewId              — update status
 */

import { Router } from "express";
import {
  putAsset,
  streamOrRedirectAsset,
  getAssetUrl,
  isCloudStorageConfigured,
  getStorageBackend,
  UPLOADS_BASE,
} from "../lib/storage";
import {
  db,
  familiesTable,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryTagsTable,
  familyMemoryPeopleTable,
  familyMemoryCommentsTable,
  familyMemoryAssetsTable,
  familyInterviewsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, desc, sql, or, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { stripTags } from "../lib/sanitize";

const router = Router();

// ─── GEDCOM parser (minimal — extracts INDI records) ─────────────────────────
// Supports the GEDCOM 5.5.1 line structure:
//   LEVEL TAG [VALUE]
// Extracts given name + birth year for each individual.
function parseGedcom(text: string): Array<{ name: string; birthYear?: string }> {
  const result: Array<{ name: string; birthYear?: string }> = [];
  let inIndi = false;
  let inBirt = false;
  let curName: string | undefined;
  let curBirthYear: string | undefined;

  function flush() {
    if (inIndi && curName) result.push({ name: curName, birthYear: curBirthYear });
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const sp1 = line.indexOf(" ");
    if (sp1 === -1) continue;
    const level = parseInt(line.slice(0, sp1), 10);
    if (isNaN(level)) continue;
    const rest = line.slice(sp1 + 1).trim();
    const sp2  = rest.indexOf(" ");
    const tag   = sp2 === -1 ? rest : rest.slice(0, sp2);
    const value = sp2 === -1 ? "" : rest.slice(sp2 + 1).trim();

    if (level === 0) {
      flush();
      inIndi = false; inBirt = false; curName = undefined; curBirthYear = undefined;
      // Detect: 0 @Ixx@ INDI  OR  0 INDI (non-standard)
      if (value === "INDI" || (tag === "INDI" && value === "")) inIndi = true;
    } else if (inIndi) {
      if (level === 1 && tag === "NAME") {
        // GEDCOM encodes surname in /slashes/ — remove them and collapse spaces
        curName = value.replace(/\//g, " ").replace(/\s+/g, " ").trim();
      } else if (level === 1 && tag === "BIRT") {
        inBirt = true;
      } else if (level === 1 && tag !== "BIRT") {
        inBirt = false;
      } else if (level === 2 && inBirt && tag === "DATE") {
        const m = value.match(/\b(\d{4})\b/);
        if (m) curBirthYear = m[1];
      }
    }
  }
  flush();
  return result.filter(r => r.name.trim() !== "");
}

// ─── Asset serving ─────────────────────────────────────────────────────────────
// Routes GET /family/assets/:key to the active storage backend:
//   • Cloud (STORAGE_BUCKET set): 307 redirect to a presigned S3/R2 URL
//   • Local disk (dev/Replit):    sendFile() from uploads/ directory
//
// Registered BEFORE the /:id param route so "assets" isn't matched as a family ID.
// No membership auth — storage keys are unguessable UUIDs; elevate if needed.
router.use("/family/assets", generalApiLimiter, async (req, res, next) => {
  if (req.method !== "GET") return next();
  // Strip leading slash; normalise away any ".." segments
  const rel = decodeURIComponent(req.path).replace(/^\/+/, "").replace(/\.\./g, "");
  if (!rel) return res.status(404).json({ error: "Not found" });
  await streamOrRedirectAsset(rel, res);
});

// ─── Validation schemas ───────────────────────────────────────────────────────

const CreateFamilySchema = z.object({
  name:            z.string().min(1).max(120).transform(s => stripTags(s)),
  description:     z.string().max(1000).optional().transform(s => s ? stripTags(s) : s),
  cover_image_url: z.string().url().max(500).optional(),
});

const UpdateFamilySchema = z.object({
  name:            z.string().min(1).max(120).transform(s => stripTags(s)).optional(),
  description:     z.string().max(1000).optional().transform(s => s ? stripTags(s) : s),
  cover_image_url: z.string().url().max(500).nullable().optional(),
});

const InviteMemberSchema = z.object({
  display_name:  z.string().min(1).max(100).transform(s => stripTags(s)),
  invite_email:  z.string().email().max(200).optional(),
  relation_note: z.string().max(200).optional().transform(s => s ? stripTags(s) : s),
  role:          z.enum(["curator", "contributor", "viewer"]).default("contributor"),
});

const UpdateMemberSchema = z.object({
  role:   z.enum(["owner", "curator", "contributor", "viewer"]).optional(),
  status: z.enum(["active", "removed"]).optional(),
});

const CreateMemorySchema = z.object({
  title:                 z.string().max(200).optional().transform(s => s ? stripTags(s) : s),
  description:           z.string().max(2000).optional().transform(s => s ? stripTags(s) : s),
  story:                 z.string().max(50000).optional().transform(s => s ? stripTags(s) : s),
  memory_date:           z.string().datetime().optional(),
  memory_date_precision: z.enum(["day", "month", "year", "circa"]).default("day"),
  location_label:        z.string().max(200).optional().transform(s => s ? stripTags(s) : s),
  lat:                   z.number().min(-90).max(90).optional(),
  lng:                   z.number().min(-180).max(180).optional(),
  source:                z.enum(["upload", "interview", "culture_card", "import"]).default("upload"),
  visibility:            z.enum(["family", "branch", "private"]).default("family"),
  tags:                  z.array(z.string().max(50)).max(20).optional(),
  interview_id:          z.number().int().positive().optional(),
});

const UpdateMemorySchema = CreateMemorySchema.partial();

const ConfirmAssetSchema = z.object({
  storage_key:      z.string().max(500),
  asset_type:       z.enum(["photo", "video", "audio", "document"]),
  mime_type:        z.string().max(100),
  byte_size:        z.number().int().positive().optional(),
  duration_seconds: z.number().int().positive().optional(),
  width:            z.number().int().positive().optional(),
  height:           z.number().int().positive().optional(),
});

const AddCommentSchema = z.object({
  body: z.string().min(1).max(5000).transform(s => stripTags(s)),
});

const CreateInterviewSchema = z.object({
  subject_member_id: z.number().int().positive().optional(),
  prompts_used:      z.array(z.string().max(500)).max(20).optional(),
});

const UpdateInterviewSchema = z.object({
  status:              z.enum(["scheduled", "recording", "transcribing", "review", "published"]),
  resulting_memory_id: z.number().int().positive().optional(),
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Check that the authenticated user is an active member of the family.
 * Returns the membership row, or null if not found / not active.
 */
async function getFamilyMembership(familyId: number, userId: number) {
  const [row] = await db
    .select()
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

const CAN_WRITE_ROLES: string[] = ["owner", "curator", "contributor"];
const CAN_MANAGE_ROLES: string[] = ["owner", "curator"];

// ─── Family Space CRUD ────────────────────────────────────────────────────────

// POST /family — create
router.post("/family", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const parsed = CreateFamilySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const { name, description, cover_image_url } = parsed.data;

  const [family] = await db
    .insert(familiesTable)
    .values({ name, description, cover_image_url, created_by: userId })
    .returning();

  // Add creator as owner
  const [userRow] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  await db.insert(familyMembersTable).values({
    family_id:    family.id,
    user_id:      userId,
    display_name: userRow?.name ?? "Family Owner",
    role:         "owner",
    status:       "active",
    joined_at:    new Date(),
  });

  logger.info({ familyId: family.id, userId }, "family_created");
  return res.status(201).json({ family });
});

// GET /family/mine — list families the caller belongs to
router.get("/family/mine", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;

  const rows = await db
    .select({
      family:     familiesTable,
      membership: familyMembersTable,
    })
    .from(familyMembersTable)
    .innerJoin(familiesTable, eq(familyMembersTable.family_id, familiesTable.id))
    .where(
      and(
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ),
    )
    .orderBy(desc(familiesTable.updated_at));

  return res.json({
    families: rows.map(r => ({
      ...r.family,
      my_role: r.membership.role,
    })),
  });
});

// GET /family/:id — detail + members summary
router.get("/family/:id", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const [family] = await db
    .select()
    .from(familiesTable)
    .where(eq(familiesTable.id, familyId))
    .limit(1);
  if (!family) return res.status(404).json({ error: "Family not found" });

  const members = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.family_id, familyId))
    .orderBy(familyMembersTable.role, familyMembersTable.display_name);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(familyMemoriesTable)
    .where(eq(familyMemoriesTable.family_id, familyId));

  return res.json({ family, members, memory_count: count, my_role: membership.role });
});

// PATCH /family/:id — update name/description
router.patch("/family/:id", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Owner or curator access required" });
  }

  const parsed = UpdateFamilySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const updates: Partial<typeof familiesTable.$inferInsert> = {
    updated_at: new Date(),
  };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.cover_image_url !== undefined) updates.cover_image_url = parsed.data.cover_image_url ?? undefined;

  const [family] = await db
    .update(familiesTable)
    .set(updates)
    .where(eq(familiesTable.id, familyId))
    .returning();

  return res.json({ family });
});

// DELETE /family/:id — owner only, hard delete
router.delete("/family/:id", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || membership.role !== "owner") {
    return res.status(403).json({ error: "Owner access required to delete a family" });
  }

  await db.delete(familiesTable).where(eq(familiesTable.id, familyId));
  logger.info({ familyId, userId }, "family_deleted");
  return res.json({ ok: true });
});

// ─── Family Members ───────────────────────────────────────────────────────────

// GET /family/:id/members
router.get("/family/:id/members", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const members = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.family_id, familyId))
    .orderBy(familyMembersTable.role, familyMembersTable.display_name);

  return res.json({ members });
});

// POST /family/:id/members — invite a member
router.post("/family/:id/members", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Owner or curator access required to invite members" });
  }

  const parsed = InviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { display_name, invite_email, relation_note, role } = parsed.data;

  const [member] = await db
    .insert(familyMembersTable)
    .values({
      family_id:    familyId,
      display_name,
      invite_email,
      relation_note,
      role,
      status:       "invited",
      invited_by:   userId,
    })
    .returning();

  logger.info({ familyId, memberId: member.id, invitedBy: userId }, "family_member_invited");
  return res.status(201).json({ member });
});

// PATCH /family/:id/members/:memberId — change role or status
router.patch("/family/:id/members/:memberId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!familyId || !memberId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Owner or curator access required" });
  }

  const parsed = UpdateMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  // Prevent owners from demoting themselves if they are the last owner
  if (parsed.data.role && parsed.data.role !== "owner") {
    const [target] = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.id, memberId))
      .limit(1);
    if (target?.role === "owner") {
      const [{ ownerCount }] = await db
        .select({ ownerCount: sql<number>`count(*)::int` })
        .from(familyMembersTable)
        .where(and(
          eq(familyMembersTable.family_id, familyId),
          eq(familyMembersTable.role, "owner"),
          eq(familyMembersTable.status, "active"),
        ));
      if (ownerCount <= 1) {
        return res.status(409).json({ error: "Cannot demote the last owner. Promote another member first." });
      }
    }
  }

  const updates: Partial<typeof familyMembersTable.$inferInsert> = {};
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "active") updates.joined_at = new Date();
  }

  const [updated] = await db
    .update(familyMembersTable)
    .set(updates)
    .where(and(
      eq(familyMembersTable.id, memberId),
      eq(familyMembersTable.family_id, familyId),
    ))
    .returning();

  if (!updated) return res.status(404).json({ error: "Member not found" });
  return res.json({ member: updated });
});

// DELETE /family/:id/members/:memberId
router.delete("/family/:id/members/:memberId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  const memberId = Number(req.params.memberId);
  if (!familyId || !memberId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Owner or curator access required" });
  }

  await db
    .delete(familyMembersTable)
    .where(and(
      eq(familyMembersTable.id, memberId),
      eq(familyMembersTable.family_id, familyId),
    ));

  return res.json({ ok: true });
});

// ─── Memories ─────────────────────────────────────────────────────────────────

// GET /family/:id/memories — list + search
router.get("/family/:id/memories", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const limit  = Math.min(Number(req.query.limit ?? 20), 50);
  const offset = Number(req.query.offset ?? 0);
  const q      = req.query.q as string | undefined;
  const source = req.query.source as string | undefined;

  // Visibility filter: viewer/contributor see family+private-own; curator/owner see all
  const visFilter =
    CAN_MANAGE_ROLES.includes(membership.role as string)
      ? undefined
      : or(
          eq(familyMemoriesTable.visibility, "family"),
          and(
            eq(familyMemoriesTable.visibility, "private"),
            eq(familyMemoriesTable.author_id, userId),
          ),
        );

  const conditions = [
    eq(familyMemoriesTable.family_id, familyId),
    ...(visFilter ? [visFilter] : []),
    ...(q ? [or(ilike(familyMemoriesTable.title, `%${q}%`), ilike(familyMemoriesTable.description, `%${q}%`))] : []),
    ...(source ? [eq(familyMemoriesTable.source, source as "upload" | "interview" | "culture_card" | "import")] : []),
  ];

  const memories = await db
    .select()
    .from(familyMemoriesTable)
    .where(and(...conditions))
    .orderBy(desc(familyMemoriesTable.updated_at))
    .limit(limit)
    .offset(offset);

  // Attach primary asset per memory (first photo or any)
  const memoryIds = memories.map(m => m.id);
  const assets = memoryIds.length
    ? await db
        .select()
        .from(familyMemoryAssetsTable)
        .where(inArray(familyMemoryAssetsTable.memory_id, memoryIds))
    : [];

  const assetsByMemory = assets.reduce<Record<number, typeof assets>>((acc, a) => {
    (acc[a.memory_id] ??= []).push(a);
    return acc;
  }, {});

  return res.json({
    memories: memories.map(m => ({
      ...m,
      primary_asset: assetsByMemory[m.id]?.find(a => a.asset_type === "photo") ?? assetsByMemory[m.id]?.[0] ?? null,
    })),
    limit,
    offset,
  });
});

// POST /family/:id/memories — create
router.post("/family/:id/memories", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Contributor access or higher required" });
  }

  const parsed = CreateMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { tags, ...rest } = parsed.data;

  const { memory_date: memoryDateStr, ...restFields } = rest;
  const [memory] = await db
    .insert(familyMemoriesTable)
    .values({
      ...restFields,
      family_id:   familyId,
      author_id:   userId,
      memory_date: memoryDateStr ? new Date(memoryDateStr) : undefined,
    })
    .returning();

  // Insert tags
  if (tags?.length) {
    await db.insert(familyMemoryTagsTable).values(
      tags.map(t => ({ memory_id: memory.id, tag: t.toLowerCase() })),
    );
  }

  broadcast({ type: "family_memory_created", payload: { family_id: familyId, memory_id: memory.id, author_id: userId } });

  logger.info({ familyId, memoryId: memory.id, userId }, "family_memory_created");
  return res.status(201).json({ memory });
});

// GET /family/:id/memories/:memoryId — detail
router.get("/family/:id/memories/:memoryId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  const memoryId = Number(req.params.memoryId);
  if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const [memory] = await db
    .select()
    .from(familyMemoriesTable)
    .where(and(
      eq(familyMemoriesTable.id, memoryId),
      eq(familyMemoriesTable.family_id, familyId),
    ))
    .limit(1);
  if (!memory) return res.status(404).json({ error: "Memory not found" });

  // Visibility check
  if (
    memory.visibility === "private" &&
    memory.author_id !== userId &&
    !CAN_MANAGE_ROLES.includes(membership.role as string)
  ) {
    return res.status(403).json({ error: "This memory is private" });
  }

  const [assets, tags, people, comments] = await Promise.all([
    db.select().from(familyMemoryAssetsTable).where(eq(familyMemoryAssetsTable.memory_id, memoryId)),
    db.select().from(familyMemoryTagsTable).where(eq(familyMemoryTagsTable.memory_id, memoryId)),
    db.select().from(familyMemoryPeopleTable).where(eq(familyMemoryPeopleTable.memory_id, memoryId)),
    db
      .select()
      .from(familyMemoryCommentsTable)
      .where(eq(familyMemoryCommentsTable.memory_id, memoryId))
      .orderBy(familyMemoryCommentsTable.created_at),
  ]);

  return res.json({ memory, assets, tags, people, comments });
});

// PATCH /family/:id/memories/:memoryId — edit
router.patch("/family/:id/memories/:memoryId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  const memoryId = Number(req.params.memoryId);
  if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const [memory] = await db
    .select()
    .from(familyMemoriesTable)
    .where(and(eq(familyMemoriesTable.id, memoryId), eq(familyMemoriesTable.family_id, familyId)))
    .limit(1);
  if (!memory) return res.status(404).json({ error: "Memory not found" });

  // Authors can edit their own; curators/owners can edit any
  if (memory.author_id !== userId && !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "You can only edit your own memories" });
  }

  const parsed = UpdateMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { tags, memory_date: memDateStr, ...rest } = parsed.data;

  const [updated] = await db
    .update(familyMemoriesTable)
    .set({
      ...rest,
      ...(memDateStr !== undefined ? { memory_date: memDateStr ? new Date(memDateStr) : null } : {}),
      updated_at: new Date(),
    })
    .where(eq(familyMemoriesTable.id, memoryId))
    .returning();

  // Replace tags if provided
  if (tags !== undefined) {
    await db.delete(familyMemoryTagsTable).where(eq(familyMemoryTagsTable.memory_id, memoryId));
    if (tags.length) {
      await db.insert(familyMemoryTagsTable).values(
        tags.map(t => ({ memory_id: memoryId, tag: t.toLowerCase() })),
      );
    }
  }

  return res.json({ memory: updated });
});

// DELETE /family/:id/memories/:memoryId
router.delete("/family/:id/memories/:memoryId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  const memoryId = Number(req.params.memoryId);
  if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const [memory] = await db
    .select()
    .from(familyMemoriesTable)
    .where(and(eq(familyMemoriesTable.id, memoryId), eq(familyMemoriesTable.family_id, familyId)))
    .limit(1);
  if (!memory) return res.status(404).json({ error: "Memory not found" });

  if (memory.author_id !== userId && !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Only the author, a curator, or owner can delete this memory" });
  }

  await db.delete(familyMemoriesTable).where(eq(familyMemoriesTable.id, memoryId));
  logger.info({ familyId, memoryId, userId }, "family_memory_deleted");
  return res.json({ ok: true });
});

// ─── Memory Assets ────────────────────────────────────────────────────────────

// POST /family/:id/memories/:memoryId/assets/upload-url
// Returns a presigned upload URL stub. Requires S3/R2 env vars; returns a
// dev-mode placeholder when credentials are absent so the flow stays testable.
router.post(
  "/family/:id/memories/:memoryId/assets/upload-url",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access required" });
    }

    const { filename, mime_type } = req.body ?? {};
    if (!filename || !mime_type) {
      return res.status(400).json({ error: "filename and mime_type are required" });
    }

    const safeFile   = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const storageKey = `families/${familyId}/memories/${memoryId}/${Date.now()}_${safeFile}`;

    if (isCloudStorageConfigured()) {
      // Generate a real presigned PutObject URL via the storage module.
      // The client uploads directly to S3/R2 and then confirms with POST /assets.
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const { getSignedUrl }     = await import("@aws-sdk/s3-request-presigner");
      const { S3Client }         = await import("@aws-sdk/client-s3");
      const endpoint = process.env["STORAGE_ENDPOINT"];
      const region   = process.env["STORAGE_REGION"] ?? (endpoint ? "auto" : "us-east-1");
      const s3 = new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: false } : {}) });
      const upload_url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket:      process.env["STORAGE_BUCKET"]!,
          Key:         storageKey,
          ContentType: mime_type,
        }),
        { expiresIn: 900 }, // 15 minutes
      );
      return res.json({ upload_url, storage_key: storageKey, expires_in: 900 });
    }

    // Local-disk mode: caller should use upload-direct instead; return a stub
    // so the flow stays testable without S3 credentials.
    return res.json({
      upload_url:  null,
      storage_key: storageKey,
      dev_mode:    true,
      message:     "Object storage not configured. Use the upload-direct endpoint instead.",
    });
  },
);

// POST /family/:id/memories/:memoryId/assets — confirm after upload
router.post(
  "/family/:id/memories/:memoryId/assets",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access required" });
    }

    const parsed = ConfirmAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const [asset] = await db
      .insert(familyMemoryAssetsTable)
      .values({ memory_id: memoryId, ...parsed.data })
      .returning();

    return res.status(201).json({ asset });
  },
);

// POST /family/:id/memories/:memoryId/assets/upload-direct
// Accepts a base64 data-URL JSON body and writes the file to the active storage
// backend (S3/R2 when STORAGE_BUCKET is set; local disk otherwise).
// Max decoded file size: 20 MB.
router.post(
  "/family/:id/memories/:memoryId/assets/upload-direct",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId   = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access required" });
    }

    const { dataUrl, filename, mimeType, assetType } = (req.body ?? {}) as Record<string, string>;
    if (!dataUrl || !filename || !mimeType || !assetType) {
      return res.status(400).json({ error: "dataUrl, filename, mimeType, assetType are required" });
    }
    if (!["photo", "video", "audio", "document"].includes(assetType)) {
      return res.status(400).json({ error: "Invalid asset type" });
    }

    const comma = dataUrl.indexOf(",");
    if (comma === -1) return res.status(400).json({ error: "Invalid dataUrl — expected base64 data URL" });
    const buffer = Buffer.from(dataUrl.slice(comma + 1), "base64");

    if (buffer.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: "File exceeds the 20 MB limit" });
    }

    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const storageKey   = `families/${familyId}/memories/${memoryId}/${Date.now()}_${safeFilename}`;

    // Write to S3/R2 or local disk depending on STORAGE_BUCKET config
    await putAsset(storageKey, buffer, mimeType);

    const [asset] = await db
      .insert(familyMemoryAssetsTable)
      .values({
        memory_id:         memoryId,
        asset_type:        assetType as "photo" | "video" | "audio" | "document",
        storage_key:       storageKey,
        mime_type:         mimeType,
        byte_size:         buffer.length,
        processing_status: "ready",
      })
      .returning();

    logger.info(
      { familyId, memoryId, assetId: asset.id, assetType, backend: getStorageBackend() },
      "family_asset_uploaded_direct",
    );
    return res.status(201).json({ asset });
  },
);

// ─── Nia Powers — Oral History Translation ─────────────────────────────────────
// Translates family memory text (interview transcripts, story text, etc.) using
// Claude. Follows the kill-switch pattern from design doc §7.4: if
// ANTHROPIC_API_KEY is absent the endpoint returns 503 with { nia_unavailable:
// true } so the UI can show a friendly "Nia is currently off" message rather
// than a silent failure.
router.post(
  "/family/:id/memories/:memoryId/translate",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId   = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership) return res.status(403).json({ error: "Not a member of this family" });

    const { text, targetLanguage = "en" } = (req.body ?? {}) as { text?: string; targetLanguage?: string };
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return res.status(503).json({
        error: "Translation unavailable — Nia is not configured for this deployment.",
        nia_unavailable: true,
      });
    }

    const LANGUAGE_NAMES: Record<string, string> = {
      en: "English",
      es: "Spanish",
      fr: "French",
      pt: "Portuguese (Brazilian)",
      ht: "Haitian Creole",
      sw: "Swahili",
      yo: "Yoruba",
      am: "Amharic",
      ar: "Arabic",
      ha: "Hausa",
      ig: "Igbo",
    };
    const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });

      const message = await anthropic.messages.create({
        model:      "claude-haiku-4-5",
        max_tokens: 4096,
        system:
          "You are Nia, Niakofa's AI guide for Community, Diaspora, and Legacy. " +
          "You specialize in oral history and family heritage preservation for the African diaspora. " +
          `Translate the following family vault interview or oral history text into ${langName}. ` +
          "Preserve the speaker's voice, warmth, cultural idioms, and emotional authenticity — " +
          "this is a Family Vault oral history, not a business document. " +
          "Output ONLY the translated text. No preamble, no notes, no quotation marks.",
        messages: [{ role: "user", content: text.trim().slice(0, 8000) }],
      });

      const translated = message.content[0]?.type === "text" ? message.content[0].text : null;
      if (!translated) throw new Error("Empty response from Nia");

      logger.info({ familyId, memoryId, targetLanguage, userId }, "family_oral_history_translated");
      return res.json({ translated, targetLanguage, langName });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, familyId, memoryId }, "family_translation_failed");
      return res.status(500).json({ error: "Translation failed — please try again." });
    }
  },
);

// DELETE /family/:id/memories/:memoryId/assets/:assetId
router.delete(
  "/family/:id/memories/:memoryId/assets/:assetId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    const assetId  = Number(req.params.assetId);
    if (!familyId || !memoryId || !assetId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access required" });
    }

    await db
      .delete(familyMemoryAssetsTable)
      .where(and(
        eq(familyMemoryAssetsTable.id, assetId),
        eq(familyMemoryAssetsTable.memory_id, memoryId),
      ));

    return res.json({ ok: true });
  },
);

// ─── Comments ─────────────────────────────────────────────────────────────────

// GET /family/:id/memories/:memoryId/comments
router.get(
  "/family/:id/memories/:memoryId/comments",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership) return res.status(403).json({ error: "Not a member" });

    const comments = await db
      .select()
      .from(familyMemoryCommentsTable)
      .where(eq(familyMemoryCommentsTable.memory_id, memoryId))
      .orderBy(familyMemoryCommentsTable.created_at);

    return res.json({ comments });
  },
);

// POST /family/:id/memories/:memoryId/comments
router.post(
  "/family/:id/memories/:memoryId/comments",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const familyId = Number(req.params.id);
    const memoryId = Number(req.params.memoryId);
    if (!familyId || !memoryId) return res.status(400).json({ error: "Invalid ids" });

    const membership = await getFamilyMembership(familyId, userId);
    if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
      return res.status(403).json({ error: "Contributor access required to comment" });
    }

    const parsed = AddCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }

    const [comment] = await db
      .insert(familyMemoryCommentsTable)
      .values({ memory_id: memoryId, author_id: userId, body: parsed.data.body })
      .returning();

    return res.status(201).json({ comment });
  },
);

// ─── Interviews ───────────────────────────────────────────────────────────────

// POST /family/:id/interviews — start an interview session
router.post("/family/:id/interviews", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Contributor access required" });
  }

  const parsed = CreateInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const [interview] = await db
    .insert(familyInterviewsTable)
    .values({
      family_id:         familyId,
      interviewer_id:    userId,
      subject_member_id: parsed.data.subject_member_id,
      prompts_used:      parsed.data.prompts_used ?? [],
    })
    .returning();

  broadcast({ type: "family_interview_status_changed", payload: { family_id: familyId, interview_id: interview.id, status: interview.status } });

  return res.status(201).json({ interview });
});

// GET /family/:id/interviews
router.get("/family/:id/interviews", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member" });

  const interviews = await db
    .select()
    .from(familyInterviewsTable)
    .where(eq(familyInterviewsTable.family_id, familyId))
    .orderBy(desc(familyInterviewsTable.updated_at));

  return res.json({ interviews });
});

// GET /family/:id/interviews/:interviewId
router.get("/family/:id/interviews/:interviewId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId    = Number(req.params.id);
  const interviewId = Number(req.params.interviewId);
  if (!familyId || !interviewId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member" });

  const [interview] = await db
    .select()
    .from(familyInterviewsTable)
    .where(and(
      eq(familyInterviewsTable.id, interviewId),
      eq(familyInterviewsTable.family_id, familyId),
    ))
    .limit(1);
  if (!interview) return res.status(404).json({ error: "Interview not found" });

  return res.json({ interview });
});

// POST /family/:id/members/import-gedcom — parse a GEDCOM file and bulk-create member rows
// Accepts { gedcom: string } (raw GEDCOM text). Creates family_members with status="invited"
// and user_id=null (placeholder rows) for each INDI record found.
router.post("/family/:id/members/import-gedcom", generalApiLimiter, requireAuth, async (req, res) => {
  const userId   = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Owner or curator access required to import a family tree" });
  }

  const { gedcom } = (req.body ?? {}) as { gedcom?: string };
  if (!gedcom || typeof gedcom !== "string") {
    return res.status(400).json({ error: "gedcom (raw GEDCOM text string) is required" });
  }
  if (gedcom.length > 5_000_000) {
    return res.status(413).json({ error: "GEDCOM file too large — max 5 MB" });
  }

  const individuals = parseGedcom(gedcom);
  if (individuals.length === 0) {
    return res.status(400).json({ error: "No individuals (INDI records) found in GEDCOM file" });
  }
  if (individuals.length > 500) {
    return res.status(400).json({
      error: `GEDCOM contains ${individuals.length} individuals — max 500 per import. Split the file and import in batches.`,
    });
  }

  // Insert members; skip duplicates (same family + display_name collision is allowed —
  // we use a try/catch per row since the unique index is only on family_id + user_id,
  // and these rows have user_id=null so they won't conflict on that index).
  const created: (typeof familyMembersTable.$inferSelect)[] = [];
  for (const ind of individuals) {
    try {
      const [member] = await db
        .insert(familyMembersTable)
        .values({
          family_id:    familyId,
          display_name: ind.name.slice(0, 100),
          relation_note: ind.birthYear ? `b. ${ind.birthYear}` : undefined,
          role:         "viewer",
          status:       "invited",
          invited_by:   userId,
        })
        .returning();
      if (member) created.push(member);
    } catch {
      // Skip any row that fails (constraint, etc.)
    }
  }

  logger.info({ familyId, userId, imported: created.length, total: individuals.length }, "gedcom_import");
  return res.json({ imported: created.length, total: individuals.length, members: created });
});

// PATCH /family/:id/interviews/:interviewId — update status
router.patch("/family/:id/interviews/:interviewId", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId    = Number(req.params.id);
  const interviewId = Number(req.params.interviewId);
  if (!familyId || !interviewId) return res.status(400).json({ error: "Invalid ids" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Contributor access required" });
  }

  const parsed = UpdateInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const updates: Partial<typeof familyInterviewsTable.$inferInsert> = {
    status:     parsed.data.status,
    updated_at: new Date(),
  };
  if (parsed.data.resulting_memory_id !== undefined) {
    updates.resulting_memory_id = parsed.data.resulting_memory_id;
  }

  const [interview] = await db
    .update(familyInterviewsTable)
    .set(updates)
    .where(and(
      eq(familyInterviewsTable.id, interviewId),
      eq(familyInterviewsTable.family_id, familyId),
    ))
    .returning();

  if (!interview) return res.status(404).json({ error: "Interview not found" });

  broadcast({ type: "family_interview_status_changed", payload: { family_id: familyId, interview_id: interview.id, status: interview.status } });

  return res.json({ interview });
});

export default router;
