import { Router } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  audioCircleParticipantsTable,
  audioCircleSessionsTable,
  circleRecordingConsentTable,
  circleRecordingsTable,
  db,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { getPrivateAssetUrl, streamOrRedirectPrivateAsset } from "../lib/storage";
import {
  authorizeRecording,
  finalizeRecording,
  getMissingRecordingConsent,
  getRecordingPlaybackUrl,
  markRecordingActive,
  recordParticipantConsent,
} from "../lib/circleRecordingPolicy";
import { sendToCircleParticipants } from "../lib/ws-hub";

const router = Router();
const activeStatuses = [
  "RECORDING_REQUESTED",
  "RECORDING_AUTHORIZED",
  "RECORDING_ACTIVE",
  "RECORDING_FINALIZING",
] as const;

async function approvedAdmin(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ is_admin: usersTable.is_admin, approval_status: usersTable.approval_status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.is_admin === true && user.approval_status === "approved";
}

function id(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function activeParticipant(sessionId: number, userId: number) {
  const [participant] = await db
    .select()
    .from(audioCircleParticipantsTable)
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, userId),
      isNull(audioCircleParticipantsTable.left_at),
    ))
    .limit(1);
  return participant ?? null;
}

async function recordingInSession(recordingId: number, sessionId: number) {
  const [recording] = await db
    .select()
    .from(circleRecordingsTable)
    .where(and(eq(circleRecordingsTable.id, recordingId), eq(circleRecordingsTable.session_id, sessionId)))
    .limit(1);
  return recording ?? null;
}

async function broadcastRecording(
  sessionId: number,
  type: "circle_recording_authorized" | "circle_recording_consent_updated" | "circle_recording_changed" | "circle_recording_available",
  payload: Record<string, unknown>,
) {
  const participants = await db
    .select({ user_id: audioCircleParticipantsTable.user_id })
    .from(audioCircleParticipantsTable)
    .where(eq(audioCircleParticipantsTable.session_id, sessionId));
  sendToCircleParticipants(participants.map((row) => row.user_id), { type, payload });
}

router.post(
  "/audio-circle-sessions/:id/recording/authorize",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.id);
    if (!sessionId) return res.status(400).json({ error: "Invalid session id" });
    const userId = req.authenticatedUserId!;
    const [session] = await db
      .select()
      .from(audioCircleSessionsTable)
      .where(and(eq(audioCircleSessionsTable.id, sessionId), eq(audioCircleSessionsTable.status, "live")))
      .limit(1);
    if (!session) return res.status(404).json({ error: "Live session not found" });
    if (session.host_id !== userId) return res.status(403).json({ error: "Only the host can authorize recording" });
    const participant = await activeParticipant(sessionId, userId);
    if (!participant) return res.status(403).json({ error: "Host is not an active participant" });
    if (!session.recording_allowed) return res.status(403).json({ error: "Recording has been disabled for this session" });

    const existing = await db
      .select()
      .from(circleRecordingsTable)
      .where(and(eq(circleRecordingsTable.session_id, sessionId), or(...activeStatuses.map((status) => eq(circleRecordingsTable.status, status)))))
      .limit(1);
    const recording = existing[0] ?? await authorizeRecording({
      sessionId,
      circleId: session.circle_id,
      hostId: userId,
    });
    await broadcastRecording(sessionId, "circle_recording_authorized", {
      session_id: sessionId,
      recording_id: recording.id,
      recording_status: recording.status,
    });
    return res.json({ ok: true, recording_id: recording.id, recording_status: recording.status });
  },
);

router.get(
  "/audio-circle-sessions/:id/recording/current",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.id);
    if (!sessionId) return res.status(400).json({ error: "Invalid session id" });
    if (!(await activeParticipant(sessionId, req.authenticatedUserId!))) {
      return res.status(403).json({ error: "Join the Circle before viewing recording state" });
    }
    const [recording] = await db
      .select()
      .from(circleRecordingsTable)
      .where(and(
        eq(circleRecordingsTable.session_id, sessionId),
        or(...activeStatuses.map((status) => eq(circleRecordingsTable.status, status))),
      ))
      .limit(1);
    if (!recording) return res.json({ recording: null });
    const [consent] = await db
      .select({ id: circleRecordingConsentTable.id })
      .from(circleRecordingConsentTable)
      .where(and(
        eq(circleRecordingConsentTable.recording_id, recording.id),
        eq(circleRecordingConsentTable.user_id, req.authenticatedUserId!),
      ))
      .limit(1);
    return res.json({
      recording: {
        id: recording.id,
        status: recording.status,
        consented: Boolean(consent),
        missing_consent_count: (await getMissingRecordingConsent(recording.id)).length,
      },
    });
  },
);

router.post(
  "/audio-circle-sessions/:sessionId/recording/:recordingId/consent",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.sessionId);
    const recordingId = id(req.params.recordingId);
    if (!sessionId || !recordingId) return res.status(400).json({ error: "Invalid id" });
    if (!(await activeParticipant(sessionId, req.authenticatedUserId!))) {
      return res.status(403).json({ error: "Only current participants can acknowledge recording consent" });
    }
    const recording = await recordingInSession(recordingId, sessionId);
    if (!recording || !activeStatuses.includes(recording.status as typeof activeStatuses[number])) {
      return res.status(404).json({ error: "Recording authorization not found" });
    }
    await recordParticipantConsent(recordingId, req.authenticatedUserId!);
    await broadcastRecording(sessionId, "circle_recording_consent_updated", {
      session_id: sessionId,
      recording_id: recordingId,
      missing_consent_count: (await getMissingRecordingConsent(recordingId)).length,
    });
    return res.json({ ok: true });
  },
);

router.post(
  "/audio-circle-sessions/:sessionId/recording/:recordingId/start",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.sessionId);
    const recordingId = id(req.params.recordingId);
    if (!sessionId || !recordingId) return res.status(400).json({ error: "Invalid id" });
    const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
    if (!session || session.status !== "live" || session.host_id !== req.authenticatedUserId) {
      return res.status(403).json({ error: "Only the live host can start recording" });
    }
    if (!(await activeParticipant(sessionId, req.authenticatedUserId!))) {
      return res.status(403).json({ error: "Host is not an active participant" });
    }
    const recording = await recordingInSession(recordingId, sessionId);
    if (!recording || recording.status !== "RECORDING_AUTHORIZED") {
      return res.status(409).json({ error: "Recording is not authorized" });
    }
    const result = await markRecordingActive(recordingId);
    if (!result.ok) {
      return res.status(409).json({
        error: "Every current participant must acknowledge recording consent first",
        missing_consent_count: result.missingUserIds.length,
      });
    }
    await db.update(audioCircleSessionsTable).set({
      is_recording: true,
      recording_status: "recording",
    }).where(eq(audioCircleSessionsTable.id, sessionId));
    await broadcastRecording(sessionId, "circle_recording_changed", {
      session_id: sessionId,
      recording_id: recordingId,
      is_recording: true,
    });
    return res.json({ ok: true, recording_id: recordingId });
  },
);

router.post(
  "/audio-circle-sessions/:sessionId/recording/:recordingId/finalize",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.sessionId);
    const recordingId = id(req.params.recordingId);
    if (!sessionId || !recordingId) return res.status(400).json({ error: "Invalid id" });
    const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
    if (!session || session.host_id !== req.authenticatedUserId) {
      return res.status(403).json({ error: "Only the host can finalize a recording" });
    }
    if (!(await recordingInSession(recordingId, sessionId))) return res.status(404).json({ error: "Recording not found" });
    const body = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body?.base64 === "string" ? req.body.base64 : "", "base64");
    const mimeType = String(req.headers["content-type"] ?? "audio/webm").split(";")[0].toLowerCase();
    const duration = Number(req.query.duration);
    try {
      const archived = await finalizeRecording({
        recordingId,
        buffer: body,
        mimeType: mimeType.startsWith("audio/") ? mimeType : "audio/webm",
        durationSeconds: Number.isFinite(duration) ? duration : undefined,
      });
      await db.update(audioCircleSessionsTable).set({
        recording_url: archived?.storage_key ? await getPrivateAssetUrl(archived.storage_key) : null,
        recording_status: "processing",
        recording_size_bytes: body.length,
        recording_duration_seconds: Number.isFinite(duration) ? Math.floor(duration) : null,
      }).where(eq(audioCircleSessionsTable.id, sessionId));
      await broadcastRecording(sessionId, "circle_recording_available", {
        session_id: sessionId,
        recording_id: recordingId,
      });
      return res.json({ ok: true, recording_id: archived?.id, recording_status: archived?.status });
    } catch (err) {
      return res.status(422).json({ error: err instanceof Error ? err.message : "Recording finalization failed" });
    }
  },
);

router.get(
  "/audio-circle-sessions/:sessionId/recording/:recordingId/playback-url",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const sessionId = id(req.params.sessionId);
    const recordingId = id(req.params.recordingId);
    if (!sessionId || !recordingId) return res.status(400).json({ error: "Invalid id" });
    const recording = await recordingInSession(recordingId, sessionId);
    if (!recording || recording.status !== "RECORDING_ARCHIVED") return res.status(404).json({ error: "Recording not found" });
    const participant = await db
      .select({ id: audioCircleParticipantsTable.id })
      .from(audioCircleParticipantsTable)
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        eq(audioCircleParticipantsTable.user_id, req.authenticatedUserId!),
      ))
      .limit(1);
    if (!participant.length && recording.host_id !== req.authenticatedUserId && !(await approvedAdmin(req.authenticatedUserId!))) {
      return res.status(403).json({ error: "Only Circle participants can play this recording" });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json({ url: await getRecordingPlaybackUrl(recordingId), expires_in_seconds: 300 });
  },
);

router.get("/audio-circle-recording-assets", requireAuth, generalApiLimiter, async (req, res) => {
  let key = "";
  try {
    key = typeof req.query.key === "string" ? decodeURIComponent(req.query.key) : "";
  } catch {
    return res.status(404).json({ error: "Not found" });
  }
  if (!key.startsWith("circles/recordings/")) return res.status(404).json({ error: "Not found" });
  const [recording] = await db.select().from(circleRecordingsTable).where(eq(circleRecordingsTable.storage_key, key)).limit(1);
  if (!recording || recording.storage_key !== key || recording.status !== "RECORDING_ARCHIVED") {
    return res.status(404).json({ error: "Not found" });
  }
  const participant = await db
    .select({ id: audioCircleParticipantsTable.id })
    .from(audioCircleParticipantsTable)
    .where(and(eq(audioCircleParticipantsTable.session_id, recording.session_id), eq(audioCircleParticipantsTable.user_id, req.authenticatedUserId!)))
    .limit(1);
  if (!participant.length && recording.host_id !== req.authenticatedUserId && !(await approvedAdmin(req.authenticatedUserId!))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return streamOrRedirectPrivateAsset(key, res);
});

export default router;