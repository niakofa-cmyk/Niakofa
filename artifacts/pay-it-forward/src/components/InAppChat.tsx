import { useState, useEffect, useRef } from "react";
import { useWebSocket } from "@/lib/useWebSocket";
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

  // Load history
  useEffect(() => {
    fetch(`/api/requests/${requestId}/chat`)
      .then(r => r.json())
      .then((msgs: ChatMessage[]) => setMessages(msgs))
      .catch(() => {});
  }, [requestId]);

  // Real-time incoming messages
  useWebSocket("chat_message" as any, (event) => {
    const msg = event.payload as ChatMessage;
    if (msg.request_id === requestId) {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    }
  });

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || !currentUser || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/requests/${requestId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender_id: currentUser.id, content: input.trim() }),
      });
      if (res.ok) setInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-80 bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-bold">Chat</span>
        <span className="text-xs text-muted-foreground ml-auto">{helperName} · {requesterName}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-4">No messages yet. Say hi!</div>
        )}
        {messages.map(msg => {
          const isMine = msg.sender_id === currentUser?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                isMine
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 p-3 border-t border-border">
        <input
          className="flex-1 bg-muted rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }}}
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
