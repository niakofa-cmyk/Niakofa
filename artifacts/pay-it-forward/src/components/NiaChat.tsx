import { useEffect, useRef, useState } from "react";
import { useAppContext } from "../lib/AppContext";
import { authHeaders } from "../lib/auth";

const NIA_URL = import.meta.env.VITE_NIA_SERVICE_URL ?? "https://niakofa-production.up.railway.app";

function getOrCreateSessionId(): string {
  const STORAGE_KEY = "niakofa_nia_session_id";
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

interface Message {
  role: "user" | "nia";
  text: string;
  imagePreview?: string; // data URL shown in the bubble for user-sent images
}

/** Resize an image to fit within maxDim×maxDim and return a JPEG data URL. */
async function resizeImage(file: File, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function NiaChat() {
  const { currentUser, helperModeActive } = useAppContext();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "nia", text: "Hi, I'm Nia 👋 How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getOrCreateSessionId());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setStreaming(true);
    setMessages((m) => [...m, { role: "nia", text: "" }]);

    try {
      const res = await fetch(`${NIA_URL}/chat`, {
        method: "POST",
        // HIGH-002: identity comes from the verified Bearer token, not a
        // client-supplied userId — nia-service no longer trusts a userId
        // sent in the request body.
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          message: text,
          sessionId: sessionId.current,
          userName: currentUser?.name ?? null,
          accountType: currentUser?.account_type ?? null,
          helperModeActive: helperModeActive ?? false,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      const MAX_BUFFER = 1_048_576; // 1MB — prevent unbounded growth on malformed SSE
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > MAX_BUFFER) { buffer = ""; continue; }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === "delta") {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                  role: "nia",
                  text: copy[copy.length - 1].text + json.text,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "nia",
          text: "Sorry, I'm having trouble connecting. Please try again.",
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  async function sendImage(file: File) {
    if (streaming) return;
    setStreaming(true);

    let dataUrl: string;
    try {
      dataUrl = await resizeImage(file);
    } catch {
      setStreaming(false);
      setMessages((m) => [...m, { role: "nia", text: "I couldn't read that image. Please try a different file." }]);
      return;
    }

    // Show thumbnail in chat as a user message
    const question = input.trim();
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", text: question || "📷 Photo", imagePreview: dataUrl },
      { role: "nia", text: "" },
    ]);

    try {
      const res = await fetch(`${NIA_URL}/analyze-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          imageBase64: dataUrl,
          question: question || undefined,
        }),
      });

      const data = await res.json() as { analysis?: string; error?: string };
      const text = data.analysis ?? data.error ?? "I couldn't analyze that image.";
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "nia", text };
        return copy;
      });
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "nia", text: "Sorry, I couldn't analyze that image right now." };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) sendImage(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: "24px", right: "24px",
          width: "56px", height: "56px", borderRadius: "50%",
          background: "#6c63ff", color: "#fff", fontSize: "24px",
          border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(108,99,255,0.4)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: "92px", right: "24px",
          width: "340px", maxHeight: "480px", background: "#0a0f1e",
          border: "1px solid #1e2a45", borderRadius: "16px",
          display: "flex", flexDirection: "column",
          zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid #1e2a45",
            fontFamily: "Inter, sans-serif", fontWeight: 600, color: "#fff", fontSize: "15px",
          }}>
            Nia · Niakofa Assistant
          </div>

          <div style={{
            flex: 1, overflowY: "auto", padding: "12px 16px",
            display: "flex", flexDirection: "column", gap: "10px",
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#6c63ff" : "#1e2a45",
                color: "#fff",
                borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: m.imagePreview ? "6px" : "8px 12px",
                maxWidth: "80%",
                fontFamily: "Inter, sans-serif", fontSize: "14px",
                lineHeight: "1.5", whiteSpace: "pre-wrap",
              }}>
                {m.imagePreview && (
                  <img
                    src={m.imagePreview}
                    alt="Sent image"
                    style={{ display: "block", width: "100%", borderRadius: "8px", marginBottom: m.text && m.text !== "📷 Photo" ? "6px" : 0 }}
                  />
                )}
                {(!m.imagePreview || (m.text && m.text !== "📷 Photo")) && (
                  <span>{m.text || (streaming && i === messages.length - 1 ? "▌" : "")}</span>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ borderTop: "1px solid #1e2a45", padding: "10px 12px", display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
            {/* Camera / image button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={streaming}
              title="Send an image to Nia"
              style={{
                background: "#1e2a45", color: "#fff", border: "none",
                borderRadius: "8px", padding: "8px 10px",
                cursor: streaming ? "not-allowed" : "pointer",
                fontSize: "16px", opacity: streaming ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              📷
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask Nia anything…"
              disabled={streaming}
              style={{
                flex: 1, background: "#1e2a45", border: "none",
                borderRadius: "8px", padding: "8px 12px",
                color: "#fff", fontFamily: "Inter, sans-serif", fontSize: "14px", outline: "none",
              }}
            />
            <button onClick={send} disabled={streaming} style={{
              background: "#6c63ff", color: "#fff", border: "none",
              borderRadius: "8px", padding: "8px 14px",
              cursor: streaming ? "not-allowed" : "pointer",
              fontFamily: "Inter, sans-serif", fontSize: "14px",
              opacity: streaming ? 0.6 : 1,
            }}>
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
