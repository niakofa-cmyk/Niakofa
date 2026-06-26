import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, RotateCcw, MapPin, MapPinOff, ChevronDown, Mic } from "lucide-react";
import { authHeaders } from "../lib/auth";

// NIA_SERVICE_URL removed — all Nia calls route through /api/nia/* proxy
const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const WELCOME_PHRASES = [
  "Sawubona — I see you.",
  "Akwaaba — you are welcome here.",
  "Pamoja — together, we rise.",
];

const QUICK_PROMPTS = [
  { label: "🍽️ Find food near me", text: "Where can I find food assistance near me today?" },
  { label: "🏠 Need shelter", text: "I need emergency shelter. Can you help me find a place tonight?" },
  { label: "💙 I'm struggling", text: "I'm really struggling right now and don't know where to turn." },
  { label: "📋 Benefits help", text: "Help me find out what benefits I might qualify for." },
  { label: "🤝 Want to help", text: "I want to help someone in my neighborhood. What requests are open near me?" },
  { label: "🗺️ What's nearby?", text: "What's happening in my community right now?" },
];

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
  timestamp?: Date;
}

interface NiaContext {
  openRequestsNearby: number;
  helpersOnlineNearby: number;
  topCategory: string | null;
  estimatedResponseMinutes: number | null;
  neighborhood: string | null;
}

interface NiaDrawerProps {
  open: boolean;
  onClose: () => void;
  initialMessage?: string;
  userId?: number | null;
  userName?: string | null;
  userLocation?: { lat: number; lon: number } | null;
  helperModeActive?: boolean;
  activeRequestId?: string | number | null;
  accountType?: string | null;
}

function NiaOrb({ size = 38, pulse = false }: { size?: number; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {pulse && (
        <motion.div
          animate={{ scale: [1, 1.45, 1], opacity: [0.45, 0, 0.45] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(29,158,117,0.35) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <motion.div
        animate={pulse ? { scale: [1, 1.04, 1] } : {}}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #1D9E75 0%, #0A6B4E 60%, #085041 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1.5px solid rgba(93,202,165,0.5)",
        }}
      >
        <span style={{
          fontSize: size * 0.42,
          fontWeight: 600,
          color: "#E1F5EE",
          fontFamily: "var(--font-sans)",
          letterSpacing: "-0.01em",
          userSelect: "none",
        }}>
          N
        </span>
      </motion.div>
    </div>
  );
}

function NiaWelcomeSplash({ onDone }: { onDone: () => void }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    WELCOME_PHRASES.forEach((_, i) => {
      timers.push(setTimeout(() => setPhraseIndex(i), i * 900));
    });
    timers.push(setTimeout(onDone, WELCOME_PHRASES.length * 900 + 400));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        padding: "40px 32px",
        background: "linear-gradient(180deg, rgba(29,158,117,0.06) 0%, transparent 100%)",
      }}
    >
      <NiaOrb size={72} pulse />
      <div style={{ textAlign: "center", minHeight: 80, display: "flex", flexDirection: "column", gap: 10 }}>
        {WELCOME_PHRASES.map((phrase, i) => (
          <AnimatePresence key={phrase}>
            {i <= phraseIndex && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  fontSize: i === 0 ? 20 : 15,
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                {phrase}
              </motion.p>
            )}
          </AnimatePresence>
        ))}
      </div>
      <p style={{
        fontSize: 12,
        color: "var(--color-text-tertiary)",
        textAlign: "center",
        maxWidth: 240,
        lineHeight: 1.6,
        margin: 0,
      }}>
        I am Nia — born from Ubuntu, purpose-built to serve. Always free, always here.
      </p>
    </motion.div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 8,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      {!isUser && <NiaOrb size={26} />}
      <div style={{
        maxWidth: "78%",
        padding: "11px 15px",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        fontSize: 13.5,
        lineHeight: 1.65,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: isUser
          ? "linear-gradient(135deg, #1D9E75 0%, #0A6B4E 100%)"
          : "var(--color-background-secondary)",
        color: isUser ? "#E1F5EE" : "var(--color-text-primary)",
        border: isUser ? "none" : "0.5px solid var(--color-border-tertiary)",
      }}>
        {msg.content}
        {msg.streaming && (
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            style={{
              display: "inline-block",
              width: 2,
              height: 14,
              background: "#1D9E75",
              marginLeft: 3,
              borderRadius: 1,
              verticalAlign: "middle",
            }}
          />
        )}
      </div>
    </motion.div>
  );
}

function CrisisStrip() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      margin: "0 12px 4px",
      background: "linear-gradient(135deg, rgba(250,236,231,0.9) 0%, rgba(245,196,179,0.5) 100%)",
      border: "0.5px solid rgba(216,90,48,0.25)",
      borderLeft: "3px solid #D85A30",
      borderRadius: "0 8px 8px 0",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "#993C1D", letterSpacing: "0.02em" }}>
          🆘 Emergency resources — always available
        </span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} color="#993C1D" />
        </motion.div>
      </button>
      <AnimatePresence mode="wait">
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                ["🚨", "Immediate danger", "Call 911"],
                ["💛", "Suicide & crisis", "Call/text 988"],
                ["💬", "Crisis text line", "Text HOME to 741741"],
                ["💜", "Domestic violence", "1-800-799-7233"],
                ["🏠", "Shelter & housing", "Call/text 211"],
                ["🍽️", "Food emergency", "Text FOOD to 877-877"],
                ["🏳️‍🌈", "LGBTQ+ crisis", "1-866-488-7386"],
                ["🎖️", "Veterans", "988 then press 1"],
              ].map(([icon, label, action]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span>{icon}</span>
                  <span style={{ color: "#712B13", flex: 1 }}>{label}</span>
                  <span style={{
                    color: "#993C1D",
                    fontWeight: 600,
                    background: "rgba(245,196,179,0.6)",
                    padding: "2px 8px",
                    borderRadius: 20,
                    fontSize: 11,
                  }}>{action}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LiveContextBadge({ context }: { context: NiaContext | null }) {
  if (!context || (context.openRequestsNearby === 0 && context.helpersOnlineNearby === 0)) return null;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      style={{
        margin: "4px 12px",
        padding: "7px 12px",
        background: "rgba(29,158,117,0.08)",
        border: "0.5px solid rgba(29,158,117,0.2)",
        borderRadius: 8,
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      {context.openRequestsNearby > 0 && (
        <span style={{ fontSize: 11, color: "#0A6B4E", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1D9E75", display: "inline-block" }} />
          {context.openRequestsNearby} open request{context.openRequestsNearby !== 1 ? "s" : ""} nearby
        </span>
      )}
      {context.helpersOnlineNearby > 0 && (
        <span style={{ fontSize: 11, color: "#0A6B4E", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", display: "inline-block" }} />
          {context.helpersOnlineNearby} helper{context.helpersOnlineNearby !== 1 ? "s" : ""} active
        </span>
      )}
      {context.estimatedResponseMinutes && (
        <span style={{ fontSize: 11, color: "#0A6B4E" }}>
          ~{context.estimatedResponseMinutes}min response
        </span>
      )}
    </motion.div>
  );
}

function QuickPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <div style={{ padding: "12px 12px 4px", display: "flex", flexWrap: "wrap", gap: 7 }}>
      {QUICK_PROMPTS.map(({ label, text }) => (
        <button
          key={label}
          onClick={() => onSelect(text)}
          style={{
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 20,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            lineHeight: 1.3,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(29,158,117,0.1)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(29,158,117,0.4)";
            (e.currentTarget as HTMLButtonElement).style.color = "#0A6B4E";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-background-secondary)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-secondary)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function NiaDrawer({
  open,
  onClose,
  initialMessage,
  userId = null,
  userName = null,
  userLocation = null,
  helperModeActive = false,
  activeRequestId = null,
  accountType = null,
}: NiaDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveContext, setLiveContext] = useState<NiaContext | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = getSessionId();
  const isFirstOpen = useRef(!sessionStorage.getItem("nia_has_opened"));
  const contextFetchedRef = useRef(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationStatus("denied"); return; }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setUserCoords({ lat, lon });
        setLocationStatus("granted");
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const d = await r.json();
          const city = d.address?.city || d.address?.town || d.address?.village || d.address?.county || null;
          if (city) setLocationLabel(city);
        } catch { /* silent */ }
      },
      () => setLocationStatus("denied"),
      { timeout: 8000, maximumAge: 300_000 }
    );
  }, []);

  // Fetch live community context once we have coordinates
  useEffect(() => {
    const coords = userCoords ?? userLocation;
    if (!coords || contextFetchedRef.current) return;
    contextFetchedRef.current = true;

    const lat = coords.lat;
    const lng = (coords as { lat: number; lng?: number; lon?: number }).lng ?? (coords as { lat: number; lon?: number }).lon;
    if (lat == null || lng == null) return;

    fetch(`${API_BASE}/api/nia/context?lat=${lat}&lng=${lng}`, {
      headers: authHeaders(),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data: NiaContext | null) => {
        if (data) setLiveContext(data);
      })
      .catch(() => { /* non-critical */ });
  }, [userCoords, userLocation]);

  // Reset context fetch flag when coords change significantly
  useEffect(() => {
    contextFetchedRef.current = false;
  }, [userCoords]);

  useEffect(() => {
    if (!open || historyLoaded) return;
    if (isFirstOpen.current) {
      sessionStorage.setItem("nia_has_opened", "1");
      setShowSplash(true);
      isFirstOpen.current = false;
    }
    fetch(`${API_BASE}/api/nia/history/${sessionId}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((rows: { userMessage: string; niaResponse: string }[]) => {
        if (rows.length > 0) {
          const restored: Message[] = [];
          for (const row of rows) {
            restored.push({ role: "user", content: row.userMessage, timestamp: new Date() });
            restored.push({ role: "nia", content: row.niaResponse, timestamp: new Date() });
          }
          setMessages(restored);
        } else {
          setMessages([{
            role: "nia",
            content: "Sawubona — I see you. Akwaaba, you are welcome here.\n\nI am Nia. I am here to help you find food, shelter, mental health support, community resources, and anything else you need — right now, for free.\n\nHow can I support you today?",
            timestamp: new Date(),
          }]);
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        setMessages([{
          role: "nia",
          content: "Sawubona — I see you. Akwaaba, you are welcome here.\n\nI am Nia. How can I support you today?",
          timestamp: new Date(),
        }]);
        setHistoryLoaded(true);
      });
  }, [open, historyLoaded, sessionId]);

  useEffect(() => {
    if (open && historyLoaded && !showSplash && initialMessage && messages.length <= 1) {
      sendMessage(initialMessage);
    }
  }, [open, historyLoaded, showSplash, initialMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !showSplash) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open, showSplash]);

  useEffect(() => {
    if (open && locationStatus === "idle") requestLocation();
  }, [open]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed, timestamp: new Date() }]);
    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "nia", content: "", streaming: true, timestamp: new Date() }]);

    const coords = userCoords ?? userLocation;

    try {
      const res = await fetch(`${API_BASE}/api/nia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          message: trimmed,
          sessionId,
          userName: userName ?? null,
          helperModeActive,
          activeRequestId: activeRequestId ?? null,
          accountType: accountType ?? null,
          // Live context — Nia uses this to make grounded, specific statements
          liveContext: liveContext ?? undefined,
          ...(coords ?? {}),
        }),
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
              content: `You've reached your daily message limit with me. 💜\n\nYour limit resets at ${reset}. Rest well — I'll be here when you return.\n\n🆘 If this is an emergency, call 911. Crisis line: 988.`,
              streaming: false,
              timestamp: new Date(),
            };
          }
          return updated;
        });
        setLoading(false);
        return;
      }

      if (res.status === 503) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "nia" && last.streaming) {
            updated[updated.length - 1] = {
              role: "nia",
              content: "Nia is temporarily unavailable. Please try again in a moment. 💜\n\n🆘 If this is urgent, call 988 (Crisis Line) or 211 (Community Resources).",
              streaming: false,
              timestamp: new Date(),
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
                if (last?.role === "nia") updated[updated.length - 1] = {
                  ...last,
                  content: event.type === "error" ? "I'm having trouble connecting right now. If this is an emergency, please call 911 or text 988." : last.content,
                  streaming: false,
                };
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
        if (last?.role === "nia" && last.streaming) updated[updated.length - 1] = {
          role: "nia",
          content: "I'm having trouble connecting right now. If this is an emergency, please call 911 or text 988.",
          streaming: false,
          timestamp: new Date(),
        };
        return updated;
      });
    } finally {
      setLoading(false);
      // Refresh live context after each message (non-blocking)
      const coords = userCoords ?? userLocation;
      if (coords) {
        const lat = coords.lat;
        const lng = (coords as { lat: number; lng?: number; lon?: number }).lng ?? (coords as { lat: number; lon?: number }).lon;
        if (lat != null && lng != null) {
          fetch(`${API_BASE}/api/nia/context?lat=${lat}&lng=${lng}`, { headers: authHeaders() })
            .then((r) => r.ok ? r.json() : null)
            .then((data: NiaContext | null) => { if (data) setLiveContext(data); })
            .catch(() => {});
        }
      }
    }
  }, [loading, sessionId, userCoords, userId, userName, userLocation, helperModeActive, activeRequestId, accountType, liveContext]);

  const handleReset = () => {
    sessionStorage.removeItem("nia_session_id");
    setHistoryLoaded(false);
    setMessages([]);
    contextFetchedRef.current = false;
    setLiveContext(null);
  };

  const showQuickPrompts = historyLoaded && !showSplash && messages.length <= 1 && !loading;

  return (
    <AnimatePresence mode="wait">
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(3px)",
              zIndex: 9998,
            }}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", bottom: 0, left: 0, right: 0,
              zIndex: 9999,
              height: "96dvh",
              display: "flex",
              flexDirection: "column",
              background: "var(--color-background-primary)",
              borderRadius: "24px 24px 0 0",
              border: "0.5px solid var(--color-border-tertiary)",
              borderBottom: "none",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px 12px",
              borderBottom: "0.5px solid var(--color-border-tertiary)",
              flexShrink: 0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <NiaOrb size={40} pulse={!loading} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.2 }}>Nia</div>
                  <div style={{ fontSize: 11, color: "#0F6E56", letterSpacing: "0.03em", fontWeight: 500 }}>Always here · Always free</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {locationStatus === "granted" && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, color: "#0F6E56",
                    background: "rgba(29,158,117,0.1)",
                    padding: "4px 9px", borderRadius: 20,
                    border: "0.5px solid rgba(29,158,117,0.25)",
                    fontWeight: 500,
                  }}>
                    <MapPin size={11} />
                    {locationLabel ?? "Location on"}
                  </div>
                )}
                {locationStatus === "denied" && (
                  <button onClick={requestLocation} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, color: "var(--color-text-tertiary)",
                    background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px",
                  }}>
                    <MapPinOff size={12} /> Enable location
                  </button>
                )}
                <button onClick={handleReset} title="New conversation" style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "transparent",
                  border: "0.5px solid var(--color-border-tertiary)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  <RotateCcw size={14} color="var(--color-text-secondary)" />
                </button>
                <button onClick={onClose} style={{
                  width: 30, height: 30, borderRadius: "50%",
                  background: "transparent",
                  border: "0.5px solid var(--color-border-tertiary)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  <X size={15} color="var(--color-text-secondary)" />
                </button>
              </div>
            </div>

            {showSplash ? (
              <NiaWelcomeSplash onDone={() => setShowSplash(false)} />
            ) : (
              <>
                <div style={{ paddingTop: 10, flexShrink: 0 }}>
                  <CrisisStrip />
                </div>
                <LiveContextBadge context={liveContext} />
                <AnimatePresence mode="wait">
                  {showQuickPrompts && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ flexShrink: 0, overflow: "hidden" }}
                    >
                      <QuickPrompts onSelect={(text) => sendMessage(text)} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div style={{
                  flex: 1, overflowY: "auto",
                  padding: "12px 12px 4px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                  <div ref={bottomRef} />
                </div>
                <div style={{
                  padding: "10px 12px 16px",
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  flexShrink: 0,
                  background: "var(--color-background-primary)",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 9,
                    background: "var(--color-background-secondary)",
                    borderRadius: 26,
                    padding: "8px 8px 8px 16px",
                    border: "0.5px solid var(--color-border-tertiary)",
                  }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                      placeholder="Ask Nia anything…"
                      disabled={loading}
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.4,
                      }}
                    />
                    <button
                      onClick={() => sendMessage(input)}
                      disabled={loading || !input.trim()}
                      style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: loading || !input.trim()
                          ? "var(--color-border-tertiary)"
                          : "linear-gradient(135deg, #1D9E75 0%, #0A6B4E 100%)",
                        border: "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                        flexShrink: 0, transition: "background 0.2s",
                      }}
                    >
                      {loading
                        ? <Loader2 size={15} color="var(--color-text-tertiary)" />
                        : <Send size={14} color={!input.trim() ? "var(--color-text-tertiary)" : "#E1F5EE"} />
                      }
                    </button>
                  </div>
                  <p style={{
                    fontSize: 10.5, color: "var(--color-text-tertiary)",
                    textAlign: "center", marginTop: 7, lineHeight: 1.5,
                  }}>
                    Pamoja — together we rise. · Emergency: 911 · Crisis: 988
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function NiaFab({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      aria-label="Open Nia — your community assistant"
      whileHover={{ scale: 1.07 }}
      whileTap={{ scale: 0.94 }}
      style={{
        position: "fixed",
        bottom: 80,
        right: 18,
        zIndex: 9997,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #1D9E75 0%, #085041 100%)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 20px rgba(10,61,46,0.35)",
      }}
    >
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: "50%",
          border: "1.5px solid rgba(29,158,117,0.6)",
          pointerEvents: "none",
        }}
      />
      <span style={{
        fontSize: 22, fontWeight: 700, color: "#E1F5EE",
        fontFamily: "var(--font-sans)",
        letterSpacing: "-0.01em",
        userSelect: "none", lineHeight: 1,
      }}>
        N
      </span>
    </motion.button>
  );
}
