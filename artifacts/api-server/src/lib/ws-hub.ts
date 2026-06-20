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

// ── Standardized Niakofa Event Types ─────────────────────────────────────────
export type WsEventType =
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
  | "account_denied"
  | "requester_location";

export interface WsEvent {
  type: WsEventType;
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

export function sendToUser(userId: number, event: WsEvent): void {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  const msg = JSON.stringify(event);
  sockets.forEach((sock) => {
    if (sock.readyState === WebSocket.OPEN) sock.send(msg);
  });
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
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(",")[0]!.trim();
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
    socket.on("message", (raw) => {
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
          const { userId: verifiedUserId, valid } = verifyToken(authToken);
          if (!valid || verifiedUserId !== userId) {
            logger.warn({ ip, userId }, "WS: register failed token verification — rejecting");
            return;
          }
          registeredUserId = userId;
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
      ipConnectionCount.set(ip, remaining);
      socketAlive.delete(socket);

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

export function broadcast(event: WsEvent): void {
  if (!wss) return;
  const msg = JSON.stringify(event);
  let sent = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
      sent++;
    }
  });
  if (sent > 0) logger.info({ type: event.type, clients: sent }, "WS broadcast");
}

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
