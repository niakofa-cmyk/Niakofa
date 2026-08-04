/**
 * Legacy Engine — World Evolution Logging
 *
 * Real "world regeneration" quest/dialogue caching already exists and works
 * (see legacy.ts's content-hash fingerprint, which correctly invalidates
 * whenever underlying vault data changes). What was missing was the
 * family-facing record of *that it happened*: legacy_world_evolution_log
 * existed with a working GET/POST API (legacy-world-evolution.ts), but
 * nothing anywhere in the app ever called the POST — the log was
 * permanently empty, so the "watch your world change" timeline page had
 * nothing to show.
 *
 * This helper is called (fire-and-forget, matching the pattern already used
 * for reservoir invalidation elsewhere in these routes) from every real
 * vault-mutation site: adding a member, memory, interview, or tree relation.
 *
 * Wired to family_knowledge_versions via bumpKnowledgeVersionIfChanged:
 * after logging the granular change, we recompute the family's knowledge
 * fingerprint and, if it changed, persist a new version row plus a
 * "world_regenerated" entry with a real diff summary.
 */

import { db, legacyWorldEvolutionLogTable } from "@workspace/db";
import { logger } from "./logger";
import { bumpKnowledgeVersionIfChanged } from "./legacy-knowledge-version";
import { cacheDel } from "./cache";

export type LegacyChangeType =
  | "member_added"
  | "memory_added"
  | "story_added"
  | "interview_added"
  | "place_added"
  | "event_added"
  | "relation_added"
  | "world_regenerated";

export async function logWorldEvolution(
  familyId: number,
  changeType: LegacyChangeType,
  description?: string,
  affectedCount = 1,
): Promise<void> {
  try {
    await db.insert(legacyWorldEvolutionLogTable).values({
      family_id: familyId,
      change_type: changeType,
      change_description: description ?? null,
      affected_count: affectedCount,
    });
  } catch (err) {
    // Never let logging failures break the actual mutation that triggered it.
    logger.error({ err, familyId, changeType }, "legacy-world-evolution: log write failed");
  }

  // Always bust the reservoir cache on any vault mutation so the next read
  // returns fresh data — even when the fingerprint calculation itself hasn't
  // changed yet (e.g. an edit where updated_at wasn't bumped by the ORM).
  // This prevents stories from "disappearing" because the AI was reading a
  // stale 24h cached reservoir that predated the mutation.
  if (changeType !== "world_regenerated") {
    cacheDel(`legacy:reservoir:${familyId}`).catch(() => { /* non-fatal */ });

    // Recursion guard: bumpKnowledgeVersionIfChanged writes its own
    // "world_regenerated" entry via a direct db.insert (not this function).
    bumpKnowledgeVersionIfChanged(familyId).catch((err) => {
      logger.error({ err, familyId }, "legacy-world-evolution: knowledge version bump failed");
    });
  }
}
