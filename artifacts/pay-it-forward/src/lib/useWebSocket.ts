import { useEffect, useRef, useCallback } from "react";

// ── Standardized Niakofa Event Types ─────────────────────────────────────────
// Structured events for operational use — do NOT use ad-hoc string names.
export type WsEventType =
  // Core request lifecycle (standardized)
  | "REQUEST_CREATED"
  | "REQUEST_ACCEPTED"
  | "HELPER_MOVING"
  | "HELPER_ARRIVED"
  | "REQUEST_COMPLETED"
  | "PAYMENT_CONFIRMED"
  // Legacy names (kept for compatibility during migration)
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
  // Trust & safety (admin events)
  | "new_report"
  | "report_reviewed"
  | "chat_message"
  // Presence system
  | "presence_update"
  // Connection management
  | "connected"
  | "pong";

export interface WsEvent {
  type: WsEventType;
  payload: unknown;
}

type WsHandler = (event: WsEvent) => void;

// ── Reconnection config ───────────────────────────────────────────────────────
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const RECONNECT_JITTER_MS = 500;
const PING_INTERVAL_MS = 25000;

function calcBackoff(attempt: number): number {
  const exp = Math.min(MIN_RECONNECT_MS * 2 ** attempt, MAX_RECONNECT_MS);
  return exp + Math.random() * RECONNECT_JITTER_MS;
}

// ── Overloads ─────────────────────────────────────────────────────────────────
// useWebSocket(handler)                   — subscribe to ALL events
// useWebSocket(eventType, handler)        — subscribe to ONE specific event type
export function useWebSocket(handler: WsHandler): void;
export function useWebSocket(eventType: WsEventType | string, handler: WsHandler): void;
export function useWebSocket(
  eventTypeOrHandler: WsEventType | string | WsHandler,
  maybeHandler?: WsHandler,
): void {
  // Resolve to a normalised (eventType | null, handler) pair
  const eventTypeFilter: string | null =
    typeof eventTypeOrHandler === "string" ? eventTypeOrHandler : null;
  const rawHandler: WsHandler =
    typeof eventTypeOrHandler === "function" ? eventTypeOrHandler : maybeHandler!;

  const handlerRef = useRef(rawHandler);
  handlerRef.current = rawHandler;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      // Reset backoff counter on successful connection
      attemptRef.current = 0;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (msg) => {
      if (unmountedRef.current) return;
      try {
        const event = JSON.parse(msg.data) as WsEvent;
        // Filter to specific event type when requested
        if (eventTypeFilter && event.type !== eventTypeFilter) return;
        handlerRef.current(event);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      const delay = calcBackoff(attemptRef.current);
      attemptRef.current = Math.min(attemptRef.current + 1, 10);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [eventTypeFilter]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);

    return () => {
      unmountedRef.current = true;
      clearInterval(pingInterval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
