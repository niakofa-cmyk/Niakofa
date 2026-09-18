import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ShieldAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { InAppChat } from "@/components/InAppChat";
import HubMessagesPanel from "@/components/messages/HubMessagesPanel";
import { ConversationInfoPanel } from "@/components/messages/ConversationInfoPanel";
import { ConversationList } from "@/components/messages/ConversationList";
import { ConversationThread } from "@/components/messages/ConversationThread";
import { ConversationHeader } from "@/components/messages/ConversationHeader";
import { MessageTypeTabs } from "@/components/messages/MessageTypeTabs";
import { MessagesShell } from "@/components/messages/MessagesShell";
import { MessagesSidebar } from "@/components/messages/MessagesSidebar";
import { directConversationPath, hubConversationPath, messagesPath, requestConversationPath, type MessageMode } from "@/lib/messageRoutes";
import { directToUnified, hubToUnified, requestToUnified, sortUnified, type UnifiedConversation } from "@/lib/unifiedConversation";
import { wsGetConnectionSnapshot, wsSubscribe, wsSubscribeConnection, type WsEvent, type WsConnectionState } from "@/lib/wsClient";

type DirectUser = { id: number; name: string; avatar_url: string | null };
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
  } | null;
};
type DirectMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_avatar: string | null;
  body: string;
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
};
type Counts = { all: number; direct: number; requests: number; hubs: number };
type ApiError = { error?: string };
type DirectMessageEvent = { conversation_id?: number; message?: DirectMessage };

function modeFromLocation(location: string): MessageMode {
  const [pathname, query] = location.split("?");
  const params = new URLSearchParams(query ?? "");
  const mode = params.get("mode");
  if (mode === "direct" || mode === "hub" || mode === "requests") return mode;
  if (mode === "request") return "requests";
  if (pathname === "/diaspora/messages" || params.has("sourceHub") || params.has("targetHub") || params.has("conversation")) return "hub";
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
  return (
    <section className="flex h-full min-h-0 flex-col">
      <ConversationHeader title={request.title} subtitle={`${request.status} · ${otherName}`} onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">Request conversation</p>
            <p className="mt-1 text-sm text-muted-foreground">The existing request chat, authorization, and realtime behavior remain in place.</p>
          </div>
          <button type="button" onClick={onOpenRequest} className="min-h-10 rounded-xl border border-primary/30 px-3 text-xs font-black text-primary hover:bg-primary/10">
            Open request
          </button>
        </div>
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
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
  const [newRecipient, setNewRecipient] = useState<DirectUser | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<DirectUser[]>([]);
  const [body, setBody] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Counts>({ all: 0, direct: 0, requests: 0, hubs: 0 });
  const [realtimeState, setRealtimeState] = useState<WsConnectionState>(() => wsGetConnectionSnapshot().state);

  const selectedConversation = useMemo(
    () => directConversations.find((conversation) => conversation.id === selectedDirectId) ?? null,
    [directConversations, selectedDirectId],
  );
  const activeRecipient = newRecipient ?? selectedConversation?.other_user ?? null;
  const selectedRequestId = Number.parseInt(queryValue(location, "request") ?? "", 10);
  const selectedHubId = Number.parseInt(queryValue(location, "conversation") ?? "", 10);
  const selectedRequest = requestConversations.find((request) => request.id === selectedRequestId) ?? null;
  const selectedHub = hubConversations.find((conversation) => conversation.id === selectedHubId) ?? null;

  const loadDirectConversations = useCallback(async () => {
    const response = await fetch("/api/messages/direct/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load direct conversations."));
    const data = await response.json() as { conversations?: DirectConversation[] };
    const next = Array.isArray(data.conversations) ? data.conversations : [];
    setDirectConversations(next);
    return next;
  }, []);

  const loadDirectMessages = useCallback(async (conversationId: number) => {
    const response = await fetch(`/api/messages/direct/${conversationId}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load this conversation."));
    const data = await response.json() as { messages?: DirectMessage[] };
    setSelectedDirectId(conversationId);
    setNewRecipient(null);
    setDirectMessages(Array.isArray(data.messages) ? data.messages : []);
    await fetch(`/api/messages/direct/conversations/${conversationId}/read`, { method: "POST", headers: authHeaders() });
  }, []);

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
    try {
      await Promise.all([loadDirectConversations(), loadRequestConversations(), loadHubConversations(), loadUnreadSummary()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Messages.");
    } finally {
      setLoading(false);
    }
  }, [loadDirectConversations, loadHubConversations, loadRequestConversations, loadUnreadSummary]);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  useEffect(() => {
    if (activeMode !== "direct") return;
    const conversationId = Number.parseInt(queryValue(location, "conversation") ?? "", 10);
    if (Number.isSafeInteger(conversationId) && conversationId > 0 && conversationId !== selectedDirectId) {
      void loadDirectMessages(conversationId).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load this conversation."));
    }
  }, [activeMode, location, loadDirectMessages, selectedDirectId]);

  useEffect(() => {
    if (!selectedDirectId || activeMode !== "direct" || realtimeState === "connected") return;
    const interval = window.setInterval(() => { void loadDirectMessages(selectedDirectId).catch(() => {}); }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeMode, loadDirectMessages, realtimeState, selectedDirectId]);

  useEffect(() => {
    const unsubscribeConnection = wsSubscribeConnection((snapshot) => setRealtimeState(snapshot.state));
    const unsubscribeEvents = wsSubscribe((event: WsEvent) => {
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
      setDirectMessages((current) => conversationId === selectedDirectId ? mergeDirectMessage(current, message) : current);
      void Promise.all([loadDirectConversations(), loadUnreadSummary()]).catch(() => {});
      if (conversationId === selectedDirectId && message.sender_id !== currentUser?.id) {
        void fetch(`/api/messages/direct/conversations/${conversationId}/read`, { method: "POST", headers: authHeaders() }).catch(() => {});
      }
    });
    return () => { unsubscribeConnection(); unsubscribeEvents(); };
  }, [activeMode, currentUser?.id, loadDirectConversations, loadDirectMessages, loadInbox, loadUnreadSummary, selectedDirectId]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || activeMode === "hub" || activeMode === "requests") {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/messages/direct/users?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
      if (!response.ok) return;
      const data = await response.json() as { users?: DirectUser[] };
      setSearchResults(Array.isArray(data.users) ? data.users : []);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeMode, search]);

  async function sendDirectMessage() {
    if (!activeRecipient || !body.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/messages/direct", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: activeRecipient.id, body: body.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not send direct message."));
      const data = await response.json() as { conversationId?: number };
      setBody("");
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
    if (activeMode === "direct") return sortUnified(direct);
    if (activeMode === "requests") return sortUnified(requests);
    if (activeMode === "hub") return sortUnified(hubs);
    return sortUnified([...direct, ...requests, ...hubs]);
  }, [activeMode, currentUser?.id, directConversations, hubConversations, requestConversations]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query || activeMode === "direct") return unifiedItems.filter((item) => !query || item.title.toLowerCase().includes(query) || item.lastMessage?.toLowerCase().includes(query));
    return unifiedItems.filter((item) => item.title.toLowerCase().includes(query) || item.lastMessage?.toLowerCase().includes(query));
  }, [activeMode, search, unifiedItems]);

  const selectedKey = activeMode === "direct" && (selectedDirectId || activeRecipient)
    ? (selectedDirectId ? `direct:${selectedDirectId}` : null)
    : activeMode === "requests" && selectedRequest ? `request:${selectedRequest.id}`
      : activeMode === "hub" && selectedHub ? `hub:${selectedHub.id}` : null;
  const showThread = Boolean(activeRecipient || selectedRequest || selectedHub);

  function clearSelection() {
    setSelectedDirectId(null);
    setNewRecipient(null);
    setDirectMessages([]);
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

  function startDirectWithUser(user: DirectUser) {
    setNewRecipient(user);
    setSelectedDirectId(null);
    setDirectMessages([]);
    setSearch("");
    setSearchResults([]);
    setShowInfo(false);
    navigate(messagesPath("direct"));
  }

  const thread = activeMode === "hub" ? (
    <HubMessagesPanel initialConversation={selectedHub ? String(selectedHub.id) : queryValue(location, "conversation")} initialSourceHub={queryValue(location, "sourceHub")} initialTargetHub={queryValue(location, "targetHub")} />
  ) : activeMode === "requests" && selectedRequest && currentUser ? (
    <RequestThread request={selectedRequest} currentUserId={currentUser.id} currentUserName={currentUser.name ?? "You"} onBack={clearSelection} onOpenRequest={() => navigate(`/request/${selectedRequest.id}`)} />
  ) : activeRecipient ? (
    <ConversationThread
      title={activeRecipient.name}
      avatarUrl={activeRecipient.avatar_url}
      subtitle={realtimeState === "connected" ? "Active connection" : "Direct message"}
      messages={directMessages}
      currentUserId={currentUser?.id ?? null}
      body={body}
      working={working}
      onBack={clearSelection}
      onInfo={() => setShowInfo(true)}
      onBodyChange={setBody}
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
        <MessagesShell
          showThread={showThread}
          showInfo={showInfo}
          mobileTabs={<MessageTypeTabs active={activeMode} counts={unreadCounts} onChange={(mode) => { clearSelection(); navigate(messagesPath(mode)); }} />}
          sidebar={<MessagesSidebar activeMode={activeMode} counts={unreadCounts} people={searchResults} onModeChange={(mode) => { clearSelection(); navigate(messagesPath(mode)); }} onCompose={() => { clearSelection(); navigate(messagesPath("direct")); }} onSelectPerson={startDirectWithUser} />}
          list={<ConversationList items={visibleItems} selectedKey={selectedKey} search={search} searchResults={searchResults} onSearchChange={setSearch} onSelect={selectUnified} onSelectPerson={startDirectWithUser} emptyLabel={activeMode === "direct" ? "Search for an approved person to start a conversation." : "No conversations yet."} />}
          thread={thread}
          info={activeRecipient ? <ConversationInfoPanel name={activeRecipient.name} avatarUrl={activeRecipient.avatar_url} onViewProfile={() => navigate(`/helper/${activeRecipient.id}`)} onBlock={() => void blockRecipient()} onReport={() => setShowReport(true)} onClose={() => setShowInfo(false)} /> : null}
        />
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
    </>
  );
}