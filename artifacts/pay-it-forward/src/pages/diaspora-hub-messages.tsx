import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MessageCircle, Send, Users } from "lucide-react";
import { useLocation } from "wouter";
import { authHeaders } from "@/lib/auth";
import { diasporaTheme } from "@/lib/diaspora/theme";
import { hubDisplayName, resolveHubReference } from "@/lib/diaspora/DiasporaHubContext";

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
  sender_hub_id: number;
  sender_hub_name: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type ApiOptions = { source_hubs?: Hub[]; target_hubs?: Hub[] };
type ApiConversation = { conversation?: { id?: number }; message?: Message; error?: string };

function labelForHub(hub: Pick<Hub, "name" | "display_name">) {
  return hubDisplayName(hub);
}

function labelForConversation(conversation: Conversation) {
  const a = conversation.hub_a_display_name || conversation.hub_a_name;
  const b = conversation.hub_b_display_name || conversation.hub_b_name;
  return `${a} ↔ ${b}`;
}

async function readError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({})) as { error?: string };
  return data.error || fallback;
}

export default function DiasporaHubMessagesPage() {
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

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedId) ?? null;
  const availableTargets = useMemo(
    () => targetHubs.filter((hub) => String(hub.id) !== sourceId),
    [targetHubs, sourceId],
  );

  async function loadConversations() {
    const response = await fetch("/api/diaspora/hub-messages/conversations", { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load Hub conversations."));
    const data = await response.json() as { conversations?: Conversation[] };
    setConversations(Array.isArray(data.conversations) ? data.conversations : []);
  }

  async function loadConversation(id: number) {
    setSelectedId(id);
    const response = await fetch(`/api/diaspora/hub-messages/conversations/${id}`, { headers: authHeaders() });
    if (!response.ok) throw new Error(await readError(response, "Could not load this conversation."));
    const data = await response.json() as { messages?: Message[] };
    setMessages(Array.isArray(data.messages) ? data.messages : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [optionsResponse] = await Promise.all([
          fetch("/api/diaspora/hub-messages/options", { headers: authHeaders() }),
          loadConversations(),
        ]);
        if (!optionsResponse.ok) throw new Error(await readError(optionsResponse, "Could not load Hub options."));
        const options = await optionsResponse.json() as ApiOptions;
        if (cancelled) return;
        const nextSources = Array.isArray(options.source_hubs) ? options.source_hubs : [];
        const nextTargets = Array.isArray(options.target_hubs) ? options.target_hubs : [];
        setSourceHubs(nextSources);
        setTargetHubs(nextTargets);
        const params = new URLSearchParams(window.location.search);
        const requestedSource = resolveHubReference(nextSources, params.get("sourceHub") ?? params.get("hub"));
        const initialSource = requestedSource ?? nextSources[0];
        if (initialSource) setSourceId(String(initialSource.id));
        const requestedTarget = resolveHubReference(nextTargets, params.get("targetHub"));
        const firstTarget = requestedTarget && requestedTarget.id !== initialSource?.id
          ? requestedTarget
          : nextTargets.find((hub) => hub.id !== initialSource?.id);
        if (firstTarget) setTargetId(String(firstTarget.id));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load Hub messages.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (targetId && targetId !== sourceId) return;
    const nextTarget = availableTargets[0];
    setTargetId(nextTarget ? String(nextTarget.id) : "");
  }, [availableTargets, sourceId, targetId]);

  async function openConversation() {
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
      const data = await response.json() as ApiConversation;
      const id = Number(data.conversation?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("The Hub conversation did not return an id.");
      await loadConversations();
      await loadConversation(id);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Could not open this Hub conversation.");
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage(event: React.FormEvent) {
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
      if (!response.ok) throw new Error(await readError(response, "Could not send this message."));
      const data = await response.json() as ApiConversation;
      if (data.message) setMessages((previous) => [...previous, data.message!]);
      setBody("");
      await loadConversations();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send this message.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={`${diasporaTheme.page} min-h-screen p-4 pb-24 sm:p-6 lg:pb-8`}>
      <main className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-start gap-3">
          <button
            onClick={() => navigate("/diaspora")}
            aria-label="Back to Diaspora Globe"
            className={`mt-1 rounded-xl border border-white/10 p-2 text-white/65 hover:bg-white/10 ${diasporaTheme.focus}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200/70">Diaspora</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Messages between Hubs</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
               Your approved canonical home Hub is available automatically. Additional Hubs remain explicit memberships, and live location never changes who you represent.
            </p>
                {sourceId && <p className="mt-2 text-xs font-semibold text-teal-200/75">Speaking as {labelForHub(sourceHubs.find((hub) => String(hub.id) === sourceId) ?? { name: "your approved Hub", display_name: null })}</p>}
          </div>
        </header>

        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-300/25 bg-rose-300/10 px-4 py-3 text-sm text-rose-100">{error}</div>}

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${diasporaTheme.panelStrong} ${diasporaTheme.radius} border p-4`}>
            <div className="flex items-center gap-2 text-sm font-black">
              <MessageCircle className="h-4 w-4 text-teal-200" /> Conversations
            </div>
            <div className="mt-3 space-y-2">
              {loading ? <div className="flex items-center gap-2 px-2 py-6 text-xs text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> :
                conversations.length === 0 ? <p className="px-2 py-6 text-xs leading-relaxed text-white/40">No Hub conversations yet. Start one below.</p> :
                conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => void loadConversation(conversation.id).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load conversation."))}
                    className={`w-full rounded-xl border px-3 py-3 text-left ${selectedId === conversation.id ? "border-teal-200/40 bg-teal-200/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"}`}
                  >
                    <p className="text-xs font-black text-white/85">{labelForConversation(conversation)}</p>
                    <p className="mt-1 truncate text-[11px] text-white/40">{conversation.last_message || "No messages yet"}</p>
                  </button>
                ))}
            </div>
          </aside>

          <section className={`${diasporaTheme.panelStrong} ${diasporaTheme.radius} border p-4 sm:p-5`}>
            <div className="flex items-center gap-2 border-b border-white/10 pb-4">
              <Users className="h-5 w-5 text-amber-200" />
              <div>
                <h2 className="text-sm font-black">{selectedConversation ? labelForConversation(selectedConversation) : "Start a Hub conversation"}</h2>
                <p className="mt-0.5 text-xs text-white/40">Hub-to-Hub messages are visible to approved members of either Hub.</p>
              </div>
            </div>

            <div className="grid gap-3 py-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-white/60">
                Speak as
                <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-teal-200/40">
                  <option value="">No approved membership</option>
                  {sourceHubs.map((hub) => <option key={hub.id} value={hub.id}>{labelForHub(hub)}{hub.is_home ? " · Home Hub" : ""}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-white/60">
                Contact approved Hub
                <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none focus:border-teal-200/40">
                  <option value="">Choose a Hub</option>
                  {availableTargets.map((hub) => <option key={hub.id} value={hub.id}>{labelForHub(hub)} · {hub.region}</option>)}
                </select>
              </label>
            </div>

            <button onClick={() => void openConversation()} disabled={working || !sourceId || !targetId} className="mb-4 inline-flex items-center gap-2 rounded-xl bg-teal-200 px-4 py-2.5 text-sm font-black text-[#071312] disabled:cursor-not-allowed disabled:opacity-40">
              <MessageCircle className="h-4 w-4" /> New or existing conversation
            </button>

            <div className="min-h-[240px] space-y-3 rounded-2xl border border-white/10 bg-black/15 p-3">
              {!selectedConversation ? <div className="flex min-h-[220px] flex-col items-center justify-center text-center"><MessageCircle className="h-9 w-9 text-teal-200/35" /><p className="mt-3 text-sm font-bold text-white/65">Choose a conversation</p><p className="mt-1 max-w-sm text-xs leading-relaxed text-white/35">Or choose your Hub and an approved target above to open a new thread.</p></div> :
                messages.length === 0 ? <p className="py-20 text-center text-xs text-white/40">No messages yet. Start the conversation below.</p> :
                messages.map((message) => <div key={message.id} className="rounded-xl border border-white/5 bg-white/[0.035] px-3 py-2.5"><p className="text-[11px] font-black text-teal-200/80">{message.sender_hub_name} · {message.sender_name}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-white/75">{message.body}</p></div>)}
            </div>

            <form onSubmit={sendMessage} className="mt-4 flex gap-2">
              <input value={body} onChange={(event) => setBody(event.target.value)} disabled={!selectedConversation || working} maxLength={2000} placeholder="Write a message as your selected Hub…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-200/40 disabled:opacity-40" />
              <button type="submit" disabled={!selectedConversation || working || !body.trim()} aria-label="Send message" className="rounded-xl bg-amber-200 px-4 text-[#071312] disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}