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
  familyMemoryPeopleTable,
  legacyQuestProgressTable,
} from "@workspace/db";
import { syncAchievements } from "./legacy-achievements";
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

  // Latest 50 memories — expanded from 15 so larger family vaults don't
  // lose their earliest stories from the AI's context window. The knowledge
  // version snapshot (legacy-knowledge-version.ts) already hashes ALL
  // memories for regeneration triggers; this limit only affects how many
  // summaries are sent to the AI quest generator in a single prompt.
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
    .limit(50);

  const [{ ic }] = await db
    .select({ ic: sql<number>`count(*)::int` })
    .from(familyInterviewsTable)
    .where(eq(familyInterviewsTable.family_id, familyId));

  // Fetch additional vault data for strong fingerprint
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
  // Fetch timestamps for stories, events, and places so edits (not just
  // count changes) invalidate the fingerprint and trigger regeneration.
  const storyRows = await db
    .select({ id: familyStoriesTable.id, updated: familyStoriesTable.updated_at })
    .from(familyStoriesTable)
    .where(eq(familyStoriesTable.family_id, familyId))
    .orderBy(desc(familyStoriesTable.updated_at))
    .limit(50);

  const eventRows = await db
    .select({ id: familyEventsTable.id, updated: familyEventsTable.updated_at })
    .from(familyEventsTable)
    .where(eq(familyEventsTable.family_id, familyId))
    .orderBy(desc(familyEventsTable.updated_at))
    .limit(50);

  const placeRows = await db
    .select({ id: familyPlacesTable.id, updated: familyPlacesTable.updated_at })
    .from(familyPlacesTable)
    .where(eq(familyPlacesTable.family_id, familyId))
    .orderBy(desc(familyPlacesTable.updated_at))
    .limit(50);

  const canonicalData = JSON.stringify({
    m: consentedMembers.map(m => `${m.id}:${m.updated?.toISOString() ?? ""}`),
    mem: memories.map(m => `${m.id}:${m.updated?.toISOString() ?? ""}`),
    i: interviewCount,
    s: storyRows.map(s => `${s.id}:${s.updated?.toISOString() ?? ""}`),
    e: eventRows.map(e => `${e.id}:${e.updated?.toISOString() ?? ""}`),
    p: placeRows.map(p => `${p.id}:${p.updated?.toISOString() ?? ""}`),
    r: relationCount,
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
RECENT MEMORIES:
${memorySummary}
STATS: ${r.memberCount} family members, ${r.memoryCount} memories, ${r.interviewCount} oral recordings

Generate exactly 5 personalized quests for this player. Each quest MUST:
- Reference SPECIFIC data above (use real ancestor names, actual memory titles, real locations)
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

    // Count memories mentioning this member (via family_memory_people junction)
    const [{ mc }] = await db
      .select({ mc: sql<number>`count(*)::int` })
      .from(familyMemoryPeopleTable)
      .where(eq(familyMemoryPeopleTable.member_id, member.id));

    // Count interviews with this member
    const [{ ic }] = await db
      .select({ ic: sql<number>`count(*)::int` })
      .from(familyInterviewsTable)
      .where(eq(familyInterviewsTable.subject_member_id, member.id));

    // Count photos for memories about this member
    const [{ pc }] = await db
      .select({ pc: sql<number>`count(*)::int` })
      .from(familyMemoryAssetsTable)
      .innerJoin(familyMemoryPeopleTable, eq(familyMemoryAssetsTable.memory_id, familyMemoryPeopleTable.memory_id))
      .where(and(eq(familyMemoryPeopleTable.member_id, member.id), eq(familyMemoryAssetsTable.asset_type, "photo")));

    // Get earliest event as birth year proxy
    const events = await db
      .select({ eventDate: familyEventsTable.event_date, category: familyEventsTable.category })
      .from(familyEventsTable)
      .where(eq(familyEventsTable.member_id, member.id))
      .orderBy(asc(familyEventsTable.event_date))
      .limit(1);

    // Count places associated with this member's events
    const [{ placeCountForMember }] = await db
      .select({ placeCountForMember: sql<number>`count(DISTINCT ${familyEventsTable.place_id})::int` })
      .from(familyEventsTable)
      .where(and(eq(familyEventsTable.member_id, member.id), sql`${familyEventsTable.place_id} IS NOT NULL`));

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
      placeCount: placeCountForMember,
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
  "/legacy/ancestors/:familyId",
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
//
// Previously this endpoint only busted caches and re-synced achievement
// *counts* — nothing recorded that THIS quest id was completed BY this
// user, so the same quest could be "completed" repeatedly with no durable
// record (see legacy_quest_progress migration 0100 for the full writeup).
// Quest title/category/xp are accepted from the client because AI-generated
// quests are ephemeral, server-generated content the client is already
// displaying verbatim — this is a completion *log*, not a vault write, so
// there's no fabrication risk in snapshotting what was shown.

const VALID_QUEST_CATEGORIES = new Set(["record", "document", "connect", "explore", "discover"]);

router.post(
  "/legacy/quests/:familyId/:questId/complete",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    const questId = String(req.params.questId);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const { fingerprint, questTitle, questCategory, xp } = req.body as {
      fingerprint?: string;
      questTitle?: string;
      questCategory?: string;
      xp?: number;
    };

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
      // Rebuild reservoir to get current fingerprint for correct cache key
      const reservoir = await buildReservoir(familyId);
      await cacheSet(reservoirKey(familyId), reservoir, RESERVOIR_TTL);

      // Invalidate quest cache with the CORRECT key format (includes fingerprint)
      await cacheDel(questKey(familyId, reservoir.fingerprint));

      // Sanitize the client-supplied quest snapshot the same way generateAiQuests
      // sanitizes model output — never trust length/enum bounds from the client.
      const effectiveFingerprint = (fingerprint && fingerprint.length > 0) ? fingerprint : reservoir.fingerprint;
      const title = typeof questTitle === "string" && questTitle.trim().length > 0
        ? questTitle.trim().slice(0, 80)
        : "Family Quest";
      const category = VALID_QUEST_CATEGORIES.has(String(questCategory)) ? String(questCategory) : "discover";
      const xpAwarded = Math.min(200, Math.max(0, Number.isFinite(Number(xp)) ? Number(xp) : 0));

      let alreadyCompleted = false;
      try {
        await db.insert(legacyQuestProgressTable).values({
          family_id:      familyId,
          user_id:        userId,
          quest_id:       questId,
          fingerprint:    effectiveFingerprint,
          quest_title:    title,
          quest_category: category,
          xp_awarded:     xpAwarded,
        });
      } catch (insertErr) {
        // Postgres unique_violation (23505) on the (family, user, quest, fingerprint)
        // index — this exact quest was already completed. Not an error condition,
        // just means no new credit should be awarded.
        const code = (insertErr as { code?: string })?.code;
        if (code === "23505") {
          alreadyCompleted = true;
        } else {
          throw insertErr;
        }
      }

      // Sync achievements so quest completion counts toward gameplay achievements
      await syncAchievements(familyId).catch((err) =>
        logger.error({ err, familyId }, "legacy: achievement sync after quest completion failed"),
      );

      logger.info({ familyId, userId, questId, alreadyCompleted }, "legacy: quest completed");

      return res.json({
        completed: true,
        alreadyCompleted,
        questId,
        familyId,
        xpAwarded: alreadyCompleted ? 0 : xpAwarded,
        message: alreadyCompleted
          ? "You've already completed this quest."
          : "Quest completed. Your family's journey has been updated.",
      });
    } catch (err) {
      logger.error({ err, familyId, questId }, "legacy: quest completion failed");
      return res.status(500).json({ error: "Failed to complete quest" });
    }
  },
);

// GET /api/legacy/quests/:familyId/history — a user's durable quest completion log
router.get(
  "/legacy/quests/:familyId/history",
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
      const rows = await db
        .select()
        .from(legacyQuestProgressTable)
        .where(
          and(
            eq(legacyQuestProgressTable.family_id, familyId),
            eq(legacyQuestProgressTable.user_id, userId),
          ),
        )
        .orderBy(desc(legacyQuestProgressTable.completed_at))
        .limit(100);

      const totalXp = rows.reduce((sum, r) => sum + r.xp_awarded, 0);

      return res.json({ completions: rows, totalXp, count: rows.length });
    } catch (err) {
      logger.error({ err, familyId }, "legacy: quest history failed");
      return res.status(500).json({ error: "Failed to load quest history" });
    }
  },
);

export { selectAncestors };
export default router;
