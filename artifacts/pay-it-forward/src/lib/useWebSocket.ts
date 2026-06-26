/**
 * useWebSocket — React hook for subscribing to the shared Niakofa WS connection.
 *
 * Uses the module-level singleton from wsClient.ts so every hook on the page
 * shares ONE connection instead of opening a new socket per call-site.
 *
 * Overloads:
 *   useWebSocket(handler)                 — receive ALL event types
 *   useWebSocket(eventType, handler)      — receive ONE specific event type
 */
import { useEffect, useRef } from "react";
import { wsStart, wsSubscribe } from "./wsClient";

export type { WsEventType, WsEvent } from "./wsClient";
import type { WsEvent, WsEventType } from "./wsClient";

type WsHandler = (event: WsEvent) => void;

export function useWebSocket(handler: WsHandler): void;
export function useWebSocket(eventType: WsEventType | string, handler: WsHandler): void;
export function useWebSocket(
  eventTypeOrHandler: WsEventType | string | WsHandler,
  maybeHandler?: WsHandler,
): void {
  const eventTypeFilter: string | null =
    typeof eventTypeOrHandler === "string" ? eventTypeOrHandler : null;
  const rawHandler: WsHandler =
    typeof eventTypeOrHandler === "function" ? eventTypeOrHandler : maybeHandler!;

  // Keep a stable ref so the subscriber closure never goes stale
  const handlerRef = useRef<WsHandler>(rawHandler);
  handlerRef.current = rawHandler;

  useEffect(() => {
    // Ensure the shared connection is open (no-op if already started)
    wsStart();

    const unsubscribe = wsSubscribe((event) => {
      if (eventTypeFilter && event.type !== eventTypeFilter) return;
      handlerRef.current(event);
    });

    return unsubscribe;
  }, [eventTypeFilter]); // re-subscribe only when the filter string changes
}
