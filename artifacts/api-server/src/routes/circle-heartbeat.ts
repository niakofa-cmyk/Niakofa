/**
 * Circle/Spiral presence heartbeat route.
 *
 * POST /audio-circle-sessions/:id/heartbeat — called by each active
 * participant every ~30s. Updates last_seen_at, sweeps ghosts, and enforces:
 * - 90s absence of host AND co-host → end session (host ghost starts grace)
 * - 4 hour max session wall-clock duration
 */
import { Router } from "express";
import { z } from "zod";
import {
  db,
  audioCircleParticipantsTable,
  audioCircleSessionsTable,
} from "@workspace/db";
import { and, eq, isNull, lt, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { sendToCircleParticipants, clearCircleSession } from "../lib/ws-hub";
import {
  HOST_GRACE_PERIOD_MS,
  isSessionPastMaxDuration,
} from "../lib/circleSessionLifecycle";
import { logger } from "../lib/logger";

const router = Router();

const HeartbeatBody = z.object({
  active_speaker_id: z.number().int().positive().nullable().optional(),
});

async function endSessionFromHeartbeat(sessionId: number, reason: string) {
  const active = await db
    .select({ user_id: audioCircleParticipantsTable.user_id })
    .from(audioCircleParticipantsTable)
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      isNull(audioCircleParticipantsTable.left_at),
    ));
  await db
    .update(audioCircleSessionsTable)
    .set({ status: "ended", ended_at: new Date() })
    .where(and(
      eq(audioCircleSessionsTable.id, sessionId),
      eq(audioCircleSessionsTable.status, "live"),
    ));
  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      isNull(audioCircleParticipantsTable.left_at),
    ));
  clearCircleSession(sessionId);
  if (active.length > 0) {
    sendToCircleParticipants(active.map((p) => p.user_id), {
      type: "circle_session_ended",
      payload: { session_id: sessionId, reason },
    });
  }
  logger.info({ session_id: sessionId, reason }, "circle: session ended from heartbeat lifecycle");
}

router.post("/audio-circle-sessions/:id/heartbeat", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const userId = req.authenticatedUserId!;
  const parsed = HeartbeatBody.safeParse(req.body);
  const activeSpeakerId = parsed.success ? (parsed.data.active_speaker_id ?? null) : null;

  const result = await db
    .update(audioCircleParticipantsTable)
    .set({ last_seen_at: new Date() })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, userId),
      isNull(audioCircleParticipantsTable.left_at),
    ))
    .returning({ id: audioCircleParticipantsTable.id });

  if (result.length === 0) return res.status(204).send();

  if (activeSpeakerId !== null) {
    const allActive = await db
      .select({ user_id: audioCircleParticipantsTable.user_id })
      .from(audioCircleParticipantsTable)
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        isNull(audioCircleParticipantsTable.left_at),
      ));
    if (allActive.some((p) => p.user_id === activeSpeakerId)) {
      const otherParticipantIds = allActive
        .map((p) => p.user_id)
        .filter((participantId) => participantId !== userId);
      if (otherParticipantIds.length > 0) {
        sendToCircleParticipants(otherParticipantIds, {
          type: "circle_active_speaker",
          payload: { session_id: sessionId, user_id: activeSpeakerId, reporter_id: userId },
        });
      }
    } else {
      logger.warn(
        { session_id: sessionId, reporter_id: userId, active_speaker_id: activeSpeakerId },
        "circle: ignored active speaker outside this session",
      );
    }
  }

  const cutoff = new Date(Date.now() - HOST_GRACE_PERIOD_MS);

  try {
    // Ghost sweep for non-hosts (co-hosts included — moderators only while present).
    const ghosts = await db
      .update(audioCircleParticipantsTable)
      .set({ left_at: new Date() })
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        isNull(audioCircleParticipantsTable.left_at),
        lt(audioCircleParticipantsTable.last_seen_at, cutoff),
        sql`${audioCircleParticipantsTable.role} != 'host'`,
      ))
      .returning({ user_id: audioCircleParticipantsTable.user_id, role: audioCircleParticipantsTable.role });

    if (ghosts.length > 0) {
      const remaining = await db
        .select({ user_id: audioCircleParticipantsTable.user_id })
        .from(audioCircleParticipantsTable)
        .where(and(
          eq(audioCircleParticipantsTable.session_id, sessionId),
          isNull(audioCircleParticipantsTable.left_at),
        ));
      for (const ghost of ghosts) {
        sendToCircleParticipants(remaining.map((p) => p.user_id), {
          type: "circle_participant_left",
          payload: { session_id: sessionId, user_id: ghost.user_id },
        });
        logger.info(
          { session_id: sessionId, user_id: ghost.user_id, role: ghost.role },
          "circle: ghost participant swept",
        );
      }
    }

    const [session] = await db
      .select()
      .from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.id, sessionId))
      .limit(1);

    if (session?.status === "live") {
      // 4-hour hard cap — Spiral continues through token refreshes until this limit.
      if (isSessionPastMaxDuration(session.started_at)) {
        await endSessionFromHeartbeat(sessionId, "max_duration_4h");
        return res.status(204).send();
      }

      // Host ghost: start the same 90s grace used when host explicitly leaves.
      const [hostRow] = await db
        .select({
          last_seen_at: audioCircleParticipantsTable.last_seen_at,
        })
        .from(audioCircleParticipantsTable)
        .where(and(
          eq(audioCircleParticipantsTable.session_id, sessionId),
          eq(audioCircleParticipantsTable.role, "host"),
          isNull(audioCircleParticipantsTable.left_at),
        ))
        .limit(1);

      if (hostRow?.last_seen_at && hostRow.last_seen_at < cutoff && !session.host_disconnected_at) {
        await db
          .update(audioCircleSessionsTable)
          .set({ host_disconnected_at: new Date() })
          .where(and(
            eq(audioCircleSessionsTable.id, sessionId),
            eq(audioCircleSessionsTable.status, "live"),
            isNull(audioCircleSessionsTable.host_disconnected_at),
          ));
        const remaining = await db
          .select({ user_id: audioCircleParticipantsTable.user_id })
          .from(audioCircleParticipantsTable)
          .where(and(
            eq(audioCircleParticipantsTable.session_id, sessionId),
            isNull(audioCircleParticipantsTable.left_at),
          ));
        sendToCircleParticipants(remaining.map((p) => p.user_id), {
          type: "circle_host_disconnected",
          payload: { session_id: sessionId, grace_period_ms: HOST_GRACE_PERIOD_MS },
        });
        logger.info({ session_id: sessionId }, "circle: host ghost — started 90s grace");
      }

      // After grace: no live host/co-host (by last_seen) → end.
      // Co-host promotion on explicit host leave remains in audio-circles.
      const [fresh] = await db
        .select()
        .from(audioCircleSessionsTable)
        .where(eq(audioCircleSessionsTable.id, sessionId))
        .limit(1);

      if (fresh?.host_disconnected_at) {
        const elapsed = Date.now() - new Date(fresh.host_disconnected_at).getTime();
        if (elapsed >= HOST_GRACE_PERIOD_MS) {
          const modRows = await db
            .select({
              last_seen_at: audioCircleParticipantsTable.last_seen_at,
            })
            .from(audioCircleParticipantsTable)
            .where(and(
              eq(audioCircleParticipantsTable.session_id, sessionId),
              isNull(audioCircleParticipantsTable.left_at),
              inArray(audioCircleParticipantsTable.role, ["host", "co_host"]),
            ));
          const liveMods = modRows.filter(
            (m) => m.last_seen_at != null && m.last_seen_at >= cutoff,
          );
          if (liveMods.length === 0) {
            await endSessionFromHeartbeat(sessionId, "no_host_or_cohost_90s");
            return res.status(204).send();
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err, session_id: sessionId }, "circle: lifecycle sweep failed");
  }

  return res.status(204).send();
});

export default router;
