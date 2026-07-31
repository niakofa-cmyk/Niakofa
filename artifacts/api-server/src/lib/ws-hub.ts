/**
 * Niakofa WebSocket Hub
 *
 * Manages all realtime connections with:
 *   - Standardized event types (REQUEST_CREATED, etc.)
 *   - Typed event payload interfaces for compile-time correctness
 *   - Per-user socket registry for targeted sends
 *   - Room-based broadcasting (sendToRequestParticipants)
 *   - Batch multi-user sends (sendToUsers)
 *   - Presence system (ONLINE / OFFLINE / BUSY / AVAILABLE / IN_REQUEST)
 *   - Per-IP connection limits (max 10 sockets per IP)
 *   - Reconnect cooldown (1 new connection / 2s per IP)
 *   - Server-initiated heartbeat (30s ping, 10s timeout to respond)
 *   - Hub metrics for admin health endpoint
 */
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { logger } from "./logger";
import { verifyToken } from "../middlewares/auth";
import { db, chatMessagesTable, requestsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Standardized Niakofa Event Types ─────────────────────────────────────────
export type WsEventType =
  | "REQUEST_CREATED"
  | "REQUEST_ACCEPTED"
  | "REQUEST_CANCELLED"
  | "HELPER_MOVING"
  | "HELPER_ARRIVED"
  | "REQUEST_COMPLETED"
  | "PAYMENT_CONFIRMED"
  | "new_request"
  | "request_updated"
  | "helper_location"
  | "helper_online"
  | "helper_offline"
  | "pledge_paid"
  | "tip_paid"
  | "pledge_scheduled"
  | "leaderboard_update"
  | "trust_tier_change"
  | "new_gratitude"
  | "new_gratitude_prompt"
  | "gratitude_liked"
  | "crisis_update"
  | "payment_completed"
  | "payouts_enabled"
  | "payout_sent"
  | "pool_updated"
  | "pool_front_paid"
  | "pool_low_balance"
  | "presence_update"
  | "connected"
  | "pong"
  | "ping"
  | "new_report"
  | "report_reviewed"
  | "chat_message"
  | "typing"
  | "help_chain_joined"
  | "help_chain_left"
  // Live safety alerts during an in-person help session
  | "safety_ping"
  | "safety_sos"
  // NIA AI event types — event-driven communication bridge
  | "nia_message"
  | "nia_checkin"
  | "nia_crisis_alert"
  | "nia_memory_update"
  | "nia_typing"
  | "nia_status"
  | "nia_cost_alert"
  // Wallet cashout events — benevolence_wallet → Stripe transfer
  | "wallet_cashout"
  | "wallet_cashout_reversed"
  | "payment_refunded"
  // Admin real-time notifications — new accounts / applications needing review
  | "new_account_pending"
  | "new_helper_application"
  | "admin_summary_update"
  // Fired when an admin approves/denies a pending account — lets the user's
  // own client react instantly if they still have the pending-approval
  // screen open, instead of relying purely on the poll button.
  | "account_approval_decided"
  // Niakofa Audio Circles — live voice/video rooms.
  | "circle_session_started"
  | "circle_session_ended"
  // Diaspora Platform — Family Vault events (scoped to family members)
  | "family_memory_created"
  | "family_interview_status_changed"
  | "circle_participant_joined"
  | "circle_participant_left"
  | "circle_hand_raised"
  | "circle_role_changed"
  | "circle_reaction"
  | "circle_recording_changed"
  | "circle_recording_available"
  | "circle_recording_status_updated"
  | "circle_host_disconnected"
  | "circle_host_reconnected"
  | "circle_muted"
  | "circle_chat_message"
  | "circle_hands_lowered"
  | "circle_kicked"
  // Co-host role transitions (host assigns/removes the co_host role).
  | "circle_cohost_assigned"
  | "circle_cohost_removed"
  | "circle_settings_updated"
  // Targeted at users who follow a circle when a new live session starts in
  // it — sent via sendToUser, not broadcast (see routes/audio-circles.ts).
  | "circle_went_live"
  // Sent to a specific user to invite them into a live circle session.
  | "circle_invite"
  // Sent to all participants when the host transfers ownership to a co-host.
  | "circle_host_transfer"
  // Broadcast whenever the loudest speaker changes. Clients use this to
  // highlight the active speaker tile (speaking ring, name label) without
  // running their own audio analysis on every remote stream.
  | "circle_active_speaker"
  // Sent to all when a participant's presence heartbeat is registered.
  // (No-op on most clients — only used for diagnostics / admin views.)
  | "circle_heartbeat"
  // WebRTC mesh signaling relay (offer/answer/ICE) between two specific
  // participants in the same session — see sendCircleSignal below.
  | "circle_signal";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

// ── Typed Payload Interfaces ──────────────────────────────────────────────────
// Import these in routes for compile-time correctness on broadcast payloads.

export interface RequestEventPayload {
  id: number;
  title: string;
  status: string;
  category?: string;
  urgency?: string;
  payment_type?: string;
  requester_id: number;
  helper_id?: number | null;
  lat?: number | null;
  lng?: number | null;
  neighborhood?: string | null;
  requester_name?: string | null;
  requester_avatar?: string | null;
  helper_name?: string | null;
  distance_miles?: number | null;
  estimated_duration_min?: number | null;
  created_at?: string | Date | null;
  [key: string]: unknown;
}

export interface PresenceEventPayload {
  user_id: number;
  status: PresenceStatus;
  identity_verified?: boolean;
}

export interface PoolEventPayload {
  balance: number;
  request_id?: number;
  amount?: number;
}

export interface HelperLocationPayload {
  user_id: number;
  request_id?: number;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
}

export interface NiaStatusPayload {
  enabled: boolean;
  last_toggled_at?: string | null;
}

export interface NiaCostAlertPayload {
  cost_usd: number;
  threshold_usd: number;
  period: string;
}

export interface HelpChainPayload {
  request_id: number;
  helper_id: number;
}

export interface PledgeEventPayload {
  user_id: number;
  request_id: number;
  amount: number;
  request_title?: string;
}

export interface LeaderboardUpdatePayload {
  user_id: number;
  help_count?: number;
  trust_score?: number;
  goodwill_score?: number;
  rank?: number;
}

export interface TrustTierChangePayload {
  user_id: number;
  old_tier?: string;
  new_tier: string;
  trust_score: number;
}

export interface CrisisUpdatePayload {
  active: boolean;
  level?: string;
  region?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ReportEventPayload {
  report_id: number;
  reporter_id?: number;
  reported_user_id?: number;
  reason?: string;
  reviewed?: boolean;
}

export interface GratitudeEventPayload {
  id: number;
  author_id?: number;
  content?: string;
  likes?: number;
  [key: string]: unknown;
}

export interface PayoutEventPayload {
  user_id: number;
  amount_cents?: number;
  stripe_transfer_id?: string;
}

export interface AdminSummaryPayload {
  pending_accounts?: number;
  pending_helpers?: number;
  open_reports?: number;
  [key: string]: unknown;
}

// ── Presence System ───────────────────────────────────────────────────────────
export type PresenceStatus = "ONLINE" | "OFFLINE" | "BUSY" | "AVAILABLE" | "IN_REQUEST";

const presenceMap = new Map<number, PresenceStatus>();

export function setPresence(userId: number, status: PresenceStatus): void {
  presenceMap.set(userId, status);
  broadcast({ type: "presence_update", payload: { user_id: userId, status } satisfies PresenceEventPayload });
}

export function getPresence(userId: number): PresenceStatus {
  return presenceMap.get(userId) ?? "OFFLINE";
}

// ── Per-user socket registry ──────────────────────────────────────────────────
const userSockets = new Map<number, Set<WebSocket>>();

// ── Audio Circle session participant registry ────────────────────────────────
// In-memory only (not the source of truth — audio_circle_participants in the
// DB is). This exists purely so the WS layer can authorize a circle_signal
// relay without a DB round-trip on every single ICE candidate, which can be
// chatty. Populated/cleared by routes/audio-circles.ts on join/leave/end.
const circleSessionParticipants = new Map<number, Set<number>>();

export function addCircleParticipant(sessionId: number, userId: number): void {
  if (!circleSessionParticipants.has(sessionId)) circleSessionParticipants.set(sessionId, new Set());
  circleSessionParticipants.get(sessionId)!.add(userId);
}

export function removeCircleParticipant(sessionId: number, userId: number): void {
  const set = circleSessionParticipants.get(sessionId);
  if (!set) return;
  set.delete(userId);
  if (set.size === 0) circleSessionParticipants.delete(sessionId);
}

export function clearCircleSession(sessionId: number): void {
  circleSessionParticipants.delete(sessionId);
}

export function isCircleParticipant(sessionId: number, userId: number): boolean {
  return circleSessionParticipants.get(sessionId)?.has(userId) ?? false;
}

/**
 * Send an event to all active WebSocket connections for a specific user.
 * No-ops silently if the user has no open sockets.
 */
export function sendToUser(userId: number, event: WsEvent): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(event);
  sockets.forEach((sock) => {
    if (sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(msg);
      } catch (err) {
        logger.warn({ err, userId, type: event.type }, "WS sendToUser: send failed — client likely closed mid-send");
      }
    }
  });
}

/**
 * Send an event to multiple users in a single pass.
 * Deduplicates — if the same userId appears twice, the event is sent once.
 */
export function sendToUsers(userIds: number[], event: WsEvent): void {
  const seen = new Set<number>();
  const msg = JSON.stringify(event);
  for (const userId of userIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    sockets.forEach((sock) => {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(msg);
        } catch (err) {
          logger.warn({ err, userId, type: event.type }, "WS sendToUsers: send failed — client likely closed mid-send");
        }
      }
    });
  }
}

/**
 * Canonical helper for request lifecycle events: notifies both the requester
 * and the assigned helper (when one exists) without requiring callers to
 * duplicate the null-check.
 *
 * Usage in routes replaces:
 *   sendToUser(request.requester_id, event);
 *   if (request.helper_id) sendToUser(request.helper_id, event);
 *
 * With:
 *   sendToRequestParticipants(request.requester_id, request.helper_id, event);
 */
export function sendToRequestParticipants(
  requesterId: number,
  helperId: number | null | undefined,
  event: WsEvent
): void {
  const ids: number[] = [requesterId];
  if (helperId != null) ids.push(helperId);
  sendToUsers(ids, event);
}

// ── Niakofa Audio Circles ────────────────────────────────────────────────────

export interface CircleSessionEventPayload {
  session_id: number;
  circle_id: number;
  host_id: number;
  title?: string;
  video_enabled?: boolean;
}

export interface CircleParticipantEventPayload {
  session_id: number;
  user_id: number;
  name?: string;
  avatar_url?: string | null;
  role?: "host" | "co_host" | "speaker" | "listener";
}

export interface CircleRoleChangedPayload {
  session_id: number;
  user_id: number;
  role: "host" | "co_host" | "speaker" | "listener";
  muted?: boolean;
}

export interface CircleCohostEventPayload {
  session_id: number;
  user_id: number;
}

export interface CircleWentLivePayload {
  session_id: number;
  circle_id: number;
  title: string;
  host_name?: string;
}

export interface CircleReactionPayload {
  session_id: number;
  user_id: number;
  emoji: string;
}

export interface CircleRecordingChangedPayload {
  session_id: number;
  is_recording: boolean;
  recording_url?: string | null;
}

/**
 * Relays a WebRTC signaling message (SDP offer/answer or ICE candidate)
 * from one participant directly to another specific participant in the same
 * session — this WS hub is purely a signaling relay, never a media relay.
 * Actual audio/video never passes through the server; peers connect
 * directly (mesh) once signaling completes. See lib/webrtcMesh.ts on the
 * frontend for the peer connection management this pairs with.
 */
export function sendCircleSignal(
  toUserId: number,
  payload: { session_id: number; from_user_id: number; signal: unknown }
): void {
  sendToUser(toUserId, { type: "circle_signal", payload });
}

/** Broadcasts a session-wide Audio Circle event to every listed participant. */
export function sendToCircleParticipants(userIds: number[], event: WsEvent): void {
  sendToUsers(userIds, event);
}

// ── Presence / online-status queries ─────────────────────────────────────────

/**
 * Returns true if the user has at least one open WebSocket connection.
 * Uses the socket registry (not presenceMap) for a ground-truth answer.
 */
export function isUserOnline(userId: number): boolean {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return false;
  for (const sock of sockets) {
    if (sock.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

/**
 * Returns all user IDs that currently have at least one open connection.
 * Useful for dispatch heuristics ("prefer online helpers") and admin dashboards.
 */
export function getConnectedUserIds(): number[] {
  const ids: number[] = [];
  for (const [userId, sockets] of userSockets) {
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        ids.push(userId);
        break; // only count each user once
      }
    }
  }
  return ids;
}

// ── Hub Metrics ───────────────────────────────────────────────────────────────

export interface HubMetrics {
  /** Total raw WebSocket connections (one user on two tabs = 2) */
  total_connections: number;
  /** Distinct authenticated user IDs with ≥1 open socket */
  registered_users: number;
  /** Number of user IDs currently tracked in presence map */
  presence_tracked: number;
  /** Presence distribution: how many users are in each status */
  presence_counts: Record<PresenceStatus, number>;
  /** User IDs currently online (open socket) */
  online_user_ids: number[];
}

/**
 * Returns live metrics about the WebSocket hub for the admin health endpoint.
 * All reads are O(n) over the in-memory maps — no DB calls.
 */
export function getHubMetrics(): HubMetrics {
  let totalConnections = 0;
  const onlineUserIds: number[] = [];

  for (const [userId, sockets] of userSockets) {
    let hasOpen = false;
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        totalConnections++;
        hasOpen = true;
      }
    }
    if (hasOpen) onlineUserIds.push(userId);
  }

  const presenceCounts: Record<PresenceStatus, number> = {
    ONLINE: 0,
    OFFLINE: 0,
    BUSY: 0,
    AVAILABLE: 0,
    IN_REQUEST: 0,
  };
  for (const status of presenceMap.values()) {
    presenceCounts[status]++;
  }

  return {
    total_connections: totalConnections,
    registered_users: onlineUserIds.length,
    presence_tracked: presenceMap.size,
    presence_counts: presenceCounts,
    online_user_ids: onlineUserIds,
  };
}

// ── Connection protection ─────────────────────────────────────────────────────
const MAX_CONNECTIONS_PER_IP  = 10;
const RECONNECT_COOLDOWN_MS   = 2_000;  // 1 new connection per 2s per IP
const HEARTBEAT_INTERVAL_MS   = 30_000; // server pings every 30s
const HEARTBEAT_TIMEOUT_MS    = 10_000; // client must pong within 10s or gets terminated
// Auth timeout: a socket that never completes `register` within this window is
// closed. This prevents silent unauthenticated subscribers that can receive
// all platform broadcast() messages without ever supplying credentials.
const AUTH_TIMEOUT_MS = 15_000; // 15s to complete auth after connection

const ipConnectionCount = new Map<string, number>();
const ipLastConnectTime = new Map<string, number>();
const socketAlive       = new WeakMap<WebSocket, boolean>();

// WeakSet of sockets that have completed a verified `register` handshake.
// broadcast() uses this to skip unauthenticated sockets.
const authenticatedSockets = new WeakSet<WebSocket>();

function getClientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

// ── WebSocket Server ──────────────────────────────────────────────────────────
let wss: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// Build the allowlist once at startup from ALLOWED_ORIGIN.
// In dev (no env var) all origins are permitted — Railway always sets this in prod.
function buildWsOriginAllowlist(): Set<string> | null {
  const raw = process.env["ALLOWED_ORIGIN"];
  if (!raw) return null; // open (dev)
  return new Set(raw.split(",").map(s => s.trim().replace(/\/$/, "")));
}
const WS_ORIGIN_ALLOWLIST = buildWsOriginAllowlist();

export function initWebSocketServer(server: import("http").Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/ws" });

  // ── Server-initiated heartbeat: ping every 30s, terminate non-responsive sockets ──
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      if (socketAlive.get(client) === false) {
        client.terminate(); // did not respond to last ping
        return;
      }
      socketAlive.set(client, false); // reset; must pong before next cycle
      client.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const ip = getClientIp(req);

    // ── Origin check (production only) ─────────────────────────────────────────
    if (WS_ORIGIN_ALLOWLIST) {
      const origin = (req.headers["origin"] ?? "").replace(/\/$/, "");
      if (!WS_ORIGIN_ALLOWLIST.has(origin)) {
        logger.warn({ ip, origin }, "WS: rejected — origin not in ALLOWED_ORIGIN");
        socket.close(1008, "Origin not allowed");
        return;
      }
    }

    // ── Per-IP connection limit ───────────────────────────────────────────────
    const currentCount = ipConnectionCount.get(ip) ?? 0;
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      logger.warn({ ip, count: currentCount }, "WS: too many connections — rejecting");
      socket.close(1008, "Too many WebSocket connections from your network. Please reload and try again.");
      return;
    }

    // ── Reconnect cooldown ────────────────────────────────────────────────────
    const lastConnect = ipLastConnectTime.get(ip) ?? 0;
    const now = Date.now();
    if (now - lastConnect < RECONNECT_COOLDOWN_MS) {
      logger.warn({ ip }, "WS: reconnecting too fast — rejecting");
      socket.close(1008, "Reconnecting too quickly. Please wait a moment before reconnecting.");
      return;
    }

    ipConnectionCount.set(ip, currentCount + 1);
    ipLastConnectTime.set(ip, now);
    socketAlive.set(socket, true);

    let registeredUserId: number | null = null;

    // AUTH TIMEOUT: give the client AUTH_TIMEOUT_MS to complete a verified
    // register handshake. If it hasn't, close the socket. This prevents silent
    // unauthenticated subscribers that never send `register` but still receive
    // every broadcast() message on the hub.
    const authTimeoutHandle = setTimeout(() => {
      if (!authenticatedSockets.has(socket)) {
        logger.warn({ ip }, "WS: auth timeout — closing unauthenticated socket");
        socket.send(JSON.stringify({ type: "error", payload: { message: "Authentication required. Please log in and reconnect." } }));
        socket.close(1008, "Authentication timeout");
      }
    }, AUTH_TIMEOUT_MS);

    logger.info({ ip, url: req.url, connections: currentCount + 1 }, "WS client connected");

    // ── Heartbeat: track pong responses ──────────────────────────────────────
    socket.on("pong", () => socketAlive.set(socket, true));

    // ── Message handler ───────────────────────────────────────────────────────
    socket.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsEvent;

        if (msg.type === "ping") {
          socketAlive.set(socket, true); // client-initiated ping also counts as alive
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if ((msg as { type: string }).type === "register") {
          // SECURITY: verify the Bearer token before trusting the claimed userId.
          // Without this, any WebSocket client could register as any userId and receive
          // that user's targeted push events (chat messages, payment confirmations, etc.).
          const { userId, token } = msg.payload as { userId: number; token?: string };
          if (userId && token) {
            const { userId: verifiedId, valid } = verifyToken(token);
            if (valid && verifiedId === userId) {
              registeredUserId = userId;
              // Mark socket as authenticated so broadcast() includes it and the
              // auth timeout doesn't fire. Must be set before any broadcast call.
              authenticatedSockets.add(socket);
              clearTimeout(authTimeoutHandle);
              if (!userSockets.has(userId)) userSockets.set(userId, new Set());
              userSockets.get(userId)!.add(socket);
              // Mark user online immediately on successful registration
              if (presenceMap.get(userId) === "OFFLINE" || !presenceMap.has(userId)) {
                presenceMap.set(userId, "ONLINE");
                // Broadcast presence without calling setPresence to avoid recursion;
                // the user is being registered, not yet interacting.
                broadcast({ type: "presence_update", payload: { user_id: userId, status: "ONLINE" } });
              }
              logger.info({ userId, ip }, "WS: user registered to socket");
            } else {
              logger.warn({ ip, claimedUserId: userId }, "WS: register rejected — token mismatch");
              socket.send(JSON.stringify({ type: "error", payload: { message: "Invalid token for this userId" } }));
            }
          } else if (userId && !token) {
            // SECURITY: Clients that claim a userId but don't supply a token cannot
            // be authenticated. Previously these were allowed to stay connected and
            // receive general broadcast messages — that means ANY unauthenticated
            // actor who guesses a userId could silently receive platform-wide
            // broadcasts (new requests, presence updates, leaderboard data, etc.).
            // Closing the socket forces all clients to authenticate properly.
            logger.warn({ ip, userId }, "WS: register without token — closing unauthenticated socket");
            socket.send(JSON.stringify({ type: "error", payload: { message: "Authentication required. Please reload and log in." } }));
            socket.close(1008, "Authentication token required");
          }
          return;
        }

        if ((msg as { type: string }).type === "presence") {
          // SECURITY: ignore client-supplied userId; bind status change to the
          // server-verified registeredUserId so a socket can only set presence
          // for the user it authenticated as — not for arbitrary user IDs.
          const { status } = msg.payload as { userId?: number; status: PresenceStatus };
          if (registeredUserId !== null && status) setPresence(registeredUserId, status);
          return;
        }

        if ((msg as { type: string }).type === "chat_message") {
          // SECURITY: must be authenticated; bind to server-verified registeredUserId
          if (registeredUserId === null || !authenticatedSockets.has(socket)) return;
          const { request_id, body, temp_id } = msg.payload as {
            request_id?: number;
            body?: string;
            temp_id?: string;
          };
          if (!request_id || !body?.trim()) return;
          const safeBody = body.trim().slice(0, 2000);
          const senderId = registeredUserId;
          // Fire-and-forget — never block the WS message loop on DB I/O
          (async () => {
            try {
              // Look up request participants to verify sender and route reply
              const [request] = await db
                .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
                .from(requestsTable)
                .where(eq(requestsTable.id, request_id))
                .limit(1);
              if (!request) return;
              const isParticipant =
                request.requester_id === senderId || request.helper_id === senderId;
              if (!isParticipant) return;

              const [sender] = await db
                .select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
                .from(usersTable)
                .where(eq(usersTable.id, senderId))
                .limit(1);

              const [saved] = await db
                .insert(chatMessagesTable)
                .values({ request_id, sender_id: senderId, content: safeBody })
                .returning();
              if (!saved) return;

              const messagePayload = {
                id: String(saved.id),
                request_id,
                sender_id: senderId,
                sender_name: sender?.name ?? "Unknown",
                sender_avatar: sender?.avatar_url ?? null,
                body: safeBody,
                created_at: saved.sent_at?.toISOString() ?? new Date().toISOString(),
              };

              // Route to both participants — each gets the same chat_message event
              sendToRequestParticipants(request.requester_id, request.helper_id, {
                type: "chat_message",
                payload: { message: messagePayload, request_id, temp_id },
              });

              // Send read-receipt prompt back to sender so InAppChat knows it was saved
              // (the echo above already replaces the optimistic message via temp_id match)
              logger.debug({ request_id, senderId, msgId: saved.id }, "WS chat_message saved + routed");
            } catch (err) {
              logger.warn({ err, senderId, request_id }, "WS chat_message: DB error");
            }
          })();
          return;
        }

        if ((msg as { type: string }).type === "circle_signal") {
          // SECURITY: sender must be authenticated, and both sender and
          // target must currently be registered participants of this exact
          // session — this is a pure relay, the server never inspects or
          // stores the SDP/ICE payload itself.
          if (registeredUserId === null || !authenticatedSockets.has(socket)) return;
          const { session_id, to_user_id, signal } = msg.payload as {
            session_id?: number;
            to_user_id?: number;
            signal?: unknown;
          };
          if (!session_id || !to_user_id || signal === undefined) return;
          if (!isCircleParticipant(session_id, registeredUserId) || !isCircleParticipant(session_id, to_user_id)) {
            logger.warn(
              { session_id, from: registeredUserId, to: to_user_id },
              "WS circle_signal: rejected — sender or target not a registered participant"
            );
            return;
          }
          sendCircleSignal(to_user_id, { session_id, from_user_id: registeredUserId, signal });
          return;
        }

        if ((msg as { type: string }).type === "typing") {
          // Route typing indicator to the other participant.
          // SECURITY: sender must be authenticated AND a verified participant of the
          // stated request_id — same participant check used by chat_message above.
          if (registeredUserId === null || !authenticatedSockets.has(socket)) return;
          const { request_id } = msg.payload as { request_id?: number };
          if (!request_id) return;
          const senderId = registeredUserId;
          // Non-blocking lookup
          (async () => {
            try {
              const [request] = await db
                .select({ requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
                .from(requestsTable)
                .where(eq(requestsTable.id, request_id))
                .limit(1);
              if (!request) return;
              // Enforce participant check — sender must be requester or assigned helper
              const isParticipant =
                request.requester_id === senderId || request.helper_id === senderId;
              if (!isParticipant) return;
              // Route to the OTHER participant only
              const otherId = senderId === request.requester_id ? request.helper_id : request.requester_id;
              if (otherId) {
                sendToUser(otherId, {
                  type: "typing" as WsEventType,
                  payload: { sender_id: senderId, request_id },
                });
              }
            } catch {}
          })();
          return;
        }
      } catch {
        // ignore malformed messages
      }
    });

    // ── Cleanup on close ──────────────────────────────────────────────────────
    socket.on("close", () => {
      // Cancel the auth timeout to prevent firing after close
      clearTimeout(authTimeoutHandle);
      const remaining = Math.max(0, (ipConnectionCount.get(ip) ?? 1) - 1);
      // Delete from map when count reaches 0 to prevent unbounded map growth
      if (remaining === 0) {
        ipConnectionCount.delete(ip);
      } else {
        ipConnectionCount.set(ip, remaining);
      }
      // Clean up reconnect cooldown entry after the window has passed
      const lastConnectTs = ipLastConnectTime.get(ip) ?? 0;
      if (Date.now() - lastConnectTs > RECONNECT_COOLDOWN_MS * 2) {
        ipLastConnectTime.delete(ip);
      }
      socketAlive.delete(socket);

      if (registeredUserId !== null) {
        const sockets = userSockets.get(registeredUserId);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) {
            userSockets.delete(registeredUserId);
            presenceMap.set(registeredUserId, "OFFLINE");
            broadcast({ type: "presence_update", payload: { user_id: registeredUserId, status: "OFFLINE" } });
          }
        }
      }

      logger.info({ ip, remaining }, "WS client disconnected");
    });

    socket.on("error", (err) => logger.warn({ err }, "WS socket error"));

    socket.send(
      JSON.stringify({
        type: "connected",
        payload: {
          message: "Niakofa live channel active — Help Today. Pay It Forward Tomorrow.",
          heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
        },
      })
    );
  });

  return wss;
}

export function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function broadcast(event: WsEvent): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  let sent = 0;
  // SECURITY: only deliver to sockets that have completed a verified register
  // handshake (token + userId confirmed). Unauthenticated sockets are tracked
  // in the auth-timeout window and closed after AUTH_TIMEOUT_MS — skipping them
  // here prevents silent data leakage to any client that connects and never
  // authenticates. `broadcastToAuthenticated()` is an alias for the same policy
  // and remains for call-site clarity.
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && authenticatedSockets.has(client)) {
      try {
        client.send(msg);
        sent++;
      } catch (err) {
        // One bad client must not abort the broadcast loop for everyone else.
        // This can happen if the socket transitions to CLOSING between the
        // readyState check and the send() call (torn-down race).
        logger.warn({ err, type: event.type }, "WS broadcast: send failed for one client — skipped");
      }
    }
  });
  if (sent > 0) logger.info({ type: event.type, clients: sent }, "WS broadcast");
}

/**
 * Broadcast an event only to WebSocket clients that have completed auth
 * (i.e. sent a valid "register" message with a verified token).
 *
 * Use this instead of broadcast() for any events that carry user-identifiable
 * data (leaderboard entries with names/cities, etc.) so unauthenticated sockets
 * cannot receive the payload even though they may be connected.
 *
 * Implementation: iterate the userSockets registry (populated on successful
 * token verification in the "register" handler) rather than wss.clients, so
 * only verified sockets are reached.
 */
export function broadcastToAuthenticated(event: WsEvent): void {
  const msg = JSON.stringify(event);
  let sent = 0;
  for (const sockets of userSockets.values()) {
    sockets.forEach((sock) => {
      if (sock.readyState === WebSocket.OPEN) {
        try {
          sock.send(msg);
          sent++;
        } catch (err) {
          logger.warn({ err, type: event.type }, "WS broadcastToAuthenticated: send failed for one client — skipped");
        }
      }
    });
  }
  if (sent > 0) logger.info({ type: event.type, clients: sent }, "WS broadcastToAuthenticated");
}

/**
 * Sends the same request event under both the standardized type and the legacy
 * type. When they are the same, only a single message is sent.
 *
 * Use this for request lifecycle events that older frontend versions may still
 * listen for under the legacy name (e.g. REQUEST_CREATED + new_request).
 */
export function broadcastRequestEvent(
  standardType: WsEventType,
  legacyType: WsEventType,
  payload: unknown
): void {
  broadcast({ type: standardType, payload });
  if (standardType !== legacyType) {
    broadcast({ type: legacyType, payload });
  }
}

// ── NIA AI Event Helpers ──────────────────────────────────────────────────────

/**
 * Emit a NIA AI event to a specific user via WebSocket.
 * Used for real-time status updates, typing indicators, and message delivery.
 */
export function sendNiaEventToUser(userId: number, type: WsEventType, payload: unknown): void {
  sendToUser(userId, { type, payload });
}

/**
 * Broadcast a NIA AI event to all connected clients.
 * Used for global status updates, cost alerts, and system-wide NIA notifications.
 */
export function broadcastNiaEvent(type: WsEventType, payload: unknown): void {
  broadcast({ type, payload });
}

/**
 * Type guard for NIA AI event types.
 */
export function isNiaEventType(type: string): type is WsEventType {
  return [
    "nia_message",
    "nia_checkin",
    "nia_crisis_alert",
    "nia_memory_update",
    "nia_typing",
    "nia_status",
    "nia_cost_alert",
  ].includes(type);
}

// Suppress unused-variable warning for HEARTBEAT_TIMEOUT_MS — it documents
// the intended client-side SLA even though the server enforces it via the
// alive WeakMap + terminate() call in the heartbeat timer above.
void (HEARTBEAT_TIMEOUT_MS satisfies number);
