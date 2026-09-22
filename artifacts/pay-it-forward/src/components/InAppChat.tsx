/**
 * InAppChat.tsx — Refactored to use the shared wsClient singleton
 *
 * Key improvements over the previous version:
 *  1. Uses the shared wsClient (wsSend + wsSubscribe) instead of a second parallel WebSocket.
 *     The old implementation opened a second WS that never sent a `register` message,
 *     hit the server's 15-second auth timeout, and was silently closed — messages were lost.
 *  2. Loads chat history via REST on mount so both parties see prior messages on refresh.
 *  3. Chat message events routed through ws-hub.ts are now DB-persisted and delivered correctly.
 *  4. Typing indicator sent via shared socket + debounced correctly.
 *  5. Offline queue flushed via REST when socket was disconnected.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import { wsSubscribe, wsSend, wsIsConnected } from "@/lib/wsClient";
import type { WsEvent } from "@/lib/wsClient";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { authHeaders } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageStatus = "sending" | "sent" | "read" | "failed";

interface ChatMessage {
  id: string;
  sender_id: number | null;
  sender_name: string | null;
  sender_avatar: string | null;
  body: string;
  created_at: string;
  status?: MessageStatus;
}

interface InAppChatProps {
  requestId: number;
  currentUserId: number;
  currentUserName: string;
  remoteUserName: string;
  /** wsUrl and authToken kept for API compat but no longer used for WS */
  wsUrl?: string;
  authToken?: string;
}

// ─── Timestamp formatter ──────────────────────────────────────────────────────

function formatTs(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 6) return `${diffH}h ago`;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ─── Unique ID ────────────────────────────────────────────────────────────────

let _msgCounter = 0;
function tempId() { return `tmp_${Date.now()}_${++_msgCounter}`; }

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * InAppChatCore contains all hooks and the full chat UI.
 * It is only rendered by the public InAppChat wrapper when requestId is valid.
 */
function InAppChatCore({
  requestId,
  currentUserId,
  currentUserName,
  remoteUserName,
}: InAppChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(() => wsIsConnected());
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<ChatMessage[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const suppressed = useIsAnimationSuppressed();

  // ─── Auto-scroll to bottom ─────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, remoteTyping]);

  // ─── Load history via REST on mount ───────────────────────────────────────
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/requests/${requestId}/messages`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((data: { messages?: { id: string; sender_id: number | null; sender_name: string | null; sender_avatar: string | null; body: string; created_at: string }[] }) => {
        if (!Array.isArray(data.messages)) return;
        const loaded: ChatMessage[] = data.messages.map(m => ({
          id: m.id,
          sender_id: m.sender_id,
          sender_name: m.sender_name,
          sender_avatar: m.sender_avatar,
          body: m.body,
          created_at: m.created_at,
          status: "sent" as const,
        }));
        loaded.forEach(m => knownIds.current.add(m.id));
        setMessages(loaded);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [requestId]);

  // ─── Flush offline queue when connection comes back ────────────────────────
  useEffect(() => {
    if (connected && offlineQueue.length > 0) {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      offlineQueue.forEach(msg => {
        fetch(`${base}/api/requests/${requestId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ content: msg.body }),
        }).then(r => r.ok ? r.json() : null)
          .then((data: { message?: { id: string; body: string; created_at: string } } | null) => {
            if (!data?.message) return;
            setMessages(prev => prev.map(m =>
              m.id === msg.id ? { ...m, id: data.message!.id, status: "sent" } : m
            ));
          })
          .catch(() => {});
      });
      setOfflineQueue([]);
    }
  }, [connected, offlineQueue, requestId]);

  // ─── Subscribe to shared WS events ────────────────────────────────────────
  useEffect(() => {
    // Track WS connection state
    const checkConnection = () => setConnected(wsIsConnected());
    const interval = setInterval(checkConnection, 2000);

    // Listen for incoming chat messages
    const unsubChat = wsSubscribe((event: WsEvent) => {
      if (event.type === "chat_message") {
        const payload = event.payload as {
          message?: {
            id: string;
            request_id?: number;
            sender_id: number | null;
            sender_name: string | null;
            sender_avatar: string | null;
            body: string;
            created_at: string;
          };
          request_id?: number;
          temp_id?: string;
        };

        // Only handle messages for this request
        const msgRequestId = payload.request_id ?? payload.message?.request_id;
        if (msgRequestId !== requestId) return;
        if (!payload.message) return;

        const incoming = payload.message;
        const msgId = String(incoming.id);

        setMessages(prev => {
          // Replace optimistic message if temp_id matches
          if (payload.temp_id) {
            const idx = prev.findIndex(m => m.id === payload.temp_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                id: msgId,
                sender_id: incoming.sender_id,
                sender_name: incoming.sender_name,
                sender_avatar: incoming.sender_avatar,
                body: incoming.body,
                created_at: incoming.created_at,
                status: "sent",
              };
              knownIds.current.add(msgId);
              return updated;
            }
          }
          // Deduplicate by server id
          if (knownIds.current.has(msgId)) return prev;
          knownIds.current.add(msgId);
          return [...prev, {
            id: msgId,
            sender_id: incoming.sender_id,
            sender_name: incoming.sender_name,
            sender_avatar: incoming.sender_avatar,
            body: incoming.body,
            created_at: incoming.created_at,
            status: incoming.sender_id === currentUserId ? "sent" : undefined,
          }];
        });
      }

      if (event.type === "typing") {
        const p = event.payload as { sender_id?: number | null; request_id?: number };
        if (p.request_id !== requestId) return;
        if (p.sender_id === currentUserId) return; // don't show own typing
        setRemoteTyping(true);
        if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
        remoteTypingTimerRef.current = setTimeout(() => setRemoteTyping(false), 3000);
      }
    });

    return () => {
      clearInterval(interval);
      unsubChat();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
    };
  }, [requestId, currentUserId]);

  // ─── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(() => {
    const body = draft.trim();
    if (!body) return;

    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const tmpId = tempId();
    const optimistic: ChatMessage = {
      id: tmpId,
      sender_id: currentUserId,
      sender_name: currentUserName,
      sender_avatar: null,
      body,
      created_at: new Date().toISOString(),
      status: "sending",
    };

    setMessages(prev => [...prev, optimistic]);

    // Try shared WS first
    const sent = wsSend({
      type: "chat_message",
      payload: { request_id: requestId, body, temp_id: tmpId },
    });

    if (!sent) {
      // WS not connected — send via REST immediately, mark failed if that also fails
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      fetch(`${base}/api/requests/${requestId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content: body }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(r))
        .then((data: { message?: { id: string; body: string; created_at: string } }) => {
          if (!data.message) return;
          setMessages(prev => prev.map(m =>
            m.id === tmpId ? { ...m, id: String(data.message!.id), status: "sent" } : m
          ));
        })
        .catch(() => {
          setMessages(prev => prev.map(m => m.id === tmpId ? { ...m, status: "failed" } : m));
          setOfflineQueue(q => [...q, optimistic]);
          toast({ title: "Offline — message queued", variant: "default" });
        });
    }
  }, [draft, currentUserId, currentUserName, requestId]);

  // ─── Typing indicator emit ─────────────────────────────────────────────────
  const handleDraftChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

      if (typingTimerRef.current) return;
      wsSend({ type: "typing", payload: { request_id: requestId, sender_id: currentUserId } });
      typingTimerRef.current = setTimeout(() => {
        typingTimerRef.current = null;
      }, 500);
    },
    [currentUserId, requestId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const isMine = (msg: ChatMessage) => msg.sender_id === currentUserId;

  return (
    <div className="flex flex-col bg-background rounded-2xl border border-border overflow-hidden" style={{ height: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/80 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-colors ${connected ? "bg-green-500" : `bg-yellow-500${suppressed ? "" : " animate-pulse"}`}`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold">{remoteUserName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {!connected
            ? offlineQueue.length > 0
              ? `${offlineQueue.length} queued`
              : "Reconnecting…"
            : historyLoaded && messages.length === 0
            ? "Start chatting"
            : ""}
        </span>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {!historyLoaded ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-3xl mb-2">💬</div>
            <div className="text-sm font-semibold">Send a message</div>
            <div className="text-xs text-muted-foreground mt-1">Connect with {remoteUserName}</div>
          </div>
        ) : (
          messages.map((msg) => {
            const mine = isMine(msg);
            const initial = msg.sender_name ? [...msg.sender_name][0] ?? "?" : "?";
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : "flex-row"}`}
              >
                {!mine && (
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold flex-shrink-0 mb-1">
                    {msg.sender_avatar ? (
                      <img src={msg.sender_avatar} alt="" aria-hidden className="w-full h-full rounded-full object-cover" />
                    ) : initial}
                  </div>
                )}
                <div className={`max-w-[72%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-snug ${
                      mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted text-foreground rounded-bl-sm"
                    } ${msg.status === "failed" ? "opacity-60" : ""}`}
                  >
                    {msg.body}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] text-muted-foreground ${mine ? "flex-row-reverse" : ""}`}>
                    <span>{formatTs(msg.created_at)}</span>
                    {mine && msg.status === "sending" && <span>○</span>}
                    {mine && msg.status === "sent" && <span className="text-muted-foreground">✓</span>}
                    {mine && msg.status === "read" && <span className="text-primary">✓✓</span>}
                    {mine && msg.status === "failed" && (
                      <span
                        className="text-destructive cursor-pointer"
                        onClick={() => {
                          setDraft(msg.body);
                          setMessages(prev => prev.filter(m => m.id !== msg.id));
                        }}
                        title="Failed — tap to retry"
                      >
                        ✕ retry
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Remote typing indicator */}
        {remoteTyping && (
          <div className="flex items-end gap-2" aria-live="polite" aria-label={`${remoteUserName} is typing`}>
            <div className="w-6 h-6 rounded-full bg-muted flex-shrink-0" aria-hidden />
            <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 bg-muted-foreground/60 rounded-full${suppressed ? "" : " animate-bounce"}`}
                    style={{ animationDelay: `${i * 150}ms` }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border bg-card/80 px-3 py-2 flex items-end gap-2 shrink-0">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleDraftChange}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          rows={1}
          aria-label="Message input"
          className="flex-1 resize-none bg-muted rounded-xl px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
          style={{ minHeight: "36px", maxHeight: "120px", fontSize: "16px" }}
        />
        <button
          onClick={sendMessage}
          disabled={!draft.trim()}
          aria-label="Send message"
          className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-transform"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2 21L23 12 2 3v7l15 2-15 2v7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Public export — renders nothing when requestId is 0 or missing (guards
 * against fetching /api/requests/0/messages when chat is mounted before the
 * request ID is available). When requestId is valid, renders InAppChatCore
 * which owns all hook calls (no conditional hooks inside).
 */
export function InAppChat(props: InAppChatProps) {
  if (!props.requestId) return null;
  return <InAppChatCore {...props} />;
}
