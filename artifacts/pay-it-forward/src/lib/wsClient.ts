import { getToken } from "@/lib/auth";
/**
 * Niakofa WebSocket Client — shared singleton
 *
 * One connection per browser tab (not per hook call).
 * Handles reconnection with exponential backoff, server-ping keepalive,
 * and user registration so the server can send targeted events via sendToUser.
 */

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
  | "requester_location"
  | "helper_online"
  | "helper_offline"
  | "pledge_paid"
  | "pledge_scheduled"
  | "leaderboard_update"
  | "trust_tier_change"
  | "new_gratitude"
  | "new_gratitude_prompt"
  | "gratitude_liked"
  | "payment_completed"
  | "payouts_enabled"
  | "payout_sent"
  | "new_report"
  | "report_reviewed"
  | "chat_message"
  | "presence_update"
  | "connected"
  | "pong"
  | "ping"
  | "helper_application_approved"
  | "helper_application_denied"
  | "crisis_update";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

type Handler = (event: WsEvent) => void;

// ── Reconnection config ───────────────────────────────────────────────────────
const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

function backoff(attempt: number): number {
  const exp = Math.min(MIN_RECONNECT_MS * 2 ** attempt, MAX_RECONNECT_MS);
  return exp + Math.random() * 500;
}

// ── Singleton state ───────────────────────────────────────────────────────────
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let attempt = 0;
let registeredUserId: number | null = null;
let started = false;

const handlers = new Set<Handler>();

function send(data: object): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function connect(): void {
  if (typeof window === "undefined") return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    attempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Re-register the user after reconnect
    if (registeredUserId !== null) {
      send({ type: "register", payload: { userId: registeredUserId, authToken: getToken() ?? undefined } });
    }

    // Keepalive ping every 25s
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);
  };

  socket.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data as string) as WsEvent;
      handlers.forEach((h) => h(event));
    } catch {
      // ignore malformed
    }
  };

  socket.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    const delay = backoff(attempt);
    attempt = Math.min(attempt + 1, 10);
    reconnectTimer = setTimeout(connect, delay);
  };

  socket.onerror = () => socket?.close();
}

/**
 * Start the shared WebSocket connection.
 * Safe to call multiple times — only connects once.
 */
export function wsStart(): void {
  if (started) return;
  started = true;
  connect();
}

/**
 * Register the current user with the WS hub so the server can use sendToUser.
 * Must be called after wsStart(), re-called whenever the logged-in user changes.
 */
export function wsRegister(userId: number): void {
  registeredUserId = userId;
  send({ type: "register", payload: { userId, authToken: getToken() ?? undefined } });
}

/** Clear registration (e.g. on logout). */
export function wsUnregister(): void {
  registeredUserId = null;
}

/**
 * Subscribe to all incoming WS events.
 * Returns an unsubscribe function — call it in your cleanup.
 */
export function wsSubscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/**
 * Returns true if the shared socket is currently open.
 * Use this to initialise UI state — e.g. useState(() => wsIsConnected()).
 */
export function wsIsConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

// ── Page-visibility reconnect — resume immediately when tab regains focus ──────
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && started) {
      const state = socket?.readyState;
      if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        attempt = 0;
        connect();
      }
    }
  });
}
