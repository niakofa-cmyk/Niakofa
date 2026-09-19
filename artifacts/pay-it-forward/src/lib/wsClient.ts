import { getToken } from "./auth";

/**
 * Niakofa WebSocket Client — shared singleton
 *
 * One connection per browser tab (not per hook call).
 * Handles reconnection with exponential backoff, server-ping keepalive,
 * and user registration so the server can send targeted events via sendToUser.
 */

export type WsEventType =
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
  | "direct_message"
  | "community_story_created"
  | "community_story_expired"
  | "community_story_viewed"
  | "community_story_reaction"
  | "community_story_shared"
  | "message_notification"
  | "hub_message"
  | "message_read"
  | "direct_call_invite"
  | "direct_call_accept"
  | "direct_call_end"
  | "typing"
  | "presence_update"
  | "crisis_update"
  | "help_chain_joined"
  | "help_chain_left"
  | "safety_ping"
  | "safety_sos"
  | "nia_message"
  | "nia_checkin"
  | "nia_crisis_alert"
  | "nia_memory_update"
  | "nia_typing"
  | "nia_status"
  | "nia_cost_alert"
  | "wallet_cashout"
  | "wallet_cashout_reversed"
  | "new_account_pending"
  | "new_helper_application"
  | "admin_summary_update"
  | "account_approval_decided"
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

export type WsConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
export interface WsConnectionSnapshot {
  state: WsConnectionState;
  reconnect_attempt: number;
  changed_at: number;
  last_connected_at: number | null;
  last_disconnected_at: number | null;
}

type Handler = (event: WsEvent) => void;
type ConnectionHandler = (snapshot: WsConnectionSnapshot) => void;

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;
const PING_INTERVAL_MS = 25_000;

function backoff(attempt: number): number {
  const exp = Math.min(MIN_RECONNECT_MS * 2 ** attempt, MAX_RECONNECT_MS);
  return exp + Math.random() * 500;
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let attempt = 0;
let registeredUserId: number | null = null;
let registeredToken: string | null = null;
let started = false;

let connectionSnapshot: WsConnectionSnapshot = {
  state: "idle",
  reconnect_attempt: 0,
  changed_at: Date.now(),
  last_connected_at: null,
  last_disconnected_at: null,
};

const handlers = new Set<Handler>();
const connectionHandlers = new Set<ConnectionHandler>();

function setConnectionState(state: WsConnectionState, reconnectAttempt = attempt): void {
  const now = Date.now();
  connectionSnapshot = {
    state,
    reconnect_attempt: reconnectAttempt,
    changed_at: now,
    last_connected_at: state === "connected" ? now : connectionSnapshot.last_connected_at,
    last_disconnected_at:
      state === "disconnected" || state === "reconnecting" ? now : connectionSnapshot.last_disconnected_at,
  };
  connectionHandlers.forEach((handler) => handler(connectionSnapshot));
}

function send(data: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const reconnectAttempt = attempt;
  const delay = backoff(reconnectAttempt);
  attempt = Math.min(attempt + 1, 10);
  setConnectionState("reconnecting", reconnectAttempt + 1);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function connect(): void {
  if (typeof window === "undefined") return;
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

  setConnectionState(attempt > 0 ? "reconnecting" : "connecting", attempt);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/ws`;
  socket = new WebSocket(url);

  socket.onopen = () => {
    const wasReconnect = attempt > 0;
    attempt = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (registeredUserId !== null) {
      const tok = registeredToken ?? getToken();
      send({ type: "register", payload: { userId: registeredUserId, token: tok } });
    }

    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => send({ type: "ping" }), PING_INTERVAL_MS);
    setConnectionState("connected", 0);

    if (wasReconnect) {
      const reconnectedEvent: WsEvent = { type: "ws_reconnected", payload: {} };
      handlers.forEach((handler) => handler(reconnectedEvent));
    }
  };

  socket.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data as string) as WsEvent;
      handlers.forEach((handler) => handler(event));
    } catch {
      // Ignore malformed server frames.
    }
  };

  socket.onclose = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    setConnectionState("disconnected", attempt);
    scheduleReconnect();
  };

  socket.onerror = () => socket?.close();
}

export function wsStart(): void {
  if (started) return;
  started = true;
  connect();
}

export function wsRegister(userId: number): void {
  registeredUserId = userId;
  registeredToken = getToken();
  send({ type: "register", payload: { userId, token: registeredToken } });
}

export function wsUnregister(): void {
  registeredUserId = null;
  registeredToken = null;
}

export function wsSubscribe(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function wsSubscribeConnection(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler);
  handler(connectionSnapshot);
  return () => connectionHandlers.delete(handler);
}

export function wsGetConnectionSnapshot(): WsConnectionSnapshot {
  return { ...connectionSnapshot };
}

export function wsIsConnected(): boolean {
  return socket?.readyState === WebSocket.OPEN;
}

export function wsSend(data: object): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
    return true;
  }
  return false;
}

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
