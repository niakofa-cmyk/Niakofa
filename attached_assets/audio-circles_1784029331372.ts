/**
 * Niakofa Audio Circles — live voice (optionally video) rooms.
 *
 * One circle per neighborhood (via city_neighborhoods) plus one city-wide
 * circle, all scoped by the same normalized city_key that
 * community-neighborhoods.ts already uses. A circle is the permanent
 * "channel"; audio_circle_sessions are individual live broadcasts inside it.
 *
 * This router owns REST lifecycle (create/join/leave/roles/recording).
 * Real-time signaling (WebRTC offer/answer/ICE) and room-state broadcasts
 * (hand raised, role changed, reactions) go over the existing WebSocket hub
 * — see lib/ws-hub.ts's circle_* event types and sendCircleSignal /
 * sendToCircleParticipants. The server never touches actual audio/video —
 * peers connect directly to each other (mesh) once signaling completes.
 */
import { Router } from "express";
import { z } from "zod";
import {
  db,
  audioCirclesTable,
  audioCircleSessionsTable,
  audioCircleParticipantsTable,
  cityNeighborhoodsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { normalizeCityKey, ensureNeighborhoodsForCity } from "./community-neighborhoods";
import {
  sendToCircleParticipants,
  addCircleParticipant,
  removeCircleParticipant,
  clearCircleSession,
} from "../lib/ws-hub";
import { logger } from "../lib/logger";

const router = Router();

const MAX_TITLE_LEN = 140;
const MAX_EMOJI_LEN = 8;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getActiveParticipants(sessionId: number) {
  return db
    .select({
      user_id: audioCircleParticipantsTable.user_id,
      role: audioCircleParticipantsTable.role,
      hand_raised: audioCircleParticipantsTable.hand_raised,
      muted: audioCircleParticipantsTable.muted,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
    })
    .from(audioCircleParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, audioCircleParticipantsTable.user_id))
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), isNull(audioCircleParticipantsTable.left_at)));
}

async function getLiveSession(circleId: number) {
  const [session] = await db
    .select()
    .from(audioCircleSessionsTable)
    .where(and(eq(audioCircleSessionsTable.circle_id, circleId), eq(audioCircleSessionsTable.status, "live")))
    .limit(1);
  return session ?? null;
}

/** Loads a session and verifies `userId` is currently an active participant with `requiredRole` (if given). */
async function requireActiveParticipant(sessionId: number, userId: number, requiredRole?: "host") {
  const [session] = await db
    .select()
    .from(audioCircleSessionsTable)
    .where(eq(audioCircleSessionsTable.id, sessionId))
    .limit(1);
  if (!session || session.status !== "live") return { session: null, participant: null } as const;

  const [participant] = await db
    .select()
    .from(audioCircleParticipantsTable)
    .where(
      and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        eq(audioCircleParticipantsTable.user_id, userId),
        isNull(audioCircleParticipantsTable.left_at)
      )
    )
    .limit(1);
  if (!participant) return { session, participant: null } as const;
  if (requiredRole === "host" && participant.role !== "host") return { session, participant: null } as const;
  return { session, participant } as const;
}

// ── Browse ───────────────────────────────────────────────────────────────────

/**
 * DATA-LOSS FIX (Circles "disappearing"): migration 0064 seeded audio_circles
 * rows for Fort Worth exactly once, as a one-time INSERT. No other code path
 * ever created an audio_circles row after that — so every city besides a
 * literal "Fort Worth" showed "No circles yet" forever, which reads to a
 * user as their circles having vanished once their real city (or a
 * different search) replaced the Fort Worth fallback.
 *
 * This makes circle creation self-healing and permanent, the same pattern
 * city_neighborhoods already uses in community-neighborhoods.ts:
 *   1. Make sure this city has neighborhoods (reuses that same cache-or-
 *      generate logic — never duplicates it).
 *   2. Upsert one circle per neighborhood + the city-wide circle, via
 *      ON CONFLICT DO NOTHING against the unique indexes added in
 *      migration 0073 — safe under concurrent requests for a brand-new
 *      city (two users searching the same new city at once can't create
 *      duplicate circles or crash on a race).
 *
 * Every insert here is a normal DB write: once a circle exists it is a
 * permanent row, unaffected by refresh, navigation, logout, or which page
 * the user is on. Nothing about this function ever deletes a circle.
 *
 * Fails open: any error here is logged and swallowed so a hiccup (nia-
 * service down, network blip) degrades to "show whatever already exists"
 * rather than a 500 — consistent with how the rest of this route already
 * treats failures as "don't erase what's on screen."
 */
async function ensureCirclesForCity(cityRaw: string, cityKey: string) {
  try {
    // Reuses community-neighborhoods.ts's own cache-or-generate logic so
    // there is exactly one place that knows how to populate a city's
    // neighborhoods — Circles just piggybacks on the result.
    await ensureNeighborhoodsForCity(cityRaw, cityKey);

    // One circle per neighborhood this city_key now has (curated or
    // freshly generated). ON CONFLICT DO NOTHING makes re-running this on
    // every request cheap and safe — it's a no-op once circles exist.
    await db.execute(sql`
      INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
      SELECT cn.city_key, cn.city_display, cn.id, cn.name || ' Circle'
      FROM city_neighborhoods cn
      WHERE cn.city_key = ${cityKey}
      ON CONFLICT (neighborhood_id) WHERE neighborhood_id IS NOT NULL DO NOTHING
    `);

    // The one city-wide circle (neighborhood_id IS NULL), always available
    // even before/if neighborhood generation ever succeeds for this city.
    await db.execute(sql`
      INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
      VALUES (${cityKey}, ${cityRaw}, NULL, ${cityRaw + " Circle"})
      ON CONFLICT (city_key) WHERE neighborhood_id IS NULL DO NOTHING
    `);
  } catch (err) {
    logger.error({ err, city: cityRaw }, "audio-circles: ensureCirclesForCity failed — showing whatever already exists");
  }
}

// GET /audio-circles?city=Fort+Worth — every circle for this city (each
// neighborhood's circle, plus the city-wide one), with live-session summary.
router.get("/audio-circles", requireAuth, generalApiLimiter, async (req, res) => {
  const cityRaw = (req.query.city as string | undefined)?.trim();
  if (!cityRaw) return res.status(400).json({ error: "city query param is required" });
  const cityKey = normalizeCityKey(cityRaw);
  if (!cityKey) return res.json({ circles: [] });

  await ensureCirclesForCity(cityRaw, cityKey);

  const circles = await db
    .select({
      id: audioCirclesTable.id,
      city_key: audioCirclesTable.city_key,
      city_display: audioCirclesTable.city_display,
      neighborhood_id: audioCirclesTable.neighborhood_id,
      name: audioCirclesTable.name,
      neighborhood_name: cityNeighborhoodsTable.name,
      neighborhood_emoji: cityNeighborhoodsTable.emoji,
    })
    .from(audioCirclesTable)
    .leftJoin(cityNeighborhoodsTable, eq(cityNeighborhoodsTable.id, audioCirclesTable.neighborhood_id))
    .where(eq(audioCirclesTable.city_key, cityKey));

  const withLiveInfo = await Promise.all(
    circles.map(async (c) => {
      const live = await getLiveSession(c.id);
      if (!live) return { ...c, live_session: null };
      const participants = await getActiveParticipants(live.id);
      // host_id can be null (data-loss fix: onDelete "set null" if the host's
      // account was deleted) — skip the lookup rather than querying with null.
      const host = live.host_id != null
        ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, live.host_id)).limit(1))[0]
        : undefined;
      return {
        ...c,
        live_session: {
          id: live.id,
          title: live.title,
          host_id: live.host_id,
          host_name: host?.name ?? "Someone",
          video_enabled: live.video_enabled,
          is_recording: live.is_recording,
          started_at: live.started_at,
          speaker_count: participants.filter(p => p.role === "host" || p.role === "speaker").length,
          listener_count: participants.filter(p => p.role === "listener").length,
        },
      };
    })
  );

  return res.json({ circles: withLiveInfo, city_key: cityKey, city_display: cityRaw });
});

// GET /audio-circles/:id — one circle + its live session + full participant list.
router.get("/audio-circles/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });

  const [circle] = await db.select().from(audioCirclesTable).where(eq(audioCirclesTable.id, circleId)).limit(1);
  if (!circle) return res.status(404).json({ error: "Circle not found" });

  const live = await getLiveSession(circleId);
  if (!live) return res.json({ circle, live_session: null, participants: [] });

  const participants = await getActiveParticipants(live.id);
  return res.json({ circle, live_session: live, participants });
});

// GET /audio-circle-sessions/:id — session + circle + participants, for the
// room page to load its initial state directly by session id (as opposed to
// GET /audio-circles/:id, which is keyed by the permanent circle/channel).
router.get("/audio-circle-sessions/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });

  const [circle] = await db.select().from(audioCirclesTable).where(eq(audioCirclesTable.id, session.circle_id)).limit(1);
  const participants = session.status === "live" ? await getActiveParticipants(sessionId) : [];

  return res.json({ session, circle: circle ?? null, participants });
});

// ── Session lifecycle ───────────────────────────────────────────────────────

const StartSessionBody = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LEN),
  video_enabled: z.boolean().optional(),
});

// POST /audio-circles/:id/start — any approved user can host. Fails with 409
// if this circle already has a live session (join that one instead).
router.post("/audio-circles/:id/start", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

  const [circle] = await db.select().from(audioCirclesTable).where(eq(audioCirclesTable.id, circleId)).limit(1);
  if (!circle) return res.status(404).json({ error: "Circle not found" });

  const existingLive = await getLiveSession(circleId);
  if (existingLive) return res.status(409).json({ error: "This circle already has a live session — join it instead", session_id: existingLive.id });

  const hostId = req.authenticatedUserId!;
  const [session] = await db
    .insert(audioCircleSessionsTable)
    .values({ circle_id: circleId, host_id: hostId, title: parsed.data.title, video_enabled: parsed.data.video_enabled ?? false })
    .returning();
  if (!session) return res.status(500).json({ error: "Failed to start session" });

  await db.insert(audioCircleParticipantsTable).values({ session_id: session.id, user_id: hostId, role: "host" });
  addCircleParticipant(session.id, hostId);

  const [host] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url }).from(usersTable).where(eq(usersTable.id, hostId)).limit(1);

  logger.info({ session_id: session.id, circle_id: circleId, host_id: hostId }, "audio-circles: session started");
  return res.status(201).json({ session, host_name: host?.name ?? null });
});

// POST /audio-circle-sessions/:id/join — join as a listener. Idempotent —
// rejoining after a leave is fine (re-inserts a fresh participant row).
router.post("/audio-circle-sessions/:id/join", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session || session.status !== "live") return res.status(404).json({ error: "Session not live" });

  const [existing] = await db
    .select()
    .from(audioCircleParticipantsTable)
    .where(
      and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        eq(audioCircleParticipantsTable.user_id, userId),
        isNull(audioCircleParticipantsTable.left_at)
      )
    )
    .limit(1);

  let participant = existing;
  if (!participant) {
    const [inserted] = await db
      .insert(audioCircleParticipantsTable)
      .values({ session_id: sessionId, user_id: userId, role: "listener" })
      .returning();
    participant = inserted;
  }
  if (!participant) return res.status(500).json({ error: "Failed to join" });

  addCircleParticipant(sessionId, userId);

  const [user] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const activeParticipants = await getActiveParticipants(sessionId);
  const otherUserIds = activeParticipants.map(p => p.user_id).filter(id => id !== userId);

  sendToCircleParticipants(otherUserIds, {
    type: "circle_participant_joined",
    payload: { session_id: sessionId, user_id: userId, name: user?.name, avatar_url: user?.avatar_url, role: participant.role },
  });

  return res.json({ participant, participants: activeParticipants });
});

// POST /audio-circle-sessions/:id/leave — leave (host leaving ends the session).
router.post("/audio-circle-sessions/:id/leave", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.json({ ok: true }); // already left — idempotent

  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(eq(audioCircleParticipantsTable.id, participant.id));
  removeCircleParticipant(sessionId, userId);

  if (participant.role === "host") {
    // Host leaving ends the whole session — same "room closes when the show
    // ends" model as a real call-in show, rather than leaving it orphaned
    // with no one able to run it.
    await endSessionInternal(session.id);
    return res.json({ ok: true, session_ended: true });
  }

  const remaining = await getActiveParticipants(sessionId);
  sendToCircleParticipants(remaining.map(p => p.user_id), {
    type: "circle_participant_left",
    payload: { session_id: sessionId, user_id: userId },
  });
  return res.json({ ok: true });
});

async function endSessionInternal(sessionId: number) {
  const activeParticipants = await getActiveParticipants(sessionId);
  await db
    .update(audioCircleSessionsTable)
    .set({ status: "ended", ended_at: new Date() })
    .where(eq(audioCircleSessionsTable.id, sessionId));
  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), isNull(audioCircleParticipantsTable.left_at)));
  clearCircleSession(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_session_ended",
    payload: { session_id: sessionId },
  });
}

// POST /audio-circle-sessions/:id/end — host ends the session for everyone.
router.post("/audio-circle-sessions/:id/end", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const { session, participant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "Only the host can end this session" });
  await endSessionInternal(sessionId);
  return res.json({ ok: true });
});

// ── Hand raising & speaker roles ─────────────────────────────────────────────

const HandRaiseBody = z.object({ raised: z.boolean() });

// POST /audio-circle-sessions/:id/hand — listener raises/lowers their hand
// to ask for a turn to speak.
router.post("/audio-circle-sessions/:id/hand", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = HandRaiseBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "raised must be a boolean" });

  const userId = req.authenticatedUserId!;
  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "You're not in this session" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ hand_raised: parsed.data.raised })
    .where(eq(audioCircleParticipantsTable.id, participant.id));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_hand_raised",
    payload: { session_id: sessionId, user_id: userId, raised: parsed.data.raised },
  });
  return res.json({ ok: true });
});

const RoleChangeBody = z.object({ user_id: z.number().int().positive() });

// POST /audio-circle-sessions/:id/promote — host moves a listener to
// speaker. Enforces the session's max_speakers cap (host + up to 12 more =
// 13 total mic slots, matching "add up to 13 speakers at once").
router.post("/audio-circle-sessions/:id/promote", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RoleChangeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const { session, participant: hostParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!hostParticipant) return res.status(403).json({ error: "Only the host can promote speakers" });

  const activeParticipants = await getActiveParticipants(sessionId);
  const currentSpeakerCount = activeParticipants.filter(p => p.role === "host" || p.role === "speaker").length;
  if (currentSpeakerCount >= session.max_speakers) {
    return res.status(409).json({ error: `This room already has the maximum of ${session.max_speakers} speakers` });
  }

  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "speaker", hand_raised: false })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_role_changed",
    payload: { session_id: sessionId, user_id: parsed.data.user_id, role: "speaker" },
  });
  return res.json({ ok: true });
});

// POST /audio-circle-sessions/:id/demote — host moves a speaker back to
// listener, or a speaker demotes themselves.
router.post("/audio-circle-sessions/:id/demote", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RoleChangeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const userId = req.authenticatedUserId!;
  const { session, participant: actingParticipant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!actingParticipant) return res.status(403).json({ error: "You're not in this session" });

  const isSelf = parsed.data.user_id === userId;
  const isHost = actingParticipant.role === "host";
  if (!isSelf && !isHost) return res.status(403).json({ error: "Only the host can demote another speaker" });
  if (isSelf && actingParticipant.role === "host") {
    return res.status(400).json({ error: "The host can't demote themselves — end the session instead" });
  }

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "listener" })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_role_changed",
    payload: { session_id: sessionId, user_id: parsed.data.user_id, role: "listener" },
  });
  return res.json({ ok: true });
});

// ── Reactions ────────────────────────────────────────────────────────────────

const ReactionBody = z.object({ emoji: z.string().trim().min(1).max(MAX_EMOJI_LEN) });

// POST /audio-circle-sessions/:id/react — ephemeral emoji reaction, never
// persisted to the DB (same "transient UI feedback, not a data record"
// reasoning as elsewhere in this app) — just a WS broadcast.
router.post("/audio-circle-sessions/:id/react", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = ReactionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "emoji is required" });

  const userId = req.authenticatedUserId!;
  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "You're not in this session" });

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_reaction",
    payload: { session_id: sessionId, user_id: userId, emoji: parsed.data.emoji },
  });
  return res.json({ ok: true });
});

// ── Recording ────────────────────────────────────────────────────────────────
// Recording itself happens client-side (Web Audio API mixing all peer tracks
// + MediaRecorder — see lib/webrtcMesh.ts), since there's no media server in
// this architecture to record server-side. These endpoints just track state
// and the final uploaded URL.

const RecordingStateBody = z.object({ is_recording: z.boolean() });

// POST /audio-circle-sessions/:id/recording — host starts/stops recording.
router.post("/audio-circle-sessions/:id/recording", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RecordingStateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "is_recording must be a boolean" });

  const { session, participant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "Only the host can control recording" });

  await db.update(audioCircleSessionsTable).set({ is_recording: parsed.data.is_recording }).where(eq(audioCircleSessionsTable.id, sessionId));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_recording_changed",
    payload: { session_id: sessionId, is_recording: parsed.data.is_recording },
  });
  return res.json({ ok: true });
});

const RecordingUrlBody = z.object({ recording_url: z.string().url().max(2048) });

// POST /audio-circle-sessions/:id/recording-url — host submits the final
// recording URL after their client finishes uploading it (e.g. to whatever
// object storage this deployment uses — out of scope here; this endpoint
// just records the resulting URL once the client has one).
router.post("/audio-circle-sessions/:id/recording-url", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RecordingUrlBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "recording_url must be a valid URL" });

  const userId = req.authenticatedUserId!;
  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.host_id !== userId) return res.status(403).json({ error: "Only the host can attach a recording" });

  await db.update(audioCircleSessionsTable).set({ recording_url: parsed.data.recording_url }).where(eq(audioCircleSessionsTable.id, sessionId));
  return res.json({ ok: true });
});

// GET /audio-circles/:id/recordings — past recordings for this circle.
router.get("/audio-circles/:id/recordings", requireAuth, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });

  // FIX (data-loss audit, follow-up): host_id is now onDelete "set null"
  // (see lib/db/migrations/0068_fix_content_cascade_deletes.sql) — a
  // completed session whose host later deleted their account has
  // host_id = NULL. The old INNER JOIN silently excluded that entire
  // recording from the archive, which is exactly the kind of disappearance
  // the migration was meant to prevent. LEFT JOIN keeps the recording;
  // host_name just comes back null for an orphaned host.
  const recordings = await db
    .select({
      id: audioCircleSessionsTable.id,
      title: audioCircleSessionsTable.title,
      host_id: audioCircleSessionsTable.host_id,
      host_name: usersTable.name,
      recording_url: audioCircleSessionsTable.recording_url,
      started_at: audioCircleSessionsTable.started_at,
      ended_at: audioCircleSessionsTable.ended_at,
    })
    .from(audioCircleSessionsTable)
    .leftJoin(usersTable, eq(usersTable.id, audioCircleSessionsTable.host_id))
    .where(
      and(
        eq(audioCircleSessionsTable.circle_id, circleId),
        eq(audioCircleSessionsTable.status, "ended"),
        sql`${audioCircleSessionsTable.recording_url} IS NOT NULL`
      )
    )
    .orderBy(desc(audioCircleSessionsTable.ended_at))
    .limit(50);

  return res.json({ recordings });
});

export default router;
