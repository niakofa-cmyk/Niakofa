import { useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { authHeaders } from "@/lib/auth";

function makeSessionId(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return `messages-${id}`;
}

export function MessengerAskNia({ query, onClose }: { query: string; onClose: () => void }) {
  const [answer, setAnswer] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const message = query.trim();
    if (!message || working) return;
    setWorking(true);
    setError(null);
    setAnswer("");

    try {
      const response = await fetch("/api/nia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          message,
          sessionId: makeSessionId(),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Nia is unavailable right now.");
      }
      if (!response.body) throw new Error("Nia returned no response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split("\n").find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(5).trim()) as { type?: string; text?: string; message?: string };
            if (event.type === "delta" && event.text) setAnswer((current) => current + event.text);
            if (event.type === "error") setError(event.message ?? "Nia could not answer.");
          } catch {
            // Ignore partial/non-JSON SSE frames.
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nia could not answer.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mx-3 mb-3 rounded-3xl border border-primary/20 bg-card p-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black">Ask Nia</p>
          <p className="truncate text-xs text-muted-foreground">{query}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Close Ask Nia">
          <X className="h-4 w-4" />
        </button>
      </div>
      {!answer && !error && !working && (
        <button type="button" onClick={() => void ask()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-black text-primary-foreground">
          <Send className="h-4 w-4" /> Ask Nia
        </button>
      )}
      {working && !answer && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Nia is thinking…
        </div>
      )}
      {answer && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{answer}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {answer && !working && (
        <button type="button" onClick={() => void ask()} className="mt-3 text-xs font-bold text-primary">Ask again</button>
      )}
    </div>
  );
}
