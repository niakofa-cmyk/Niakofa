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
 * Deliberately NOT wired to family_knowledge_versions yet: that table's
 * versioning/snapshot logic is owned by the fingerprint computation in
 * legacy.ts, and duplicating it here risks the two drifting out of sync.
 * knowledge_version_id is left null until a shared version-bumping utility
 * is built as its own follow-up.
 */

import { db, legacyWorldEvolutionLogTable } from "@workspace/db";
import { logger } from "./logger";

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
}
