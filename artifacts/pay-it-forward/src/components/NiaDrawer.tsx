import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/AppContext";

const NIA_SERVICE_URL = import.meta.env.VITE_NIA_SERVICE_URL ?? "/nia";

function getSessionId(): string {
  let id = sessionStorage.getItem("nia_session_id");
  if (!id) {
    id = `nia_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("nia_session_id", id);
  }
  return id;
}

interface Message {
  role: "user" | "nia";
  content: string;
  streaming?: boolean;
}

interface NiaDrawerProps {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
}

export function NiaDrawer({ open, onClose, initialMessage }: NiaDrawerProps) {
  const { currentUser } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = getSessionId();

  useEffect(() => {
    if (!open || historyLoaded) return;
    fetch(`${NIA_SERVICE_URL}/history/${sessionId}`)
      .then((r) => r.json())
      .then((rows: { userMessage: string; niaResponse: string }[]) => {
        if (rows.length > 0) {
          const restored: Message[] = [];
          for (const row of rows) {
            restored.push({ role: "user", content: row.userMessage });
            restored.push({ role: "nia", content: row.niaResponse });
          }
          setMessages(restored);
        } else {
          setMessages([{ role: "nia", content: "Hi! I'm Nia, your Niakofa community assistant. 💜\n\nHow can I help you today?" }]);
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        setMessages([{ role: "nia", content: "Hi! I'm Nia, your Niakofa community assistant. 💜\n\nHow can I help you today?" }]);
        setHistoryLoaded(true);
      });
  }, [open, historyLoaded, sessionId]);

  useEffect(() => {
    if (open && historyLoaded && initialMessage && messages.length <= 1) {
      sendMessage(initialMessage);
    }
  }, [open, historyLoaded, initialMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "nia", content: "", streaming: true }]);

    try {
      const res = await fetch(`${NIA_SERVICE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, sessionId, userId: currentUser?.id ?? null }),
      });

      if (res.status === 429) {
        const err = await res.json();
        const reset = new Date(err.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "nia" && last.streaming) {
            updated[updated.length - 1] = {
              role: "nia",
              content: `You've reached your daily message limit with Nia. 💜\n\nYour limit resets at ${reset}. See you then!`,
              streaming: false,
            };
          }
          return updated;
        });
        setLoading(false);
        return;
      }
      if (!res.ok || !res.body) throw new Error("unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "delta") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "nia") updated[updated.length - 1] = { ...last, content: last.content + event.text, streaming: true };
                return updated;
              });
            } else if (event.type === "done" || event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "nia") updated[updated.length - 1] = { ...last, content: event.type === "error" ? event.message : last.content, streaming: false };
                return updated;
              });
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "nia" && last.streaming) updated[updated.length - 1] = { role: "nia", content: "I'm having trouble connecting right now. Please try again in a moment.", streaming: false };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId, currentUser?.id]);

  const handleReset = () => {
    sessionStorage.removeItem("nia_session_id");
    setHistoryLoaded(false);
    setMessages([]);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl flex flex-col"
            style={{ height: "82dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-black text-base">Nia</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Community Assistant</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="rounded-full w-8 h-8" onClick={handleReset} title="New conversation">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "nia" && (
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}>
                    {msg.content}
                    {msg.streaming && <span className="inline-block w-1.5 h-4 bg-primary/60 ml-0.5 animate-pulse rounded-sm" />}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-safe pt-3 border-t border-border shrink-0">
              <div className="flex items-center gap-2 bg-muted rounded-2xl px-4 py-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder="Ask Nia anything…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  disabled={loading}
                />
                <Button size="icon" className="w-8 h-8 rounded-xl shrink-0"
                  onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Nia can make mistakes. For emergencies call 911 or text 988.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function NiaFab({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="fixed bottom-36 right-4 z-40 w-12 h-12 rounded-full bg-primary shadow-[0_0_20px_rgba(139,92,246,0.4)] flex items-center justify-center border border-primary/30"
      aria-label="Open Nia assistant"
    >
      <Sparkles className="w-5 h-5 text-primary-foreground" />
    </motion.button>
  );
}
