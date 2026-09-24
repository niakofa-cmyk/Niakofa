export const UNIFIED_EVENT_TYPES = [
  "message.created",
  "message.updated",
  "message.read",
  "message.deleted",
  "conversation.created",
  "conversation.updated",
  "conversation.read",
  "typing.started",
  "typing.stopped",
  "presence.changed",
  "notification.created",
  "request.created",
  "request.updated",
  "request.status_changed",
  "hub.created",
  "hub.updated",
  "hub.membership_changed",
  "story.created",
  "story.updated",
  "story.viewed",
  "story.reaction",
  "story.reply",
  "story.shared",
  "story.expired",
  "call.invited",
  "call.accepted",
  "call.rejected",
  "call.ended",
  "nia.message",
  "nia.typing",
  "nia.status",
] as const;

export type UnifiedEventType = typeof UNIFIED_EVENT_TYPES[number];

export type UnifiedRealtimeEvent = {
  event_id: string;
  event_type: UnifiedEventType;
  occurred_at: string;
  actor_id: number | null;
  conversation_id: number | null;
  conversation_kind: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  replayed?: boolean;
};

type RealtimeFrame = {
  type: string;
  payload?: unknown;
  event_id?: string;
  occurred_at?: string;
  idempotency_key?: string;
};

const legacyMap: Record<string, UnifiedEventType | null> = {
  direct_message: "message.created",
  chat_message: "message.created",
  hub_message: "message.created",
  message_read: "message.read",
  message_notification: "notification.created",
  typing: "typing.started",
  presence_update: "presence.changed",
  request_updated: "request.updated",
  REQUEST_CREATED: "request.created",
  REQUEST_ACCEPTED: "request.status_changed",
  REQUEST_CANCELLED: "request.status_changed",
  HELPER_MOVING: "request.status_changed",
  HELPER_ARRIVED: "request.status_changed",
  REQUEST_COMPLETED: "request.status_changed",
  community_story_created: "story.created",
  community_story_expired: "story.expired",
  community_story_viewed: "story.viewed",
  community_story_reaction: "story.reaction",
  community_story_shared: "story.shared",
  direct_call_invite: "call.invited",
  direct_call_accept: "call.accepted",
  direct_call_end: "call.ended",
  nia_typing: "nia.typing",
  nia_status: "nia.status",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnifiedEventType(value: unknown): value is UnifiedEventType {
  return typeof value === "string" && (UNIFIED_EVENT_TYPES as readonly string[]).includes(value);
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export function normalizeRealtimeEvent(event: RealtimeFrame): UnifiedRealtimeEvent | null {
  const source = event.type === "unified_event" && isRecord(event.payload) ? event.payload : null;
  const eventType = source?.event_type ?? legacyMap[event.type] ?? null;
  if (!isUnifiedEventType(eventType)) return null;

  const rawPayload = source?.payload ?? event.payload;
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const message = isRecord(payload.message) ? payload.message : null;
  // Canonical consumers should not need to know whether Direct, Request, or
  // Hub wrapped its message in a `message` property.
  const canonicalPayload = message ? { ...payload, ...message } : payload;
  const adjustedType: UnifiedEventType = event.type === "typing"
    && (payload.is_typing === false || payload.status === "stopped")
    ? "typing.stopped"
    : eventType;
  const conversationId = integerOrNull(source?.conversation_id)
    ?? integerOrNull(canonicalPayload.conversation_id)
    ?? integerOrNull(canonicalPayload.request_id)
    ?? integerOrNull(canonicalPayload.hub_id);
  const actorId = integerOrNull(source?.actor_id)
    ?? integerOrNull(canonicalPayload.sender_id)
    ?? integerOrNull(canonicalPayload.sender_user_id)
    ?? integerOrNull(canonicalPayload.user_id);

  return {
    event_id: typeof source?.event_id === "string"
      ? source.event_id
      : event.event_id ?? `${event.type}:${JSON.stringify(payload)}`,
    event_type: adjustedType,
    occurred_at: typeof source?.occurred_at === "string"
      ? source.occurred_at
      : event.occurred_at ?? new Date().toISOString(),
    actor_id: actorId,
    conversation_id: conversationId,
    conversation_kind: typeof source?.conversation_kind === "string"
      ? source.conversation_kind
      : typeof canonicalPayload.kind === "string"
        ? canonicalPayload.kind
        : event.type === "hub_message"
          ? "hub"
          : event.type === "chat_message"
            ? "request"
            : event.type === "direct_message" || event.type === "message_read"
              ? "direct"
              : null,
    entity_id: source?.entity_id != null
      ? String(source.entity_id)
      : canonicalPayload.id != null
        ? String(canonicalPayload.id)
        : null,
    payload: canonicalPayload,
  };
}

/**
 * Replayed events arrive as a `unified_event` envelope while live delivery
 * keeps the legacy frame types for compatibility. Consumers that care about a
 * request lifecycle can use this helper to read both shapes without knowing
 * which delivery path produced the event.
 */
export function unwrapUnifiedRealtimeEvent(
  event: RealtimeFrame,
): { eventType: UnifiedEventType; payload: Record<string, unknown> } | null {
  if (event.type !== "unified_event" || !isRecord(event.payload)) return null;
  const eventType = event.payload.event_type;
  if (!isUnifiedEventType(eventType)) return null;
  const payload = event.payload.payload;
  return { eventType, payload: isRecord(payload) ? payload : {} };
}

export type DurableRealtimeState = {
  cursor: string | null;
  seen: string[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const STORAGE_KEY_PREFIX = "niakofa:realtime-cursor:v2:";
const SEEN_LIMIT = 1000;

function defaultStorage(): StorageLike | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadDurableRealtimeState(
  userId: number | null = null,
  storage?: StorageLike,
): DurableRealtimeState {
  const target = storage ?? defaultStorage();
  if (!target) return { cursor: null, seen: [] };
  try {
    const raw = target.getItem(`${STORAGE_KEY_PREFIX}${userId ?? "anonymous"}`);
    if (!raw) return { cursor: null, seen: [] };
    const parsed = JSON.parse(raw) as Partial<DurableRealtimeState>;
    return {
      cursor: typeof parsed.cursor === "string" ? parsed.cursor : null,
      seen: Array.isArray(parsed.seen)
        ? parsed.seen.filter((value): value is string => typeof value === "string").slice(-SEEN_LIMIT)
        : [],
    };
  } catch {
    return { cursor: null, seen: [] };
  }
}

export function rememberDurableEvent(
  state: DurableRealtimeState,
  eventId: string,
  userId: number | null = null,
  storage?: StorageLike,
): DurableRealtimeState {
  if (!eventId) return state;
  const next: DurableRealtimeState = {
    // The cursor advances even when a replayed event is already in the
    // bounded seen list. This prevents a duplicate from pinning recovery.
    cursor: eventId,
    seen: state.seen.includes(eventId)
      ? state.seen
      : [...state.seen, eventId].slice(-SEEN_LIMIT),
  };
  const target = storage ?? defaultStorage();
  try {
    target?.setItem(`${STORAGE_KEY_PREFIX}${userId ?? "anonymous"}`, JSON.stringify(next));
  } catch {
    // Private browsing and full localStorage must not disable live messaging.
  }
  return next;
}