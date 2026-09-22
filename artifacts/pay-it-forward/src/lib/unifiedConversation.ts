/**
 * Frontend-only projection of the existing Direct, Request, and Hub rows.
 * This is deliberately not a new conversation backend or database model.
 */
export type ConversationKind = "direct" | "request" | "hub";

export type UnifiedConversation = {
  key: string;
  kind: ConversationKind;
  sourceId: number;
  title: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  lastMessage?: string | null;
  timestamp?: string | null;
  unreadCount: number;
  status?: string | null;
  peerUserId?: number | null;
};

export function directToUnified(
  conversation: {
    id: number;
    updated_at: string | null;
    other_user: { id: number; name: string; avatar_url: string | null };
    last_message: {
      body: string;
      sender_id: number;
      created_at: string | null;
      read_at: string | null;
    } | null;
  },
  currentUserId: number | null,
): UnifiedConversation {
  const last = conversation.last_message;
  return {
    key: `direct:${conversation.id}`,
    kind: "direct",
    sourceId: conversation.id,
    title: conversation.other_user.name,
    avatarUrl: conversation.other_user.avatar_url,
    lastMessage: last?.body ?? null,
    timestamp: last?.created_at ?? conversation.updated_at,
    unreadCount: last && !last.read_at && last.sender_id !== currentUserId ? 1 : 0,
    peerUserId: conversation.other_user.id,
  };
}

export function requestToUnified(request: {
  id: number;
  title: string;
  status: string;
  requester_name?: string | null;
  helper_name?: string | null;
  created_at?: string | null;
}): UnifiedConversation {
  return {
    key: `request:${request.id}`,
    kind: "request",
    sourceId: request.id,
    title: request.title,
    subtitle: [request.requester_name, request.helper_name].filter(Boolean).join(" · ") || request.status,
    timestamp: request.created_at ?? null,
    unreadCount: 0,
    status: request.status,
  };
}

export function hubToUnified(hub: {
  id: number;
  hub_a_name: string;
  hub_a_display_name: string | null;
  hub_b_name: string;
  hub_b_display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
}): UnifiedConversation {
  const first = hub.hub_a_display_name || hub.hub_a_name;
  const second = hub.hub_b_display_name || hub.hub_b_name;
  return {
    key: `hub:${hub.id}`,
    kind: "hub",
    sourceId: hub.id,
    title: `${first} ↔ ${second}`,
    lastMessage: hub.last_message,
    timestamp: hub.last_message_at,
    unreadCount: 0,
  };
}

export function sortUnified(items: UnifiedConversation[]): UnifiedConversation[] {
  return [...items].sort((a, b) => {
    const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
    return bTime - aTime || b.sourceId - a.sourceId;
  });
}