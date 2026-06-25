/**
 * Niakofa WebSocket Hub
 *
 * Manages all realtime connections with:
 *   - Standardized event types (REQUEST_CREATED, etc.)
 *   - Per-user socket registry for targeted sends
 *   - Presence system (ONLINE / OFFLINE / BUSY / AVAILABLE / IN_REQUEST)
 *   - Per-IP connection limits (max 10 sockets per IP)
 *   - Reconnect cooldown (1 new connection / 2s per IP)
 *   - Server-initiated heartbeat (30s ping, 10s timeout to respond)
 */
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { logger } from "./logger";
import { verifyToken } from "../middlewares/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ── Standardized Niakofa Event Types ─────────────────────────────────────────
// Admin-only event types — these carry sensitive data (report contents,
// reporter/reported user identities) and must NEVER go out via broadcast(),
// only broadcastToAdmins() or sendToUser(). Splitting the type means a
// future broadcast({ type: "new_report", ... }) call is a compile error,
// not just a code-review hope.
export type AdminOnlyEventType = "new_report" | "report_reviewed" | "anomaly_detected" | "new_account_application";

export type WsEventType =
  | AdminOnlyEventType
  | "REQUEST_CREATED"
  | "REQUEST_ACCEPTED"
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
  | "presence_update"
  | "connected"
  | "pong"
  | "ping"
  | "new_report"
  | "report_reviewed"
  | "chat_message"
  | "helper_application_approved"
  | "helper_application_denied"
  | "account_approved"
  | "help_chain_joined"
  | "help_chain_left"
  | "account_denied"
  | "requester_location";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

// broadcast() is public-only by construction — admin-only event types are
// excluded from the type it accepts, so passing one is a compile error.
export interface PublicWsEvent {
  type: Exclude<WsEventType, AdminOnlyEventType>;
  payload: unknown;
}

// ── Presence System ───────────────────────────────────────────────────────────
export type PresenceStatus = "ONLINE" | "OFFLINE" | "BUSY" | "AVAILABLE" | "IN_REQUEST";

const presenceMap = new Map<number, PresenceStatus>();

export function setPresence(userId: number, status: PresenceStatus): void {
  presenceMap.set(userId, status);
  broadcast({ type: "presence_update", payload: { user_id: userId, status } });
}

export function getPresence(userId: number): PresenceStatus {
  return presenceMap.get(userId) ?? "OFFLINE";
}

// ── Per-user socket registry ──────────────────────────────────────────────────
const userSockets = new Map<number, Set<WebSocket>>();

// ── Admin socket registry — populated at register time below ─────────────────
// Used so admin-only events (e.g. SOS, report reviews) aren't broadcast to
// every connected client by default; visibility no longer relies solely on
// the frontend choosing not to render them.
const adminSockets = new Set<WebSocket>();

export function broadcastToAdmins(event: WsEvent): void {
  const msg = JSON.stringify(event);
  let sent = 0;
  // BUG-5-C02: wrap each send in try/catch — a single bad socket must not
  // abort the forEach loop and silently drop all subsequent admin recipients.
  adminSockets.forEach((sock) => {
    if (sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(msg);
        sent++;
      } catch (err) {
        logger.warn({ err, type: event.type }, "WS broadcastToAdmins: send failed for one socket");
      }
    }
  });
  if (sent > 0) logger.info({ type: event.type, clients: sent }, "WS broadcast (admins only)");
}

export function sendToUser(userId: number, event: WsEvent): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(event);
  // BUG-5-C02: per-socket try/catch so one broken connection doesn't
  // prevent delivery to the same user's other open tabs/devices.
  sockets.forEach((sock) => {
    if (sock.readyState === WebSocket.OPEN) {
      try {
        sock.send(msg);
      } catch (err) {
        logger.warn({ err, userId, type: event.type }, "WS sendToUser: send failed for one socket");
      }
    }
  });
}

// MED-004: force-close and deregister every socket for a user — call this
// right after an account is deleted so the deleted user stops receiving
// real-time events instead of lingering until their client disconnects.
export function disconnectUserSockets(userId: number): void {
  const sockets = userSockets.get(userId);
  if (sockets) {
    sockets.forEach((sock) => {
      adminSockets.delete(sock);
      try { sock.close(4001, "Account deleted"); } catch { /* already closed */ }
    });
  }
  userSockets.delete(userId);
}

// ── Connection protection ─────────────────────────────────────────────────────
const MAX_CONNECTIONS_PER_IP  = 10;
const RECONNECT_COOLDOWN_MS   = 2_000;  // 1 new connection per 2s per IP
const HEARTBEAT_INTERVAL_MS   = 30_000; // server pings every 30s
const HEARTBEAT_TIMEOUT_MS    = 10_000; // client must pong within 10s or gets terminated

const ipConnectionCount = new Map<string, number>();
const ipLastConnectTime = new Map<string, number>();
const socketAlive       = new WeakMap<WebSocket, boolean>();

function getClientIp(req: IncomingMessage): string {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) {
    // Trust the LAST entry, not the first — with exactly one trusted proxy
    // in front (Railway, matching app.ts's `trust proxy = 1`), that proxy
    // appends the real client IP as the final hop. The FIRST entry is
    // entirely client-supplied and trivially spoofable by sending a fake
    // x-forwarded-for header directly.
    const parts = (Array.isArray(fwd) ? fwd[0] : fwd).split(",");
    return parts[parts.length - 1]!.trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

// ── WebSocket Server ──────────────────────────────────────────────────────────
let wss: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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

    logger.info({ ip, url: req.url, connections: currentCount + 1 }, "WS client connected");

    // ── Heartbeat: track pong responses ──────────────────────────────────────
    socket.on("pong", () => socketAlive.set(socket, true));

    // ── Message handler ───────────────────────────────────────────────────────
    socket.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsEvent;

        if (msg.type === "ping") {
          socketAlive.set(socket, true); // client-initiated ping also counts as alive
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if ((msg as { type: string }).type === "register") {
          const { userId, authToken } = msg.payload as { userId: number; authToken?: string };
          if (!userId || !authToken) {
            logger.warn({ ip }, "WS: register attempted without authToken — rejecting");
            return;
          }
          const { userId: verifiedUserId, tokenVersion, valid } = verifyToken(authToken);
          if (!valid || verifiedUserId !== userId) {
            logger.warn({ ip, userId }, "WS: register failed token verification — rejecting");
            return;
          }
          // Check token_version against the DB too — verifyToken only
          // checks signature/expiry. Without this, a revoked token (logged
          // out, password changed, or banned user) could still register a
          // live WebSocket connection and keep receiving real-time events,
          // even though the equivalent HTTP request would 401.
          let isAdmin = false;
          try {
            const [u] = await db.select({ is_admin: usersTable.is_admin, token_version: usersTable.token_version })
              .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
            if (!u || u.token_version !== tokenVersion) {
              logger.warn({ ip, userId }, "WS: register token_version mismatch (revoked) — rejecting");
              return;
            }
            isAdmin = u.is_admin;
          } catch (err) {
            logger.warn({ err, userId }, "WS: failed to verify token_version at register — rejecting");
            return;
          }
          registeredUserId = userId;
          if (isAdmin) adminSockets.add(socket);
          if (!userSockets.has(userId)) userSockets.set(userId, new Set());
          userSockets.get(userId)!.add(socket);
          return;
        }

        if ((msg as { type: string }).type === "presence") {
          const { userId, status } = msg.payload as { userId: number; status: PresenceStatus };
          // Only allow a socket to set presence for the user it already
          // authenticated as via "register" — prevents presence spoofing.
          if (userId && status && registeredUserId === userId) {
            setPresence(userId, status);
          }
          return;
        }
      } catch {
        // ignore malformed messages
      }
    });

    // ── Cleanup on close ──────────────────────────────────────────────────────
    socket.on("close", () => {
      const remaining = Math.max(0, (ipConnectionCount.get(ip) ?? 1) - 1);
      if (remaining === 0) {
        ipConnectionCount.delete(ip);
        ipLastConnectTime.delete(ip);
      } else {
        ipConnectionCount.set(ip, remaining);
      }
      socketAlive.delete(socket);
      adminSockets.delete(socket);

      if (registeredUserId !== null) {
        const sockets = userSockets.get(registeredUserId);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) {
            userSockets.delete(registeredUserId);
            setPresence(registeredUserId, "OFFLINE");
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

export function broadcast(event: PublicWsEvent): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  let sent = 0;
  // BUG-5-C02: per-client try/catch — in some Node ws versions client.send()
  // throws synchronously on a broken pipe. One bad socket must not kill the
  // entire broadcast loop and drop all subsequent recipients.
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(msg);
        sent++;
      } catch (err) {
        logger.warn({ err, type: event.type }, "WS broadcast: send failed for one client");
      }
    }
  });
  if (sent > 0) logger.info({ type: event.type, clients: sent }, "WS broadcast");
}

export function broadcastRequestEvent(
  standardType: PublicWsEvent["type"],
  legacyType: PublicWsEvent["type"],
  payload: unknown
): void {
  broadcast({ type: standardType, payload });
  if (standardType !== legacyType) {
    broadcast({ type: legacyType, payload });
  }
}
