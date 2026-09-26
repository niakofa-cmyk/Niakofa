import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, ShieldAlert, UsersRound, X } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { InAppChat } from "@/components/InAppChat";
import HubMessagesPanel from "@/components/messages/HubMessagesPanel";
import { ConversationInfoPanel } from "@/components/messages/ConversationInfoPanel";
import { ConversationList } from "@/components/messages/ConversationList";
import { ConversationThread } from "@/components/messages/ConversationThread";
import { ConversationHeader } from "@/components/messages/ConversationHeader";
import { MessagesShell } from "@/components/messages/MessagesShell";
import { NewMessageRail } from "@/components/messages/NewMessageRail";
import { NewMessageDialog } from "@/components/messages/NewMessageDialog";
import { RequestConversationContext } from "@/components/request/RequestConversationContext";
import { SharedMediaPanel } from "@/components/messages/SharedMediaPanel";
import { DirectCallPanel } from "@/components/messages/DirectCallPanel";
import { MessengerMobileHome } from "@/components/messages/MessengerMobileHome";
import { MobileNavDrawer } from "@/components/MobileNavDrawer";
import { NotificationsDrawer } from "@/components/NotificationsDrawer";
import type { PendingAttachment, PendingContext } from "@/components/messages/MessageComposerWithAttachments";
import type { MessageAttachmentData } from "@/components/messages/MessageAttachment";
import { directConversationPath, hubConversationPath, messagesPath, requestConversationPath, type MessageMode } from "@/lib/messageRoutes";
import { getRequestNavigationPath } from "@/lib/request-navigation";
import { directToUnified, hubToUnified, requestToUnified, sortUnified, type UnifiedConversation } from "@/lib/unifiedConversation";
import { applyUnifiedRealtimeEvent, createConversationState, markConversationRead, shouldNotifyConversation, type ConversationEvent, type ConversationState } from "@/lib/conversationState";
import type { UnifiedRealtimeEvent } from "@/lib/unifiedRealtime";
import { wsGetConnectionSnapshot, wsSubscribe, wsSubscribeConnection, type WsEvent, type WsConnectionState } from "@/lib/wsClient";

type DirectUser = { id: number; name: string; avatar_url: string | null };
type MessageSearchResult = { conversation_id: number; message_id: number; sender_id: number; sender_name: string; sender_avatar: string | null; body: string; created_at: string | null; peer?: DirectUser };
type DirectConversation = {
  id: number;
  updated_at: string | null;
  other_user: DirectUser;
  last_message: {
    id: number;
    body: string;
    sender_id: number;
    created_at: string | null;
    read_at: string | null;
    attachment_count?: number;
  } | null;
};
type DirectMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string | null;
  body: string;
  attachments?: MessageAttachmentData[];
  created_at: string | null;
  read_at: string | null;
};
type HubConversation = {
  id: number;
  hub_a_id: number;
  hub_b_id: number;
  hub_a_name: string;
  hub_a_display_name: string | null;
  hub_b_name: string;
  hub_b_display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
};
type RequestConversation = {
  id: number;
  title: string;
  status: string;
  requester_id: number;
  helper_id: number | null;
  requester_name?: string | null;
  helper_name?: string | null;
  created_at?: string | null;
  lat: number;
  lng: number;
};
type Counts = { all: number; direct: number; requests: number; hubs: number };
type ApiError = { error?: string };
type DirectMessageEvent = { conversation_id?: number; message?: DirectMessage };

function browserNotify(title: string, body: string, tag: string): void {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body: body.slice(0, 160), tag });
  } catch {
    // Browser notification support can be revoked between the permission check
    // and construction. Realtime messaging must remain usable in that case.
  }
}

function modeFromLocation(location: string): MessageMode {
  const [pathname, query] = location.split("?");
  const params = new URLSearchParams(query ?? "");
  const mode = params.get("mode");
  if (mode === "direct" || mode === "hub" || mode === "requests") return mode;
  if (mode === "request") return "requests";
  if (params.has("sourceHub") || params.has("targetHub")) return "hub";
  if (pathname === "/diaspora/messages") return "all";
  return "all";
}

function queryValue(location: string, key: string): string | null {
  return new URLSearchParams(location.split("?")[1] ?? "").get(key);
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as ApiError;
  return data.error || fallback;
}

function mergeDirectMessage(messages: DirectMessage[], incoming: DirectMessage): DirectMessage[] {
  return [...messages.filter((message) => message.id !== incoming.id), incoming].sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return aTime - bTime || a.id - b.id;
  });
}

function RequestThread({
  request,
  currentUserId,
  currentUserName,
  onBack,
  onOpenRequest,
}: {
  request: RequestConversation;
  currentUserId: number;
  currentUserName: string;
  onBack: () => void;
  onOpenRequest: () => void;
}) {
  const otherName = request.requester_id === currentUserId
    ? request.helper_name || "Your helper"
    : request.requester_name || "Request owner";
  useEffect(() => {
    void fetch("/api/messages/requests/" + request.id + "/read", { method: "POST", headers: authHeaders() }).catch(() => {});
  }, [request.id]);
  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConversationHeader title={request.title} subtitle={`${request.status} · ${otherName}`} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <RequestConversationContext request={request} currentUserId={currentUserId} onOpen={onOpenRequest} />
        <InAppChat
          requestId={request.id}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          remoteUserName={otherName}
        />
      </div>
    </section>
  );
}

export default function MessagesPage() {
  const [location, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const activeMode = modeFromLocation(location);
  const [directConversations, setDirectConversations] = useState<DirectConversation[]>([]);
  const [hubConversations, setHubConversations] = useState<HubConversation[]>([]);
  const [requestConversations, setRequestConversations] = useState<RequestConversation[]>([]);
  const [selectedDirectId, setSelectedDirectId] = useState<number | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [newRecipient, setNewRecipient] = useState<DirectUser | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DirectUser[]>([]);
  const [messageSearchResults, setMessageSearchResults] = useState<MessageSearchResult[]>([]);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearchQuery, setThreadSearchQuery] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [contexts, setContexts] = useState<PendingContext[]>([]);
  const [reportReason, setReportReason] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showMobileNotifications, setShowMobileNotifications] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [callMode, setCallMode] = useState<"voice" | "video" | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Counts>({ all: 0, direct: 0, requests: 0, hubs: 0 });
  const [realtimeState, setRealtimeState] = useState<WsConnectionState>(() => wsGetConnectionSnapshot().state);
  const [liveConversationState, setLiveConversationState] = useState<ConversationState>(() => createConversationState());
  const liveConversationStateRef = useRef(liveConversationState);
  const [presenceByUser, setPresenceByUser] = useState<Record<number, string>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<number, boolean>>({});

  const markLiveConversationRead = useCallback((kind: ConversationEvent["kind"], sourceId: number) => {
    const next = markConversationRead(liveConversationStateRef.current, kind, sourceId);
    if (next === liveConversationStateRef.current) return;
    liveConversationStateRef.current = next;
    setLiveConversationState(next);
  }, []);

  const selectedConversation = useMemo(
    () => directConversations.find((conversation) => conversation.id === selectedDirectId) ?? null,
    [directConversations, selectedDirectId],
  );
  const activeRecipient = newRecipient ?? selectedConversation?.other_user ?? null;
  const selectedRequestId = Number.parseInt(queryValue(location, "request") ?? "", 10);
  const selectedHubId = Number.parseInt(queryValue(location, "conversation") ?? "", 10);
  const selectedRequest = requestConversations.find((request) => request.id === selectedRequestId) ?? null;
  const selectedHub = hubConversations.find((conversation) => conversation.id === selectedHubId) ?? null;
  const mobilePeople = useMemo(
    () => directConversations.map((conversation) => conversation.other_user),
    [directConversations],
  );
  const sharedAttachments = useMemo(
    () => directMessages.flatMap((message) => message.attachments ?? []),
    [directMessages],
  );
  const threadSearchMatches = useMemo(() => {
    const query = threadSearchQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    return directMessages.filter((message) => message.body.toLocaleLowerCase().includes(query)).map((message) => message.id);
  }, [directMessages, threadSearchQuery]);
  const threadSearchMatchIndex = threadSearchMatches.length
    ? Math.max(0, threadSearchMatches.indexOf(highlightedMessageId ?? threadSearchMatches[0]))
    : 0;
  const threadHighlightedMessageId = threadSearchOpen && threadSearchQuery.trim() && threadSearchMatches.length
    ? threadSearchMatches[threadSearchMatchIndex]
    : highlightedMessageId;

  const loadDirectConversations = useCallback(async () => {
    const response = await fetch("/api/messages/direct/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load direct conversations."));
    const data = await response.json() as { conversations?: DirectConversation[] };
    const next = Array.isArray(data.conversations) ? data.conversations : [];
    setDirectConversations(next);
    return next;
  }, []);

  const loadDirectMessages = useCallback(async (conversationId: number, targetMessageId?: number | null) => {
    const response = await fetch(`/api/messages/direct/${conversationId}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load this conversation."));
    const data = await response.json() as { messages?: DirectMessage[] };
    setSelectedDirectId(conversationId);
    setNewRecipient(null);
    setDirectMessages(Array.isArray(data.messages) ? data.messages : []);
    setHighlightedMessageId(targetMessageId && targetMessageId > 0 ? targetMessageId : null);
    await fetch(`/api/messages/direct/conversations/${conversationId}/read`, { method: "POST", headers: authHeaders() });
    markLiveConversationRead("direct", conversationId);
  }, [markLiveConversationRead]);

  const loadHubConversations = useCallback(async () => {
    const response = await fetch("/api/diaspora/hub-messages/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load Hub conversations."));
    const data = await response.json() as { conversations?: HubConversation[] };
    setHubConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, []);

  const loadRequestConversations = useCallback(async () => {
    if (!currentUser?.id) return;
    const query = new URLSearchParams({ limit: "50" }).toString();
    const [requesterResponse, helperResponse] = await Promise.all([
      fetch(`/api/requests?requester_id=${currentUser.id}&${query}`, { headers: authHeaders() }),
      fetch(`/api/requests?helper_id=${currentUser.id}&${query}`, { headers: authHeaders() }),
    ]);
    if (!requesterResponse.ok || !helperResponse.ok) throw new Error("Could not load request conversations.");
    const requester = await requesterResponse.json() as RequestConversation[];
    const helper = await helperResponse.json() as RequestConversation[];
    const merged = [...(Array.isArray(requester) ? requester : []), ...(Array.isArray(helper) ? helper : [])];
    const unique = new Map(merged.map((request) => [request.id, request]));
    setRequestConversations([...unique.values()].sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : a.id;
      const bTime = b.created_at ? Date.parse(b.created_at) : b.id;
      return bTime - aTime;
    }));
  }, [currentUser?.id]);

  const loadUnreadSummary = useCallback(async () => {
    const response = await fetch("/api/messages/unread-summary", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load message counts."));
    const data = await response.json() as Partial<Counts>;
    setUnreadCounts({
      all: Number(data.all) || 0,
      direct: Number(data.direct) || 0,
      requests: Number(data.requests) || 0,
      hubs: Number(data.hubs) || 0,
    });
  }, []);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    const results = await Promise.allSettled([
      loadDirectConversations(),
      loadRequestConversations(),
      loadHubConversations(),
      loadUnreadSummary(),
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    // Messages is a unified shell over four independent sources. Keep the
    // shell usable when an optional source (for example Hub data) is briefly
    // unavailable; only surface an error when the inbox itself cannot load.
    const directFailed = results[0]?.status === "rejected";
    if (directFailed) {
      const reason = failures[0]?.reason;
      setError(reason instanceof Error ? reason.message : "Could not load Messages.");
    } else if (failures.length) {
      const reason = failures[0]?.reason;
      setError(reason instanceof Error ? reason.message : "Some Messages features are temporarily unavailable.");
    }
    setLoading(false);
  }, [loadDirectConversations, loadHubConversations, loadRequestConversations, loadUnreadSummary]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  useEffect(() => {
    if (activeMode !== "direct") return;
    const conversationId = Number.parseInt(queryValue(location, "conversation") ?? "", 10);
    const targetMessageId = Number.parseInt(queryValue(location, "message") ?? "", 10);
    if (Number.isSafeInteger(conversationId) && conversationId > 0 && (conversationId !== selectedDirectId || (targetMessageId > 0 && targetMessageId !== highlightedMessageId))) {
      void loadDirectMessages(conversationId, Number.isSafeInteger(targetMessageId) ? targetMessageId : null).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load this conversation."));
    }
  }, [activeMode, highlightedMessageId, location, loadDirectMessages, selectedDirectId]);

  useEffect(() => {
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
  }, [selectedDirectId]);

  useEffect(() => {
    if (!threadSearchOpen || !threadSearchQuery.trim()) return;
    if (!threadSearchMatches.length) {
      setHighlightedMessageId(null);
      return;
    }
    if (!threadSearchMatches.includes(highlightedMessageId ?? -1)) {
      setHighlightedMessageId(threadSearchMatches[0]);
    }
  }, [highlightedMessageId, threadSearchMatches, threadSearchOpen, threadSearchQuery]);

  useEffect(() => {
    if (!selectedDirectId || activeMode !== "direct" || realtimeState === "connected") return;
    const interval = window.setInterval(() => { void loadDirectMessages(selectedDirectId).catch(() => {}); }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeMode, loadDirectMessages, realtimeState, selectedDirectId]);

  useEffect(() => {
    const unsubscribeConnection = wsSubscribeConnection((snapshot) => setRealtimeState(snapshot.state));
    const unsubscribeEvents = wsSubscribe((event: WsEvent) => {
      if (event.type === "unified_event") {
        const unified = event.payload as UnifiedRealtimeEvent;
        const result = applyUnifiedRealtimeEvent(liveConversationStateRef.current, unified, currentUser?.id ?? null);
        if (result.accepted && result.state !== liveConversationStateRef.current) {
          liveConversationStateRef.current = result.state;
          setLiveConversationState(result.state);
        }

        const payload = unified.payload;
        if (unified.event_type === "presence.changed") {
          const userId = typeof payload.user_id === "number" ? payload.user_id : unified.actor_id;
          if (userId) setPresenceByUser((current) => ({ ...current, [userId]: typeof payload.status === "string" ? payload.status : "OFFLINE" }));
          return;
        }
        if (unified.event_type === "typing.started" || unified.event_type === "typing.stopped") {
          if (unified.conversation_id) {
            setTypingByConversation((current) => ({
              ...current,
              [unified.conversation_id!]: unified.event_type === "typing.started",
            }));
          }
          return;
        }
        if (unified.event_type === "message.read" || unified.event_type === "conversation.read") {
          if (unified.conversation_id && (unified.conversation_kind === "direct" || unified.conversation_kind === "request" || unified.conversation_kind === "hub")) {
            markLiveConversationRead(unified.conversation_kind, unified.conversation_id);
          }
          void loadUnreadSummary().catch(() => {});
          return;
        }
        if (unified.event_type === "message.created") {
          const conversationId = unified.conversation_id;
          const message = typeof payload.id === "number"
            && typeof payload.sender_id === "number"
            ? payload as unknown as DirectMessage
            : null;
          if (conversationId && unified.conversation_kind === "direct" && message) {
            setDirectMessages((current) => conversationId === selectedDirectId ? mergeDirectMessage(current, message) : current);
            void Promise.all([loadDirectConversations(), loadUnreadSummary()]).catch(() => {});
            if (message.sender_id !== currentUser?.id && conversationId === selectedDirectId) {
              markLiveConversationRead("direct", conversationId);
              void fetch(`/api/messages/direct/conversations/${conversationId}/read`, { method: "POST", headers: authHeaders() }).catch(() => {});
            } else if (shouldNotifyConversation({
              activeKey: selectedDirectId ? `direct:${selectedDirectId}` : null,
              conversationKey: `direct:${conversationId}`,
              documentVisible: document.visibilityState === "visible",
              permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
              senderId: message.sender_id,
              currentUserId: currentUser?.id ?? null,
            })) {
              browserNotify(`${message.sender_name} sent you a message`, message.body, `direct:${conversationId}`);
            }
          } else {
            void Promise.all([loadRequestConversations(), loadHubConversations(), loadUnreadSummary()]).catch(() => {});
          }
          return;
        }
        if (
          unified.event_type === "request.created"
          || unified.event_type === "request.updated"
          || unified.event_type === "request.status_changed"
          || unified.event_type === "hub.created"
          || unified.event_type === "hub.updated"
          || unified.event_type === "hub.membership_changed"
          || unified.event_type === "notification.created"
        ) {
          void Promise.all([loadRequestConversations(), loadHubConversations(), loadUnreadSummary()]).catch(() => {});
        }
        return;
      }
      if (event.type === "ws_reconnected") {
        void loadInbox();
        if (activeMode === "direct" && selectedDirectId) void loadDirectMessages(selectedDirectId).catch(() => {});
        return;
      }
      if (event.type !== "direct_message") return;
      const payload = event.payload as DirectMessageEvent | null;
      const message = payload?.message;
      const conversationId = payload?.conversation_id ?? message?.conversation_id;
      if (!message || !conversationId) return;
      // Legacy frames remain available for older consumers, but the canonical
      // unified_event frame owns state, unread, and notification transitions.
      // Merge here only so the thread stays responsive if the canonical frame
      // is delayed by the browser event queue.
      setDirectMessages((current) => conversationId === selectedDirectId ? mergeDirectMessage(current, message) : current);
    });
    return () => { unsubscribeConnection(); unsubscribeEvents(); };
  }, [activeMode, currentUser?.id, loadDirectConversations, loadDirectMessages, loadHubConversations, loadInbox, loadRequestConversations, loadUnreadSummary, markLiveConversationRead, selectedDirectId]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || activeMode === "hub" || activeMode === "requests") {
      setSearchResults([]);
      setMessageSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const [peopleResponse, messagesResponse] = await Promise.all([
        fetch(`/api/messages/direct/users?q=${encodeURIComponent(query)}`, { headers: authHeaders() }),
        fetch(`/api/messages/direct/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() }),
      ]);
      if (peopleResponse.ok) {
        const data = await peopleResponse.json() as { users?: DirectUser[] };
        setSearchResults(Array.isArray(data.users) ? data.users : []);
      } else {
        setSearchResults([]);
      }
      if (messagesResponse.ok) {
        const data = await messagesResponse.json() as { results?: MessageSearchResult[] };
        setMessageSearchResults(Array.isArray(data.results) ? data.results : []);
      } else {
        setMessageSearchResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeMode, search]);

  async function sendDirectMessage() {
    if (!activeRecipient || (!body.trim() && attachments.length === 0 && contexts.length === 0)) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/messages/direct", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId: activeRecipient.id,
          body: body.trim(),
           attachments: attachments.map(({ data_url, original_name, alt_text }) => ({ data_url, original_name, alt_text })),
           contexts,
        }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not send direct message."));
      const data = await response.json() as { conversationId?: number };
      setBody("");
      setAttachments([]);
      setContexts([]);
      setNewRecipient(null);
      await loadDirectConversations();
      await loadUnreadSummary();
      if (data.conversationId) await loadDirectMessages(data.conversationId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send direct message.");
    } finally {
      setWorking(false);
    }
  }

  async function blockRecipient() {
    if (!activeRecipient) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/messages/direct/users/${activeRecipient.id}/block`, { method: "POST", headers: authHeaders() });
      if (!response.ok) throw new Error(await readError(response, "Could not block this user."));
      setSelectedDirectId(null);
      setNewRecipient(null);
      setDirectMessages([]);
      setShowInfo(false);
      navigate(messagesPath("direct"));
      await Promise.all([loadDirectConversations(), loadUnreadSummary()]);
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : "Could not block this user.");
    } finally {
      setWorking(false);
    }
  }

  async function reportConversation() {
    if (!selectedDirectId || !reportReason.trim()) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/messages/direct/conversations/${selectedDirectId}/report`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not submit the report."));
      setReportReason("");
      setShowReport(false);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Could not submit the report.");
    } finally {
      setWorking(false);
    }
  }

  const unifiedItems = useMemo(() => {
    const direct = directConversations.map((conversation) => directToUnified(conversation, currentUser?.id ?? null));
    const requests = requestConversations.map(requestToUnified);
    const hubs = hubConversations.map(hubToUnified);
    const withLiveState = (items: UnifiedConversation[]) => items.map((item) => {
      const live = liveConversationState.conversations[item.key];
      if (!live) return item;
      return {
        ...item,
        title: live.title || item.title,
        lastMessage: live.lastMessage ?? item.lastMessage,
        timestamp: live.timestamp ?? item.timestamp,
        unreadCount: live.unreadCount,
      };
    });
    if (activeMode === "direct") return sortUnified(withLiveState(direct));
    if (activeMode === "requests") return sortUnified(withLiveState(requests));
    if (activeMode === "hub") return sortUnified(withLiveState(hubs));
    return sortUnified(withLiveState([...direct, ...requests, ...hubs]));
  }, [activeMode, currentUser?.id, directConversations, hubConversations, liveConversationState, requestConversations]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || activeMode === "direct") return unifiedItems.filter((item) => !query || item.title.toLowerCase().includes(query) || item.lastMessage?.toLowerCase().includes(query));
    return unifiedItems.filter((item) => item.title.toLowerCase().includes(query) || item.lastMessage?.toLowerCase().includes(query));
  }, [activeMode, search, unifiedItems]);

  const selectedKey = selectedDirectId
    ? `direct:${selectedDirectId}`
    : selectedRequest
      ? `request:${selectedRequest.id}`
      : selectedHub
        ? `hub:${selectedHub.id}`
        : null;
  const showThread = Boolean(activeRecipient || selectedRequest || selectedHub);

  function clearSelection() {
    setCallMode(null);
    setShowSharedMedia(false);
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setSelectedDirectId(null);
    setNewRecipient(null);
    setDirectMessages([]);
    setHighlightedMessageId(null);
    setShowInfo(false);
    navigate(messagesPath(activeMode));
  }

  function selectUnified(item: UnifiedConversation) {
    if (item.kind === "direct") {
      navigate(directConversationPath(item.sourceId));
      void loadDirectMessages(item.sourceId);
    } else if (item.kind === "request") {
      navigate(requestConversationPath(item.sourceId));
    } else {
      navigate(hubConversationPath(item.sourceId));
    }
  }

  const startDirectWithUser = useCallback((user: DirectUser, initialBody = "") => {
    setNewRecipient(user);
    setSelectedDirectId(null);
    setDirectMessages([]);
    setBody(initialBody);
    setContexts([]);
    setSearch("");
    setSearchResults([]);
    setShowInfo(false);
    navigate(messagesPath("direct"));
  }, [navigate]);

  useEffect(() => {
    const recipientId = Number.parseInt(queryValue(location, "recipientId") ?? "", 10);
    const exchangeListingId = Number.parseInt(queryValue(location, "exchangeListingId") ?? "", 10);
    const exchangePickupRequestId = Number.parseInt(queryValue(location, "exchangePickupRequestId") ?? "", 10);
    const hasExchangeContext = Number.isSafeInteger(exchangeListingId) && exchangeListingId > 0;
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || (activeRecipient?.id === recipientId && !hasExchangeContext)) return;
    const storyId = Number.parseInt(queryValue(location, "storyId") ?? "", 10);
    let cancelled = false;
    const loadRecipient = async () => {
      const response = await fetch(`/api/messages/direct/users/${recipientId}`, { headers: authHeaders() });
      if (!response.ok || cancelled) return;
      const data = await response.json() as { user?: DirectUser };
      const recipient = data.user;
      if (recipient && !cancelled) {
        startDirectWithUser(recipient, hasExchangeContext ? "" : `Replying to ${recipient.name}'s Story`);
        if (Number.isSafeInteger(storyId) && storyId > 0) setContexts([{ type: "story", story_id: storyId, label: "Community Story" }]);
        if (hasExchangeContext) {
          const params = new URLSearchParams({ section: "exchange", listingId: String(exchangeListingId) });
          if (Number.isSafeInteger(exchangePickupRequestId) && exchangePickupRequestId > 0) params.set("pickupRequestId", String(exchangePickupRequestId));
          setContexts([{
            type: "link",
            url: `${window.location.origin}/community?${params.toString()}`,
            label: `Exchange coordination · Post #${exchangeListingId}`,
          }]);
        }
      }
    };
    void loadRecipient();
    return () => { cancelled = true; };
  }, [activeRecipient?.id, location, startDirectWithUser]);

  function selectSearchMessage(conversationId: number, messageId: number) {
    setThreadSearchOpen(false);
    setThreadSearchQuery("");
    setSearch("");
    setSearchResults([]);
    setMessageSearchResults([]);
    navigate(directConversationPath(conversationId, messageId));
    void loadDirectMessages(conversationId, messageId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not open this conversation."));
  }

  const thread = activeMode === "hub" ? (
    <HubMessagesPanel initialConversation={selectedHub ? String(selectedHub.id) : queryValue(location, "conversation")} initialSourceHub={queryValue(location, "sourceHub")} initialTargetHub={queryValue(location, "targetHub")} />
  ) : activeMode === "requests" && selectedRequest && currentUser ? (
    <RequestThread
      request={selectedRequest}
      currentUserId={currentUser.id}
      currentUserName={currentUser.name ?? "You"}
      onBack={clearSelection}
      onOpenRequest={() => navigate(getRequestNavigationPath({
        id: selectedRequest.id,
        status: selectedRequest.status,
        requesterId: selectedRequest.requester_id,
        helperId: selectedRequest.helper_id,
        currentUserId: currentUser.id,
      }))}
    />
  ) : activeRecipient ? (
    <ConversationThread
      title={activeRecipient.name}
      avatarUrl={activeRecipient.avatar_url}
      active={presenceByUser[activeRecipient.id] === "ONLINE"}
      subtitle={typingByConversation[selectedDirectId ?? -1] ? "Typing…" : presenceByUser[activeRecipient.id] === "ONLINE" ? "Active now" : realtimeState === "connected" ? "Direct message" : "Reconnecting…"}
      messages={directMessages}
       highlightedMessageId={threadHighlightedMessageId}
      currentUserId={currentUser?.id ?? null}
      body={body}
      attachments={attachments}
       contexts={contexts}
      working={working}
      onBack={clearSelection}
      onInfo={() => setShowInfo(true)}
       onSearch={() => setThreadSearchOpen(true)}
       searchOpen={threadSearchOpen}
       searchQuery={threadSearchQuery}
       searchMatchCount={threadSearchMatches.length}
       searchMatchIndex={threadSearchMatchIndex}
       onSearchQueryChange={setThreadSearchQuery}
       onNextSearchMatch={() => {
         if (!threadSearchMatches.length) return;
         setHighlightedMessageId(threadSearchMatches[(threadSearchMatchIndex + 1) % threadSearchMatches.length]);
       }}
       onPreviousSearchMatch={() => {
         if (!threadSearchMatches.length) return;
         setHighlightedMessageId(threadSearchMatches[(threadSearchMatchIndex - 1 + threadSearchMatches.length) % threadSearchMatches.length]);
       }}
       onCloseSearch={() => { setThreadSearchOpen(false); setThreadSearchQuery(""); }}
      onVoiceCall={() => setCallMode("voice")}
      onVideoCall={() => setCallMode("video")}
      onBodyChange={setBody}
      onAttachmentsChange={setAttachments}
       onContextsChange={setContexts}
      onSend={() => void sendDirectMessage()}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div><p className="font-black">Your messages</p><p className="mt-1 text-xs text-muted-foreground">Select a conversation to open its thread.</p></div>
    </div>
  );

  return (
    <>
      {error && (
        <div role="alert" className="mx-auto mt-3 flex max-w-7xl items-start gap-2 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}
      {loading ? (
        <div className="mx-auto flex min-h-[32rem] max-w-7xl items-center justify-center px-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="mx-auto hidden w-full max-w-[82rem] items-center justify-between px-3 pb-2 pt-3 lg:flex">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => navigate("/")} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to Niakofa app">
                <ArrowLeft className="h-4 w-4" /> Niakofa
              </button>
              <span className="text-border">/</span>
              <h1 className="text-xl font-black">Messages</h1>
            </div>
            <button type="button" onClick={() => navigate("/community")} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open Niakofa Community">
              <UsersRound className="h-4 w-4" /> Community
            </button>
          </div>
          {!showThread && (
            <div className="lg:hidden">
              <MessengerMobileHome
                items={visibleItems}
                people={mobilePeople}
                searchResults={searchResults}
                search={search}
                onSearchChange={setSearch}
                onSelect={selectUnified}
                onSelectPerson={startDirectWithUser}
                onCompose={() => setShowNewMessage(true)}
                onNotifications={() => setShowMobileNotifications(true)}
                onMenu={() => setShowMobileMenu(true)}
                onBackToApp={() => navigate("/")}
                onCommunity={() => navigate("/community")}
              />
              <NotificationsDrawer open={showMobileNotifications} onClose={() => setShowMobileNotifications(false)} />
              <MobileNavDrawer
                open={showMobileMenu}
                onClose={() => setShowMobileMenu(false)}
              />
            </div>
          )}
          <div className={showThread ? "" : "hidden lg:block"}>
            <MessagesShell
              showThread={showThread}
              showInfo={showInfo}
              list={<ConversationList activeMode={activeMode} counts={unreadCounts} onModeChange={(mode) => { clearSelection(); navigate(messagesPath(mode)); }} items={visibleItems} selectedKey={selectedKey} search={search} searchResults={searchResults} messageSearchResults={messageSearchResults} onSearchChange={setSearch} onSelect={selectUnified} onSelectPerson={startDirectWithUser} onSelectMessageSearch={selectSearchMessage} onCompose={() => setShowNewMessage(true)} emptyLabel="No conversations yet." />}
              thread={thread}
              info={
            activeRecipient ? (
              <ConversationInfoPanel
                name={activeRecipient.name}
                avatarUrl={activeRecipient.avatar_url}
                active={realtimeState === "connected"}
                sharedAttachments={sharedAttachments}
                onViewProfile={() => navigate(`/helper/${activeRecipient.id}`)}
                onViewSharedMedia={() => setShowSharedMedia(true)}
                onBlock={() => void blockRecipient()}
                onReport={() => setShowReport(true)}
                onClose={() => setShowInfo(false)}
              />
            ) : selectedRequest ? (
              <ConversationInfoPanel
                name={selectedRequest.requester_id === currentUser?.id ? selectedRequest.helper_name || "Your helper" : selectedRequest.requester_name || "Request owner"}
                kind="request"
                contextTitle={selectedRequest.title}
                contextStatus={selectedRequest.status}
                contextMeta="Request chat stays tied to the existing request authorization."
                onOpenContext={() => currentUser && navigate(getRequestNavigationPath({ id: selectedRequest.id, status: selectedRequest.status, requesterId: selectedRequest.requester_id, helperId: selectedRequest.helper_id, currentUserId: currentUser.id }))}
                onClose={() => setShowInfo(false)}
              />
            ) : selectedHub ? (
              <ConversationInfoPanel
                name={`${selectedHub.hub_a_display_name || selectedHub.hub_a_name} ↔ ${selectedHub.hub_b_display_name || selectedHub.hub_b_name}`}
                kind="hub"
                contextTitle={`${selectedHub.hub_a_display_name || selectedHub.hub_a_name} ↔ ${selectedHub.hub_b_display_name || selectedHub.hub_b_name}`}
                contextMeta="Send only as an approved source Hub."
                onClose={() => setShowInfo(false)}
              />
            ) : null
          }
          rightRail={
            <NewMessageRail
              onSelectPerson={(person) => { startDirectWithUser(person); }}
              onSelectHub={(sourceId, targetId) => { clearSelection(); navigate(messagesPath("hub", { sourceHub: sourceId, targetHub: targetId })); }}
              onSelectCommunity={() => navigate("/community")}
            />
            }
            />
          </div>
        </>
      )}
      {currentUser && (
        <DirectCallPanel
          conversationId={selectedDirectId}
          peerId={activeRecipient?.id ?? null}
          peerName={activeRecipient?.name}
          autoStartMode={callMode}
          listenGlobally
          resolvePeer={(userId, conversationId) => {
            const conversation = directConversations.find((item) => item.id === conversationId);
            if (conversation) return { id: conversation.other_user.id, name: conversation.other_user.name };
            const person = directConversations.find((item) => item.other_user.id === userId)?.other_user;
            return person ? { id: person.id, name: person.name } : null;
          }}
          onAutoStartConsumed={() => setCallMode(null)}
          onClose={() => setCallMode(null)}
        />
      )}
      {showSharedMedia && activeRecipient && selectedDirectId && (
        <SharedMediaPanel conversationId={selectedDirectId} onClose={() => setShowSharedMedia(false)} />
      )}
      {showReport && activeRecipient && selectedDirectId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-xl">
            <h2 className="font-black">Report conversation</h2>
            <p className="mt-1 text-xs text-muted-foreground">Reports are reviewed through the existing safety workflow.</p>
            <textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} maxLength={500} rows={4} className="mt-3 w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm outline-none focus:border-primary" placeholder="Tell us what happened" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setShowReport(false); setReportReason(""); }} className="min-h-10 rounded-xl px-3 text-sm font-bold text-muted-foreground">Cancel</button>
              <button type="button" disabled={working || !reportReason.trim()} onClick={() => void reportConversation()} className="min-h-10 rounded-xl bg-rose-500 px-3 text-sm font-black text-white disabled:opacity-50">Submit report</button>
            </div>
          </div>
        </div>
      )}
      {showNewMessage && (
        <NewMessageDialog
          onClose={() => setShowNewMessage(false)}
          onSelectPerson={(person) => { setShowNewMessage(false); startDirectWithUser(person); }}
          onSelectHub={(sourceId, targetId) => { setShowNewMessage(false); clearSelection(); navigate(messagesPath("hub", { sourceHub: sourceId, targetHub: targetId })); }}
          onSelectCommunity={() => { setShowNewMessage(false); navigate("/community"); }}
        />
      )}
    </>
  );
}