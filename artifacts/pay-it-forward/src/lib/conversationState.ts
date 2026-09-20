import type { ConversationKind } from "./unifiedConversation";
import type { UnifiedRealtimeEvent } from "./unifiedRealtime";

export type ConversationEvent = {
  type: "direct_message" | "chat_message" | "hub_message" | "message_read";
  eventId?: string | number | null;
  conversationId: number;
  kind: ConversationKind;
  senderId?: number | null;
  currentUserId?: number | null;
  body?: string | null;
  createdAt?: string | null;
  title?: string | null;
  read?: boolean;
};

export type ConversationLiveState = {
  key: string;
  kind: ConversationKind;
  sourceId: number;
  title?: string | null;
  lastMessage?: string | null;
  timestamp?: string | null;
  unreadCount: number;
  lastEventId?: string | null;
  seenEventIds: string[];
};

export type ConversationState = {
  conversations: Record<string, ConversationLiveState>;
  seenEventIds: string[];
};

export type NotificationPolicyInput = {
  activeKey?: string | null;
  conversationKey: string;
  documentVisible: boolean;
  permission?: NotificationPermission | "unsupported";
  senderId?: number | null;
  currentUserId?: number | null;
};

export function conversationKey(kind: ConversationKind, sourceId: number): string {
  return `${kind}:${sourceId}`;
}

export function createConversationState(): ConversationState {
  return { conversations: {}, seenEventIds: [] };
}

function normalizeEventId(event: ConversationEvent): string | null {
  if (event.eventId === null || event.eventId === undefined || event.eventId === "") return null;
  return `${event.type}:${event.kind}:${event.conversationId}:${String(event.eventId)}`;
}

function remember(values: string[], value: string, limit = 500): string[] {
  if (values.includes(value)) return values;
  return [...values, value].slice(-limit);
}

function copyState(state: ConversationState): ConversationState {
  return {
    conversations: { ...state.conversations },
    seenEventIds: [...state.seenEventIds],
  };
}

export function applyConversationEvent(
  state: ConversationState,
  event: ConversationEvent,
): { state: ConversationState; accepted: boolean } {
  const eventId = normalizeEventId(event);
  if (eventId && state.seenEventIds.includes(eventId)) return { state, accepted: false };

  const next = copyState(state);
  const key = conversationKey(event.kind, event.conversationId);
  const previous = state.conversations[key] ?? {
    key,
    kind: event.kind,
    sourceId: event.conversationId,
    title: event.title ?? null,
    lastMessage: null,
    timestamp: null,
    unreadCount: 0,
    seenEventIds: [],
  };
  const incoming = event.senderId !== null && event.senderId !== undefined && event.senderId !== event.currentUserId;
  const isRead = event.type === "message_read" || event.read === true;

  next.conversations[key] = {
    ...previous,
    title: event.title ?? previous.title,
    lastMessage: event.body ?? previous.lastMessage,
    timestamp: event.createdAt ?? previous.timestamp,
    unreadCount: event.type === "message_read"
      ? 0
      : isRead
        ? previous.unreadCount
        : incoming
          ? previous.unreadCount + 1
          : previous.unreadCount,
    lastEventId: eventId ?? previous.lastEventId,
    seenEventIds: eventId ? remember(previous.seenEventIds, eventId, 100) : previous.seenEventIds,
  };
  if (eventId) next.seenEventIds = remember(next.seenEventIds, eventId);
  return { state: next, accepted: true };
}

export function markConversationRead(
  state: ConversationState,
  kind: ConversationKind,
  sourceId: number,
): ConversationState {
  const key = conversationKey(kind, sourceId);
  const current = state.conversations[key];
  if (!current || current.unreadCount === 0) return state;
  return {
    ...state,
    conversations: {
      ...state.conversations,
      [key]: { ...current, unreadCount: 0 },
    },
  };
}

export function shouldNotifyConversation(input: NotificationPolicyInput): boolean {
  if (input.permission !== "granted") return false;
  if (input.documentVisible) return false;
  if (input.activeKey === input.conversationKey) return false;
  if (
    input.senderId !== null &&
    input.senderId !== undefined &&
    input.currentUserId !== null &&
    input.currentUserId !== undefined &&
    input.senderId === input.currentUserId
  ) {
    return false;
  }
  return true;
}

export function applyUnifiedRealtimeEvent(
  state: ConversationState,
  event: UnifiedRealtimeEvent,
  currentUserId: number | null = null,
): { state: ConversationState; accepted: boolean } {
  const kind = event.conversation_kind as ConversationKind | null;
  if (!kind || event.conversation_id === null) return { state, accepted: true };
  const payload = event.payload;
  const mappedType: ConversationEvent["type"] =
    event.event_type === "message.read" || event.event_type === "conversation.read"
      ? "message_read"
      : event.event_type === "message.created"
        ? kind === "direct" ? "direct_message" : kind === "request" ? "chat_message" : "hub_message"
        : kind === "direct" ? "direct_message" : kind === "request" ? "chat_message" : "hub_message";
  return applyConversationEvent(state, {
    type: mappedType,
    eventId: event.event_id,
    conversationId: event.conversation_id,
    kind,
    senderId: typeof payload.sender_id === "number" ? payload.sender_id : event.actor_id,
    currentUserId: typeof payload.current_user_id === "number" ? payload.current_user_id : currentUserId,
    body: typeof payload.body === "string" ? payload.body : null,
    createdAt: typeof payload.created_at === "string" ? payload.created_at : event.occurred_at,
    title: typeof payload.title === "string" ? payload.title : null,
    read: event.event_type === "message.read" || event.event_type === "conversation.read",
  });
}
