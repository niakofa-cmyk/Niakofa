/**
 * Circle presence heartbeat route.
 *
 * POST /audio-circle-sessions/:id/heartbeat — called by each active
 * participant every 30s to prove they are still in the room. Updates
 * last_seen_at so a lazy sweep can mark ghost participants (crashed tabs,
 * backgrounded mobile browsers) as left without relying solely on WS
 * disconnect events, which can be dropped on flaky networks.
 *
 * This also broadcasts the active-speaker ID if the client includes it.
 * The client sends its current loudest-speaking peer_user_id (from the
 * Web Audio volume analyser) so the server can fanout a circle_active_speaker
 * event — letting every OTHER participant highlight the correct tile without
 * running their own cross-peer audio analysis.
 */
import { Router } from "express";
import { z } from "zod";
import { db, audioCircleParticipantsTable } from "@workspace/db";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { sendToCircleParticipants } from "../lib/ws-hub";
import { logger } from "../lib/logger";

const router = Router();

const HeartbeatBody = z.object({
  /** The user_id of whichever peer this client currently hears loudest. Null when no one is speaking. */
  active_speaker_id: z.number().int().positive().nullable().optional(),
});

// POST /audio-circle-sessions/:id/heartbeat
// Rate-limit friendly (one call per participant per 30s) — does not require
// requireApproved because heartbeats must work for all roles.
router.post("/audio-circle-sessions/:id/heartbeat", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const userId = req.authenticatedUserId!;
  const parsed = HeartbeatBody.safeParse(req.body);
  const activeSpeakerId = parsed.success ? (parsed.data.active_speaker_id ?? null) : null;

  // Update last_seen_at for this participant (must still be in the session).
  const result = await db
    .update(audioCircleParticipantsTable)
    .set({ last_seen_at: new Date() })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, userId),
      isNull(audioCircleParticipantsTable.left_at),
    ))
    .returning({ id: audioCircleParticipantsTable.id });

  // If the participant isn't found (already left or session ended), 204 is
  // fine — the client will stop heartbeating when it navigates away anyway.
  if (result.length === 0) return res.status(204).send();

  // Broadcast active speaker ID when supplied so other clients can highlight
  // the correct tile without running their own cross-peer audio analysis.
  if (activeSpeakerId !== null) {
    const allActive = await db
      .select({ user_id: audioCircleParticipantsTable.user_id })
      .from(audioCircleParticipantsTable)
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        isNull(audioCircleParticipantsTable.left_at),
      ));
    sendToCircleParticipants(allActive.map(p => p.user_id), {
      type: "circle_active_speaker",
      payload: { session_id: sessionId, user_id: activeSpeakerId, reporter_id: userId },
    });
  }

  // ── Lazy ghost-participant sweep ──────────────────────────────────────────
  // Any participant whose last_seen_at is older than 90s is considered gone
  // (their WS disconnect was missed). Mark them as left and broadcast a leave
  // event so the audience count and participant list stay accurate.
  // We only sweep once per heartbeat (not a background worker) to avoid the
  // need for a separate process. The 90s threshold matches HOST_GRACE_PERIOD_MS.
  const GHOST_THRESHOLD_MS = 90_000;
  const cutoff = new Date(Date.now() - GHOST_THRESHOLD_MS);
  try {
    const ghosts = await db
      .update(audioCircleParticipantsTable)
      .set({ left_at: new Date() })
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        isNull(audioCircleParticipantsTable.left_at),
        lt(audioCircleParticipantsTable.last_seen_at, cutoff),
        // Never sweep the host — they have their own grace-period mechanism.
        sql`${audioCircleParticipantsTable.role} != 'host'`,
      ))
      .returning({ user_id: audioCircleParticipantsTable.user_id });

    if (ghosts.length > 0) {
      const remaining = await db
        .select({ user_id: audioCircleParticipantsTable.user_id })
        .from(audioCircleParticipantsTable)
        .where(and(
          eq(audioCircleParticipantsTable.session_id, sessionId),
          isNull(audioCircleParticipantsTable.left_at),
        ));
      for (const ghost of ghosts) {
        sendToCircleParticipants(remaining.map(p => p.user_id), {
          type: "circle_participant_left",
          payload: { session_id: sessionId, user_id: ghost.user_id },
        });
        logger.info({ session_id: sessionId, user_id: ghost.user_id }, "circle: ghost participant swept");
      }
    }
  } catch (err) {
    // Ghost sweep failing is non-critical — log and continue.
    logger.warn({ err, session_id: sessionId }, "circle: ghost sweep failed");
  }

  return res.status(204).send();
});

export default router;
