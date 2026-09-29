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
  isCloudStorageConfigured,
  getStorageBackend,
  deleteAssetStrict,
  assetExists,
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
  familyStoriesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, desc, sql, or, ilike, inArray } from "drizzle-orm";
import { z } from "zod";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { requestNia } from "../lib/nia-client";
import { stripTags } from "../lib/sanitize";
import { randomUUID } from "node:crypto";

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
// Family assets are authenticated and membership-scoped. Storage keys include
// family and memory ids, so they are not a substitute for authorization.
router.use("/family/assets", generalApiLimiter, requireAuth, async (req, res, next) => {
  if (req.method !== "GET") return next();

  let rel: string;
  try {
    rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  } catch {
    return res.status(404).json({ error: "Not found" });
  }

  const match = rel.match(/^families\/(\d+)\/memories\/(\d+)\/([^/]+)$/);
  const familyId = Number(match?.[1]);
  const memoryId = Number(match?.[2]);
  if (!match || !Number.isSafeInteger(familyId) || !Number.isSafeInteger(memoryId)
    || familyId < 1 || memoryId < 1 || rel.includes("..")) {
    return res.status(404).json({ error: "Not found" });
  }

  const membership = await getFamilyMembership(familyId, req.authenticatedUserId!);
  if (!membership) return res.status(404).json({ error: "Not found" });

  const [memory] = await db
    .select({
      id: familyMemoriesTable.id,
      author_id: familyMemoriesTable.author_id,
      visibility: familyMemoriesTable.visibility,
    })
    .from(familyMemoriesTable)
    .where(and(
      eq(familyMemoriesTable.id, memoryId),
      eq(familyMemoriesTable.family_id, familyId),
    ))
    .limit(1);
  if (!memory || (
    memory.visibility === "private"
    && memory.author_id !== req.authenticatedUserId
    && !CAN_MANAGE_ROLES.includes(membership.role as string)
  )) {
    return res.status(404).json({ error: "Not found" });
  }

  const [asset] = await db
    .select({ storage_key: familyMemoryAssetsTable.storage_key })
    .from(familyMemoryAssetsTable)
    .where(and(
      eq(familyMemoryAssetsTable.memory_id, memoryId),
      eq(familyMemoryAssetsTable.storage_key, rel),
    ))
    .limit(1);
  if (!asset) return res.status(404).json({ error: "Not found" });

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
  // Optional family-history metadata. Curators can set what they know and
  // leave any unknown values blank.
  gender:     z.enum(["male", "female"]).optional(),
  birth_year: z.number().int().min(1500).max(2100).optional(),
  death_year: z.number().int().min(1500).max(2100).optional(),
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

const CreateStorySchema = z.object({
  title:            z.string().min(1).max(200).transform((s) => stripTags(s)),
  body:             z.string().min(1).max(50000).transform((s) => stripTags(s)),
  category:         z.enum(["oral", "written", "tradition", "recipe", "song", "proverb", "biography"]).optional(),
  language:         z.string().max(50).optional().transform((s) => (s ? stripTags(s) : s)),
  teller_member_id: z.number().int().positive().optional(),
  about_member_id:  z.number().int().positive().optional(),
  memory_id:        z.number().int().positive().optional(),
  tags:             z.array(z.string().max(50)).max(20).optional(),
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

/**
 * Resolve a memory only when the route family and memory family both match.
 * This deliberately distinguishes a missing/cross-family row (404) from an
 * existing private row the caller is not allowed to see (403).
 */
async function getAccessibleMemory(
  familyId: number,
  memoryId: number,
  userId: number,
  membership: Awaited<ReturnType<typeof getFamilyMembership>>,
) {
  const [memory] = await db.select().from(familyMemoriesTable).where(and(
    eq(familyMemoriesTable.id, memoryId),
    eq(familyMemoriesTable.family_id, familyId),
  )).limit(1);
  if (!memory) return { memory: null, forbidden: false };
  const readable = familyMemoryVisibilityAllows(
    memory.visibility, memory.author_id, userId, membership?.role as string | undefined,
  );
  return { memory, forbidden: !readable };
}

export function familyMemoryStorageKeyFor(familyId: number, memoryId: number, key: string): boolean {
  const prefix = `families/${familyId}/memories/${memoryId}/`;
  return key.startsWith(prefix) && key.length > prefix.length
    && !key.includes("..") && !key.startsWith("/")
    && !key.slice(prefix.length).includes("/");
}

export function familyMemoryVisibilityAllows(
  visibility: string,
  authorId: number | null,
  userId: number,
  role: string | undefined,
): boolean {
  return visibility === "family"
    || (visibility === "private" && (
      authorId === userId || CAN_MANAGE_ROLES.includes(role ?? "")
    ));
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

  // Include both active members and pending invitations
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
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .orderBy(desc(familiesTable.updated_at));

  // Fetch active member counts for all returned families in one query
  const familyIds = rows.map(r => r.family.id);
  const memberCounts: Record<number, number> = {};
  if (familyIds.length > 0) {
    const counts = await db
      .select({
        family_id: familyMembersTable.family_id,
        count: sql<number>`count(*)::int`,
      })
      .from(familyMembersTable)
      .where(
        and(
          inArray(familyMembersTable.family_id, familyIds),
          eq(familyMembersTable.status, "active"),
        ),
      )
      .groupBy(familyMembersTable.family_id);
    for (const c of counts) {
      memberCounts[c.family_id] = c.count;
    }
  }

  return res.json({
    families: rows.map(r => ({
      ...r.family,
      my_role:      r.membership.role,
      status:       r.membership.status,   // "active" | "invited"
      member_count: memberCounts[r.family.id] ?? 0,
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

  const familyAssets = await db
    .select({
      storage_key: familyMemoryAssetsTable.storage_key,
      thumbnail_key: familyMemoryAssetsTable.thumbnail_key,
    })
    .from(familyMemoryAssetsTable)
    .innerJoin(
      familyMemoriesTable,
      eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id),
    )
    .where(eq(familyMemoriesTable.family_id, familyId));
  try {
    for (const asset of familyAssets) {
      await deleteAssetStrict(asset.storage_key);
      if (asset.thumbnail_key) await deleteAssetStrict(asset.thumbnail_key);
    }
  } catch (error) {
    logger.error({ error, familyId }, "family_storage_cleanup_failed");
    return res.status(502).json({
      error: "Family storage cleanup incomplete; database rows remain for retry. Some objects may already have been removed.",
    });
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

  // Allow both active and invited members to view the member list.
  // Invited users need this to see who invited them and to accept/decline.
  const [membership] = await db
    .select()
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);
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

  // Look up the caller's membership (active OR invited) and the target member.
  const [callerMembership] = await db
    .select()
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);

  const [targetMember] = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.id, memberId))
    .limit(1);

  if (!callerMembership) return res.status(403).json({ error: "Not a member of this family" });

  // Self-service: an invited user can accept their own invitation (status → active)
  const isSelfAccept = targetMember?.user_id === userId
    && targetMember?.status === "invited"
    && req.body?.status === "active";

  if (!isSelfAccept) {
    // All other changes require owner/curator privileges
    if (!CAN_MANAGE_ROLES.includes(callerMembership.role as string)) {
      return res.status(403).json({ error: "Owner or curator access required" });
    }
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
  if (parsed.data.gender !== undefined) updates.gender = parsed.data.gender;
  if (parsed.data.birth_year !== undefined) updates.birth_year = parsed.data.birth_year;
  if (parsed.data.death_year !== undefined) updates.death_year = parsed.data.death_year;
  if (Object.keys(updates).length > 0) updates.updated_at = new Date();

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

  const [callerMembership] = await db
    .select()
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);

  if (!callerMembership) return res.status(403).json({ error: "Not a member of this family" });

  // Look up the target member to check if this is a self-decline
  const [targetMember] = await db
    .select()
    .from(familyMembersTable)
    .where(eq(familyMembersTable.id, memberId))
    .limit(1);

  // Self-service: an invited user can decline their own invitation (delete their membership)
  const isSelfDecline = targetMember?.user_id === userId
    && targetMember?.status === "invited";

  if (!isSelfDecline) {
    // All other deletions require owner/curator privileges
    if (!CAN_MANAGE_ROLES.includes(callerMembership.role as string)) {
      return res.status(403).json({ error: "Owner or curator access required" });
    }
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

  const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
  if (!access.memory) return res.status(404).json({ error: "Not found" });
  if (access.forbidden) {
    return res.status(403).json({ error: "This memory is private" });
  }
  const memory = access.memory;

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

  const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
  if (!access.memory) return res.status(404).json({ error: "Not found" });
  if (access.forbidden) return res.status(403).json({ error: "This memory is private" });
  const memory = access.memory;

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

  const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
  if (!access.memory) return res.status(404).json({ error: "Not found" });
  const memory = access.memory;

  if (memory.author_id !== userId && !CAN_MANAGE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Only the author, a curator, or owner can delete this memory" });
  }

  const assets = await db.select().from(familyMemoryAssetsTable)
    .where(eq(familyMemoryAssetsTable.memory_id, memoryId));
  try {
    for (const asset of assets) {
      await deleteAssetStrict(asset.storage_key);
      if (asset.thumbnail_key) await deleteAssetStrict(asset.thumbnail_key);
    }
  } catch (error) {
    logger.error({ error, familyId, memoryId }, "family_memory_storage_cleanup_failed");
    return res.status(502).json({
      error: "Memory storage cleanup incomplete; database rows remain for retry. Some objects may already have been removed.",
    });
  }
  await db.delete(familyMemoriesTable).where(and(
    eq(familyMemoriesTable.id, memoryId), eq(familyMemoriesTable.family_id, familyId),
  ));
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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

    const { filename, mime_type } = req.body ?? {};
    if (!filename || !mime_type) {
      return res.status(400).json({ error: "filename and mime_type are required" });
    }

    const safeFile   = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    const storageKey = `families/${familyId}/memories/${memoryId}/${randomUUID()}_${safeFile}`;

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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

    const parsed = ConfirmAssetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    if (!familyMemoryStorageKeyFor(familyId, memoryId, parsed.data.storage_key)
      || !(await assetExists(parsed.data.storage_key))) {
      return res.status(400).json({ error: "Invalid or unavailable server-issued storage key" });
    }

    let asset: typeof familyMemoryAssetsTable.$inferSelect | undefined;
    try {
      [asset] = await db
        .insert(familyMemoryAssetsTable)
        .values({ memory_id: memoryId, ...parsed.data })
        .returning();
    } catch (error) {
      let committedAsset: typeof familyMemoryAssetsTable.$inferSelect | undefined;
      let commitCheckSucceeded = true;
      try {
        [committedAsset] = await db.select()
          .from(familyMemoryAssetsTable)
          .where(and(
            eq(familyMemoryAssetsTable.memory_id, memoryId),
            eq(familyMemoryAssetsTable.storage_key, parsed.data.storage_key),
          ))
          .limit(1);
      } catch (checkError) {
        commitCheckSucceeded = false;
        logger.error({ error: checkError, familyId, memoryId }, "family_asset_commit_check_failed");
      }
      if (!commitCheckSucceeded) {
        return res.status(502).json({ error: "Asset confirmation outcome uncertain; object retained. Please retry confirmation." });
      }
      if (committedAsset) {
        return res.status(201).json({ asset: committedAsset });
      }
      try {
        await deleteAssetStrict(parsed.data.storage_key);
      } catch (cleanupError) {
        logger.error({ error: cleanupError, familyId, memoryId }, "family_asset_orphan_cleanup_failed");
      }
      logger.error({ error, familyId, memoryId }, "family_asset_row_failed");
      return res.status(502).json({ error: "Asset record creation failed; storage cleanup was attempted. Please retry." });
    }
    if (!asset) {
      try {
        await deleteAssetStrict(parsed.data.storage_key);
      } catch (cleanupError) {
        logger.error({ error: cleanupError, familyId, memoryId }, "family_asset_empty_row_cleanup_failed");
      }
      return res.status(502).json({ error: "Asset record creation returned no row; storage cleanup was attempted. Please retry." });
    }

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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

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
    const storageKey   = `families/${familyId}/memories/${memoryId}/${randomUUID()}_${safeFilename}`;

    // Write to S3/R2 or local disk depending on STORAGE_BUCKET config
    await putAsset(storageKey, buffer, mimeType);

    let asset: typeof familyMemoryAssetsTable.$inferSelect | undefined;
    try {
      [asset] = await db
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
    } catch (error) {
      let committedAsset: { id: number } | undefined;
      let commitCheckSucceeded = true;
      try {
        [committedAsset] = await db.select({ id: familyMemoryAssetsTable.id })
          .from(familyMemoryAssetsTable)
          .where(and(
            eq(familyMemoryAssetsTable.memory_id, memoryId),
            eq(familyMemoryAssetsTable.storage_key, storageKey),
          ))
          .limit(1);
      } catch (checkError) {
        commitCheckSucceeded = false;
        logger.error({ error: checkError, familyId, memoryId, storageKey }, "family_direct_upload_commit_check_failed");
      }
      if (commitCheckSucceeded && !committedAsset) {
        try {
          await deleteAssetStrict(storageKey);
        } catch (cleanupError) {
          logger.error({ error: cleanupError, familyId, memoryId, storageKey }, "family_direct_upload_orphan_cleanup_failed");
        }
      }
      logger.error({ error, familyId, memoryId, storageKey }, "family_direct_upload_asset_row_failed");
      return res.status(502).json({ error: "Asset record creation failed; storage cleanup was attempted. Please retry." });
    }
    if (!asset) {
      try {
        await deleteAssetStrict(storageKey);
      } catch (cleanupError) {
        logger.error({ error: cleanupError, familyId, memoryId, storageKey }, "family_direct_upload_orphan_cleanup_failed");
      }
      return res.status(502).json({ error: "Asset record creation returned no row; storage cleanup was attempted. Please retry." });
    }

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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

    const { text, targetLanguage = "en" } = (req.body ?? {}) as { text?: string; targetLanguage?: string };
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
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
      const response = await requestNia("/internal/translate", {
        method: "POST",
        body: JSON.stringify({ text, targetLanguage }),
      });
      const result = await response.json().catch(() => ({})) as {
        translated?: unknown;
        targetLanguage?: string;
        langName?: string;
        error?: string;
      };
      if (!response.ok || typeof result.translated !== "string" || !result.translated.trim()) {
        return res.status(response.status >= 400 ? response.status : 502).json({
          error: result.error ?? "Translation unavailable — Nia is not configured for this deployment.",
          nia_unavailable: response.status === 503,
        });
      }

      logger.info({ familyId, memoryId, targetLanguage, userId }, "family_oral_history_translated");
      return res.json({
        translated: result.translated,
        targetLanguage: result.targetLanguage ?? targetLanguage,
        langName: result.langName ?? langName,
      });
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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

    const [asset] = await db.select().from(familyMemoryAssetsTable).where(and(
      eq(familyMemoryAssetsTable.id, assetId), eq(familyMemoryAssetsTable.memory_id, memoryId),
    )).limit(1);
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    try {
      await deleteAssetStrict(asset.storage_key);
      if (asset.thumbnail_key) await deleteAssetStrict(asset.thumbnail_key);
    } catch (error) {
      logger.error({ error, familyId, memoryId, assetId }, "family_asset_storage_cleanup_failed");
      return res.status(502).json({ error: "Asset storage cleanup failed; please retry." });
    }
    await db.delete(familyMemoryAssetsTable).where(eq(familyMemoryAssetsTable.id, assetId));

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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

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
    const access = await getAccessibleMemory(familyId, memoryId, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });

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

// ─── Stories ──────────────────────────────────────────────────────────────────
// Family stories are first-class Family Vault records with an explicit write
// path, independent of any game or external runtime.

// POST /family/:id/stories — record a family story
router.post("/family/:id/stories", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership || !CAN_WRITE_ROLES.includes(membership.role as string)) {
    return res.status(403).json({ error: "Contributor access or higher required" });
  }

  const parsed = CreateStorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { title, body, category, language, teller_member_id, about_member_id, memory_id, tags } = parsed.data;
  for (const memberId of [teller_member_id, about_member_id].filter((id): id is number => id !== undefined)) {
    const [member] = await db.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(
      eq(familyMembersTable.id, memberId), eq(familyMembersTable.family_id, familyId),
    )).limit(1);
    if (!member) return res.status(400).json({ error: "Story member must belong to this family" });
  }
  if (memory_id !== undefined) {
    const access = await getAccessibleMemory(familyId, memory_id, userId, membership);
    if (!access.memory) return res.status(404).json({ error: "Not found" });
    if (access.forbidden) return res.status(403).json({ error: "This memory is private" });
  }

  const [story] = await db
    .insert(familyStoriesTable)
    .values({
      family_id: familyId,
      title,
      body,
      category: category ?? null,
      language: language ?? null,
      teller_member_id: teller_member_id ?? null,
      about_member_id: about_member_id ?? null,
      memory_id: memory_id ?? null,
      tags: tags ?? [],
    })
    .returning();

  broadcast({ type: "family_story_created", payload: { family_id: familyId, story_id: story.id, author_id: userId } });

  logger.info({ familyId, storyId: story.id, userId }, "family_story_created");
  return res.status(201).json({ story });
});

// GET /family/:id/stories — list stories
router.get("/family/:id/stories", generalApiLimiter, requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const familyId = Number(req.params.id);
  if (!familyId) return res.status(400).json({ error: "Invalid family id" });

  const membership = await getFamilyMembership(familyId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this family" });

  const allStories = await db
    .select()
    .from(familyStoriesTable)
    .where(eq(familyStoriesTable.family_id, familyId))
    .orderBy(desc(familyStoriesTable.created_at));
  const stories = [];
  for (const story of allStories) {
    if (story.memory_id !== null) {
      const access = await getAccessibleMemory(familyId, story.memory_id, userId, membership);
      if (!access.memory || access.forbidden) continue;
    }
    stories.push(story);
  }

  return res.json({ stories });
});

export default router;
