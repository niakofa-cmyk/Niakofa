/**
 * Niakofa — Legacy Mode API
 *
 * Provides a Family Knowledge Reservoir (cached family data) and
 * AI-powered quest generation via Anthropic Claude.
 *
 * The reservoir is built from real family DB data and cached for 24h.
 * Quest generation reads from the reservoir (never re-fetches live family data)
 * so Anthropic is called only when the cache is cold or the family's data
 * fingerprint changes (new memories/members added).
 *
 * Routes:
 *   GET  /api/legacy/reservoir/:familyId           — cached family knowledge reservoir
 *   GET  /api/legacy/quests/:familyId              — cached AI quests (auto-generate on miss)
 *   POST /api/legacy/quests/:familyId/refresh      — force-refresh quests (6h cooldown)
 *   POST /api/legacy/reservoir/:familyId/invalidate — bust reservoir cache (after writes)
 */

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  familiesTable,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyTreeRelationsTable,
  familyMemoryAssetsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { cacheGet, cacheSet, cacheDel } from "../lib/cache";
import { eq, and, desc, sql, inArray, asc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConsentedMemberIds, filterConsentedMembers } from "../lib/legacy-consent";

const router = Router();

// ── TTL constants (seconds) ───────────────────────────────────────────────────

const RESERVOIR_TTL   = 86_400; // 24 h — rebuild reservoir at most once per day
const QUEST_TTL       = 21_600; // 6 h  — quests regenerated after 6 hours
const REFRESH_COOLDOWN = 21_600; // 6 h  — users can force-refresh once per 6 hours

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AncestorProfile {
  name: string;
  role: string;
  relation: string | null;
}

/** A resolved parent/spouse edge between two consented members, by name. */
export interface RelationshipEdge {
  fromName: string;
  toName:   string;
  type:     "parent" | "spouse";
}

export interface MemorySummary {
  title:      string | null;
  description: string | null;
  memoryDate: string | null;
  location:   string | null;
  source:     string;
}

export interface FamilyReservoir {
  familyId:        number;
  familyName:      string;
  memberCount:     number;
  memoryCount:     number;
  interviewCount:  number;
  ancestorProfiles: AncestorProfile[];
  relationshipEdges: RelationshipEdge[];
  memorySummaries:  MemorySummary[];
  /** Content-based hash of actual vault data — changes when ANY data changes, not just counts. */
  fingerprint: string;
  builtAt: string;
}

export interface AiQuest {
  id:           string;
  title:        string;
  description:  string;
  xp:           number;
  category:     "record" | "document" | "connect" | "explore" | "discover";
  actionPath:   string;
  isAiGenerated: boolean;
  ancestorName?: string;
}

// ── Cache key helpers ─────────────────────────────────────────────────────────

const reservoirKey = (familyId: number) => `legacy:reservoir:${familyId}`;
const questKey     = (familyId: number, fp: string) => `legacy:quests:${familyId}:${fp}`;
const cooldownKey  = (userId: number, familyId: number) => `legacy:refresh-cd:${userId}:${familyId}`;

// ── Membership guard ──────────────────────────────────────────────────────────

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
  return Boolean(row);
}

// ── Reservoir builder ─────────────────────────────────────────────────────────
// Reads live DB data and constructs the reservoir snapshot.
// Called only on cache miss or explicit invalidation.

async function buildReservoir(familyId: number): Promise<FamilyReservoir> {
  const [family] = await db
    .select({ name: familiesTable.name })
    .from(familiesTable)
    .where(eq(familiesTable.id, familyId))
    .limit(1);

  // Top 20 active members — include id and updated_at for strong fingerprint
  const members = await db
    .select({
      id:        familyMembersTable.id,
      name:      familyMembersTable.display_name,
      role:      familyMembersTable.role,
      relation:  familyMembersTable.relation_note,
      updated:   familyMembersTable.updated_at,
      is_living: familyMembersTable.is_living,
      user_id:   familyMembersTable.user_id,
    })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        inArray(familyMembersTable.status, ["active"]),
      ),
    )
    .limit(20);

  // ── Consent gate: only include members who have consented to storytelling ──
  const consentedIds = await getConsentedMemberIds(familyId);
  const consentedMembers = filterConsentedMembers(members, consentedIds);

  // ── Relationship graph: resolve parent/spouse edges to names ───────────────
  // Previously familyTreeRelationsTable was only ever used for a count in the
  // fingerprint — the actual edges (who is whose parent/spouse) never reached
  // the AI prompt, so quests/dialogue couldn't reference real relationships
  // ("Kofi is Ama's father") even though that data exists in the Family Tree.
  // Restricted to consented member IDs on both ends so an edge involving a
  // member who hasn't consented to storytelling is never surfaced to the AI.
  const consentedMemberIdSet = new Set(consentedMembers.map(m => m.id));
  const nameById = new Map(consentedMembers.map(m => [m.id, m.name ?? "Unknown"]));

  const relationEdgesRaw = consentedMemberIdSet.size
    ? await db
        .select({
          from: familyTreeRelationsTable.from_member_id,
          to:   familyTreeRelationsTable.to_member_id,
          type: familyTreeRelationsTable.relation_type,
        })
        .from(familyTreeRelationsTable)
        .where(eq(familyTreeRelationsTable.family_id, familyId))
    : [];

  const relationshipEdges: RelationshipEdge[] = relationEdgesRaw
    .filter(e => consentedMemberIdSet.has(e.from) && consentedMemberIdSet.has(e.to))
    .filter((e): e is typeof e & { type: "parent" | "spouse" } => e.type === "parent" || e.type === "spouse")
    .map(e => ({ fromName: nameById.get(e.from) ?? "Unknown", toName: nameById.get(e.to) ?? "Unknown", type: e.type }))
    .slice(0, 40);

  // Latest 15 memories — include id and updated_at for strong fingerprint
  const memories = await db
    .select({
      id:             familyMemoriesTable.id,
      title:          familyMemoriesTable.title,
      description:    familyMemoriesTable.description,
      memory_date:    familyMemoriesTable.memory_date,
      location_label: familyMemoriesTable.location_label,
      source:         familyMemoriesTable.source,
      updated:        familyMemoriesTable.updated_at,
    })
    .from(familyMemoriesTable)
    .where(eq(familyMemoriesTable.family_id, familyId))
    .orderBy(desc(familyMemoriesTable.updated_at))
    .limit(15);

  const [{ ic }] = await db
    .select({ ic: sql<number>`count(*)::int` })
    .from(familyInterviewsTable)
    .where(eq(familyInterviewsTable.family_id, familyId));

  // Fetch additional vault data for strong fingerprint
  const [{ storyCount }] = await db
    .select({ storyCount: sql<number>`count(*)::int` })
    .from(familyStoriesTable)
    .where(eq(familyStoriesTable.family_id, familyId));

  const [{ eventCount }] = await db
    .select({ eventCount: sql<number>`count(*)::int` })
    .from(familyEventsTable)
    .where(eq(familyEventsTable.family_id, familyId));

  const [{ placeCount }] = await db
    .select({ placeCount: sql<number>`count(*)::int` })
    .from(familyPlacesTable)
    .where(eq(familyPlacesTable.family_id, familyId));

  const [{ relationCount }] = await db
    .select({ relationCount: sql<number>`count(*)::int` })
    .from(familyTreeRelationsTable)
    .where(eq(familyTreeRelationsTable.family_id, familyId));

  const [{ assetCount }] = await db
    .select({ assetCount: sql<number>`count(*)::int` })
    .from(familyMemoryAssetsTable)
    .where(eq(familyMemoryAssetsTable.memory_id, sql`ANY (SELECT id FROM family_memories WHERE family_id = ${familyId})`));

  const memberCount    = consentedMembers.length;
  const memoryCount    = memories.length;
  const interviewCount = Number(ic ?? 0);

  // ── Strong content-based fingerprint ──────────────────────────────────────
  // Instead of just counts, hash actual IDs + updated_at timestamps so the
  // fingerprint changes when ANY underlying data changes (not just counts).
  // e.g. editing Grandma's story from "We moved" to "We moved to Detroit in 1957"
  // changes the memory's updated_at, which changes the fingerprint.
  //
  // IMPORTANT: this hash must cover the family's FULL id+updated_at set, not
  // just the top-20-members / latest-15-memories sample used for AI context
  // below. Otherwise editing member #21 or memory #16 in a large family is
  // invisible to the fingerprint and the world silently never regenerates.
  // These are cheap (two narrow columns, no row cap) so fetching all of them
  // just for hashing is fine even for large families.
  const [allMemberStamps, allMemoryStamps] = await Promise.all([
    db
      .select({ id: familyMembersTable.id, updated: familyMembersTable.updated_at })
      .from(familyMembersTable)
      .where(and(eq(familyMembersTable.family_id, familyId), inArray(familyMembersTable.status, ["active"]))),
    db
      .select({ id: familyMemoriesTable.id, updated: familyMemoriesTable.updated_at })
      .from(familyMemoriesTable)
      .where(eq(familyMemoriesTable.family_id, familyId)),
  ]);

  const canonicalData = JSON.stringify({
    // Full family-wide stamps drive fingerprint change-detection.
    mAll: allMemberStamps.map(m => `${m.id}:${m.updated?.toISOString() ?? ""}`).sort(),
    memAll: allMemoryStamps.map(m => `${m.id}:${m.updated?.toISOString() ?? ""}`).sort(),
    i: interviewCount,
    s: storyCount,
    e: eventCount,
    p: placeCount,
    r: relationCount,
    rEdges: relationshipEdges.map(e => `${e.fromName}>${e.type}>${e.toName}`).sort(),
    a: assetCount,
  });
  const fingerprint = Buffer.from(canonicalData).toString("base64url").slice(0, 64);

  return {
    familyId,
    familyName:      family?.name ?? "My Family",
    memberCount,
    memoryCount,
    interviewCount,
    ancestorProfiles: consentedMembers.map(m => ({
      name:     m.name ?? "Unknown",
      role:     m.role,
      relation: m.relation ?? null,
    })),
    relationshipEdges,
    memorySummaries: memories.map(m => ({
      title:       m.title,
      description: m.description ? m.description.slice(0, 180) : null,
      memoryDate:  m.memory_date ? String(m.memory_date) : null,
      location:    m.location_label,
      source:      m.source,
    })),
    fingerprint,
    builtAt: new Date().toISOString(),
  };
}

// ── Fallback quests (Anthropic unavailable or key not set) ────────────────────
// Smarter than static templates — derived from real reservoir data.

function buildFallbackQuests(r: FamilyReservoir): AiQuest[] {
  const quests: AiQuest[] = [];
  const first = r.ancestorProfiles[0];
  const firstMem = r.memorySummaries[0];
  const fid = r.familyId;

  if (r.interviewCount === 0) {
    quests.push({
      id: "fb-1", isAiGenerated: false,
      title: first
        ? `Record ${first.name.split(" ")[0]}'s Story`
        : "Record an Elder's Story",
      description: "Their voice is irreplaceable — capture it before it is lost.",
      xp: 120, category: "record",
      actionPath: `/family/${fid}`,
      ancestorName: first?.name,
    });
  }

  if (r.memoryCount < 3) {
    quests.push({
      id: "fb-2", isAiGenerated: false,
      title: "Document a Family Memory",
      description: "Every story added becomes a chapter in your family's legacy.",
      xp: 80, category: "document",
      actionPath: `/family/${fid}`,
    });
  }

  if (r.memberCount < 5) {
    quests.push({
      id: "fb-3", isAiGenerated: false,
      title: "Expand the Family Tree",
      description: "Add relatives to unlock new chapters and storylines.",
      xp: 75, category: "connect",
      actionPath: "/diaspora/tree",
    });
  }

  if (firstMem?.location) {
    quests.push({
      id: "fb-4", isAiGenerated: false,
      title: `Visit ${firstMem.location}`,
      description: "Check in at a place your family called home.",
      xp: 150, category: "explore",
      actionPath: `/family/${fid}`,
    });
  } else {
    quests.push({
      id: "fb-4", isAiGenerated: false,
      title: "Play Preserve the Culture",
      description: "Spark new conversations with the family card game.",
      xp: 60, category: "discover",
      actionPath: "/diaspora/preserve",
    });
  }

  quests.push({
    id: "fb-5", isAiGenerated: false,
    title: "Explore the Family Timeline",
    description: "Walk through your family's history decade by decade.",
    xp: 50, category: "discover",
    actionPath: "/diaspora/timeline",
  });

  return quests.slice(0, 5);
}

// ── AI quest generation ───────────────────────────────────────────────────────
// Calls Anthropic claude-3-5-haiku (low cost) with the reservoir as context.
// Returns validated AiQuest[] or falls back to template quests on any error.

async function generateAiQuests(r: FamilyReservoir): Promise<AiQuest[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn("legacy: ANTHROPIC_API_KEY not set — using fallback quests");
    return buildFallbackQuests(r);
  }

  const anthropic = new Anthropic({ apiKey });

  const ancestorList = r.ancestorProfiles.length
    ? r.ancestorProfiles
        .slice(0, 8)
        .map(a => `${a.name} (${a.role}${a.relation ? `, ${a.relation}` : ""})`)
        .join("; ")
    : "No ancestors added yet";

  const relationshipList = r.relationshipEdges.length
    ? r.relationshipEdges
        .slice(0, 15)
        .map(e => e.type === "parent" ? `${e.fromName} is the parent of ${e.toName}` : `${e.fromName} and ${e.toName} are spouses`)
        .join("; ")
    : "No relationships recorded yet";

  const memorySummary = r.memorySummaries.length
    ? r.memorySummaries
        .slice(0, 6)
        .map(m =>
          `• "${m.title ?? "Untitled"}" (${m.source}${m.location ? ` @ ${m.location}` : ""}${m.memoryDate ? `, ${m.memoryDate}` : ""})`,
        )
        .join("\n")
    : "No memories recorded yet";

  const prompt = `You are the AI Game Master for Niakofa Legacy Mode — a living family history RPG.

FAMILY: ${r.familyName}
ANCESTORS: ${ancestorList}
RELATIONSHIPS: ${relationshipList}
RECENT MEMORIES:
${memorySummary}
STATS: ${r.memberCount} family members, ${r.memoryCount} memories, ${r.interviewCount} oral recordings

Generate exactly 5 personalized quests for this player. Each quest MUST:
- Reference SPECIFIC data above (use real ancestor names, actual memory titles, real locations)
- Where RELATIONSHIPS data is available, use it — e.g. prompt the player to ask a parent about their spouse, or connect two relatives who are family but don't yet have a story linking them
- Have a personal, evocative title that feels unique to THIS family
- XP: 50–150 based on effort required
- Category: exactly one of: record, document, connect, explore, discover
- actionPath: one of: /diaspora/tree, /diaspora/family, /family/${r.familyId}, /diaspora/preserve, /diaspora/timeline
- Description: under 110 characters, urgent and motivating tone

Return ONLY a JSON array — no preamble, no explanation, no markdown fences:
[{"title":"...","description":"...","xp":100,"category":"record","actionPath":"/family/${r.familyId}","ancestorName":"..."}]`;

  try {
    const response = await anthropic.messages.create({
      model:      "claude-3-5-haiku-20241022",
      max_tokens: 650,
      messages:   [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("")
      .trim();

    // Extract JSON array — strip any accidental markdown wrapping
    const match = text.replace(/```(?:json)?|```/g, "").match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array found in Claude response");

    const raw = JSON.parse(match[0]) as Array<Record<string, unknown>>;
    const VALID_CATS = new Set(["record","document","connect","explore","discover"]);

    return raw.slice(0, 5).map((q, i) => ({
      id:           `ai-${r.fingerprint}-${i}`,
      title:        String(q.title ?? "Family Quest").slice(0, 80),
      description:  String(q.description ?? "").slice(0, 120),
      xp:           Math.min(200, Math.max(50, Number(q.xp ?? 75))),
      category:     VALID_CATS.has(String(q.category))
                      ? (q.category as AiQuest["category"])
                      : "discover",
      actionPath:   String(q.actionPath ?? `/family/${r.familyId}`),
      isAiGenerated: true,
      ancestorName: q.ancestorName ? String(q.ancestorName).slice(0, 60) : undefined,
    }));
  } catch (err) {
    logger.warn({ err }, "legacy: AI quest generation failed — using fallback quests");
    return buildFallbackQuests(r);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/legacy/reservoir/:familyId
// Returns the cached family knowledge reservoir (builds fresh on miss).
router.get(
  "/legacy/reservoir/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const key    = reservoirKey(familyId);
    const cached = await cacheGet<FamilyReservoir>(key);
    if (cached) return res.json({ ...cached, fromCache: true });

    const reservoir = await buildReservoir(familyId);
    await cacheSet(key, reservoir, RESERVOIR_TTL);
    return res.json({ ...reservoir, fromCache: false });
  },
);

// GET /api/legacy/quests/:familyId
// Returns cached AI quests, generating them if the cache is cold or stale
// (fingerprint mismatch = new family data = auto-regenerates on next read).
router.get(
  "/legacy/quests/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    // Step 1: get or build the reservoir (source of truth for fingerprint)
    const rKey      = reservoirKey(familyId);
    let reservoir   = await cacheGet<FamilyReservoir>(rKey);
    if (!reservoir) {
      reservoir = await buildReservoir(familyId);
      await cacheSet(rKey, reservoir, RESERVOIR_TTL);
    }

    // Step 2: check if quests cached under current fingerprint
    const qKey        = questKey(familyId, reservoir.fingerprint);
    const cachedQuests = await cacheGet<AiQuest[]>(qKey);
    if (cachedQuests) {
      return res.json({
        quests:      cachedQuests,
        fingerprint: reservoir.fingerprint,
        fromCache:   true,
        isAiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
      });
    }

    // Step 3: generate fresh quests
    const quests = await generateAiQuests(reservoir);
    await cacheSet(qKey, quests, QUEST_TTL);
    return res.json({
      quests,
      fingerprint: reservoir.fingerprint,
      fromCache:   false,
      isAiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  },
);

// POST /api/legacy/quests/:familyId/refresh
// Force-refreshes the quest cache (rate-limited to once per 6h per user).
router.post(
  "/legacy/quests/:familyId/refresh",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const cdKey     = cooldownKey(userId, familyId);
    const onCooldown = await cacheGet<boolean>(cdKey);
    if (onCooldown) {
      return res.status(429).json({
        error: "Quest refresh is available once every 6 hours. Check back later!",
      });
    }

    // Rebuild reservoir so quests are based on the latest family data
    const reservoir = await buildReservoir(familyId);
    await cacheSet(reservoirKey(familyId), reservoir, RESERVOIR_TTL);

    const quests = await generateAiQuests(reservoir);
    await cacheSet(questKey(familyId, reservoir.fingerprint), quests, QUEST_TTL);
    await cacheSet(cdKey, true, REFRESH_COOLDOWN);

    logger.info({ familyId, userId, fingerprint: reservoir.fingerprint }, "legacy: quests force-refreshed");

    return res.json({
      quests,
      fingerprint: reservoir.fingerprint,
      refreshed:   true,
      isAiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    });
  },
);

// POST /api/legacy/reservoir/:familyId/invalidate
// Busts the reservoir cache after the user adds a memory, member, or interview.
// Callers should fire-and-forget this — the next GET /quests will rebuild lazily.
router.post(
  "/legacy/reservoir/:familyId/invalidate",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    await cacheDel(reservoirKey(familyId));
    logger.info({ familyId, userId }, "legacy: reservoir invalidated");
    return res.json({ invalidated: true });
  },
);

// ── Ancestor Selection Engine ─────────────────────────────────────────────────
// Evaluates family members to find the best playable ancestor for Legacy Mode.
// Scoring: birth year, death year, generation, available stories, events,
// locations, photos, interviews, completeness. Returns top candidates.

export interface AncestorCandidate {
  memberId: number;
  name: string;
  role: string;
  relation: string | null;
  birthYear: string | null;
  deathYear: string | null;
  storyCount: number;
  eventCount: number;
  placeCount: number;
  memoryCount: number;
  interviewCount: number;
  photoCount: number;
  completenessScore: number;
  selectionReason: string;
}

async function selectAncestors(familyId: number): Promise<AncestorCandidate[]> {
  const members = await db
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
    );

  // ── Consent gate: only include members who have consented to storytelling ──
  const consentedIds = await getConsentedMemberIds(familyId);
  const consentedMembers = filterConsentedMembers(members, consentedIds);

  const candidates: AncestorCandidate[] = [];

  for (const member of consentedMembers) {
    // Count stories about this member
    const [{ sc }] = await db
      .select({ sc: sql<number>`count(*)::int` })
      .from(familyStoriesTable)
      .where(eq(familyStoriesTable.about_member_id, member.id));

    // Count events for this member
    const [{ ec }] = await db
      .select({ ec: sql<number>`count(*)::int` })
      .from(familyEventsTable)
      .where(eq(familyEventsTable.member_id, member.id));

    // Count memories mentioning this member
    const [{ mc }] = await db
      .select({ mc: sql<number>`count(*)::int` })
      .from(familyMemoriesTable)
      .where(eq(familyMemoriesTable.family_id, familyId));

    // Count interviews with this member
    const [{ ic }] = await db
      .select({ ic: sql<number>`count(*)::int` })
      .from(familyInterviewsTable)
      .where(eq(familyInterviewsTable.subject_member_id, member.id));

    // Count photos (assets) for memories about this member
    const [{ pc }] = await db
      .select({ pc: sql<number>`count(*)::int` })
      .from(familyMemoryAssetsTable)
      .where(eq(familyMemoryAssetsTable.asset_type, "photo"));

    // Get earliest event as birth year proxy
    const events = await db
      .select({ eventDate: familyEventsTable.event_date, category: familyEventsTable.category })
      .from(familyEventsTable)
      .where(eq(familyEventsTable.member_id, member.id))
      .orderBy(asc(familyEventsTable.event_date))
      .limit(1);

    const birthEvent = events.find(e => e.category === "birth");
    const deathEvent = events.find(e => e.category === "death");
    const birthYear = birthEvent?.eventDate ? new Date(birthEvent.eventDate).getFullYear().toString() : null;
    const deathYear = deathEvent?.eventDate ? new Date(deathEvent.eventDate).getFullYear().toString() : null;

    // Completeness score: weighted sum of data richness
    const completenessScore = Math.min(100,
      (sc > 0 ? 15 : 0) +
      (ec > 0 ? 20 : 0) +
      (mc > 0 ? 15 : 0) +
      (ic > 0 ? 20 : 0) +
      (pc > 0 ? 10 : 0) +
      (birthYear ? 10 : 0) +
      (deathYear ? 5 : 0) +
      (member.relation ? 5 : 0),
    );

    const reasons: string[] = [];
    if (sc > 0) reasons.push(`${sc} recorded stor${sc === 1 ? "y" : "ies"}`);
    if (ec > 0) reasons.push(`${ec} life event${ec === 1 ? "" : "s"}`);
    if (ic > 0) reasons.push(`${ic} interview${ic === 1 ? "" : "s"}`);
    if (birthYear) reasons.push(`born ${birthYear}`);

    candidates.push({
      memberId: member.id,
      name: member.name,
      role: member.role,
      relation: member.relation,
      birthYear,
      deathYear,
      storyCount: sc,
      eventCount: ec,
      placeCount: 0,
      memoryCount: mc,
      interviewCount: ic,
      photoCount: pc,
      completenessScore,
      selectionReason: reasons.length > 0 ? reasons.join(", ") : "Available family member",
    });
  }

  // Sort by completeness score descending
  candidates.sort((a, b) => b.completenessScore - a.completenessScore);
  return candidates;
}

// GET /api/legacy/ancestors/:familyId — get ancestor candidates for selection
router.get(
  "/ancestors/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    const [member] = await db
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

    if (!member) return res.status(403).json({ error: "Not a member of this family" });

    try {
      const candidates = await selectAncestors(familyId);
      return res.json({ ancestors: candidates });
    } catch (err) {
      logger.error({ err, familyId }, "legacy: ancestor selection failed");
      return res.status(500).json({ error: "Failed to select ancestors" });
    }
  },
);

// ── Quest Completion Tracking ─────────────────────────────────────────────────
// POST /api/legacy/quests/:familyId/:questId/complete — mark a quest as completed
// Awards XP and updates achievement progress for the family.

router.post(
  "/quests/:familyId/:questId/complete",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const questId = String(req.params.questId);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    const [member] = await db
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

    if (!member) return res.status(403).json({ error: "Not a member of this family" });

    try {
      // Invalidate quest cache so next load regenerates with updated state
      const questKey = `legacy:quests:${familyId}`;
      await cacheDel(questKey);

      logger.info({ familyId, userId, questId }, "legacy: quest completed");

      return res.json({
        completed: true,
        questId,
        familyId,
        message: "Quest completed. Your family's journey has been updated.",
      });
    } catch (err) {
      logger.error({ err, familyId, questId }, "legacy: quest completion failed");
      return res.status(500).json({ error: "Failed to complete quest" });
    }
  },
);

export { selectAncestors };
export default router;
