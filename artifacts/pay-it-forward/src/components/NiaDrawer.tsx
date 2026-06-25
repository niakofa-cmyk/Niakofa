import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, RotateCcw, MapPin, MapPinOff, ChevronDown, Mic, Volume2, Square } from "lucide-react";
import { authHeaders } from "../lib/auth";
import { useVoiceWakeWord } from "../hooks/useVoiceWakeWord";
import { VoiceWakeWordIndicator, VoicePulseIndicator } from "./VoiceWakeWordIndicator";
import { detectUserLanguage, getProfile, CulturalLanguage } from "../lib/culturalGreetings";
import { useNiaTTS } from "../hooks/useNiaTTS";


// All Nia traffic routes through the API server proxy at /api/nia/...
// No hardcoded external URL — the api-server forwards to the nia-service.
const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const WELCOME_PHRASES = [
  "Sawubona — I see you.",
  "Akwaaba — you are welcome here.",
  "Pamoja — together, we rise.",
  "Ubuntu — I am because we are.",
];

const QUICK_PROMPTS = [
  { label: "🍽️ Find food near me", text: "Where can I find food assistance near me today?" },
  { label: "🏠 Need shelter", text: "I need emergency shelter. Can you help me find a place tonight?" },
  { label: "💙 I'm struggling", text: "I'm really struggling right now and don't know where to turn." },
  { label: "📋 Benefits help", text: "Help me find out what benefits I qualify for." },
  { label: "🤝 Become a helper", text: "I want to become a Niakofa helper. How do I get started and what should I know?" },
  { label: "🗺️ What's nearby?", text: "What's happening in my community right now?" },
  { label: "💳 Payment question", text: "I have a question about my wallet or a payment on my account." },
  { label: "🌍 Need translation", text: "Can you help me communicate with a neighbor in a different language?" },
];


// ── Parse [SUGGEST: ...] tags from Nia responses ─────────────────────────────
function parseSuggestions(content: string): { text: string; suggestions: string[] } {
  const match = content.match(/\[SUGGEST:\s*([^\]]+)\]/);
  if (!match) return { text: content, suggestions: [] };
  const suggestions = match[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const text = content.replace(/\[SUGGEST:[^\]]+\]/, "").trimEnd();
  return { text, suggestions };
}

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
  // Phase 4: real match_reasons from lib/matching.ts, surfaced by
  // helper-dashboard.tsx via AppContext when a helper is viewing open
  // requests. Forwarded to the backend so Nia can explain a match using only
  // real data, never invented reasons.
  matchReasons?: string[] | null;
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

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    // Detect mobile to use faster timing so the splash feels snappy, not slow
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    const phraseDuration = isMobile ? 700 : 900;
    const timers: ReturnType<typeof setTimeout>[] = [];
    WELCOME_PHRASES.forEach((_, i) => {
      timers.push(setTimeout(() => setPhraseIndex(i), i * phraseDuration));
    });
    const total = WELCOME_PHRASES.length * phraseDuration + 400;
    timers.push(setTimeout(() => onDoneRef.current(), total));
    const safety = setTimeout(() => onDoneRef.current(), 4000);
    return () => { timers.forEach(clearTimeout); clearTimeout(safety); };
  }, []); // run once on mount only

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

function MessageBubble({
  msg,
  isSpeaking,
  onSpeak,
  onSuggest,
}: {
  msg: Message;
  isSpeaking?: boolean;
  onSpeak?: () => void;
  onSuggest?: (text: string) => void;
}) {
  const isUser = msg.role === "user";
  const { text: displayText, suggestions } = isUser || msg.streaming
    ? { text: msg.content, suggestions: [] }
    : parseSuggestions(msg.content);
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
        {displayText}
        {!isUser && !msg.streaming && msg.content && onSpeak && (
          <button
            onClick={onSpeak}
            aria-label={isSpeaking ? "Stop playback" : "Listen to this message"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              marginLeft: 6,
              verticalAlign: "middle",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: isSpeaking ? "#1D9E75" : "var(--color-text-tertiary)",
              padding: 0,
            }}
          >
            {isSpeaking ? <Square size={13} /> : <Volume2 size={14} />}
          </button>
        )}
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
      {!isUser && !msg.streaming && suggestions.length > 0 && onSuggest && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, marginLeft: 34 }}>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onSuggest(s)}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid rgba(29,158,117,0.4)",
                background: "rgba(29,158,117,0.08)",
                color: "#0A6B4E",
                cursor: "pointer",
                fontWeight: 600,
                lineHeight: 1.3,
                transition: "all 0.15s",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {s} →
            </button>
          ))}
        </div>
      )}
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
          className="nia-quick-prompt"
          style={{
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: 20,
            border: "0.5px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary)",
            color: "var(--color-text-secondary)",
            cursor: "pointer",
            lineHeight: 1.3,
            transition: "all 0.15s",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
            minHeight: 36,
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
  matchReasons = null,
}: NiaDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<CulturalLanguage>("en");

  // Phase 7a: Detect cultural language
  useEffect(() => {
    setVoiceLanguage(detectUserLanguage());
  }, []);

  // Phase 7a: Voice wake word
  const { listening, listeningState, stopListening, startListening } = useVoiceWakeWord({
    enabled: true,
    continuous: true,
    onWakeWordDetected: (lang, _transcript) => {
      setVoiceActivated(true);
      setVoiceLanguage(lang);
      const profile = getProfile(lang);
      setMessages((prev: Message[]) => [
        ...prev,
        { role: "nia", content: profile.greetingResponse, timestamp: new Date() },
      ]);
      niaSay(profile.greetingResponse, lang);
    },
  });


  // Phase 7b: Nia speaks back
  const { speak: niaSay, stop: niaStopSpeaking } = useNiaTTS({ enabled: true });
  // Phase 7a: Stop voice when drawer closes
  useEffect(() => {
    if (!open) {
      stopListening();
      niaStopSpeaking();
      setVoiceActivated(false);
    }
  }, [open]);

  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveContext, setLiveContext] = useState<NiaContext | null>(null);
  // Phase 6: voice I/O. speakingIndex tracks which message bubble (if any) is
  // currently playing TTS audio, so only one plays at a time and the speaker
  // button can show a stop icon for the active one. recording tracks mic
  // capture state for the push-to-talk button.
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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

  // Fetch live community context once we have coordinates — only when authenticated
  useEffect(() => {
    const coords = userCoords ?? userLocation;
    if (!coords || contextFetchedRef.current) return;
    // Skip context fetch if no auth token — avoids 401 noise on login screen
    const headers = authHeaders();
    if (!headers["Authorization"]) return;
    contextFetchedRef.current = true;

    const lat = coords.lat;
    const lng = (coords as { lat: number; lng?: number; lon?: number }).lng ?? (coords as { lat: number; lon?: number }).lon;
    if (lat == null || lng == null) return;

    fetch(`${API_BASE}/api/nia/context?lat=${lat}&lng=${lng}`, {
      headers,
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
    fetch(`${API_BASE}/api/nia/history/${sessionId}`, {
      headers: authHeaders(),
    })
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
          language: voiceLanguage !== "en" ? voiceLanguage : undefined,
          voiceActivated,
          wakeWordLanguage: voiceActivated ? voiceLanguage : undefined,
          sessionId,
          userName: userName ?? null,
          helperModeActive,
          activeRequestId: activeRequestId ?? null,
          accountType: accountType ?? null,
          // Live context — Nia uses this to make grounded, specific statements
          liveContext: (liveContext || matchReasons?.length)
            ? { ...(liveContext ?? {}), ...(matchReasons?.length ? { matchReasons } : {}) }
            : undefined,
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

  // Phase 6: TTS playback for a given message bubble. Stops any
  // currently-playing audio first (only one plays at a time). Clicking the
  // speaker on an already-speaking message stops it instead of restarting.
  const speakMessage = useCallback(async (index: number, text: string) => {
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
      audioPlaybackRef.current = null;
    }
    if (speakingIndex === index) {
      setSpeakingIndex(null);
      return;
    }
    setSpeakingIndex(index);
    try {
      const res = await fetch(`${API_BASE}/api/nia/voice/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setSpeakingIndex(null);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlaybackRef.current = audio;
      audio.onended = () => {
        setSpeakingIndex((cur) => (cur === index ? null : cur));
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setSpeakingIndex((cur) => (cur === index ? null : cur));
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      setSpeakingIndex((cur) => (cur === index ? null : cur));
    }
  }, [speakingIndex]);

  // Phase 6: push-to-talk recording. Records a single utterance, sends it to
  // /api/nia/voice/transcribe, and feeds the transcribed text through the
  // normal sendMessage flow — voice doesn't bypass any of the existing chat
  // logic, it just supplies the text a different way.
  const startRecording = useCallback(async () => {
    if (recording || loading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        if (blob.size === 0) return;
        setTranscribing(true);
        try {
          const res = await fetch(`${API_BASE}/api/nia/voice/transcribe`, {
            method: "POST",
            headers: { "Content-Type": blob.type, ...authHeaders() },
            body: blob,
          });
          if (res.ok) {
            const data = (await res.json()) as { text?: string };
            if (data.text) {
              setInput(data.text);
              sendMessage(data.text);
            }
          }
        } catch {
          // Silent — user can just type instead if voice transcription fails.
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      // Mic permission denied or unavailable — recording state never flips
      // to true, so the UI stays in its normal (text-input) state.
    }
  }, [recording, loading, sendMessage]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }, []);

  // Stop any playing audio and release the mic if the drawer closes mid-recording.
  useEffect(() => {
    if (!open) {
      audioPlaybackRef.current?.pause();
      audioPlaybackRef.current = null;
      setSpeakingIndex(null);
      if (recording) stopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
                  {messages.map((msg, i) => (
                    <MessageBubble
                      key={i}
                      msg={msg}
                      isSpeaking={speakingIndex === i}
                      onSpeak={() => speakMessage(i, msg.content)}
                      onSuggest={(text) => sendMessage(text)}
                    />
                  ))}
                  <div ref={bottomRef} />
                </div>
                <div style={{
                  padding: "10px 12px",
                  paddingBottom: "max(16px, env(safe-area-inset-bottom))",
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
                      placeholder={recording ? "Listening…" : transcribing ? "Transcribing…" : "Ask Nia anything…"}
                      disabled={loading || recording || transcribing}
                      style={{
                        flex: 1, background: "transparent", border: "none", outline: "none",
                        fontSize: 16, color: "var(--color-text-primary)", lineHeight: 1.4,
                      }}
                    />
                    <button
                      onClick={recording ? stopRecording : startRecording}
                      disabled={loading || transcribing}
                      aria-label={recording ? "Stop recording" : "Record a voice message"}
                      style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: recording
                          ? "linear-gradient(135deg, #E05252 0%, #B23A3A 100%)"
                          : "var(--color-background-tertiary)",
                        border: "none",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: loading || transcribing ? "not-allowed" : "pointer",
                        flexShrink: 0, transition: "background 0.2s",
                        opacity: loading || transcribing ? 0.5 : 1,
                      }}
                    >
                      {transcribing
                        ? <Loader2 size={14} color="var(--color-text-tertiary)" className="animate-spin" />
                        : <Mic size={14} color={recording ? "#fff" : "var(--color-text-secondary)"} />
                      }
                    </button>
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
                        : <Send size={14} color={!input.trim() ? 'var(--color-text-tertiary)' : '#E1F5EE'} />
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

// Nia's living orb — sparkle particle positions (degrees around the circle)
const NIA_SPARK_ANGLES = [0, 72, 144, 216, 288];

export function NiaFab({ onClick, hidden }: { onClick: () => void; hidden?: boolean }) {
  const FAB_SIZE = 70;
  const MARGIN = 14;
  // v2 key resets any old bottom-right saved position → defaults to top-center
  const STORAGE_KEY = "nia_fab_pos_v2";

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Use a ref for drag state so we never close over stale pos
  const drag = useRef({ active: false, moved: false, px: 0, py: 0, ox: 0, oy: 0 });
  const divRef = useRef<HTMLDivElement>(null);

  // Clamp a position to the current viewport bounds.
  // safeAreaBottom is a ref read at call time — no closure dep needed.
  const clampToViewport = useCallback((p: { x: number; y: number }): { x: number; y: number } => {
    const maxX = window.innerWidth - FAB_SIZE - MARGIN;
    // Account for safe-area-inset-bottom (iPhone home indicator, Android gesture bar)
    // so Nia never lands behind the system UI at the screen bottom.
    const maxY = window.innerHeight - FAB_SIZE - MARGIN - safeAreaBottom.current;
    return {
      x: Math.max(MARGIN, Math.min(p.x, maxX)),
      y: Math.max(MARGIN, Math.min(p.y, maxY)),
    };
  }, []);

  // Mount: restore persisted position, or default to top-center
  useEffect(() => {
    const defaultPos = () => ({
      x: Math.round(window.innerWidth / 2 - FAB_SIZE / 2),
      // y: 16 keeps Nia at the very top of the viewport — visually above the
      // TopBar and all page UI, confirming she floats OUTSIDE the app chrome.
      // Users can drag her anywhere; position is persisted to localStorage.
      y: 16,
    });
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        const maxX = window.innerWidth - FAB_SIZE - MARGIN;
        const maxY = window.innerHeight - FAB_SIZE - MARGIN;
        if (typeof p.x === "number" && typeof p.y === "number" &&
            p.x >= MARGIN && p.x <= maxX && p.y >= MARGIN && p.y <= maxY) {
          setPos(p);
          return;
        }
      }
    } catch { /* ignore */ }
    setPos(defaultPos());
  }, []);

  // Resize / orientation-change guard: re-clamp persisted position whenever
  // the viewport dimensions change. Without this, rotating the device mid-session
  // or resizing the browser window can strand the orb outside the new bounds.
  // BUG-5 (remaining): "Drag clamp bounds still computed from window at drag-time only;
  // rotating mid-session can leave the orb outside the new viewport bounds."
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        if (!prev) return prev;
        const clamped = clampToViewport(prev);
        // Only update state (and trigger a re-render) if bounds actually changed
        if (clamped.x === prev.x && clamped.y === prev.y) return prev;
        return clamped;
      });
    };
    window.addEventListener("resize", handleResize, { passive: true });
    // screen.orientation is more reliable than resize for orientation changes
    // on iOS PWAs and Android Chrome where resize fires inconsistently.
    if (typeof screen !== "undefined" && screen.orientation) {
      screen.orientation.addEventListener("change", handleResize);
    }
    return () => {
      window.removeEventListener("resize", handleResize);
      if (typeof screen !== "undefined" && screen.orientation) {
        screen.orientation.removeEventListener("change", handleResize);
      }
    };
  }, [clampToViewport]);

  // Raw pointer handlers on a plain div — most reliable on mobile + desktop
  const onPD = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const cur = pos ?? { x: 0, y: 0 };
    // Set drag.active = true BEFORE attempting setPointerCapture so that
    // even if capture throws (WebKit/mobile WebViews can throw on touch-originated
    // pointerIds), drag state is still active and onPointerMove will process moves.
    drag.current = { active: true, moved: false, px: e.clientX, py: e.clientY, ox: cur.x, oy: cur.y };
    // Visual feedback: switch to grabbing cursor imperatively (no re-render cost)
    if (divRef.current) divRef.current.style.cursor = "grabbing";
    try {
      divRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // Capture failed (common on iOS WebKit with touch pointers) — drag still
      // works via onPointerMove since drag.current.active is already true.
    }
  }, [pos]);

  const onPM = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.sqrt(dx * dx + dy * dy) < 7) return;
    d.moved = true;
    const maxX = window.innerWidth - FAB_SIZE - MARGIN;
    const maxY = window.innerHeight - FAB_SIZE - MARGIN - safeAreaBottom.current;
    setPos({
      x: Math.max(MARGIN, Math.min(d.ox + dx, maxX)),
      y: Math.max(MARGIN, Math.min(d.oy + dy, maxY)),
    });
  }, []);

  const onPU = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    // Reset cursor back to grab regardless of whether this was a tap or a drag
    if (divRef.current) divRef.current.style.cursor = "grab";
    if (!d.moved) {
      onClick();
    } else {
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      const maxX = window.innerWidth - FAB_SIZE - MARGIN;
      const maxY = window.innerHeight - FAB_SIZE - MARGIN - safeAreaBottom.current;
      const newPos = {
        x: Math.max(MARGIN, Math.min(d.ox + dx, maxX)),
        y: Math.max(MARGIN, Math.min(d.oy + dy, maxY)),
      };
      setPos(newPos);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos)); } catch { /* ignore */ }
    }
    d.moved = false;
    try { divRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [onClick]);

  // System/browser-canceled gestures (e.g. OS swipe, incoming call) must NOT
  // be treated as a tap — clear drag state without opening Nia or persisting.
  const onPC = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    d.active = false;
    d.moved = false;
    if (divRef.current) divRef.current.style.cursor = "grab";
    try { divRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  // ── Safe-area measurement (added LAST to preserve hook order) ────────────────
  // Measures env(safe-area-inset-bottom) once on mount via a CSS env() probe so
  // the clamp functions can account for the iPhone home indicator and Android
  // gesture bar without requiring a CSS-to-JS polyfill. Stored as a ref so it
  // never triggers re-renders; read at call time in drag handlers and clampToViewport.
  const safeAreaBottom = useRef(0);
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;pointer-events:none;visibility:hidden;" +
      "bottom:env(safe-area-inset-bottom,0px);height:0";
    document.body.appendChild(probe);
    safeAreaBottom.current = parseFloat(getComputedStyle(probe).bottom) || 0;
    document.body.removeChild(probe);
  }, []);

  if (hidden || !pos) return null;

  return (
    // Plain div — no Framer Motion wrapper so pointer capture is unobstructed
    <div
      ref={divRef}
      role="button"
      aria-label="Open Nia — your community assistant"
      onPointerDown={onPD}
      onPointerMove={onPM}
      onPointerUp={onPU}
      onPointerCancel={onPC}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        // Maximum z-index — Nia floats above every app layer
        zIndex: 2147483647,
        width: FAB_SIZE,
        height: FAB_SIZE,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "grab",
        // No transform on outer container — keeps drag hit-area aligned with pointer
      }}
    >
      {/* ── Layer 1: Far outer aura ── */}
      <motion.div
        animate={{ scale: [1, 1.8, 1], opacity: [0.22, 0, 0.22] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: -18,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(29,158,117,0.5) 0%, rgba(29,158,117,0.15) 50%, transparent 75%)",
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 2: Heartbeat ring ── */}
      <motion.div
        animate={{ scale: [1, 1.45, 1], opacity: [0.55, 0, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: [0.2, 0, 0.8, 1], delay: 0.3 }}
        style={{
          position: "absolute",
          inset: -5,
          borderRadius: "50%",
          border: "1.5px solid rgba(93,202,165,0.7)",
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 3: Secondary slower ring ── */}
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0, 0.4] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 1.1 }}
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: "50%",
          border: "1px solid rgba(93,202,165,0.45)",
          pointerEvents: "none",
        }}
      />

      {/* ── Layer 4: Main orb body — floats + heartbeat ── */}
      <motion.div
        animate={{
          scale: [1, 1.05, 1, 1.03, 1],
          // Bob DOWNWARD so visual never extends above the container's hit boundary.
          // Positive y = moves down in CSS — entire orb stays within tap area.
          y: [0, 5, 3, 7, 4, 0],
        }}
        transition={{
          scale: { duration: 2.6, repeat: Infinity, ease: [0.4, 0, 0.6, 1], times: [0, 0.25, 0.5, 0.75, 1] },
          y: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "linear-gradient(140deg, #30D9A0 0%, #1D9E75 30%, #0E7A5A 65%, #085041 100%)",
          border: "2px solid rgba(93,202,165,0.55)",
          boxShadow: [
            "0 8px 36px rgba(10,61,46,0.65)",
            "0 2px 10px rgba(10,61,46,0.4)",
            "inset 0 1px 0 rgba(255,255,255,0.18)",
            "inset 0 -2px 6px rgba(0,0,0,0.2)",
            "0 0 0 1px rgba(29,158,117,0.2)",
          ].join(", "),
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {/* ── Inner rotating shimmer ── */}
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.18) 20%, transparent 40%, rgba(255,255,255,0.08) 60%, transparent 80%)",
            pointerEvents: "none",
          }}
        />
        {/* ── Glint highlight ── */}
        <div style={{
          position: "absolute",
          top: 6,
          left: 10,
          width: 18,
          height: 10,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.22)",
          filter: "blur(3px)",
          pointerEvents: "none",
        }} />
        {/* ── N lettermark ── */}
        <motion.span
          animate={{
            textShadow: [
              "0 1px 8px rgba(0,0,0,0.35)",
              "0 1px 16px rgba(0,200,140,0.5)",
              "0 1px 8px rgba(0,0,0,0.35)",
            ],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: "#E8FFF6",
            fontFamily: "var(--font-sans)",
            letterSpacing: "-0.01em",
            userSelect: "none",
            lineHeight: 1,
            pointerEvents: "none",
            position: "relative",
            zIndex: 1,
          }}
        >
          N
        </motion.span>
      </motion.div>

      {/* ── Layer 5: Orbiting sparkle particles ── */}
      {NIA_SPARK_ANGLES.map((deg, i) => (
        <motion.div
          key={i}
          animate={{
            opacity: [0, 0.9, 0.6, 0],
            scale: [0, 1.2, 0.8, 0],
            x: [0, Math.round(Math.cos((deg * Math.PI) / 180) * 40)],
            y: [0, Math.round(Math.sin((deg * Math.PI) / 180) * 40)],
          }}
          transition={{
            duration: 2.8,
            repeat: Infinity,
            delay: i * 0.55,
            ease: "easeOut",
            times: [0, 0.4, 0.7, 1],
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 5,
            height: 5,
            marginTop: -2.5,
            marginLeft: -2.5,
            borderRadius: "50%",
            background: i % 2 === 0 ? "#5DCAA5" : "#A8F0D8",
            boxShadow: "0 0 4px rgba(93,202,165,0.8)",
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
