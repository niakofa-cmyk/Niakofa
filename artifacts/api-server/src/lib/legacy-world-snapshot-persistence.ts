import {
  db,
  legacyChaptersTable,
  legacyQuestsTable,
  legacyWorldVersionsTable,
  legacyWorldsTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import type { InterviewWorldRegeneration, LegacyWorldSnapshot } from "./legacy-interview-result";
import { logger } from "./logger";

type PersistedWorldData = Record<string, unknown> & {
  interviewSnapshots?: Record<string, LegacyWorldSnapshot>;
  latestInterviewId?: number;
  latestSnapshot?: LegacyWorldSnapshot;
};

export interface PersistedInterviewWorld {
  worldId: number;
  snapshot: LegacyWorldSnapshot;
  created: boolean;
  chapterId: number | null;
  questId: number | null;
}

function readWorldData(value: unknown): PersistedWorldData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PersistedWorldData
    : {};
}

function questTypeForSnapshot(snapshot: LegacyWorldSnapshot): "mystery" | "exploration" {
  return snapshot.locations.length > 0 ? "exploration" : "mystery";
}

/**
 * Makes an interview regeneration a durable game-world event.
 *
 * The source of truth remains the Family Vault and knowledge version. This
 * helper only materializes the already-derived, explicitly sourced snapshot
 * into the existing Legacy world/chapter/quest tables. It is idempotent by
 * interview id so result reloads and completion retries cannot duplicate game
 * content.
 */
export async function persistInterviewWorldSnapshot(
  regeneration: InterviewWorldRegeneration,
  interviewId: number,
  knowledgeVersionId: number | null,
): Promise<PersistedInterviewWorld> {
  const familyId = regeneration.snapshot.familyId;
  const [existingWorld] = await db
    .select()
    .from(legacyWorldsTable)
    .where(eq(legacyWorldsTable.family_id, familyId))
    .orderBy(desc(legacyWorldsTable.updated_at))
    .limit(1);

  let world = existingWorld;
  if (!world) {
    [world] = await db
      .insert(legacyWorldsTable)
      .values({
        family_id: familyId,
        knowledge_version_id: knowledgeVersionId,
        status: "ready",
        world_data: {},
      })
      .returning();
  }

  const worldData = readWorldData(world.world_data);
  const snapshots = worldData.interviewSnapshots ?? {};
  const snapshotKey = String(interviewId);
  const persistedSnapshot = snapshots[snapshotKey];
  if (persistedSnapshot) {
    return {
      worldId: world.id,
      snapshot: persistedSnapshot,
      created: false,
      chapterId: null,
      questId: null,
    };
  }

  const nextWorldData: PersistedWorldData = {
    ...worldData,
    interviewSnapshots: { ...snapshots, [snapshotKey]: regeneration.snapshot },
    latestInterviewId: interviewId,
    latestSnapshot: regeneration.snapshot,
  };
  await db
    .update(legacyWorldsTable)
    .set({
      knowledge_version_id: knowledgeVersionId,
      status: "ready",
      world_data: nextWorldData,
      updated_at: new Date(),
    })
    .where(eq(legacyWorldsTable.id, world.id));

  await db.insert(legacyWorldVersionsTable).values({
    world_id: world.id,
    family_id: familyId,
    knowledge_version_id: knowledgeVersionId,
    version_label: `Interview ${interviewId} · World ${regeneration.worldVersion ?? "pending"}`,
    changes: regeneration.snapshot as unknown as Record<string, unknown>,
  });

  let chapterId: number | null = null;
  if (regeneration.chapterSeed) {
    const [lastChapter] = await db
      .select({ chapterNumber: legacyChaptersTable.chapter_number })
      .from(legacyChaptersTable)
      .where(eq(legacyChaptersTable.world_id, world.id))
      .orderBy(desc(legacyChaptersTable.chapter_number))
      .limit(1);
    const chapterNumber = (lastChapter?.chapterNumber ?? 0) + 1;
    const [chapter] = await db
      .insert(legacyChaptersTable)
      .values({
        world_id: world.id,
        family_id: familyId,
        chapter_number: chapterNumber,
        title: regeneration.chapterSeed.title,
        synopsis: regeneration.chapterSeed.reason,
        status: "unlocked",
        chapter_data: {
          sourceInterviewId: interviewId,
          snapshot: regeneration.snapshot,
          historicalLayer: "narrative_interpretation",
        },
        unlocked_at: new Date(),
      })
      .returning({ id: legacyChaptersTable.id });
    chapterId = chapter?.id ?? null;
  }

  let questId: number | null = null;
  if (regeneration.newQuest) {
    const fingerprint = `interview:${interviewId}`;
    const [existingQuest] = await db
      .select({ id: legacyQuestsTable.id })
      .from(legacyQuestsTable)
      .where(and(
        eq(legacyQuestsTable.family_id, familyId),
        eq(legacyQuestsTable.quest_id_text, regeneration.newQuest.id),
        eq(legacyQuestsTable.fingerprint, fingerprint),
      ))
      .limit(1);
    if (existingQuest) {
      questId = existingQuest.id;
    } else {
      const [quest] = await db
        .insert(legacyQuestsTable)
        .values({
          family_id: familyId,
          world_id: world.id,
          quest_id_text: regeneration.newQuest.id,
          fingerprint,
          title: regeneration.newQuest.title,
          description: regeneration.newQuest.reason,
          quest_type: questTypeForSnapshot(regeneration.snapshot),
          category: "interview",
          action_path: "/legacy/interview-quest",
          is_ai_generated: false,
          steps: regeneration.snapshot.discoveries,
          completion_condition: { sourceInterviewId: interviewId },
        })
        .returning({ id: legacyQuestsTable.id });
      questId = quest?.id ?? null;
    }
  }

  return {
    worldId: world.id,
    snapshot: regeneration.snapshot,
    created: true,
    chapterId,
    questId,
  };
}

export async function loadPersistedInterviewWorldSnapshot(
  familyId: number,
  interviewId: number,
): Promise<LegacyWorldSnapshot | null> {
  const [world] = await db
    .select({ world_data: legacyWorldsTable.world_data })
    .from(legacyWorldsTable)
    .where(eq(legacyWorldsTable.family_id, familyId))
    .orderBy(desc(legacyWorldsTable.updated_at))
    .limit(1);
  return readWorldData(world?.world_data).interviewSnapshots?.[String(interviewId)] ?? null;
}

export function toRegenerationFromSnapshot(
  snapshot: LegacyWorldSnapshot,
  fallback: InterviewWorldRegeneration,
): InterviewWorldRegeneration {
  return {
    ...fallback,
    worldVersion: snapshot.worldVersion,
    newCharacters: snapshot.characters,
    newQuest: fallback.newQuest && snapshot.quests.some((quest) => quest.id === fallback.newQuest?.id)
      ? fallback.newQuest
      : null,
    chapterSeed: fallback.chapterSeed && snapshot.chapters.some((chapter) => chapter.id === fallback.chapterSeed?.id)
      ? fallback.chapterSeed
      : null,
    newDialogue: snapshot.dialogue[0]?.text ?? "",
    snapshot,
  };
}

export function logPersistenceFailure(error: unknown, familyId: number, interviewId: number) {
  logger.error({ err: error, familyId, interviewId }, "legacy-world-snapshot: persistence failed");
}