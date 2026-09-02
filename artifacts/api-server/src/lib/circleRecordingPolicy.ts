import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  audioCircleParticipantsTable,
  circleRecordingConsentTable,
  circleRecordingsTable,
  db,
} from "@workspace/db";
import { deleteAsset, getPrivateAssetUrl, putAsset } from "./storage";
import { logger } from "./logger";

export const RECORDING_RETENTION_DAYS = 30;
export const ACTIVE_RECORDING_STATUSES = [
  "RECORDING_REQUESTED",
  "RECORDING_AUTHORIZED",
  "RECORDING_ACTIVE",
  "RECORDING_FINALIZING",
] as const;

export function calculateRetentionUntil(
  createdAt = new Date(),
  retentionDays = Number(process.env["CIRCLE_RECORDING_RETENTION_DAYS"]) || RECORDING_RETENTION_DAYS,
): Date {
  const safeDays = Math.max(1, Math.min(3650, Math.floor(retentionDays)));
  return new Date(createdAt.getTime() + safeDays * 24 * 60 * 60 * 1000);
}

export async function authorizeRecording(input: {
  sessionId: number;
  circleId: number;
  hostId: number;
}) {
  const [recording] = await db
    .insert(circleRecordingsTable)
    .values({
      session_id: input.sessionId,
      circle_id: input.circleId,
      host_id: input.hostId,
      status: "RECORDING_AUTHORIZED",
      retention_until: calculateRetentionUntil(),
    })
    .returning();
  return recording;
}

export async function getMissingRecordingConsent(recordingId: number): Promise<number[]> {
  const participants = await db
    .select({ user_id: audioCircleParticipantsTable.user_id })
    .from(audioCircleParticipantsTable)
    .where(and(
      eq(audioCircleParticipantsTable.session_id, (
        await db
          .select({ session_id: circleRecordingsTable.session_id })
          .from(circleRecordingsTable)
          .where(eq(circleRecordingsTable.id, recordingId))
          .limit(1)
      )[0]?.session_id ?? -1),
      isNull(audioCircleParticipantsTable.left_at),
    ));
  const consented = await db
    .select({ user_id: circleRecordingConsentTable.user_id })
    .from(circleRecordingConsentTable)
    .where(eq(circleRecordingConsentTable.recording_id, recordingId));
  const consentedIds = new Set(consented.map((row) => row.user_id));
  return participants.map((row) => row.user_id).filter((id) => !consentedIds.has(id));
}

export async function recordParticipantConsent(recordingId: number, userId: number) {
  const [consent] = await db
    .insert(circleRecordingConsentTable)
    .values({ recording_id: recordingId, user_id: userId })
    .onConflictDoNothing()
    .returning();
  return consent ?? null;
}

export async function markRecordingActive(recordingId: number) {
  const missing = await getMissingRecordingConsent(recordingId);
  if (missing.length > 0) {
    return { ok: false as const, missingUserIds: missing };
  }
  const [recording] = await db
    .update(circleRecordingsTable)
    .set({
      status: "RECORDING_ACTIVE",
      started_at: new Date(),
      updated_at: new Date(),
    })
    .where(and(
      eq(circleRecordingsTable.id, recordingId),
      eq(circleRecordingsTable.status, "RECORDING_AUTHORIZED"),
    ))
    .returning();
  return recording
    ? { ok: true as const, recording }
    : { ok: false as const, missingUserIds: [], error: "Recording is no longer available" };
}

export async function finalizeRecording(input: {
  recordingId: number;
  buffer: Buffer;
  mimeType: string;
  durationSeconds?: number;
}) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length === 0) {
    throw new Error("Recording body is empty");
  }
  const [recording] = await db
    .select()
    .from(circleRecordingsTable)
    .where(and(
      eq(circleRecordingsTable.id, input.recordingId),
      inArray(circleRecordingsTable.status, ["RECORDING_ACTIVE", "RECORDING_FINALIZING"]),
    ))
    .limit(1);
  if (!recording) throw new Error("Recording is not active");

  const extension = input.mimeType === "audio/mp4" ? "m4a" : input.mimeType === "audio/ogg" ? "ogg" : "webm";
  const storageKey = `circles/recordings/${recording.id}/${crypto.randomUUID()}.${extension}`;
  await db
    .update(circleRecordingsTable)
    .set({ status: "RECORDING_FINALIZING", updated_at: new Date() })
    .where(eq(circleRecordingsTable.id, recording.id));
  try {
    await putAsset(storageKey, input.buffer, input.mimeType || "audio/webm");
    const [archived] = await db
      .update(circleRecordingsTable)
      .set({
        status: "RECORDING_ARCHIVED",
        ended_at: new Date(),
        duration_seconds: input.durationSeconds && input.durationSeconds > 0 ? Math.floor(input.durationSeconds) : null,
        mime_type: input.mimeType || "audio/webm",
        byte_size: input.buffer.length,
        storage_key: storageKey,
        updated_at: new Date(),
      })
      .where(eq(circleRecordingsTable.id, recording.id))
      .returning();
    return archived;
  } catch (err) {
    logger.error({ err, recordingId: recording.id }, "circles: recording finalization failed");
    await db
      .update(circleRecordingsTable)
      .set({ status: "RECORDING_FAILED", updated_at: new Date() })
      .where(eq(circleRecordingsTable.id, recording.id));
    throw err;
  }
}

export async function getRecordingPlaybackUrl(recordingId: number) {
  const [recording] = await db
    .select({ storage_key: circleRecordingsTable.storage_key, status: circleRecordingsTable.status })
    .from(circleRecordingsTable)
    .where(eq(circleRecordingsTable.id, recordingId))
    .limit(1);
  if (!recording || recording.status !== "RECORDING_ARCHIVED" || !recording.storage_key) {
    throw new Error("Recording is not available");
  }
  return getPrivateAssetUrl(recording.storage_key, 300);
}

export async function deleteExpiredRecording(recording: {
  id: number;
  storage_key: string | null;
}) {
  if (recording.storage_key) await deleteAsset(recording.storage_key);
  await db.delete(circleRecordingsTable).where(eq(circleRecordingsTable.id, recording.id));
}