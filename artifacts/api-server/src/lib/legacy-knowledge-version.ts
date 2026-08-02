/**
 * Legacy Engine — Knowledge Versioning & World Regeneration
 *
 * family_knowledge_versions existed as a schema with a documented purpose
 * ("the core of the world regenerates loop") but nothing in the codebase ever
 * wrote a row to it — it was permanently empty. legacy.ts computes a similar
 * content-hash fingerprint, but only for its own 24h quest-cache key; that
 * fingerprint is never persisted, versioned, or diffed, so there was no way
 * to answer "what actually changed since last time" or to fire a real
 * world_regenerated event.
 *
 * This module is that missing piece:
 *   1. Build a canonical snapshot of the family's vault (member/memory/
 *      interview/story/place/event IDs + their updated_at timestamps).
 *   2. Hash it (sha256, not truncated base64 — this hash is persisted, not
 *      just used as an in-memory cache key, so we want the full digest).
 *   3. Compare to the family's latest stored family_knowledge_versions row.
 *   4. If different (or this is the family's first version), insert a new
 *      version row and a legacy_world_evolution_log entry with change_type
 *      "world_regenerated", carrying a real diff (new members/memories/
 *      stories/places/events since the previous version) instead of a
 *      generic "something changed" message.
 *
 * Called from logWorldEvolution() after every granular vault mutation is
 * logged (fire-and-forget, same pattern as the rest of this module). Not
 * called for the "world_regenerated" change type itself, to avoid recursion.
 */

import { createHash } from "node:crypto";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryAssetsTable,
  familyInterviewsTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyKnowledgeVersionsTable,
  legacyWorldEvolutionLogTable,
} from "@workspace/db";
import { logger } from "./logger";

interface KnowledgeSnapshot {
  member_ids: string[];
  memory_ids: string[];
  interview_ids: string[];
  story_ids: string[];
  place_ids: string[];
  event_ids: string[];
  asset_ids: string[];
}

const CATEGORY_LABELS: Record<keyof KnowledgeSnapshot, string> = {
  member_ids: "family member",
  memory_ids: "memory",
  interview_ids: "interview",
  story_ids: "story",
  place_ids: "place",
  event_ids: "event",
  asset_ids: "photo / audio asset",
};

/** id[:updated_at] token so an edit (not just a new row) also changes the hash. */
function idToken(id: number, updatedAt: Date | string | null | undefined): string {
  const iso = updatedAt ? new Date(updatedAt).toISOString() : "";
  return `${id}:${iso}`;
}

async function buildSnapshot(familyId: number): Promise<KnowledgeSnapshot> {
  const [members, memories, interviews, stories, places, events, assets] = await Promise.all([
    db
      .select({ id: familyMembersTable.id, updated: familyMembersTable.updated_at })
      .from(familyMembersTable)
      .where(and(
        eq(familyMembersTable.family_id, familyId),
        inArray(familyMembersTable.status, ["active"]),
      )),
    db
      .select({ id: familyMemoriesTable.id, updated: familyMemoriesTable.updated_at })
      .from(familyMemoriesTable)
      .where(eq(familyMemoriesTable.family_id, familyId)),
    db
      .select({ id: familyInterviewsTable.id, updated: familyInterviewsTable.updated_at })
      .from(familyInterviewsTable)
      .where(eq(familyInterviewsTable.family_id, familyId)),
    db
      .select({ id: familyStoriesTable.id, updated: familyStoriesTable.updated_at })
      .from(familyStoriesTable)
      .where(eq(familyStoriesTable.family_id, familyId)),
    db
      .select({ id: familyPlacesTable.id, updated: familyPlacesTable.updated_at })
      .from(familyPlacesTable)
      .where(eq(familyPlacesTable.family_id, familyId)),
    db
      .select({ id: familyEventsTable.id, updated: familyEventsTable.updated_at })
      .from(familyEventsTable)
      .where(eq(familyEventsTable.family_id, familyId)),
    db
      .select({ id: familyMemoryAssetsTable.id, updated: familyMemoryAssetsTable.created_at })
      .from(familyMemoryAssetsTable)
      .innerJoin(familyMemoriesTable, eq(familyMemoryAssetsTable.memory_id, familyMemoriesTable.id))
      .where(eq(familyMemoriesTable.family_id, familyId)),
  ]);

  return {
    member_ids: members.map((m) => idToken(m.id, m.updated)),
    memory_ids: memories.map((m) => idToken(m.id, m.updated)),
    interview_ids: interviews.map((i) => idToken(i.id, i.updated)),
    story_ids: stories.map((s) => idToken(s.id, s.updated)),
    place_ids: places.map((p) => idToken(p.id, p.updated)),
    event_ids: events.map((e) => idToken(e.id, e.updated)),
    asset_ids: assets.map((a) => idToken(a.id, a.updated)),
  };
}

function hashSnapshot(snapshot: KnowledgeSnapshot): string {
  // Sort keys so field order never affects the hash, only content does.
  const canonical = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

/** Count of ids present in `next` whose bare numeric id wasn't in `prev`. */
function countNewIds(prev: string[], next: string[]): number {
  const prevBareIds = new Set(prev.map((t) => t.split(":")[0]));
  return next.filter((t) => !prevBareIds.has(t.split(":")[0])).length;
}

function buildDiffDescription(
  prev: KnowledgeSnapshot | null,
  next: KnowledgeSnapshot,
  newVersion: number,
): { description: string; affectedCount: number } {
  const categories = Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>;

  if (!prev) {
    // First version ever recorded for this family — describe the starting snapshot.
    const total = categories.reduce((sum, key) => sum + next[key].length, 0);
    return {
      description: `Your family world was created — Version ${newVersion}.`,
      affectedCount: Math.max(total, 1),
    };
  }

  const parts: string[] = [];
  let affectedCount = 0;
  for (const key of categories) {
    const added = countNewIds(prev[key], next[key]);
    if (added > 0) {
      affectedCount += added;
      const label = CATEGORY_LABELS[key];
      parts.push(`${added} new ${label}${added === 1 ? "" : "s"}`);
    }
  }

  const description = parts.length > 0
    ? `Your family world evolved to Version ${newVersion} — ${parts.join(", ")}.`
    : `Your family world reached Version ${newVersion}.`;

  return { description, affectedCount: Math.max(affectedCount, 1) };
}

/**
 * Recomputes the family's knowledge fingerprint and, if it changed since the
 * last stored version, persists a new family_knowledge_versions row plus a
 * "world_regenerated" evolution-log entry with a real diff summary.
 *
 * Safe to call frequently — it's a no-op (besides two cheap reads) when
 * nothing has actually changed.
 */
export async function bumpKnowledgeVersionIfChanged(familyId: number): Promise<void> {
  try {
    const [latest] = await db
      .select()
      .from(familyKnowledgeVersionsTable)
      .where(eq(familyKnowledgeVersionsTable.family_id, familyId))
      .orderBy(desc(familyKnowledgeVersionsTable.version))
      .limit(1);

    const nextSnapshot = await buildSnapshot(familyId);
    const nextFingerprint = hashSnapshot(nextSnapshot);

    if (latest && latest.fingerprint === nextFingerprint) {
      return; // Nothing changed since the last recorded version.
    }

    const nextVersion = (latest?.version ?? 0) + 1;
    const prevSnapshot = (latest?.snapshot as KnowledgeSnapshot | undefined) ?? null;

    const [inserted] = await db
      .insert(familyKnowledgeVersionsTable)
      .values({
        family_id: familyId,
        version: nextVersion,
        fingerprint: nextFingerprint,
        snapshot: nextSnapshot,
      })
      .returning();

    const { description, affectedCount } = buildDiffDescription(prevSnapshot, nextSnapshot, nextVersion);

    await db.insert(legacyWorldEvolutionLogTable).values({
      family_id: familyId,
      knowledge_version_id: inserted.id,
      change_type: "world_regenerated",
      change_description: description,
      affected_count: affectedCount,
      previous_version: latest?.version ?? null,
      new_version: nextVersion,
    });

    logger.info(
      { familyId, previousVersion: latest?.version ?? null, newVersion: nextVersion },
      "legacy-knowledge-version: world regenerated",
    );
  } catch (err) {
    // Versioning must never break the vault mutation that triggered it.
    logger.error({ err, familyId }, "legacy-knowledge-version: bump failed");
  }
}
