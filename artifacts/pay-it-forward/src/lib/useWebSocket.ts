/**
 * useWebSocket — React hook for subscribing to the shared Niakofa WS connection.
 *
 * Uses the module-level singleton from wsClient.ts so every hook on the page
 * shares ONE connection instead of opening a new socket per call-site.
 *
 * Overloads:
 *   useWebSocket(handler)                 — receive ALL event types (escape hatch)
 *   useWebSocket(eventType, handler)      — receive ONE specific event type (PREFERRED)
 *
 * BUG-028: The one-argument (catch-all) form requires the handler to manually
 * type-check `event.type` at runtime. This creates risk if a server event type
 * is renamed — TypeScript won't catch the mismatch. Prefer the two-argument
 * typed form for all new call-sites. The one-argument form is retained as an
 * internal escape hatch for components that legitimately need to handle multiple
 * distinct event types in one callback (e.g. map.tsx's multi-event handler).
 *
 * @example Preferred:
 *   useWebSocket("request_updated", (event) => { ... });
 *
 * @example Escape hatch (document why you need it):
 *   useWebSocket((event) => {
 *     if (event.type === "helper_online") { ... }
 *     if (event.type === "helper_offline") { ... }
 *   });
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
