import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Inbox, Loader2, MessageCircle, Radio, ShieldAlert, Users, X } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { messagesPath, type MessageMode } from "@/lib/messageRoutes";
import { wsGetConnectionSnapshot, wsSubscribe, wsSubscribeConnection, type WsEvent, type WsConnectionState } from "@/lib/wsClient";
import HubMessagesPanel from "@/components/messages/HubMessagesPanel";
import { MetaStyleDirectPane } from "@/components/messages/MetaStyleDirectPane";

type DirectUser = {
  id: number;
  name: string;
  avatar_url: string | null;
};

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
};

type ApiError = { error?: string };

type DirectMessageEvent = {
  conversation_id?: number;
  message?: DirectMessage;
};

function mergeDirectMessage(messages: DirectMessage[], incoming: DirectMessage): DirectMessage[] {
  const next = [...messages.filter((message) => message.id !== incoming.id), incoming];
  return next.sort((a, b) => {
    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
    return aTime - bTime || a.id - b.id;
  });
}

function modeFromLocation(location: string): MessageMode {
  const [pathname, query] = location.split("?");
  const params = new URLSearchParams(query ?? "");
  const mode = params.get("mode");
  if (mode === "direct" || mode === "hub" || mode === "requests") return mode;
  if (mode === "request") return "requests";
  if (
    pathname === "/diaspora/messages" ||
    params.has("sourceHub") ||
    params.has("targetHub") ||
    params.has("conversation")
  ) return "hub";
  return "all";
}

function hubContextFromLocation(location: string): {
  sourceHub: string | null;
  targetHub: string | null;
  conversation: string | null;
} {
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  return {
    sourceHub: params.get("sourceHub"),
    targetHub: params.get("targetHub"),
    conversation: params.get("conversation"),
  };
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as ApiError;
  return data.error || fallback;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function Avatar({ user }: { user: DirectUser }) {
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="h-10 w-10 rounded-2xl object-cover" />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-xs font-black text-primary">
      {initials(user.name)}
    </span>
  );
}

function ModeTab({
  mode,
  activeMode,
  icon,
  label,
  onClick,
}: {
  mode: MessageMode;
  activeMode: MessageMode;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors ${
        activeMode === mode
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export default function MessagesPage() {
  const [location, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const activeMode = modeFromLocation(location);
  const hubContext = hubContextFromLocation(location);
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
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeState, setRealtimeState] = useState<WsConnectionState>(() => wsGetConnectionSnapshot().state);

  const selectedConversation = useMemo(
    () => directConversations.find((conversation) => conversation.id === selectedDirectId) ?? null,
    [directConversations, selectedDirectId],
  );
  const activeRecipient = newRecipient ?? selectedConversation?.other_user ?? null;

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
    await fetch(`/api/messages/direct/conversations/${conversationId}/read`, {
      method: "POST",
      headers: authHeaders(),
    });
  }, []);

  const loadHubConversations = useCallback(async () => {
    const response = await fetch("/api/diaspora/hub-messages/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load Hub conversations."));
    const data = await response.json() as { conversations?: HubConversation[] };
    setHubConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }, []);

  const loadRequestConversations = useCallback(async () => {
    if (!currentUser?.id) return;
    const query = new URLSearchParams({ limit: "50" });
    const [requesterResponse, helperResponse] = await Promise.all([
      fetch(`/api/requests?requester_id=${currentUser.id}&${query.toString()}`, { headers: authHeaders() }),
      fetch(`/api/requests?helper_id=${currentUser.id}&${query.toString()}`, { headers: authHeaders() }),
    ]);
    if (!requesterResponse.ok || !helperResponse.ok) {
      throw new Error("Could not load request conversations.");
    }
    const requester = await requesterResponse.json() as RequestConversation[];
    const helper = await helperResponse.json() as RequestConversation[];
    const merged = [...(Array.isArray(requester) ? requester : []), ...(Array.isArray(helper) ? helper : [])];
    const unique = new Map(merged.map((request) => [request.id, request]));
    setRequestConversations([...unique.values()].sort((a, b) => b.id - a.id));
  }, [currentUser?.id]);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tasks: Promise<unknown>[] = [loadDirectConversations(), loadRequestConversations()];
      if (activeMode === "all" || activeMode === "hub") tasks.push(loadHubConversations());
      await Promise.all(tasks);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Messages.");
    } finally {
      setLoading(false);
    }
  }, [activeMode, loadDirectConversations, loadHubConversations, loadRequestConversations]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (activeMode !== "direct") return;
    const conversationValue = new URLSearchParams(location.split("?")[1] ?? "").get("conversation");
    const conversationId = Number.parseInt(conversationValue ?? "", 10);
    if (Number.isSafeInteger(conversationId) && conversationId > 0 && conversationId !== selectedDirectId) {
      void loadDirectMessages(conversationId).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Could not load this conversation.");
      });
    }
  }, [activeMode, location, loadDirectMessages, selectedDirectId]);

  useEffect(() => {
    if (!selectedDirectId || activeMode !== "direct") return;
    if (realtimeState === "connected") return;
    const interval = window.setInterval(() => {
      void loadDirectMessages(selectedDirectId).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeMode, loadDirectMessages, realtimeState, selectedDirectId]);

  useEffect(() => {
    const unsubscribeConnection = wsSubscribeConnection((snapshot) => {
      setRealtimeState(snapshot.state);
    });

    const unsubscribeEvents = wsSubscribe((event: WsEvent) => {
      if (event.type === "ws_reconnected") {
        void loadInbox();
        if (activeMode === "direct" && selectedDirectId) {
          void loadDirectMessages(selectedDirectId).catch(() => {});
        }
        return;
      }

      if (event.type !== "direct_message") return;
      const payload = event.payload as DirectMessageEvent | null;
      const message = payload?.message;
      const conversationId = payload?.conversation_id ?? message?.conversation_id;
      if (!message || !conversationId) return;

      setDirectMessages((current) =>
        conversationId === selectedDirectId ? mergeDirectMessage(current, message) : current,
      );
      void loadDirectConversations().catch(() => {});

      if (conversationId === selectedDirectId && message.sender_id !== currentUser?.id) {
        void fetch(`/api/messages/direct/conversations/${conversationId}/read`, {
          method: "POST",
          headers: authHeaders(),
        }).catch(() => {});
      }
    });

    return () => {
      unsubscribeConnection();
      unsubscribeEvents();
    };
  }, [
    activeMode,
    currentUser?.id,
    loadDirectConversations,
    loadDirectMessages,
    loadInbox,
    selectedDirectId,
  ]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || activeMode !== "direct") {
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
      const response = await fetch(`/api/messages/direct/users/${activeRecipient.id}/block`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not block this user."));
      setSelectedDirectId(null);
      setNewRecipient(null);
      setDirectMessages([]);
      await loadDirectConversations();
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

  const modeTitle = activeMode === "direct"
    ? "Direct messages"
    : activeMode === "requests"
      ? "Request conversations"
      : activeMode === "hub"
        ? "Hub conversations"
        : "Your conversations";

  return (
    <div className="mx-auto min-h-[70dvh] w-full max-w-5xl px-4 pb-28 pt-5">
      <header className="mb-5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Niakofa</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Messages</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          People, requests, and Diaspora Hubs in one communication layer.
        </p>
      </header>

      <nav className="mb-5 flex gap-2 overflow-x-auto pb-1" aria-label="Message types">
        <ModeTab mode="all" activeMode={activeMode} icon={<Inbox className="h-4 w-4" />} label="All" onClick={() => navigate(messagesPath("all"))} />
        <ModeTab mode="direct" activeMode={activeMode} icon={<MessageCircle className="h-4 w-4" />} label="Direct" onClick={() => navigate(messagesPath("direct"))} />
        <ModeTab mode="requests" activeMode={activeMode} icon={<Users className="h-4 w-4" />} label="Requests" onClick={() => navigate(messagesPath("requests"))} />
        <ModeTab mode="hub" activeMode={activeMode} icon={<Radio className="h-4 w-4" />} label="Hubs" onClick={() => navigate(messagesPath("hub"))} />
      </nav>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex min-h-56 items-center justify-center rounded-3xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : activeMode === "direct" ? (
        <MetaStyleDirectPane
          conversations={directConversations}
          messages={directMessages}
          selectedId={selectedDirectId}
          recipient={activeRecipient}
          search={search}
          searchResults={searchResults}
          body={body}
          working={working}
          currentUserId={currentUser?.id ?? null}
          realtimeState={realtimeState}
          reportOpen={showReport}
          reportReason={reportReason}
          onSearchChange={setSearch}
          onSelectConversation={(id) => {
            navigate(messagesPath("direct", { conversation: id }));
            void loadDirectMessages(id);
          }}
          onSelectUser={(user) => {
            setNewRecipient(user);
            setSelectedDirectId(null);
            setDirectMessages([]);
            setSearch("");
            setSearchResults([]);
            navigate(messagesPath("direct"));
          }}
          onBackToList={() => {
            setSelectedDirectId(null);
            setNewRecipient(null);
            setDirectMessages([]);
            setShowReport(false);
            navigate(messagesPath("direct"));
          }}
          onBodyChange={setBody}
          onSend={() => void sendDirectMessage()}
          onBlock={() => void blockRecipient()}
          onToggleReport={() => setShowReport((value) => !value)}
          onReportReasonChange={setReportReason}
          onReport={() => void reportConversation()}
          onCancelReport={() => { setShowReport(false); setReportReason(""); }}
        />
      ) : (
        <section className="rounded-3xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><MessageCircle className="h-5 w-5 text-primary" /></div>
            <div><h2 className="font-black">{modeTitle}</h2><p className="text-xs text-muted-foreground">Each conversation keeps its own authorization rules.</p></div>
          </div>

          {(activeMode === "all" || activeMode === "requests") && (
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Requests</h3><Check className="h-4 w-4 text-primary" /></div>
              {requestConversations.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No request conversations yet.</p> : <div className="grid gap-2 sm:grid-cols-2">{requestConversations.map((request) => <button key={request.id} type="button" onClick={() => navigate(`/request/${request.id}`)} className="rounded-2xl border border-border p-3 text-left hover:border-primary/40"><p className="truncate text-sm font-black">{request.title}</p><p className="mt-1 text-xs text-muted-foreground">{request.status} · Open request chat</p></button>)}</div>}
            </div>
          )}

          {(activeMode === "all") && (
            <div className="mb-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Direct</h3>
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              {directConversations.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No direct conversations yet.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {directConversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => navigate(messagesPath("direct", { conversation: conversation.id }))}
                      className="flex items-center gap-3 rounded-2xl border border-border p-3 text-left hover:border-primary/40"
                    >
                      <Avatar user={conversation.other_user} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{conversation.other_user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{conversation.last_message?.body ?? "Open conversation"}</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatTime(conversation.updated_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

           {activeMode === "hub" ? (
             <HubMessagesPanel
               initialSourceHub={hubContext.sourceHub}
               initialTargetHub={hubContext.targetHub}
               initialConversation={hubContext.conversation}
             />
           ) : activeMode === "all" && (
            <div>
              <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Diaspora Hubs</h3><Radio className="h-4 w-4 text-primary" /></div>
               {hubConversations.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No Hub conversations yet. Select a Hub from the Diaspora Globe to start one.</p> : <div className="grid gap-2 sm:grid-cols-2">{hubConversations.map((conversation) => { const first = conversation.hub_a_display_name || conversation.hub_a_name; const second = conversation.hub_b_display_name || conversation.hub_b_name; return <button key={conversation.id} type="button" onClick={() => navigate(messagesPath("hub", { conversation: conversation.id }))} className="rounded-2xl border border-border p-3 text-left hover:border-primary/40"><p className="truncate text-sm font-black">{first} ↔ {second}</p><p className="mt-1 truncate text-xs text-muted-foreground">{conversation.last_message || "Open Hub conversation"}</p></button>; })}</div>}
            </div>
          )}

          {activeMode === "all" && (
            <button type="button" onClick={() => navigate(messagesPath("direct"))} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary hover:bg-primary/15">
              <MessageCircle className="h-4 w-4" /> Message people directly
            </button>
          )}
        </section>
      )}
    </div>
  );
}