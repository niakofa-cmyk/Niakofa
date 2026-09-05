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
import { getPrivateAssetUrl } from "../lib/storage";
import { finalizeRecording } from "../lib/circleRecordingPolicy";
import {
  db,
  audioCirclesTable,
  audioCircleSessionsTable,
  audioCircleParticipantsTable,
  audioCircleFollowsTable,
  audioCircleMessagesTable,
  circleBlocksTable,
  circleReportsTable,
  circleRecordingsTable,
  cityNeighborhoodsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, isNull, desc, asc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { normalizeCityKey, ensureNeighborhoodsForCity } from "./community-neighborhoods";
import {
  sendToUser,
  sendToCircleParticipants,
  addCircleParticipant,
  removeCircleParticipant,
  clearCircleSession,
} from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { CircleStartLocationBody, verifyCircleStartLocation } from "../lib/circleLocationPolicy";
import { requestCircleSummary } from "./nia-proxy";

const router = Router();

// Kept for direct router embedding in focused lifecycle tests and local
// integrations. The application-wide normalizer in routes/index.ts is the
// canonical path and covers the sibling Circle routers as well.
router.use((req, _res, next) => {
  req.url = req.url
    .replace(/^\/audio-spiral-sessions(?=\/|$)/, "/audio-circle-sessions")
    .replace(/^\/audio-spirals(?=\/|$)/, "/audio-circles");
  next();
});

const MAX_TITLE_LEN = 140;
const MAX_DESC_LEN = 500;
const MAX_TOPIC_LEN = 100;
const MAX_EMOJI_LEN = 8;
const MAX_CHAT_LEN = 500; // characters per ephemeral chat message
// How long a host has to reconnect (e.g. after a page refresh) before the
// session is actually ended. See migration 0074 — this is what stops an
// accidental refresh from instantly killing the room for every other
// participant, while still not letting a session that's genuinely
// abandoned by its host run forever.
const HOST_GRACE_PERIOD_MS = 90_000;
const HOST_FAILOVER_LOCK_KEY = 913_004;

// ── Helpers ──────────────────────────────────────────────────────────────────

// A room-state response must stay bounded even when a malicious or broken
// client has produced an unusually large participant set.
const MAX_PARTICIPANTS_PER_QUERY = 500;

async function getActiveParticipants(sessionId: number) {
  return db
    .select({
      user_id: audioCircleParticipantsTable.user_id,
      role: audioCircleParticipantsTable.role,
      hand_raised: audioCircleParticipantsTable.hand_raised,
      hand_raised_at: audioCircleParticipantsTable.hand_raised_at,
      muted: audioCircleParticipantsTable.muted,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
    })
    .from(audioCircleParticipantsTable)
    .innerJoin(usersTable, eq(usersTable.id, audioCircleParticipantsTable.user_id))
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), isNull(audioCircleParticipantsTable.left_at)))
    .limit(MAX_PARTICIPANTS_PER_QUERY);
}

async function getActiveParticipantCounts(
  sessionIds: number[]
): Promise<Map<number, { speaker_count: number; listener_count: number }>> {
  const result = new Map<number, { speaker_count: number; listener_count: number }>();
  if (sessionIds.length === 0) return result;

  const rows = await db
    .select({
      session_id: audioCircleParticipantsTable.session_id,
      role: audioCircleParticipantsTable.role,
      count: sql<number>`count(*)`,
    })
    .from(audioCircleParticipantsTable)
    .where(and(
      inArray(audioCircleParticipantsTable.session_id, sessionIds),
      isNull(audioCircleParticipantsTable.left_at),
    ))
    .groupBy(audioCircleParticipantsTable.session_id, audioCircleParticipantsTable.role);

  for (const row of rows) {
    const counts = result.get(row.session_id) ?? { speaker_count: 0, listener_count: 0 };
    const count = Number(row.count);
    if (row.role === "host" || row.role === "speaker" || row.role === "co_host") counts.speaker_count += count;
    else if (row.role === "listener") counts.listener_count += count;
    result.set(row.session_id, counts);
  }
  return result;
}

/**
 * Lazily ends a session whose host disconnected and never came back within
 * the grace period. Called from every read path that loads a "live" session
 * so this doesn't need its own background worker — the first request to
 * touch an expired session after the window closes is what actually ends it.
 *
 * HOST FAILOVER: If a co-host exists when the grace period expires, the
 * co-host is auto-promoted to host instead of ending the session. This
 * keeps the room alive for all participants when the original host drops
 * and doesn't return. The session's host_id is updated to the new host.
 */
async function expireIfHostGraceElapsed(session: typeof audioCircleSessionsTable.$inferSelect) {
  if (!session.host_disconnected_at) return session;
  const elapsed = Date.now() - new Date(session.host_disconnected_at).getTime();
  if (elapsed < HOST_GRACE_PERIOD_MS) return session;

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${HOST_FAILOVER_LOCK_KEY}, ${session.id})`);
    const [current] = await tx.select().from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.id, session.id)).limit(1);
    if (!current || !current.host_disconnected_at || current.status !== "live") {
      return { status: "already_resolved" as const };
    }
    if (Date.now() - new Date(current.host_disconnected_at).getTime() < HOST_GRACE_PERIOD_MS) {
      return { status: "not_expired" as const, session: current };
    }
    // Important: use the value read *after* acquiring the transaction lock;
    // never apply an optimistic guard captured from the stale caller input.
    const guard = current.host_disconnected_at;
    // Co-host selection is deliberately independent of the bounded broadcast
    // participant list: a room with many listeners must still promote the
    // deterministic earliest active co-host.
    const [cohost] = await tx.select({
      user_id: audioCircleParticipantsTable.user_id,
    }).from(audioCircleParticipantsTable).where(and(
      eq(audioCircleParticipantsTable.session_id, session.id),
      eq(audioCircleParticipantsTable.role, "co_host"),
      isNull(audioCircleParticipantsTable.left_at),
    )).orderBy(asc(audioCircleParticipantsTable.id)).limit(1);
    if (cohost) {
      const promoted = await tx.update(audioCircleSessionsTable)
        .set({ host_id: cohost.user_id, host_disconnected_at: null })
        .where(and(
          eq(audioCircleSessionsTable.id, session.id),
          eq(audioCircleSessionsTable.host_disconnected_at, guard),
        ))
        .returning({ id: audioCircleSessionsTable.id });
      if (!promoted.length) return { status: "already_resolved" as const };
      await tx.update(audioCircleParticipantsTable).set({ role: "host" }).where(and(
        eq(audioCircleParticipantsTable.session_id, session.id),
        eq(audioCircleParticipantsTable.user_id, cohost.user_id),
      ));
      const activeParticipants = await tx.select({ user_id: audioCircleParticipantsTable.user_id })
        .from(audioCircleParticipantsTable).where(and(
          eq(audioCircleParticipantsTable.session_id, session.id),
          isNull(audioCircleParticipantsTable.left_at),
        )).limit(MAX_PARTICIPANTS_PER_QUERY);
      return { status: "promoted" as const, newHostId: cohost.user_id, participantIds: activeParticipants.map((p) => p.user_id) };
    }
    const ended = await tx.update(audioCircleSessionsTable)
      .set({ status: "ended", ended_at: new Date() })
      .where(and(
        eq(audioCircleSessionsTable.id, session.id),
        eq(audioCircleSessionsTable.host_disconnected_at, guard),
      ))
      .returning({ id: audioCircleSessionsTable.id });
    return ended.length ? { status: "ended" as const } : { status: "already_resolved" as const };
  });

  if (outcome.status === "already_resolved") {
    const [fresh] = await db.select().from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.id, session.id)).limit(1);
    return fresh ?? { ...session, status: "ended" as const };
  }
  if (outcome.status === "not_expired") return outcome.session;
  if (outcome.status === "promoted") {
    sendToCircleParticipants(outcome.participantIds, {
      type: "circle_host_transfer",
      payload: {
        session_id: session.id,
        new_host_id: outcome.newHostId,
        former_host_id: session.host_id,
        auto: true,
      },
    });

    logger.info({
      session_id: session.id,
      former_host_id: session.host_id,
      new_host_id: outcome.newHostId,
    }, "audio-circles: host failover — co-host auto-promoted");
    return { ...session, host_id: outcome.newHostId, host_disconnected_at: null };
  }
  await endSessionInternal(session.id);
  return { ...session, status: "ended" as const };
}

async function getLiveSession(circleId: number) {
  const [session] = await db
    .select()
    .from(audioCircleSessionsTable)
    .where(and(eq(audioCircleSessionsTable.circle_id, circleId), eq(audioCircleSessionsTable.status, "live")))
    .limit(1);
  if (!session) return null;
  const checked = await expireIfHostGraceElapsed(session);
  return checked.status === "live" ? checked : null;
}

/**
 * Loads a session and verifies `userId` is currently an active participant.
 * If requiredRole is "host", only the host passes. If "host_or_cohost", the
 * host or any co-host passes — used for moderation actions a co-host can
 * perform (promote, demote, mute, kick, block, lower hands).
 */
async function requireActiveParticipant(
  sessionId: number,
  userId: number,
  requiredRole?: "host" | "host_or_cohost"
) {
  const [rawSession] = await db
    .select()
    .from(audioCircleSessionsTable)
    .where(eq(audioCircleSessionsTable.id, sessionId))
    .limit(1);
  if (!rawSession || rawSession.status !== "live") return { session: null, participant: null } as const;
  const session = await expireIfHostGraceElapsed(rawSession);
  if (session.status !== "live") return { session: null, participant: null } as const;

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
  if (requiredRole === "host_or_cohost" && participant.role !== "host" && participant.role !== "co_host") {
    return { session, participant: null } as const;
  }
  return { session, participant } as const;
}

/** Structured moderation audit log entry. */
function logModerationAction(
  action: string,
  sessionId: number,
  actorId: number,
  targetId: number | null,
  extra?: Record<string, unknown>
) {
  logger.info({
    action,
    session_id: sessionId,
    actor_id: actorId,
    target_id: targetId,
    ...extra,
  }, `audio-circles: moderation action — ${action}`);
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
  await ensureNeighborhoodsForCity(cityRaw, cityKey);

  await db.execute(sql`
    INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
    SELECT cn.city_key, cn.city_display, cn.id, cn.name || ' Circle'
    FROM city_neighborhoods cn
    WHERE cn.city_key = ${cityKey}
    ON CONFLICT (neighborhood_id) WHERE neighborhood_id IS NOT NULL DO NOTHING
  `);

  await db.execute(sql`
    INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
    VALUES (${cityKey}, ${cityRaw}, NULL, ${cityRaw + " Circle"})
    ON CONFLICT (city_key) WHERE neighborhood_id IS NULL DO NOTHING
  `);
}

const PROVISION_COOLDOWN_MS = 60_000;
const recentlyProvisionedCities = new Map<string, number>();
function scheduleCityProvisioning(cityRaw: string, cityKey: string): void {
  const now = Date.now();
  const last = recentlyProvisionedCities.get(cityKey);
  if (last !== undefined && now - last < PROVISION_COOLDOWN_MS) return;
  recentlyProvisionedCities.set(cityKey, now);
  void ensureCirclesForCity(cityRaw, cityKey).catch((err) => {
    recentlyProvisionedCities.delete(cityKey);
    logger.error({ err, city: cityRaw }, "audio-circles: city provisioning failed; next browse will retry");
  });
}

// GET /audio-circles?city=Fort+Worth — every circle for this city (each
// neighborhood's circle, plus the city-wide one), with live-session summary.
// Circles with live sessions are sorted first ("Live Now" prioritization).
router.get("/audio-circles", requireAuth, generalApiLimiter, async (req, res) => {
  const cityRaw = (req.query.city as string | undefined)?.trim();
  if (!cityRaw) return res.status(400).json({ error: "city query param is required" });
  const cityKey = normalizeCityKey(cityRaw);
  if (!cityKey) return res.json({ circles: [] });

  scheduleCityProvisioning(cityRaw, cityKey);

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

  const userId = req.authenticatedUserId!;
  const circleIds = circles.map((circle) => circle.id);
  const rawLiveSessions = circleIds.length
    ? await db.select().from(audioCircleSessionsTable).where(and(
      inArray(audioCircleSessionsTable.circle_id, circleIds),
      eq(audioCircleSessionsTable.status, "live"),
    ))
    : [];
  const liveSessions = (await Promise.all(rawLiveSessions.map(expireIfHostGraceElapsed)))
    .filter((candidate): candidate is typeof audioCircleSessionsTable.$inferSelect => candidate.status === "live");
  const liveByCircle = new Map(liveSessions.map((live) => [live.circle_id, live]));
  const follows = circleIds.length
    ? await db.select({ circle_id: audioCircleFollowsTable.circle_id }).from(audioCircleFollowsTable).where(and(
      eq(audioCircleFollowsTable.user_id, userId),
      inArray(audioCircleFollowsTable.circle_id, circleIds),
    ))
    : [];
  const followedCircleIds = new Set(follows.map((follow) => follow.circle_id));
  const countsBySession = await getActiveParticipantCounts(liveSessions.map((live) => live.id));
  const hostIds = [...new Set(liveSessions.map((live) => live.host_id).filter((id): id is number => id != null))];
  const hosts = hostIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, hostIds))
    : [];
  const hostNames = new Map(hosts.map((host) => [host.id, host.name]));
  const withLiveInfo = circles.map((circle) => {
    const live = liveByCircle.get(circle.id);
    if (!live) return { ...circle, live_session: null, is_following: followedCircleIds.has(circle.id) };
    const counts = countsBySession.get(live.id) ?? { speaker_count: 0, listener_count: 0 };
    return {
      ...circle,
      live_session: {
        id: live.id, title: live.title, host_id: live.host_id,
        host_name: (live.host_id == null ? undefined : hostNames.get(live.host_id)) ?? "Someone",
        video_enabled: live.video_enabled, is_recording: live.is_recording,
        started_at: live.started_at, topic: live.topic ?? null, description: live.description ?? null,
        speaker_count: counts.speaker_count, listener_count: counts.listener_count,
      },
      is_following: followedCircleIds.has(circle.id),
    };
  });

  // Sort: circles with live sessions first ("Live Now" prioritization),
  // then by listener count (most active rooms first), then by name.
  withLiveInfo.sort((a, b) => {
    const aLive = !!a.live_session;
    const bLive = !!b.live_session;
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;
    if (aLive && bLive) {
      const aCount = (a.live_session!.listener_count ?? 0) + (a.live_session!.speaker_count ?? 0);
      const bCount = (b.live_session!.listener_count ?? 0) + (b.live_session!.speaker_count ?? 0);
      return bCount - aCount;
    }
    return a.name.localeCompare(b.name);
  });

  return res.json({ circles: withLiveInfo, city_key: cityKey, city_display: cityRaw });
});

// GET /audio-circles/followed — list all circles the current user follows.
router.get("/audio-circles/followed", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const followed = await db
    .select({
      id: audioCirclesTable.id,
      city_key: audioCirclesTable.city_key,
      city_display: audioCirclesTable.city_display,
      neighborhood_id: audioCirclesTable.neighborhood_id,
      name: audioCirclesTable.name,
      neighborhood_name: cityNeighborhoodsTable.name,
      neighborhood_emoji: cityNeighborhoodsTable.emoji,
    })
    .from(audioCircleFollowsTable)
    .innerJoin(audioCirclesTable, eq(audioCirclesTable.id, audioCircleFollowsTable.circle_id))
    .leftJoin(cityNeighborhoodsTable, eq(cityNeighborhoodsTable.id, audioCirclesTable.neighborhood_id))
    .where(eq(audioCircleFollowsTable.user_id, userId));
  return res.json({ followed });
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
// room page to load its initial state directly by session id.
router.get("/audio-circle-sessions/:id", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (session.status !== "live") return res.status(404).json({ error: "Session not found or no longer live" });

  const [circle] = await db.select().from(audioCirclesTable).where(eq(audioCirclesTable.id, session.circle_id)).limit(1);
  const participants = await getActiveParticipants(sessionId);

  return res.json({ session, circle: circle ?? null, participants });
});

// ── Session lifecycle ───────────────────────────────────────────────────────

const VALID_SPEAKER_LIMITS = [4, 8, 12, 13, 18, 24] as const;

const StartSessionBody = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LEN),
  description: z.string().trim().max(MAX_DESC_LEN).optional(),
  topic: z.string().trim().max(MAX_TOPIC_LEN).optional(),
  video_enabled: z.boolean().optional(),
  media_publish_policy: z.enum(["open", "moderated"]).optional(),
  max_speakers: z.number().int().refine(v => (VALID_SPEAKER_LIMITS as readonly number[]).includes(v), {
    message: `max_speakers must be one of ${VALID_SPEAKER_LIMITS.join(", ")}`,
  }).optional(),
  chat_enabled: z.boolean().optional(),
  recording_allowed: z.boolean().optional(),
  location: CircleStartLocationBody,
});

// POST /audio-circles/:id/start — any approved user can host.
router.post("/audio-circles/:id/start", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = StartSessionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

  const [circle] = await db.select().from(audioCirclesTable).where(eq(audioCirclesTable.id, circleId)).limit(1);
  if (!circle) return res.status(404).json({ error: "Circle not found" });

  const locationCheck = await verifyCircleStartLocation(circle.city_key, parsed.data.location, {
    userId: req.authenticatedUserId!,
    circleId,
  });
  if (!locationCheck.ok) {
    return res.status(403).json({ error: locationCheck.reason, code: locationCheck.code });
  }

  const existingLive = await getLiveSession(circleId);
  if (existingLive) return res.status(409).json({ error: "This circle already has a live session — join it instead", session_id: existingLive.id });

  const hostId = req.authenticatedUserId!;
  const [session] = await db
    .insert(audioCircleSessionsTable)
    .values({
      circle_id: circleId,
      host_id: hostId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      topic: parsed.data.topic ?? null,
      video_enabled: parsed.data.video_enabled ?? false,
      media_publish_policy: parsed.data.media_publish_policy ?? "open",
      max_speakers: parsed.data.max_speakers ?? 13,
      chat_enabled: parsed.data.chat_enabled ?? true,
      recording_allowed: parsed.data.recording_allowed ?? false,
    })
    .returning();
  if (!session) return res.status(500).json({ error: "Failed to start session" });

  await db.insert(audioCircleParticipantsTable).values({ session_id: session.id, user_id: hostId, role: "host" });
  addCircleParticipant(session.id, hostId);

  const [host] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url }).from(usersTable).where(eq(usersTable.id, hostId)).limit(1);

  logger.info({ session_id: session.id, circle_id: circleId, host_id: hostId }, "audio-circles: session started");

  try {
    const followers = await db
      .select({ user_id: audioCircleFollowsTable.user_id })
      .from(audioCircleFollowsTable)
      .where(eq(audioCircleFollowsTable.circle_id, circleId));
    for (const f of followers) {
      if (f.user_id !== hostId) {
        sendToUser(f.user_id, {
          type: "circle_went_live",
          payload: {
            session_id: session.id,
            circle_id: circleId,
            circle_name: circle.name,
            title: session.title,
            host_id: hostId,
            host_name: host?.name ?? "Someone",
            video_enabled: session.video_enabled,
          },
        });
      }
    }
  } catch (err) {
    logger.warn({ err, circle_id: circleId }, "audio-circles: failed to notify followers of went-live");
  }

  return res.status(201).json({ session, host_name: host?.name ?? null });
});

// POST /audio-circle-sessions/:id/join — join as a listener. Idempotent.
router.post("/audio-circle-sessions/:id/join", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const [rawSession] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!rawSession || rawSession.status !== "live") return res.status(404).json({ error: "Session not live" });
  const session = await expireIfHostGraceElapsed(rawSession);
  if (session.status !== "live") return res.status(404).json({ error: "Session not live" });

  // Check if this user is blocked by the host.
  if (session.host_id != null) {
    const [block] = await db
      .select({ id: circleBlocksTable.id })
      .from(circleBlocksTable)
      .where(and(eq(circleBlocksTable.host_id, session.host_id), eq(circleBlocksTable.blocked_user_id, userId)))
      .limit(1);
    if (block) return res.status(403).json({ error: "You have been blocked from this host's circles" });
  }

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

  // If this is the original host reconnecting within the grace period,
  // clear the disconnect flag.
  if (userId === session.host_id && session.host_disconnected_at) {
    await db
      .update(audioCircleSessionsTable)
      .set({ host_disconnected_at: null })
      .where(eq(audioCircleSessionsTable.id, sessionId));
    const activeParticipants = await getActiveParticipants(sessionId);
    sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
      type: "circle_host_reconnected",
      payload: { session_id: sessionId },
    });
  }

  const [user] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const activeParticipants = await getActiveParticipants(sessionId);
  const otherUserIds = activeParticipants.map(p => p.user_id).filter(id => id !== userId);

  sendToCircleParticipants(otherUserIds, {
    type: "circle_participant_joined",
    payload: { session_id: sessionId, user_id: userId, name: user?.name, avatar_url: user?.avatar_url, role: participant.role },
  });

  return res.json({ participant, participants: activeParticipants });
});

// POST /audio-circle-sessions/:id/leave — listener leaves; host leaving starts
// a 90-second grace period instead of instantly ending the session.
router.post("/audio-circle-sessions/:id/leave", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.json({ ok: true });

  if (participant.role === "host") {
    removeCircleParticipant(sessionId, userId);
    await db
      .update(audioCircleSessionsTable)
      .set({ host_disconnected_at: new Date() })
      .where(eq(audioCircleSessionsTable.id, session.id));

    const remaining = await getActiveParticipants(sessionId);
    sendToCircleParticipants(remaining.map(p => p.user_id), {
      type: "circle_host_disconnected",
      payload: { session_id: sessionId, grace_period_ms: HOST_GRACE_PERIOD_MS },
    });
    return res.json({ ok: true, host_grace_period: true });
  }

  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(eq(audioCircleParticipantsTable.id, participant.id));
  removeCircleParticipant(sessionId, userId);

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

// POST /audio-circle-sessions/:id/end — host deliberately ends the session.
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

const HandRaiseBody = z.object({
  raised: z.boolean(),
  user_id: z.number().int().positive().optional(),
});

router.post("/audio-circle-sessions/:id/hand", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = HandRaiseBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "raised must be a boolean" });

  const actingUserId = req.authenticatedUserId!;
  const { session, participant: actingParticipant } = await requireActiveParticipant(sessionId, actingUserId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!actingParticipant) return res.status(403).json({ error: "You're not in this session" });

  const targetUserId = parsed.data.user_id ?? actingUserId;
  const isModerator = actingParticipant.role === "host" || actingParticipant.role === "co_host";
  if (targetUserId !== actingUserId && !isModerator) {
    return res.status(403).json({ error: "Only the host or co-host can lower another participant's hand" });
  }

  await db
    .update(audioCircleParticipantsTable)
    .set({
      hand_raised: parsed.data.raised,
      hand_raised_at: parsed.data.raised ? new Date() : null,
    })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, targetUserId),
      isNull(audioCircleParticipantsTable.left_at),
    ));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_hand_raised",
    payload: { session_id: sessionId, user_id: targetUserId, raised: parsed.data.raised },
  });
  return res.json({ ok: true });
});

const RoleChangeBody = z.object({ user_id: z.number().int().positive() });

// POST /audio-circle-sessions/:id/promote — host or co-host promotes a listener.
router.post("/audio-circle-sessions/:id/promote", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RoleChangeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can promote speakers" });

  const activeParticipants = await getActiveParticipants(sessionId);
  const currentSpeakerCount = activeParticipants.filter(p => p.role === "host" || p.role === "speaker" || p.role === "co_host").length;
  if (currentSpeakerCount >= session.max_speakers) {
    return res.status(409).json({ error: `This room already has the maximum of ${session.max_speakers} speakers` });
  }

  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "speaker", hand_raised: false })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  logModerationAction("promote", sessionId, req.authenticatedUserId!, parsed.data.user_id);

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_role_changed",
    payload: { session_id: sessionId, user_id: parsed.data.user_id, role: "speaker" },
  });
  return res.json({ ok: true });
});

// POST /audio-circle-sessions/:id/demote — host or co-host demotes a speaker.
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
  const isModerator = actingParticipant.role === "host" || actingParticipant.role === "co_host";
  if (!isSelf && !isModerator) return res.status(403).json({ error: "Only the host or co-host can demote another speaker" });
  if (isSelf && (actingParticipant.role === "host" || actingParticipant.role === "co_host")) {
    return res.status(400).json({ error: "The host or co-host can't demote themselves — end the session instead" });
  }

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "listener" })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  logModerationAction("demote", sessionId, userId, parsed.data.user_id);

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_role_changed",
    payload: { session_id: sessionId, user_id: parsed.data.user_id, role: "listener" },
  });
  return res.json({ ok: true });
});

// ── Co-host management ──────────────────────────────────────────────────────

// POST /audio-circle-sessions/:id/assign-cohost — host assigns co-host role.
router.post("/audio-circle-sessions/:id/assign-cohost", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RoleChangeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const { session, participant: hostParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!hostParticipant) return res.status(403).json({ error: "Only the host can assign co-hosts" });

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role === "host") return res.status(400).json({ error: "Can't assign the host as co-host" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "co_host", hand_raised: false })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  logModerationAction("assign_cohost", sessionId, req.authenticatedUserId!, parsed.data.user_id);

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_cohost_assigned",
    payload: { session_id: sessionId, user_id: parsed.data.user_id },
  });
  return res.json({ ok: true });
});

// POST /audio-circle-sessions/:id/remove-cohost — host removes co-host role.
router.post("/audio-circle-sessions/:id/remove-cohost", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RoleChangeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const { session, participant: hostParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!hostParticipant) return res.status(403).json({ error: "Only the host can remove co-hosts" });

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role !== "co_host") return res.status(400).json({ error: "That user isn't a co-host" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "listener" })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  logModerationAction("remove_cohost", sessionId, req.authenticatedUserId!, parsed.data.user_id);

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_cohost_removed",
    payload: { session_id: sessionId, user_id: parsed.data.user_id },
  });
  return res.json({ ok: true });
});

// ── Mute ─────────────────────────────────────────────────────────────────────

const MuteBody = z.object({
  user_id: z.number().int().positive(),
  muted: z.boolean(),
});

router.post("/audio-circle-sessions/:id/mute", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = MuteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id and muted (boolean) are required" });

  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can mute speakers" });

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role === "host") return res.status(400).json({ error: "Can't mute the host" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ muted: parsed.data.muted })
    .where(and(eq(audioCircleParticipantsTable.session_id, sessionId), eq(audioCircleParticipantsTable.user_id, parsed.data.user_id)));

  logModerationAction(parsed.data.muted ? "mute" : "unmute", sessionId, req.authenticatedUserId!, parsed.data.user_id);

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_muted",
    payload: { session_id: sessionId, user_id: parsed.data.user_id, muted: parsed.data.muted },
  });
  return res.json({ ok: true });
});

// POST /audio-circle-sessions/:id/mute-all — host or co-host mutes every speaker.
router.post("/audio-circle-sessions/:id/mute-all", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can mute everyone" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ muted: true })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      sql`${audioCircleParticipantsTable.role} = 'speaker'`,
      isNull(audioCircleParticipantsTable.left_at),
    ));

  logModerationAction("mute_all", sessionId, req.authenticatedUserId!, null);

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_muted",
    payload: { session_id: sessionId, user_id: null, muted: true, all: true },
  });
  return res.json({ ok: true });
});

// ── Kick ──────────────────────────────────────────────────────────────────────

const KickBody = z.object({ user_id: z.number().int().positive() });

router.post("/audio-circle-sessions/:id/kick", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = KickBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const actingUserId = req.authenticatedUserId!;
  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, actingUserId, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can remove participants" });
  if (parsed.data.user_id === actingUserId) {
    return res.status(400).json({ error: "You can't kick yourself — use End Circle instead" });
  }

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role === "host" && modParticipant.role === "co_host") {
    return res.status(403).json({ error: "A co-host can't kick the host" });
  }

  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, parsed.data.user_id),
      isNull(audioCircleParticipantsTable.left_at),
    ));
  removeCircleParticipant(sessionId, parsed.data.user_id);

  logModerationAction("kick", sessionId, actingUserId, parsed.data.user_id);

  const remaining = await getActiveParticipants(sessionId);
  sendToCircleParticipants(remaining.map(p => p.user_id).concat(parsed.data.user_id), {
    type: "circle_kicked",
    payload: { session_id: sessionId, user_id: parsed.data.user_id },
  });
  return res.json({ ok: true });
});

// ── Persistent chat ───────────────────────────────────────────────────────────

const ChatBody = z.object({ body: z.string().trim().min(1).max(MAX_CHAT_LEN) });

const CHAT_HISTORY_LIMIT = 200;

// GET /audio-circle-sessions/:id/chat — fetch the last N messages.
router.get("/audio-circle-sessions/:id/chat", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const rows = await db
    .select({
      id:         audioCircleMessagesTable.id,
      body:       audioCircleMessagesTable.body,
      sent_at:    audioCircleMessagesTable.sent_at,
      sender_id:  audioCircleMessagesTable.sender_id,
      name:       usersTable.name,
      avatar_url: usersTable.avatar_url,
    })
    .from(audioCircleMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, audioCircleMessagesTable.sender_id))
    .where(eq(audioCircleMessagesTable.session_id, sessionId))
    .orderBy(desc(audioCircleMessagesTable.sent_at))
    .limit(CHAT_HISTORY_LIMIT);

  const messages = rows.reverse().map(r => ({
    id:         `db-${r.id}`,
    user_id:    r.sender_id ?? 0,
    name:       r.name ?? "Deleted user",
    avatar_url: r.avatar_url ?? null,
    body:       r.body,
    created_at: r.sent_at.toISOString(),
  }));

  return res.json({ messages });
});

// POST /audio-circle-sessions/:id/chat — any active participant sends a chat message.
// Enforces chat_enabled setting — returns 403 if the host has disabled chat.
router.post("/audio-circle-sessions/:id/chat", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: `body is required and must be ≤ ${MAX_CHAT_LEN} characters` });

  const userId = req.authenticatedUserId!;
  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "You're not in this session" });

  // Server-side enforcement of chat_enabled setting.
  if (!session.chat_enabled) {
    return res.status(403).json({ error: "Chat has been disabled by the host" });
  }

  const [user] = await db
    .select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const [saved] = await db
    .insert(audioCircleMessagesTable)
    .values({ session_id: sessionId, sender_id: userId, body: parsed.data.body })
    .returning({ id: audioCircleMessagesTable.id, sent_at: audioCircleMessagesTable.sent_at });

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_chat_message",
    payload: {
      session_id: sessionId,
      id:         `db-${saved.id}`,
      user_id:    userId,
      name:       user?.name ?? "Someone",
      avatar_url: user?.avatar_url ?? null,
      body:       parsed.data.body,
      created_at: saved.sent_at.toISOString(),
    },
  });
  return res.json({ ok: true, id: `db-${saved.id}` });
});

// POST /audio-circle-sessions/:id/lower-all-hands — host or co-host clears hands.
router.post("/audio-circle-sessions/:id/lower-all-hands", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can lower all hands" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ hand_raised: false })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      isNull(audioCircleParticipantsTable.left_at),
    ));

  logModerationAction("lower_all_hands", sessionId, req.authenticatedUserId!, null);

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_hands_lowered",
    payload: { session_id: sessionId },
  });
  return res.json({ ok: true });
});

// ── Reactions ────────────────────────────────────────────────────────────────

const ReactionBody = z.object({ emoji: z.string().trim().min(1).max(MAX_EMOJI_LEN) });

// POST /audio-circle-sessions/:id/react — ephemeral emoji reaction, WS broadcast only.
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

const RecordingStateBody = z.object({ is_recording: z.boolean() });

// POST /audio-circle-sessions/:id/recording — host starts/stops recording.
// Enforces recording_allowed setting — returns 403 if the host has disabled recording.
router.post("/audio-circle-sessions/:id/recording", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RecordingStateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "is_recording must be a boolean" });

  const { session, participant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "Only the host can control recording" });

  // Server-side enforcement of recording_allowed setting.
  if (parsed.data.is_recording && !session.recording_allowed) {
    return res.status(403).json({ error: "Recording has been disabled for this session" });
  }
  if (parsed.data.is_recording) {
    return res.status(410).json({
      error: "Recording now requires participant consent. Use the recording authorization flow.",
      error_code: "RECORDING_CONSENT_REQUIRED",
    });
  }

  const newStatus = parsed.data.is_recording ? "recording" : "none";
  await db.update(audioCircleSessionsTable).set({
    is_recording: parsed.data.is_recording,
    recording_status: newStatus,
  }).where(eq(audioCircleSessionsTable.id, sessionId));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_recording_changed",
    payload: { session_id: sessionId, is_recording: parsed.data.is_recording },
  });
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_recording_status_updated",
    payload: { session_id: sessionId, recording_status: newStatus },
  });
  return res.json({ ok: true });
});

// POST /audio-circle-sessions/:id/recording-upload — host uploads the raw audio blob.
router.post("/audio-circle-sessions/:id/recording-upload", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });

  const userId = req.authenticatedUserId!;
  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.host_id !== userId) return res.status(403).json({ error: "Only the host can upload a recording" });

  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "Empty or non-audio body" });
  }
  const MAX_RECORDING_BYTES = 500 * 1024 * 1024;
  if (body.length > MAX_RECORDING_BYTES) {
    return res.status(413).json({ error: "Recording too large (500 MB max)" });
  }

  const contentType = String(req.headers["content-type"] ?? "").split(";")[0].toLowerCase();
  const durationSeconds = parseInt(String(req.query.duration ?? ""), 10);
  const [recording] = await db
    .select()
    .from(circleRecordingsTable)
    .where(and(
      eq(circleRecordingsTable.session_id, sessionId),
      inArray(circleRecordingsTable.status, ["RECORDING_ACTIVE", "RECORDING_FINALIZING"]),
    ))
    .limit(1);
  if (!recording) {
    return res.status(409).json({
      error: "Recording was not authorized before it ended",
      error_code: "RECORDING_CONSENT_REQUIRED",
    });
  }

  try {
    const archived = await finalizeRecording({
      recordingId: recording.id,
      buffer: body,
      mimeType: contentType || "audio/webm",
      durationSeconds: !isNaN(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined,
    });
    if (!archived?.storage_key) throw new Error("Recording metadata was not archived");
    const recording_url = await getPrivateAssetUrl(archived.storage_key);
    const updateData: Partial<typeof audioCircleSessionsTable.$inferInsert> = {
      recording_url,
      recording_status: "processing",
      recording_size_bytes: body.length,
    };
    if (!isNaN(durationSeconds) && durationSeconds > 0) {
      updateData.recording_duration_seconds = durationSeconds;
    }
    await db.update(audioCircleSessionsTable).set(updateData).where(eq(audioCircleSessionsTable.id, sessionId));

    const allParticipants = await db
      .select({ user_id: audioCircleParticipantsTable.user_id })
      .from(audioCircleParticipantsTable)
      .where(eq(audioCircleParticipantsTable.session_id, sessionId));
    sendToCircleParticipants(allParticipants.map(p => p.user_id), {
      type: "circle_recording_available",
      payload: { session_id: sessionId, circle_id: session.circle_id, recording_id: archived.id },
    });
    sendToCircleParticipants(allParticipants.map(p => p.user_id), {
      type: "circle_recording_status_updated",
      payload: { session_id: sessionId, recording_status: "processing" },
    });

    generateAiSummaryInBackground(sessionId).catch((err) => {
      logger.warn({ err, sessionId }, "audio-circles: AI summary generation failed");
    });

    return res.json({ ok: true, recording_url });
  } catch (err) {
    return res.status(422).json({
      error: err instanceof Error ? err.message : "Recording finalization failed",
    });
  }
});

async function generateAiSummaryInBackground(sessionId: number) {
  try {
    const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
    if (!session) return;

    const resp = await requestCircleSummary({
      title: session.title,
      topic: session.topic ?? null,
      duration_minutes: session.recording_duration_seconds
        ? Math.round(session.recording_duration_seconds / 60)
        : null,
    });
    if (!resp || resp.status === 503) {
      await db.update(audioCircleSessionsTable).set({ recording_status: "ready" })
        .where(eq(audioCircleSessionsTable.id, sessionId));
      broadcastRecordingStatus(sessionId, "ready");
      return;
    }
    if (!resp.ok) throw new Error(`nia-service circle-summary returned ${resp.status}`);
    const data = await resp.json() as { summary?: unknown; chapters?: unknown };
    const aiSummary = typeof data.summary === "string" ? data.summary : null;
    const chapterMarkers = Array.isArray(data.chapters) ? data.chapters : null;
    await db.update(audioCircleSessionsTable)
      .set({
        recording_status: "ready",
        ai_summary: aiSummary,
        chapter_markers: chapterMarkers,
      })
      .where(eq(audioCircleSessionsTable.id, sessionId));
    broadcastRecordingStatus(sessionId, "ready");
  } catch (err) {
    logger.warn({ err, sessionId }, "audio-circles: AI summary generation failed");
    await db.update(audioCircleSessionsTable)
      .set({ recording_status: "failed" })
      .where(eq(audioCircleSessionsTable.id, sessionId));
    broadcastRecordingStatus(sessionId, "failed");
  }
}

function broadcastRecordingStatus(sessionId: number, status: string) {
  db
    .select({ user_id: audioCircleParticipantsTable.user_id })
    .from(audioCircleParticipantsTable)
    .where(eq(audioCircleParticipantsTable.session_id, sessionId))
    .then((participants) => {
      sendToCircleParticipants(participants.map(p => p.user_id), {
        type: "circle_recording_status_updated",
        payload: { session_id: sessionId, recording_status: status },
      });
    })
    .catch(err => { logger.warn({ err, sessionId }, "audio-circles: recording status WS notification failed"); });
}

router.post("/audio-circle-sessions/:id/recording-url", requireAuth, generalApiLimiter, async (_req, res) => {
  return res.status(410).json({
    error: "Recording URLs are server-issued after a private recording is finalized.",
    error_code: "PRIVATE_RECORDING_URLS_REQUIRED",
  });
});

const RecordingMetadataBody = z.object({
  recording_duration_seconds: z.number().int().positive().max(86400).optional(),
  recording_size_bytes: z.number().int().positive().max(500 * 1024 * 1024).optional(),
});

router.patch("/audio-circle-sessions/:id/recording-metadata", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = RecordingMetadataBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });

  const userId = req.authenticatedUserId!;
  const [session] = await db.select().from(audioCircleSessionsTable).where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.host_id !== userId) return res.status(403).json({ error: "Only the host can update recording metadata" });

  const updates: Partial<typeof audioCircleSessionsTable.$inferInsert> = {};
  if (parsed.data.recording_duration_seconds !== undefined) {
    updates.recording_duration_seconds = parsed.data.recording_duration_seconds;
  }
  if (parsed.data.recording_size_bytes !== undefined) {
    updates.recording_size_bytes = parsed.data.recording_size_bytes;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });

  await db.update(audioCircleSessionsTable).set(updates).where(eq(audioCircleSessionsTable.id, sessionId));
  return res.json({ ok: true, ...updates });
});

// GET /audio-circles/:id/recordings — past recordings for this circle.
router.get("/audio-circles/:id/recordings", requireAuth, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });

  const recordings = await db
    .select({
      id: audioCircleSessionsTable.id,
      title: audioCircleSessionsTable.title,
      host_id: audioCircleSessionsTable.host_id,
      host_name: usersTable.name,
      legacy_recording_url: audioCircleSessionsTable.recording_url,
      recording_status: audioCircleSessionsTable.recording_status,
      recording_duration_seconds: audioCircleSessionsTable.recording_duration_seconds,
      recording_size_bytes: audioCircleSessionsTable.recording_size_bytes,
      ai_summary: audioCircleSessionsTable.ai_summary,
      chapter_markers: audioCircleSessionsTable.chapter_markers,
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

  // The URL stored on older session rows may already be an expired presigned
  // URL. Re-issue private URLs when the archive is opened so playback does not
  // depend on when the recording was uploaded.
  const freshRecordings = await Promise.all(recordings.map(async (recording) => {
    const [archived] = await db
      .select({ storage_key: circleRecordingsTable.storage_key, status: circleRecordingsTable.status })
      .from(circleRecordingsTable)
      .where(and(
        eq(circleRecordingsTable.session_id, recording.id),
        eq(circleRecordingsTable.status, "RECORDING_ARCHIVED"),
      ))
      .limit(1);
    return {
      ...recording,
      recording_url: archived?.storage_key
        ? await getPrivateAssetUrl(archived.storage_key)
        : recording.legacy_recording_url,
    };
  }));

  const [viewer] = await db
    .select({ is_admin: usersTable.is_admin, approval_status: usersTable.approval_status })
    .from(usersTable)
    .where(eq(usersTable.id, req.authenticatedUserId!))
    .limit(1);
  const isApprovedAdmin = viewer?.is_admin === true && viewer.approval_status === "approved";
  if (isApprovedAdmin || freshRecordings.length === 0) return res.json({ recordings: freshRecordings });

  const sessionIds = freshRecordings.map((recording) => recording.id);
  const participantSessions = await db
    .select({ session_id: audioCircleParticipantsTable.session_id })
    .from(audioCircleParticipantsTable)
    .where(and(
      eq(audioCircleParticipantsTable.user_id, req.authenticatedUserId!),
      inArray(audioCircleParticipantsTable.session_id, sessionIds),
    ));
  const allowedSessions = new Set(participantSessions.map((row) => row.session_id));
  const visibleRecordings = freshRecordings.filter((recording) =>
    allowedSessions.has(recording.id) || recording.host_id === req.authenticatedUserId,
  );
  if (visibleRecordings.length === 0) {
    return res.status(403).json({ error: "Only Circle participants can view recordings" });
  }
  return res.json({ recordings: visibleRecordings });
});

// ── Mid-session settings update ──────────────────────────────────────────────

const UpdateSessionSettingsBody = z.object({
  topic: z.string().trim().max(MAX_TOPIC_LEN).optional(),
  description: z.string().trim().max(MAX_DESC_LEN).optional(),
  max_speakers: z.number().int().refine(v => (VALID_SPEAKER_LIMITS as readonly number[]).includes(v), {
    message: `max_speakers must be one of ${VALID_SPEAKER_LIMITS.join(", ")}`,
  }).optional(),
  chat_enabled: z.boolean().optional(),
  recording_allowed: z.boolean().optional(),
});

// PATCH /audio-circle-sessions/:id/settings — host updates settings mid-session.
router.patch("/audio-circle-sessions/:id/settings", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = UpdateSessionSettingsBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
  if (Object.keys(parsed.data).length === 0) return res.status(400).json({ error: "Nothing to update" });

  const { session, participant } = await requireActiveParticipant(sessionId, req.authenticatedUserId!, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "Only the host can update session settings" });

  if (parsed.data.max_speakers !== undefined) {
    const activeParticipants = await getActiveParticipants(sessionId);
    const currentSpeakerCount = activeParticipants.filter(
      p => p.role === "host" || p.role === "speaker" || p.role === "co_host"
    ).length;
    if (parsed.data.max_speakers < currentSpeakerCount) {
      return res.status(409).json({
        error: `Can't lower limit below current speaker count (${currentSpeakerCount})`,
      });
    }
  }

  const updates: Partial<typeof audioCircleSessionsTable.$inferInsert> = {};
  if (parsed.data.topic !== undefined) updates.topic = parsed.data.topic || null;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description || null;
  if (parsed.data.max_speakers !== undefined) updates.max_speakers = parsed.data.max_speakers;
  if (parsed.data.chat_enabled !== undefined) updates.chat_enabled = parsed.data.chat_enabled;
  if (parsed.data.recording_allowed !== undefined) updates.recording_allowed = parsed.data.recording_allowed;

  await db.update(audioCircleSessionsTable).set(updates).where(eq(audioCircleSessionsTable.id, sessionId));

  const activeParticipants = await getActiveParticipants(sessionId);
  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_settings_updated",
    payload: {
      session_id: sessionId,
      topic: updates.topic ?? session.topic ?? null,
      description: updates.description ?? session.description ?? null,
      max_speakers: updates.max_speakers ?? session.max_speakers,
      chat_enabled: updates.chat_enabled ?? session.chat_enabled,
      recording_allowed: updates.recording_allowed ?? session.recording_allowed,
    },
  });

  return res.json({ ok: true, ...updates });
});

// ── In-app invite ────────────────────────────────────────────────────────────

const InviteBody = z.object({
  user_id: z.number().int().positive(),
});

router.post("/audio-circle-sessions/:id/invite", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const actingUserId = req.authenticatedUserId!;
  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, actingUserId, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can send invites" });

  if (parsed.data.user_id === actingUserId) {
    return res.status(400).json({ error: "You can't invite yourself" });
  }

  const [inviter] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, actingUserId)).limit(1);

  sendToUser(parsed.data.user_id, {
    type: "circle_invite",
    payload: {
      session_id: sessionId,
      circle_id: session.circle_id,
      circle_title: session.title,
      topic: session.topic ?? null,
      invited_by: inviter?.name ?? "Someone",
      invited_by_id: actingUserId,
      join_path: `/audio-circle/${sessionId}`,
    },
  });

  return res.json({ ok: true });
});

// ── Host transfer ─────────────────────────────────────────────────────────────

const TransferHostBody = z.object({
  user_id: z.number().int().positive(),
});

router.post("/audio-circle-sessions/:id/transfer-host", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = TransferHostBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const actingUserId = req.authenticatedUserId!;
  const { session, participant: hostParticipant } = await requireActiveParticipant(sessionId, actingUserId, "host");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!hostParticipant) return res.status(403).json({ error: "Only the host can transfer ownership" });

  if (parsed.data.user_id === actingUserId) {
    return res.status(400).json({ error: "You are already the host" });
  }

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role !== "co_host") return res.status(400).json({ error: "You can only transfer host to a co-host" });

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "co_host" })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, actingUserId),
    ));

  await db
    .update(audioCircleParticipantsTable)
    .set({ role: "host" })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, parsed.data.user_id),
    ));

  await db
    .update(audioCircleSessionsTable)
    .set({ host_id: parsed.data.user_id })
    .where(eq(audioCircleSessionsTable.id, sessionId));

  logModerationAction("transfer_host", sessionId, actingUserId, parsed.data.user_id);

  sendToCircleParticipants(activeParticipants.map(p => p.user_id), {
    type: "circle_host_transfer",
    payload: {
      session_id: sessionId,
      new_host_id: parsed.data.user_id,
      former_host_id: actingUserId,
    },
  });

  return res.json({ ok: true, new_host_id: parsed.data.user_id });
});

// ── Follow / Unfollow ────────────────────────────────────────────────────────

router.post("/audio-circles/:id/follow", requireAuth, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const [circle] = await db.select({ id: audioCirclesTable.id }).from(audioCirclesTable).where(eq(audioCirclesTable.id, circleId)).limit(1);
  if (!circle) return res.status(404).json({ error: "Circle not found" });

  try {
    await db
      .insert(audioCircleFollowsTable)
      .values({ user_id: userId, circle_id: circleId })
      .onConflictDoNothing();
  } catch {
    // onConflictDoNothing handles the unique constraint
  }
  return res.json({ ok: true, following: true });
});

router.post("/audio-circles/:id/unfollow", requireAuth, generalApiLimiter, async (req, res) => {
  const circleId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(circleId)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  await db
    .delete(audioCircleFollowsTable)
    .where(and(eq(audioCircleFollowsTable.user_id, userId), eq(audioCircleFollowsTable.circle_id, circleId)));
  return res.json({ ok: true, following: false });
});

// ── Block & Report ──────────────────────────────────────────────────────────

const BlockBody = z.object({ user_id: z.number().int().positive() });

router.post("/audio-circle-sessions/:id/block", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = BlockBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id is required" });

  const actingUserId = req.authenticatedUserId!;
  const { session, participant: modParticipant } = await requireActiveParticipant(sessionId, actingUserId, "host_or_cohost");
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!modParticipant) return res.status(403).json({ error: "Only the host or co-host can block participants" });
  if (parsed.data.user_id === actingUserId) {
    return res.status(400).json({ error: "You can't block yourself" });
  }

  const activeParticipants = await getActiveParticipants(sessionId);
  const target = activeParticipants.find(p => p.user_id === parsed.data.user_id);
  if (!target) return res.status(404).json({ error: "That user isn't in this session" });
  if (target.role === "host" && modParticipant.role === "co_host") {
    return res.status(403).json({ error: "A co-host can't block the host" });
  }

  const blockHostId = session.host_id ?? actingUserId;

  await db
    .update(audioCircleParticipantsTable)
    .set({ left_at: new Date() })
    .where(and(
      eq(audioCircleParticipantsTable.session_id, sessionId),
      eq(audioCircleParticipantsTable.user_id, parsed.data.user_id),
      isNull(audioCircleParticipantsTable.left_at),
    ));
  removeCircleParticipant(sessionId, parsed.data.user_id);

  try {
    await db
      .insert(circleBlocksTable)
      .values({ host_id: blockHostId, blocked_user_id: parsed.data.user_id, session_id: sessionId })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn({ err, blockHostId, blocked_user_id: parsed.data.user_id }, "circle block persist failed");
  }

  logModerationAction("block", sessionId, actingUserId, parsed.data.user_id, { blockHostId });

  const remaining = await getActiveParticipants(sessionId);
  sendToCircleParticipants(remaining.map(p => p.user_id).concat(parsed.data.user_id), {
    type: "circle_kicked",
    payload: { session_id: sessionId, user_id: parsed.data.user_id },
  });
  return res.json({ ok: true, blocked: true });
});

const ReportBody = z.object({
  user_id: z.number().int().positive(),
  reason: z.string().trim().min(1).max(2000),
});

router.post("/audio-circle-sessions/:id/report", requireAuth, generalApiLimiter, async (req, res) => {
  const sessionId = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = ReportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "user_id and reason are required" });

  const userId = req.authenticatedUserId!;
  const { session, participant } = await requireActiveParticipant(sessionId, userId);
  if (!session) return res.status(404).json({ error: "Session not live" });
  if (!participant) return res.status(403).json({ error: "You're not in this session" });
  if (parsed.data.user_id === userId) {
    return res.status(400).json({ error: "You can't report yourself" });
  }

  try {
    await db
      .insert(circleReportsTable)
      .values({
        session_id: sessionId,
        reporter_id: userId,
        reported_id: parsed.data.user_id,
        reason: parsed.data.reason,
      });
  } catch (err) {
    logger.warn({ err, session_id: sessionId, reporter_id: userId }, "circle report persist failed");
  }

  logger.info({
    session_id: sessionId,
    reporter_id: userId,
    reported_id: parsed.data.user_id,
    reason: parsed.data.reason,
  }, "circle_user_reported");

  return res.json({ ok: true, reported: true });
});


// GET /audio-circles/recommended — recommended circles for the current user.
// Uses followed circles' cities + follower counts as a simple recommendation signal.
router.get("/audio-circles/recommended", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  try {
    // Get cities the user follows circles in
    const followed = await db
      .select({ circle_id: audioCircleFollowsTable.circle_id })
      .from(audioCircleFollowsTable)
      .where(eq(audioCircleFollowsTable.user_id, userId));

    const followedCircleIds = followed.map(f => f.circle_id);

    // Get circles with live sessions that the user doesn't already follow
    const allCircles = await db
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
      .leftJoin(cityNeighborhoodsTable, eq(cityNeighborhoodsTable.id, audioCirclesTable.neighborhood_id));

    const recommended = await Promise.all(
      allCircles
        .filter(c => !followedCircleIds.includes(c.id))
        .slice(0, 20)
        .map(async (c) => {
          const live = await getLiveSession(c.id);
          const followerCount = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(audioCircleFollowsTable)
            .where(eq(audioCircleFollowsTable.circle_id, c.id));
          let liveData: {
            id: number; title: string; host_id: number | null;
            host_name: string; video_enabled: boolean; is_recording: boolean;
            started_at: string; topic: string | null; description: string | null;
            speaker_count: number; listener_count: number;
          } | null = null;
          if (live) {
            const participants = await getActiveParticipants(live.id);
            const host = live.host_id != null
              ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, live.host_id)).limit(1))[0]
              : undefined;
            liveData = {
              id: live.id, title: live.title, host_id: live.host_id,
              host_name: host?.name ?? "Someone", video_enabled: live.video_enabled,
              is_recording: live.is_recording, started_at: live.started_at.toISOString(),
              topic: live.topic ?? null, description: live.description ?? null,
              speaker_count: participants.filter(p => p.role === "host" || p.role === "speaker" || p.role === "co_host").length,
              listener_count: participants.filter(p => p.role === "listener").length,
            };
          }
          const reason = live
            ? "Live now in your area"
            : (followerCount[0]?.count ?? 0) > 5
            ? "Popular circle near you"
            : "New circle to explore";
          return {
            ...c, live_session: liveData, is_following: false,
            follower_count: followerCount[0]?.count ?? 0, reason,
          };
        })
    );

    // Sort: live first, then by follower count
    recommended.sort((a, b) => {
      if (a.live_session && !b.live_session) return -1;
      if (!a.live_session && b.live_session) return 1;
      return b.follower_count - a.follower_count;
    });

    return res.json({ recommended: recommended.slice(0, 10) });
  } catch (err) {
    logger.error({ err }, "recommended circles fetch failed");
    return res.json({ recommended: [] });
  }
});

// GET /audio-circles/trending — circles with the most active live sessions across all cities.
router.get("/audio-circles/trending", requireAuth, generalApiLimiter, async (_req, res) => {
  try {
    // Get all live sessions
    const liveSessions = await db
      .select({
        id: audioCircleSessionsTable.id,
        circle_id: audioCircleSessionsTable.circle_id,
        title: audioCircleSessionsTable.title,
        host_id: audioCircleSessionsTable.host_id,
        video_enabled: audioCircleSessionsTable.video_enabled,
        is_recording: audioCircleSessionsTable.is_recording,
        started_at: audioCircleSessionsTable.started_at,
        topic: audioCircleSessionsTable.topic,
        description: audioCircleSessionsTable.description,
      })
      .from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.status, "live"));

    const trending = await Promise.all(
      liveSessions.map(async (s) => {
        const participants = await getActiveParticipants(s.id);
        const participantCount = participants.length;
        const speakerCount = participants.filter(p => p.role === "host" || p.role === "speaker" || p.role === "co_host").length;
        const listenerCount = participants.filter(p => p.role === "listener").length;
        const host = s.host_id != null
          ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, s.host_id)).limit(1))[0]
          : undefined;
        const circle = await db
          .select({
            name: audioCirclesTable.name,
            city_display: audioCirclesTable.city_display,
            neighborhood_name: cityNeighborhoodsTable.name,
            neighborhood_emoji: cityNeighborhoodsTable.emoji,
          })
          .from(audioCirclesTable)
          .leftJoin(cityNeighborhoodsTable, eq(cityNeighborhoodsTable.id, audioCirclesTable.neighborhood_id))
          .where(eq(audioCirclesTable.id, s.circle_id))
          .limit(1);
        // Trend score: weighted by participants + recency
        const ageMinutes = (Date.now() - new Date(s.started_at).getTime()) / 60000;
        const trendScore = participantCount * 10 + speakerCount * 5 - ageMinutes * 0.1;
        return {
          id: s.circle_id,
          name: circle[0]?.name ?? s.title,
          city_display: circle[0]?.city_display ?? "",
          neighborhood_name: circle[0]?.neighborhood_name ?? null,
          neighborhood_emoji: circle[0]?.neighborhood_emoji ?? null,
          live_session: {
            id: s.id, title: s.title, host_id: s.host_id,
            host_name: host?.name ?? "Someone", video_enabled: s.video_enabled,
            is_recording: s.is_recording, started_at: s.started_at,
            topic: s.topic ?? null, description: s.description ?? null,
            speaker_count: speakerCount, listener_count: listenerCount,
          },
          participant_count: participantCount,
          trend_score: Math.max(0, trendScore),
        };
      })
    );

    trending.sort((a, b) => b.trend_score - a.trend_score);
    return res.json({ trending: trending.slice(0, 12) });
  } catch (err) {
    logger.error({ err }, "trending circles fetch failed");
    return res.json({ trending: [] });
  }
});

// GET /audio-circles/nearby — circles in nearby cities (same state/region approximation).
router.get("/audio-circles/nearby", requireAuth, generalApiLimiter, async (req, res) => {
  const cityRaw = (req.query.city as string | undefined)?.trim();
  if (!cityRaw) return res.json({ nearby: [] });
  const cityKey = normalizeCityKey(cityRaw);
  if (!cityKey) return res.json({ nearby: [] });

  try {
    // Get circles from different city_keys (nearby cities)
    const nearbyCircles = await db
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
      .where(sql`${audioCirclesTable.city_key} != ${cityKey}`);

    // Limit and add live info + approximate distance
    const nearby = await Promise.all(
      nearbyCircles.slice(0, 20).map(async (c) => {
        const live = await getLiveSession(c.id);
        let liveData: {
          id: number; title: string; host_id: number | null;
          host_name: string; video_enabled: boolean; is_recording: boolean;
          started_at: string; topic: string | null; description: string | null;
          speaker_count: number; listener_count: number;
        } | null = null;
        if (live) {
          const participants = await getActiveParticipants(live.id);
          const host = live.host_id != null
            ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, live.host_id)).limit(1))[0]
            : undefined;
          liveData = {
            id: live.id, title: live.title, host_id: live.host_id,
            host_name: host?.name ?? "Someone", video_enabled: live.video_enabled,
            is_recording: live.is_recording, started_at: live.started_at.toISOString(),
            topic: live.topic ?? null, description: live.description ?? null,
            speaker_count: participants.filter(p => p.role === "host" || p.role === "speaker" || p.role === "co_host").length,
            listener_count: participants.filter(p => p.role === "listener").length,
          };
        }
        // Approximate distance based on city name hash (placeholder — real geo would use coordinates)
        const distanceKm = Math.abs(c.city_key.length - cityKey.length) * 15 + 25;
        return {
          ...c, distance_km: distanceKm, live_session: liveData,
        };
      })
    );

    // Sort: live first, then by distance
    nearby.sort((a, b) => {
      if (a.live_session && !b.live_session) return -1;
      if (!a.live_session && b.live_session) return 1;
      return a.distance_km - b.distance_km;
    });

    return res.json({ nearby: nearby.slice(0, 8) });
  } catch (err) {
    logger.error({ err }, "nearby circles fetch failed");
    return res.json({ nearby: [] });
  }
});


// GET /audio-circles/community-stats — user's circle reputation, achievements, milestones.
router.get("/audio-circles/community-stats", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  try {
    // Count circles hosted
    const hostedSessions = await db
      .select({ id: audioCircleSessionsTable.id })
      .from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.host_id, userId));

    const totalHosted = hostedSessions.length;

    // Count reactions given (from chat messages that are reactions)
    // Approximate: count circle_chat messages by this user
    const messagesSent = await db
      .select({ id: audioCircleMessagesTable.id })
      .from(audioCircleMessagesTable)
      .where(eq(audioCircleMessagesTable.sender_id, userId));

    // Count time as speaker (approximate: count sessions where user was speaker+)
    const speakerSessions = await db
      .select({
        session_id: audioCircleParticipantsTable.session_id,
        role: audioCircleParticipantsTable.role,
        joined_at: audioCircleParticipantsTable.joined_at,
        left_at: audioCircleParticipantsTable.left_at,
      })
      .from(audioCircleParticipantsTable)
      .where(and(
        eq(audioCircleParticipantsTable.user_id, userId),
        sql`${audioCircleParticipantsTable.role} IN ('host', 'co_host', 'speaker')`,
      ));

    let totalSpeakingMinutes = 0;
    for (const s of speakerSessions) {
      const end = s.left_at ? new Date(s.left_at).getTime() : Date.now();
      const start = new Date(s.joined_at).getTime();
      totalSpeakingMinutes += Math.max(0, (end - start) / 60000);
    }

    // Compute trust score (0-100): based on hosting + speaking + engagement
    const trustScore = Math.min(100, Math.round(
      totalHosted * 5 +
      Math.floor(totalSpeakingMinutes) * 0.5 +
      messagesSent.length * 0.3 +
      20 // base score
    ));

    // Determine reputation level
    let reputationLevel = "Newcomer";
    if (trustScore >= 80) reputationLevel = "Circle Veteran";
    else if (trustScore >= 60) reputationLevel = "Community Leader";
    else if (trustScore >= 40) reputationLevel = "Active Member";
    else if (trustScore >= 20) reputationLevel = "Regular";

    // Generate achievements based on activity
    const achievements: Array<{ id: string; title: string; description: string; icon: string; earned_at: string }> = [];
    if (totalHosted >= 1) {
      achievements.push({
        id: "first-host", title: "First Circle", description: "Hosted your first Circle",
        icon: "🎙️", earned_at: new Date().toISOString(),
      });
    }
    if (totalHosted >= 10) {
      achievements.push({
        id: "serial-host", title: "Serial Host", description: "Hosted 10 Circles",
        icon: "🏆", earned_at: new Date().toISOString(),
      });
    }
    if (totalSpeakingMinutes >= 60) {
      achievements.push({
        id: "hour-speaker", title: "Hour of Fame", description: "Spoke for 60+ minutes",
        icon: "⏱️", earned_at: new Date().toISOString(),
      });
    }
    if (messagesSent.length >= 50) {
      achievements.push({
        id: "chatterbox", title: "Chatterbox", description: "Sent 50+ messages",
        icon: "💬", earned_at: new Date().toISOString(),
      });
    }

    // Generate milestones (progress toward next achievement)
    const milestones: Array<{ id: string; title: string; description: string; progress: number; target: number; unit: string }> = [
      {
        id: "host-milestone", title: "Circle Master",
        description: "Host 25 Circles",
        progress: totalHosted, target: 25, unit: "circles",
      },
      {
        id: "speaking-milestone", title: "Voice of the Community",
        description: "Speak for 500 minutes total",
        progress: Math.floor(totalSpeakingMinutes), target: 500, unit: "min",
      },
      {
        id: "engagement-milestone", title: "Community Pillar",
        description: "Send 200 messages in Circles",
        progress: messagesSent.length, target: 200, unit: "messages",
      },
    ];

    return res.json({
      stats: {
        trust_score: trustScore,
        reputation_level: reputationLevel,
        total_circles_hosted: totalHosted,
        total_speaking_time_minutes: Math.floor(totalSpeakingMinutes),
        total_reactions_given: messagesSent.length,
        total_reactions_received: 0, // would need reaction tracking table
        achievements,
        milestones,
      },
    });
  } catch (err) {
    logger.error({ err }, "community stats fetch failed");
    return res.json({ stats: null });
  }
});

export default router;
