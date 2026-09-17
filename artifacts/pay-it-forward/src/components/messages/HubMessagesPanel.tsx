import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { hubDisplayName, resolveHubReference } from "@/lib/diaspora/DiasporaHubContext";
import { messagesPath } from "@/lib/messageRoutes";

type Hub = {
  id: number;
  name: string;
  display_name: string | null;
  region: string;
  hub_scope: string;
  country_code: string | null;
  subdivision_code: string | null;
  is_home?: boolean;
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

type ConversationDetails = Conversation & {
  hub_a?: Hub | null;
  hub_b?: Hub | null;
};

type Props = {
  initialSourceHub?: string | null;
  initialTargetHub?: string | null;
  initialConversation?: string | null;
};

async function readError(response: Response, fallback: string): Promise<string> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error || fallback;
}

function conversationLabel(conversation: Conversation): string {
  const first = conversation.hub_a_display_name || conversation.hub_a_name;
  const second = conversation.hub_b_display_name || conversation.hub_b_name;
  return `${first} ↔ ${second}`;
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

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const availableTargets = useMemo(
    () => targetHubs.filter((hub) => String(hub.id) !== sourceId),
    [targetHubs, sourceId],
  );

  async function loadConversations(): Promise<Conversation[]> {
    const response = await fetch("/api/diaspora/hub-messages/conversations", {
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load Hub conversations."));
    }
    const data = await response.json() as { conversations?: Conversation[] };
    const next = Array.isArray(data.conversations) ? data.conversations : [];
    setConversations(next);
    return next;
  }

  async function loadConversation(id: number): Promise<void> {
    setSelectedId(id);
    const response = await fetch(`/api/diaspora/hub-messages/conversations/${id}`, {
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Could not load this Hub conversation."));
    }
    const data = await response.json() as {
      conversation?: ConversationDetails;
      messages?: Message[];
    };
    setMessages(Array.isArray(data.messages) ? data.messages : []);

    const conversation = data.conversation;
    if (conversation) {
      const memberIds = [conversation.hub_a_id, conversation.hub_b_id];
      const source = sourceHubs.find((hub) => memberIds.includes(hub.id));
      const target = targetHubs.find((hub) => memberIds.includes(hub.id) && hub.id !== source?.id);
      if (source) setSourceId(String(source.id));
      if (target) setTargetId(String(target.id));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [optionsResponse] = await Promise.all([
          fetch("/api/diaspora/hub-messages/options", { headers: authHeaders() }),
          loadConversations(),
        ]);
        if (!optionsResponse.ok) {
          throw new Error(await readError(optionsResponse, "Could not load Hub options."));
        }
        const options = await optionsResponse.json() as {
          source_hubs?: Hub[];
          target_hubs?: Hub[];
        };
        if (cancelled) return;

        const sources = Array.isArray(options.source_hubs) ? options.source_hubs : [];
        const targets = Array.isArray(options.target_hubs) ? options.target_hubs : [];
        setSourceHubs(sources);
        setTargetHubs(targets);

        const requestedSource = resolveHubReference(sources, initialSourceHub ?? null);
        const initialSource = requestedSource ?? sources[0];
        if (initialSource) setSourceId(String(initialSource.id));

        const requestedTarget = resolveHubReference(targets, initialTargetHub ?? null);
        const initialTarget = requestedTarget && requestedTarget.id !== initialSource?.id
          ? requestedTarget
          : targets.find((hub) => hub.id !== initialSource?.id);
        if (initialTarget) setTargetId(String(initialTarget.id));

        const conversationId = Number.parseInt(initialConversation ?? "", 10);
        if (Number.isSafeInteger(conversationId) && conversationId > 0) {
          await loadConversation(conversationId);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load Hub messaging.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
    // The loader functions are intentionally local to this bootstrap effect.
    // Including their recreated identities would reload the panel on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConversation, initialSourceHub, initialTargetHub]);

  useEffect(() => {
    if (targetId && targetId !== sourceId) return;
    const next = availableTargets[0];
    setTargetId(next ? String(next.id) : "");
  }, [availableTargets, sourceId, targetId]);

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
        body: JSON.stringify({
          source_hub_id: Number(sourceId),
          target_hub_id: Number(targetId),
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not open this Hub conversation."));
      }
      const data = await response.json() as { conversation?: { id?: number } };
      const id = Number(data.conversation?.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("The Hub conversation did not return an id.");
      }
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
      const response = await fetch(`/api/diaspora/hub-messages/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ sender_hub_id: Number(sourceId), body: body.trim() }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not send this message."));
      }
      const data = await response.json() as { message?: Message };
      if (data.message) setMessages((previous) => [...previous, data.message!]);
      setBody("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send this message.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-4 flex min-h-48 items-center justify-center rounded-2xl border border-border bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-black">
          <MessageCircle className="h-4 w-4 text-primary" />
          Hub conversations
        </div>
        <div className="mt-3 space-y-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-5 text-xs text-muted-foreground">No Hub conversations yet.</p>
          ) : conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => void selectConversation(conversation.id)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                selectedId === conversation.id
                  ? "border-primary/40 bg-primary/10"
                  : "border-border hover:bg-muted/60"
              }`}
            >
              <p className="truncate text-xs font-black">{conversationLabel(conversation)}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {conversation.last_message || "No messages yet"}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-2xl border border-border bg-background p-4">
        <div className="border-b border-border pb-3">
          <p className="text-xs font-black uppercase tracking-widest text-primary">Hub messaging</p>
          <h3 className="mt-1 text-lg font-black">
            {selected ? conversationLabel(selected) : "Start a Hub conversation"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Send only as an approved source Hub. Target membership is not required.
          </p>
        </div>

        <div className="grid gap-3 py-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted-foreground">
            Speak as
            <select
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">No approved membership</option>
              {sourceHubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hubDisplayName(hub)}{hub.is_home ? " · Home Hub" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold text-muted-foreground">
            Contact approved Hub
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">Choose a Hub</option>
              {availableTargets.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hubDisplayName(hub)} · {hub.region}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => void openConversation()}
          disabled={working || !sourceId || !targetId}
          className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          New or existing conversation
        </button>

        <div className="mt-4 min-h-48 space-y-3 overflow-y-auto rounded-2xl border border-border bg-muted/20 p-3">
          {!selected ? (
            <div className="flex min-h-44 flex-col items-center justify-center text-center">
              <MessageCircle className="h-8 w-8 text-primary/40" />
              <p className="mt-2 text-sm font-bold text-muted-foreground">Choose a Hub conversation</p>
            </div>
          ) : messages.length === 0 ? (
            <p className="py-16 text-center text-xs text-muted-foreground">No messages yet. Start the conversation below.</p>
          ) : messages.map((message) => (
            <div key={message.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[11px] font-black text-primary">
                {message.sender_hub_name} · {message.sender_name}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
            </div>
          ))}
        </div>

        <form onSubmit={sendMessage} className="mt-4 flex gap-2">
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!selected || working}
            maxLength={2000}
            placeholder="Write a message as your selected Hub…"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!selected || working || !body.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Send Hub message"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}