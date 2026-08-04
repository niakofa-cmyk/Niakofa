import { getToken } from "./auth";

/**
 * Niakofa WebSocket Client — shared singleton
 *
 * One connection per browser tab (not per hook call).
 * Handles reconnection with exponential backoff, server-ping keepalive,
 * and user registration so the server can send targeted events via sendToUser.
 */

export type WsEventType =
  // Synthetic client-side event — emitted by wsClient itself (not the server)
  // when a dropped connection is successfully re-established. Components that
  // cache server-pushed data should listen for this and invalidate / re-fetch.
  | "ws_reconnected"
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
  | "pledge_scheduled"
  | "leaderboard_update"
  | "trust_tier_change"
  | "new_gratitude"
  | "new_gratitude_prompt"
  | "gratitude_liked"
  | "payment_completed"
  | "payouts_enabled"
  | "payout_sent"
  | "pool_updated"
  | "pool_front_paid"
  | "pool_low_balance"
  | "new_report"
  | "report_reviewed"
  | "chat_message"
  | "typing"
  | "presence_update"
  | "crisis_update"
  | "help_chain_joined"
  | "help_chain_left"
  // Live safety alerts during an in-person help session
  | "safety_ping"
  | "safety_sos"
  // Nia AI events
  | "nia_message"
  | "nia_checkin"
  | "nia_crisis_alert"
  | "nia_memory_update"
  | "nia_typing"
  | "nia_status"
  | "nia_cost_alert"
  // Wallet cashout events
  | "wallet_cashout"
  | "wallet_cashout_reversed"
  // Admin real-time notifications
  | "new_account_pending"
  | "new_helper_application"
  | "admin_summary_update"
  // Fired when an admin approves/denies a pending account
  | "account_approval_decided"
  // Niakofa Audio Circles
  | "family_memory_created"
  | "family_interview_status_changed"
  | "family_story_created"
  | "family_place_created"
  | "circle_session_started"
  | "circle_session_ended"
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
  | "circle_kicked"
  | "circle_cohost_assigned"
  | "circle_cohost_removed"
  | "circle_chat_message"
  | "circle_hands_lowered"
  | "circle_went_live"
  | "circle_invite"
  | "circle_host_transfer"
  | "circle_signal"
  | "circle_settings_updated"
  | "circle_active_speaker"
  | "circle_heartbeat"
  | "connected"
  | "pong"
  | "ping";

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
let registeredToken: string | null = null;
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
    // Capture BEFORE resetting — attempt > 0 means this is a recovery, not
    // the first connection. Components subscribed via wsSubscribe can listen
    // for "ws_reconnected" to invalidate caches / re-fetch stale server data.
    const wasReconnect = attempt > 0;
    attempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Re-register after reconnect — include Bearer token so the server
    // can verify identity before routing targeted push events to this socket.
    if (registeredUserId !== null) {
      const tok = registeredToken ?? getToken();
      send({ type: "register", payload: { userId: registeredUserId, token: tok } });
    }

    // Keepalive ping every 25s
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);

    // Notify all subscribers that the connection is back so they can re-fetch
    // any data that might have changed while we were offline.
    if (wasReconnect) {
      const reconnectedEvent: WsEvent = { type: "ws_reconnected", payload: {} };
      handlers.forEach((h) => h(reconnectedEvent));
    }
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
  registeredToken = getToken();
  send({ type: "register", payload: { userId, token: registeredToken } });
}

/** Clear registration (e.g. on logout). */
export function wsUnregister(): void {
  registeredUserId = null;
  registeredToken = null;
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

/**
 * Send a raw message through the shared WebSocket.
 * Returns true if the message was sent, false if the socket was not open.
 * Use this in components that want to send events (e.g. chat_message, typing)
 * without creating a second parallel WebSocket connection.
 */
export function wsSend(data: object): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    return true;
  }
  return false;
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
