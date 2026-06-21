import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
import { authHeaders } from "@/lib/auth";
import { Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";

interface ChatMessage {
  id: number;
  request_id: number;
  sender_id: number;
  content: string;
  sent_at: string;
  read_at: string | null;
}

interface InAppChatProps {
  requestId: number;
  helperName: string;
  requesterName: string;
}

export function InAppChat({ requestId, helperName, requesterName }: InAppChatProps) {
  const { currentUser } = useAppContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const markedReadRef = useRef(false);

  // Load history — includes auth header so the backend can verify the caller
  useEffect(() => {
    fetch(`/api/requests/${requestId}/chat`, {
      headers: authHeaders(),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs: ChatMessage[]) => setMessages(msgs))
      .catch(() => {});
  }, [requestId]);

  // Mark other party's messages as read once, when the chat mounts
  useEffect(() => {
    if (markedReadRef.current) return;
    markedReadRef.current = true;
    fetch(`/api/requests/${requestId}/chat/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    }).catch(() => {});
  }, [requestId]);

  // Real-time incoming messages — typed correctly, no cast needed
  useWebSocket(
    "chat_message",
    useCallback(
      (event) => {
        const msg = event.payload as ChatMessage;
        if (msg.request_id === requestId) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Mark newly arrived messages from the other party as read immediately
          if (msg.sender_id !== currentUser?.id) {
            fetch(`/api/requests/${requestId}/chat/read`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
            }).catch(() => {});
          }
        }
      },
      [requestId, currentUser?.id],
    ),
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !currentUser || sending) return;
    setSending(true);
    const optimisticContent = input.trim();
    setInput("");

    // BUG-011: Add an optimistic message immediately so the UI feels instant.
    // The real message arrives via WebSocket ("chat_message" event). The
    // duplicate-guard in the WS handler (`prev.find(m => m.id === msg.id)`)
    // dedupes when the server echo arrives. On failure, the optimistic message
    // is removed and the input is restored.
    const optimisticId = -(Date.now()); // negative id — never collides with server ids
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      request_id: requestId,
      sender_id: currentUser.id,
      content: optimisticContent,
      sent_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch(`/api/requests/${requestId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        // sender_id is read from the verified Bearer token on the backend —
        // we do NOT send it in the body to prevent spoofing.
        body: JSON.stringify({ content: optimisticContent }),
      });
      if (!res.ok) {
        // Remove optimistic message and restore input on failure
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(optimisticContent);
      }
      // On success, the WS echo will replace the optimistic message via the
      // duplicate-guard in the useWebSocket handler.
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(optimisticContent);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80 shrink-0">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold">Chat</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {helperName} · {requesterName}
        </span>
      </div>

      {/* Message list — capped height so it doesn't push other content off screen */}
      <div className="overflow-y-auto p-3 space-y-2" style={{ maxHeight: "220px", minHeight: "80px" }}>
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">
            No messages yet. Say hi!
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quick reply chips */}
      <div className="flex gap-2 px-3 pt-2 overflow-x-auto pb-1 scrollbar-none shrink-0">
        {["I'm on my way!", "Be there in 5 min", "Running a bit late", "Arrived!", "Can you clarify?"].map(
          (reply) => (
            <button
              key={reply}
              onClick={() => setInput(reply)}
              className="shrink-0 text-xs bg-muted active:bg-primary/20 border border-border active:border-primary/50 rounded-full px-3 py-1.5 transition-all text-muted-foreground active:text-primary font-medium select-none"
            >
              {reply}
            </button>
          ),
        )}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2 p-3 border-t border-border shrink-0">
        <input
          className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground transition-all"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={1000}
        />
        <Button
          size="icon"
          className="rounded-full w-9 h-9 shrink-0"
          onClick={send}
          disabled={!input.trim() || sending}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
