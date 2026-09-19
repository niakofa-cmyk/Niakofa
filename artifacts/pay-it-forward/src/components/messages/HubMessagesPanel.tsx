import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, ExternalLink, Loader2, MessageCircle, Radio, Send, Users } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { hubDisplayName, resolveHubReference } from "@/lib/diaspora/DiasporaHubContext";
import { messagesPath } from "@/lib/messageRoutes";
import { wsSubscribe, type WsEvent } from "@/lib/wsClient";

type Hub = {
  id: number;
  name: string;
  display_name: string | null;
  region: string;
  hub_scope: string;
  country_code: string | null;
  subdivision_code: string | null;
};

type Conversation = {
  id: number;
  hub_a_id: number;
  hub_b_id: number;
  hub_a_name: string;
  hub_a_display_name: string | null;
  hub_b_name: string;
  hub_b_display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
};

type Message = {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_hub_id: number;
  sender_hub_name: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type Props = {
  initialSourceHub?: string | null;
  initialTargetHub?: string | null;
  initialConversation?: string | null;
};

type HubFeed = {
  hub: { id: number; name: string; display_name: string; region: string; country_code: string | null; subdivision_code: string | null };
  counts: { members: number; open_requests: number; gratitude: number; posts: number };
  actions: { community: string; messages: string; spirals: string };
  context: { membership_is_not_inferred_from_location: true; spirals_are_curated: true };
};

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error || fallback;
}

function conversationLabel(conversation: Conversation): string {
  return (conversation.hub_a_display_name || conversation.hub_a_name) + " ↔ " +
    (conversation.hub_b_display_name || conversation.hub_b_name);
}

function mergeMessage(current: Message[], incoming: Message): Message[] {
  return [...current.filter((message) => message.id !== incoming.id), incoming]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
}

export default function HubMessagesPanel({
  initialSourceHub,
  initialTargetHub,
  initialConversation,
}: Props) {
  const [, navigate] = useLocation();
  const [sourceHubs, setSourceHubs] = useState<Hub[]>([]);
  const [targetHubs, setTargetHubs] = useState<Hub[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtime, setRealtime] = useState(true);
  const [hubFeed, setHubFeed] = useState<HubFeed | null>(null);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const availableTargets = useMemo(
    () => targetHubs.filter((hub) => String(hub.id) !== sourceId),
    [targetHubs, sourceId],
  );

  const markRead = useCallback(async (id: number): Promise<void> => {
    await fetch("/api/messages/hubs/" + id + "/read", {
      method: "POST",
      headers: authHeaders(),
    }).catch(() => {});
  }, []);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    const response = await fetch("/api/diaspora/hub-messages/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load Hub conversations."));
    const data = await response.json() as { conversations?: Conversation[] };
    const next = Array.isArray(data.conversations) ? data.conversations : [];
    setConversations(next);
    return next;
  }, []);

  const loadConversation = useCallback(async (id: number): Promise<void> => {
    setSelectedId(id);
    const response = await fetch("/api/diaspora/hub-messages/conversations/" + id, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load this Hub conversation."));
    const data = await response.json() as { conversation?: Conversation; messages?: Message[] };
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    await markRead(id);
  }, [markRead]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setError(null);
      try {
        const optionsResponse = await fetch("/api/diaspora/hub-messages/options", { headers: authHeaders() });
        if (!optionsResponse.ok) throw new Error(await readError(optionsResponse, "Could not load Hub options."));
        const options = await optionsResponse.json() as { source_hubs?: Hub[]; target_hubs?: Hub[] };
        if (cancelled) return;

        const sources = Array.isArray(options.source_hubs) ? options.source_hubs : [];
        const targets = Array.isArray(options.target_hubs) ? options.target_hubs : [];
        setSourceHubs(sources);
        setTargetHubs(targets);

        const source = resolveHubReference(sources, initialSourceHub ?? null) ?? sources[0];
        const target = resolveHubReference(targets, initialTargetHub ?? null) ??
          targets.find((hub) => hub.id !== source?.id);
        if (source) setSourceId(String(source.id));
        if (target) setTargetId(String(target.id));

        const existing = await loadConversations();
        const requestedId = Number.parseInt(initialConversation ?? "", 10);
        if (Number.isSafeInteger(requestedId) && requestedId > 0) {
          await loadConversation(requestedId);
        } else if (existing[0]) {
          setSelectedId(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load Hub messaging.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [initialConversation, initialSourceHub, initialTargetHub, loadConversation, loadConversations]);

  useEffect(() => {
    if (targetId && targetId !== sourceId) return;
    const next = availableTargets[0];
    setTargetId(next ? String(next.id) : "");
  }, [availableTargets, sourceId, targetId]);

  useEffect(() => {
    if (!sourceId) {
      setHubFeed(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/community/hubs/${sourceId}/feed`, { headers: authHeaders() })
      .then(async (response) => {
        if (!response.ok) throw new Error("Hub context is unavailable.");
        return response.json() as Promise<HubFeed>;
      })
      .then((data) => {
        if (!cancelled) setHubFeed(data);
      })
      .catch(() => {
        if (!cancelled) setHubFeed(null);
      });
    return () => { cancelled = true; };
  }, [sourceId]);

  useEffect(() => {
    const unsubscribe = wsSubscribe((event: WsEvent) => {
      if (event.type === "ws_reconnected") {
        setRealtime(false);
        void loadConversations().finally(() => setRealtime(true));
        if (selectedId) void loadConversation(selectedId).catch(() => {});
        return;
      }
      if (event.type !== "hub_message") return;
      const payload = event.payload as { conversation_id?: number; message?: Message } | null;
      if (!payload?.conversation_id || !payload.message) return;

      setConversations((current) => current.map((conversation) =>
        conversation.id === payload.conversation_id
          ? {
              ...conversation,
              last_message: payload.message?.body ?? conversation.last_message,
              last_message_at: payload.message?.created_at ?? conversation.last_message_at,
            }
          : conversation,
      ));

      if (payload.conversation_id === selectedId) {
        setMessages((current) => mergeMessage(current, payload.message!));
        void markRead(selectedId);
      }
    });
    return unsubscribe;
  }, [loadConversation, loadConversations, markRead, selectedId]);

  async function selectConversation(id: number): Promise<void> {
    const conversation = conversations.find((item) => item.id === id);
    const source = sourceHubs.find((hub) => conversation
      ? [conversation.hub_a_id, conversation.hub_b_id].includes(hub.id)
      : false);
    navigate(messagesPath("hub", {
      conversation: id,
      sourceHub: source?.id,
      targetHub: conversation
        ? [conversation.hub_a_id, conversation.hub_b_id].find((hubId) => hubId !== source?.id)
        : undefined,
    }));
    try {
      await loadConversation(id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load conversation.");
    }
  }

  async function openConversation(): Promise<void> {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/diaspora/hub-messages/conversations", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ source_hub_id: Number(sourceId), target_hub_id: Number(targetId) }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not open this Hub conversation."));
      const data = await response.json() as { conversation?: { id?: number } };
      const id = Number(data.conversation?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("The Hub conversation did not return an id.");
      await loadConversations();
      navigate(messagesPath("hub", { sourceHub: sourceId, targetHub: targetId, conversation: id }));
      await loadConversation(id);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open this Hub conversation.");
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedId || !sourceId || !body.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/diaspora/hub-messages/conversations/" + selectedId + "/messages", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sender_hub_id: Number(sourceId), body: body.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response, "Could not send this message."));
      const data = await response.json() as { message?: Message };
      if (data.message) setMessages((current) => mergeMessage(current, data.message!));
      setBody("");
      await loadConversations();
      await markRead(selectedId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send this message.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return <div className="mt-4 flex min-h-48 items-center justify-center rounded-3xl border border-border bg-background"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mt-4 grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-h-0 rounded-3xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3 border-b border-border px-2 pb-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Hub inbox</p>
            <h3 className="mt-1 text-base font-black">Conversations</h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary">
            <Radio className="h-3 w-3" /> {realtime ? "Live" : "Syncing"}
          </span>
        </div>
        <div className="mt-3 space-y-1.5 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted-foreground">No Hub conversations yet.</p>
          ) : conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => void selectConversation(conversation.id)}
              className={"w-full rounded-2xl border px-3 py-3 text-left transition " +
                (selectedId === conversation.id ? "border-primary/40 bg-primary/10" : "border-transparent hover:border-border hover:bg-muted/50")}>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black">{conversationLabel(conversation)}</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{conversation.last_message || "No messages yet"}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card">
        <header className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Hub conversation</p>
              <h3 className="mt-1 truncate text-lg font-black">{selected ? conversationLabel(selected) : "Start a Hub conversation"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Source Hub identity ↔ target Hub identity · shared coordination thread</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <span className="rounded-xl border border-border bg-background px-3 py-2 text-[10px] font-black text-muted-foreground"><Users className="mr-1 inline h-3 w-3" /> Approved membership</span>
            </div>
          </div>
        </header>

        <div className="border-b border-border bg-background/60 px-4 py-3 sm:px-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Speak as
              <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-2xl border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary">
                <option value="">No approved membership</option>
                {sourceHubs.map((hub) => <option key={hub.id} value={hub.id}>{hubDisplayName(hub)}</option>)}
              </select>
            </label>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Contact approved Hub
              <select value={targetId} onChange={(event) => setTargetId(event.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-2xl border border-border bg-card px-3 text-sm font-bold outline-none focus:border-primary">
                <option value="">Choose a Hub</option>
                {availableTargets.map((hub) => <option key={hub.id} value={hub.id}>{hubDisplayName(hub)} · {hub.region}</option>)}
              </select>
            </label>
          </div>
          {hubFeed && (
            <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">Hub context</p>
                  <p className="mt-1 truncate text-sm font-black">{hubFeed.hub.display_name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{hubFeed.hub.region} · {hubFeed.counts.members} members · {hubFeed.counts.open_requests} open requests</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={hubFeed.actions.community} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border bg-card px-2.5 text-[10px] font-black hover:bg-muted">
                    Community <ExternalLink className="h-3 w-3" />
                  </a>
                  <a href={hubFeed.actions.spirals} className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border bg-card px-2.5 text-[10px] font-black hover:bg-muted">
                    Spirals <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold text-muted-foreground">
                <span className="rounded-full bg-background px-2 py-1">{hubFeed.counts.posts} posts</span>
                <span className="rounded-full bg-background px-2 py-1">{hubFeed.counts.gratitude} gratitude</span>
                <span className="rounded-full bg-background px-2 py-1">Curated Spirals</span>
              </div>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">Membership authorizes the source identity; target membership is not required to receive or contact a Hub.</p>
            <button type="button" onClick={() => void openConversation()} disabled={working || !sourceId || !targetId}
              className="min-h-10 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-40">
              {working ? "Opening…" : "Open conversation"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-background/60 to-card p-4 sm:p-5">
          {!selected ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessageCircle className="h-7 w-7" /></div>
              <p className="mt-3 text-sm font-black">Choose a Hub conversation</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">Hub-to-Hub messages remain in the unified Messages workspace while Hub authorization remains authoritative.</p>
            </div>
          ) : messages.length === 0 ? (
            <p className="py-20 text-center text-xs text-muted-foreground">No messages yet. Start the Hub-to-Hub conversation below.</p>
          ) : messages.map((message) => (
            <div key={message.id} className={"flex " + (message.sender_hub_id === Number(sourceId) ? "justify-end" : "justify-start")}>
              <div className="max-w-[85%] rounded-3xl border border-border bg-card px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2 text-[10px] font-black text-primary">
                  <Building2 className="h-3 w-3" /> {message.sender_hub_name}
                  <span className="font-medium text-muted-foreground">· {message.sender_name}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                <p className="mt-2 text-[9px] text-muted-foreground">{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={sendMessage} className="border-t border-border bg-card p-3 sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} disabled={!selected || working}
              maxLength={2000} rows={1} placeholder="Write as your selected Hub…"
              className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-40" />
            <button type="submit" disabled={!selected || working || !body.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40" aria-label="Send Hub message">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {error && <p role="alert" className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
        </form>
      </section>
    </div>
  );
}