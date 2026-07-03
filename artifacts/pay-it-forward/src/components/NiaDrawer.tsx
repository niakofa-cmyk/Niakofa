import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Loader2, RotateCcw, MapPin, MapPinOff, ChevronDown } from "lucide-react";
import { authHeaders } from "../lib/auth";
import { useAppContext } from "../lib/AppContext";
import { useNiaTTS } from "../hooks/useNiaTTS";
import { useVoiceWakeWord } from "../hooks/useVoiceWakeWord";
import { VoiceWakeWordIndicator } from "./VoiceWakeWordIndicator";
import {
  detectUserLanguage,
  getCareGreeting,
  getProfile,
  getTimeOfDay,
  type CulturalLanguage,
} from "../lib/culturalGreetings";
import {
  detectFoodIntent,
  buildFoodResourceMessage,
  recordFoodSignal,
  markFoodResourcesShown,
  foodResourcesAlreadyShown,
  getFoodSignalCount,
} from "../lib/foodIntent";

// Nia traffic routes through the api-server proxy (/api/nia/*) — no direct nia-service URL in frontend
const API_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// Phase 7c: time-of-day aware welcome phrases
function getWelcomePhrases(): string[] {
  const tod = getTimeOfDay();
  const phrases: Record<string, string[]> = {
    morning: [
      "Habari ya asubuhi — good morning.",
      "Akwaaba — you are welcome here.",
      "Wasuze otya nno — how did you sleep?",
      "Ubuntu — I am because we are.",
    ],
    afternoon: [
      "Sawubona — I see you.",
      "Akwaaba — you are welcome here.",
      "Pamoja — together, we rise.",
      "Ubuntu — I am because we are.",
    ],
    evening: [
      "Sawubona — I see you tonight.",
      "Akwaaba — you are welcome here.",
      "Usiku wa amani — peace in the evening.",
      "Ubuntu — I am because we are.",
    ],
    night: [
      "Sawubona — I see you.",
      "You are not alone in this.",
      "Niko hapa — I am here.",
      "Ubuntu — I am because we are.",
    ],
  };
  return phrases[tod] ?? phrases.afternoon;
}
const WELCOME_PHRASES = getWelcomePhrases();

const QUICK_PROMPTS = [
  { label: "🍽️ Find food near me", text: "Where can I find food assistance near me today?" },
  { label: "🏠 Need shelter", text: "I need emergency shelter. Can you help me find a place tonight?" },
  { label: "💙 I'm struggling", text: "I'm really struggling right now and don't know where to turn." },
  { label: "📋 Benefits help", text: "Help me find out what benefits I might qualify for." },
  { label: "🤝 Want to help", text: "I want to help someone in my neighborhood. What requests are open near me?" },
  { label: "🗺️ What's nearby?", text: "What's happening in my community right now?" },
];

function getSessionId(): string {
  let id = localStorage.getItem("nia_session_id");
  if (!id) {
    id = `nia_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("nia_session_id", id);
  }
  return id;
}

interface Message {
  role: "user" | "nia";
  content: string;
  streaming?: boolean;
  timestamp?: Date;
  lang?: CulturalLanguage;
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
  /** City, County, State from GPS reverse geocode — from AppContext.userPlace */
  userCity?: string | null;
  userCounty?: string | null;
  userState?: string | null;
  helperModeActive?: boolean;
  activeRequestId?: string | number | null;
  accountType?: string | null;
}

// ── Mobile-safe NiaOrb ─────────────────────────────────────────────────────────
// MOBILE FIX: Reduced from 5 layers of concurrent animations to GPU-friendly set.
// - Layer 5 (sparkle particles) only renders when pulse=true AND NOT on low-end devices
// - Added willChange: "transform" / "opacity" on all animated elements for GPU promotion
// - Shimmer uses CSS animation fallback instead of framer-motion for better perf
// - Particles reduced to 3 (from 5) on mobile to prevent animation thread starvation

const SPARKLE_ANGLES = [0, 120, 240]; // 3 particles (down from 5) — mobile safe

function useIsLowEndDevice() {
  const ref = useRef<boolean | null>(null);
  if (ref.current === null) {
    // Heuristic: low RAM or slow CPU — skip heavy particles
    const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
    const lowRam = (nav.deviceMemory ?? 8) < 4;
    const lowCpu = (nav.hardwareConcurrency ?? 8) < 4;
    ref.current = lowRam || lowCpu;
  }
  return ref.current;
}

export function NiaOrb({ size = 38, pulse = false }: { size?: number; pulse?: boolean }) {
  const pad = Math.round(size * 0.55);
  const total = size + pad * 2;
  const cx = total / 2;
  const orbitR = size * 0.72;
  const dotR = Math.max(2, size * 0.075);
  const isLow = useIsLowEndDevice();
  const showParticles = pulse && !isLow;

  return (
    <div
      style={{
        position: "relative",
        width: total,
        height: total,
        flexShrink: 0,
        marginLeft: -pad,
        marginTop: -pad,
        // GPU layer hint — avoids layout thrash from child animations
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      {/* Layer 1 — breathing aura */}
      <motion.div
        animate={{ scale: [1, 1.55, 1], opacity: [0.3, 0, 0.3] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: size * 1.8,
          height: size * 1.8,
          borderRadius: "50%",
          top: cx - size * 0.9,
          left: cx - size * 0.9,
          background: "radial-gradient(circle, rgba(29,158,117,0.45) 0%, rgba(29,158,117,0.12) 50%, transparent 75%)",
          pointerEvents: "none",
          willChange: "transform, opacity",
        }}
      />

      {/* Layer 2 — heartbeat ring */}
      <motion.div
        animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        style={{
          position: "absolute",
          width: size * 1.18,
          height: size * 1.18,
          borderRadius: "50%",
          top: cx - size * 0.59,
          left: cx - size * 0.59,
          border: "1.5px solid rgba(93,202,165,0.7)",
          pointerEvents: "none",
          willChange: "transform, opacity",
        }}
      />

      {/* Layer 3 — slow outer ring — ONLY on pulse, skip on low-end */}
      {pulse && !isLow && (
        <motion.div
          animate={{ scale: [1, 1.22, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          style={{
            position: "absolute",
            width: size * 1.36,
            height: size * 1.36,
            borderRadius: "50%",
            top: cx - size * 0.68,
            left: cx - size * 0.68,
            border: "1px solid rgba(29,200,140,0.4)",
            pointerEvents: "none",
            willChange: "transform, opacity",
          }}
        />
      )}

      {/* Layer 4 — orb body: bob animation */}
      <motion.div
        animate={{ y: [0, -size * 0.06, 0] }}
        transition={{ duration: 3.0, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: size,
          height: size,
          top: cx - size / 2,
          left: cx - size / 2,
          willChange: "transform",
        }}
      >
        <motion.div
          animate={pulse ? { scale: [1, 1.04, 1] } : {}}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #23CFA4 0%, #1D9E75 40%, #0A6B4E 75%, #063D2E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `${Math.max(1.5, size * 0.025)}px solid rgba(93,202,165,0.6)`,
            boxShadow: `0 0 ${size * 0.35}px rgba(35,207,164,0.45), 0 0 ${size * 0.7}px rgba(29,158,117,0.2), inset 0 1px 0 rgba(255,255,255,0.15)`,
            overflow: "hidden",
            position: "relative",
            willChange: "transform",
          }}
        >
          {/* Rotating shimmer — CSS animation instead of framer for mobile perf */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "conic-gradient(from 0deg, transparent 70%, rgba(255,255,255,0.18) 85%, transparent 100%)",
              pointerEvents: "none",
              animation: "nia-shimmer 6s linear infinite",
            }}
          />
          {/* Glint highlight */}
          <div
            style={{
              position: "absolute",
              top: size * 0.12,
              left: size * 0.15,
              width: size * 0.22,
              height: size * 0.1,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.22)",
              transform: "rotate(-25deg)",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              fontSize: size * 0.44,
              fontWeight: 800,
              color: "#E8FFF6",
              fontFamily: "var(--font-sans)",
              letterSpacing: "-0.02em",
              userSelect: "none",
              position: "relative",
              textShadow: `0 1px ${size * 0.06}px rgba(0,0,0,0.3)`,
              lineHeight: 1,
            }}
          >
            N
          </span>
        </motion.div>
      </motion.div>

      {/* Layer 5 — orbiting sparkle particles — only on non-low-end devices */}
      {showParticles &&
        SPARKLE_ANGLES.map((angle, i) => (
          <motion.div
            key={i}
            animate={{
              rotate: [angle, angle + 360],
              opacity: [0, 1, 0.8, 0],
            }}
            transition={{
              rotate: { duration: 5 + i * 0.4, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.35 },
            }}
            style={{
              position: "absolute",
              top: cx,
              left: cx,
              width: 0,
              height: 0,
              pointerEvents: "none",
              willChange: "transform, opacity",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -orbitR,
                left: -dotR,
                width: dotR * 2,
                height: dotR * 2,
                borderRadius: "50%",
                background:
                  i % 2 === 0
                    ? "rgba(35,207,164,0.95)"
                    : "rgba(147,250,210,0.85)",
                boxShadow: `0 0 ${dotR * 3}px rgba(35,207,164,0.8)`,
              }}
            />
          </motion.div>
        ))}
    </div>
  );
}

// ── NiaWelcomeSplash — mobile fixed ───────────────────────────────────────────
// MOBILE FIX: Removed nested AnimatePresence per phrase (caused layout recalculations).
// Now uses a single opacity transition on the container; phrases fade in together.

function NiaWelcomeSplash({ onDone, userName, lang }: { onDone: () => void; userName?: string | null; lang: CulturalLanguage }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const { speak } = useNiaTTS();

  const careGreeting = getCareGreeting(lang, userName);
  const displayPhrases = lang === "en" ? WELCOME_PHRASES : [
    careGreeting.greeting,
    careGreeting.careCheck,
    WELCOME_PHRASES[2], // Pamoja — universal
  ];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    displayPhrases.forEach((_, i) => {
      timers.push(setTimeout(() => setPhraseIndex(i), i * 900));
    });
    // Speak the care greeting when splash opens
    timers.push(setTimeout(() => {
      speak(careGreeting.combined, lang);
    }, 300));
    timers.push(setTimeout(onDone, displayPhrases.length * 900 + 400));
    return () => timers.forEach(clearTimeout);
  }, [onDone]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // MOBILE FIX: explicit will-change so this layer gets composited
        willChange: "opacity",
      }}
    >
      <NiaOrb size={72} pulse />
      <div style={{ textAlign: "center", minHeight: 80, display: "flex", flexDirection: "column", gap: 10 }}>
        {displayPhrases.map((phrase, i) => (
          // MOBILE FIX: Simple CSS opacity transition, no nested AnimatePresence
          <p
            key={phrase}
            style={{
              fontSize: i === 0 ? 20 : 15,
              fontWeight: i === 0 ? 600 : 400,
              color: i === 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              lineHeight: 1.4,
              margin: 0,
              opacity: i <= phraseIndex ? 1 : 0,
              transform: i <= phraseIndex ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
          >
            {phrase}
          </p>
        ))}
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-tertiary)",
          textAlign: "center",
          maxWidth: 240,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
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
      <div
        style={{
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
        }}
      >
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
    <div
      style={{
        margin: "0 12px 4px",
        background: "linear-gradient(135deg, rgba(250,236,231,0.9) 0%, rgba(245,196,179,0.5) 100%)",
        border: "0.5px solid rgba(216,90,48,0.25)",
        borderLeft: "3px solid #D85A30",
        borderRadius: "0 8px 8px 0",
        overflow: "hidden",
      }}
    >
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
          // MOBILE FIX: prevents 300ms tap delay
          touchAction: "manipulation",
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
                  <span
                    style={{
                      color: "#993C1D",
                      fontWeight: 600,
                      background: "rgba(245,196,179,0.6)",
                      padding: "2px 8px",
                      borderRadius: 20,
                      fontSize: 11,
                    }}
                  >
                    {action}
                  </span>
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
          style={{ touchAction: "manipulation" }}
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
  userCity = null,
  userCounty = null,
  userState = null,
  helperModeActive = false,
  activeRequestId = null,
  accountType = null,
}: NiaDrawerProps) {
  // Pull userPlace from AppContext — GPS-resolved city/county/state
  const { userPlace } = useAppContext();
  const resolvedCity = userCity ?? userPlace?.city ?? null;
  const resolvedCounty = userCounty ?? userPlace?.county ?? null;
  const resolvedState = userState ?? userPlace?.state ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  // Location status derived from AppContext GPS
  const locationStatus: "idle" | "requesting" | "granted" | "denied" =
    (resolvedCity || resolvedCounty || userLocation) ? "granted" : "idle";
  const locationLabel = resolvedCity
    ? (resolvedCounty ? `${resolvedCity}, ${resolvedCounty} Co.` : resolvedCity)
    : resolvedCounty ?? null;
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveContext, setLiveContext] = useState<NiaContext | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = getSessionId();
  const isFirstOpen = useRef(!sessionStorage.getItem("nia_has_opened"));
  const contextFetchedRef = useRef(false);

  // ── Multilingual TTS + language detection ─────────────────────────────────
  const [userLang, setUserLang] = useState<CulturalLanguage>("en");
  const { speak, stop: stopSpeech } = useNiaTTS({ enabled: true, rate: 0.92, pitch: 1.05 });

  // Detect user language once on mount
  useEffect(() => {
    setUserLang(detectUserLanguage());
  }, []);

  // Speak Nia's responses in the detected language
  const speakNiaResponse = useCallback((text: string, lang: CulturalLanguage) => {
    // Only speak the first 200 chars — full text can be very long
    const preview = text.slice(0, 200).replace(/\n/g, " ");
    speak(preview, lang);
  }, [speak]);

  // GPS is managed by AppContext watchPosition — this is kept as a no-op for any remaining call-sites
  const requestLocation = useCallback(() => {}, []);

  // Fetch live community context
  useEffect(() => {
    const coords = userCoords ?? userLocation;
    if (!coords || contextFetchedRef.current) return;
    contextFetchedRef.current = true;
    const lat = coords.lat;
    const lng = (coords as { lat: number; lng?: number; lon?: number }).lng ?? (coords as { lat: number; lon?: number }).lon;
    if (lat == null || lng == null) return;
    fetch(`${API_BASE}/api/nia/context?lat=${lat}&lng=${lng}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data: NiaContext | null) => { if (data) setLiveContext(data); })
      .catch(() => {});
  }, [userCoords, userLocation]);

  useEffect(() => { contextFetchedRef.current = false; }, [userCoords]);

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
          const profile = getProfile(userLang);
          setMessages([{
            role: "nia",
            content: `${profile.greetingResponse}

${profile.niaIntro}

${profile.helpPrompt}`,
            timestamp: new Date(),
            lang: userLang,
          }]);
        }
        setHistoryLoaded(true);
      })
      .catch(() => {
        setMessages([{
          role: "nia",
          content: `Sawubona — I see you. Akwaaba, you are welcome here.

I am Nia. How can I support you today?`,
          timestamp: new Date(),
        }]);
        setHistoryLoaded(true);
      });
  }, [open, historyLoaded, sessionId, userLang]);

  useEffect(() => {
    if (open && historyLoaded && !showSplash && initialMessage && messages.length <= 1) {
      sendMessage(initialMessage);
    }
  }, [open, historyLoaded, showSplash, initialMessage]); // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && !showSplash) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open, showSplash]);

  useEffect(() => {
    if (open && locationStatus === "idle") requestLocation();
  }, [open]); // eslint-disable-line

  // Stop TTS when drawer closes
  useEffect(() => {
    if (!open) stopSpeech();
  }, [open, stopSpeech]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    // Phase 7c: food intent detection — detect before API call
    let detectedFoodSignal: string | null = null;
    setMessages((prev) => {
      const priorNia = [...prev].reverse().find((m) => m.role === "nia");
      const priorContent = priorNia?.content ?? "";
      const intent = detectFoodIntent(trimmed, priorContent);

      if (intent.shouldSurfaceResources && !foodResourcesAlreadyShown()) {
        recordFoodSignal();
        markFoodResourcesShown();
        detectedFoodSignal = intent.signal;
        const resourceMsg = buildFoodResourceMessage({
          lang: userLang,
          userName,
          signal: intent.signal,
          isRepeat: getFoodSignalCount() > 1,
        });
        return [
          ...prev,
          { role: "user" as const, content: trimmed, timestamp: new Date() },
          { role: "nia" as const, content: resourceMsg, timestamp: new Date() },
        ];
      }

      if (intent.followUpPrompt && !foodResourcesAlreadyShown()) {
        return [
          ...prev,
          { role: "user" as const, content: trimmed, timestamp: new Date() },
          { role: "nia" as const, content: intent.followUpPrompt, timestamp: new Date() },
        ];
      }

      return [...prev, { role: "user" as const, content: trimmed, timestamp: new Date() }];
    });

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "nia" as const, content: "", streaming: true, timestamp: new Date() }]);
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
          foodSignal: detectedFoodSignal ?? undefined,
          foodSignalCount: getFoodSignalCount() > 0 ? getFoodSignalCount() : undefined,
          activeRequestId: activeRequestId ?? null,
          accountType: accountType ?? null,
          liveContext: liveContext ?? undefined,
          preferredLanguage: userLang,
          ...(coords ?? {}),
          city: resolvedCity ?? undefined,
          county: resolvedCounty ?? undefined,
          state: resolvedState ?? undefined,
        }),
      });

      if (res.status === 503) {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "nia" && last.streaming) {
            updated[updated.length - 1] = {
              role: "nia",
              content: `Nia is resting right now 💙

She'll be back soon. In the meantime, all of Niakofa's community features — the map, requests, helpers, and your wallet — are fully available.

If this is an emergency, please call 911 or text HOME to 741741.`,
              streaming: false,
              timestamp: new Date(),
            };
          }
          return updated;
        });
        setLoading(false);
        return;
      }

      if (res.status === 429) {
        const err = await res.json();
        const reset = new Date(err.resetAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "nia" && last.streaming) {
            updated[updated.length - 1] = {
              role: "nia",
              content: `You've reached your daily message limit with me. 💜

Your limit resets at ${reset}. Rest well — I'll be here when you return.

🆘 If this is an emergency, call 911. Crisis line: 988.`,
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
      let fullResponse = "";

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
              fullResponse += event.text;
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
                if (last?.role === "nia") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: event.type === "error" ? "I'm having trouble connecting right now. If this is an emergency, please call 911 or text 988." : last.content,
                    streaming: false,
                    lang: userLang,
                  };
                }
                return updated;
              });
              // Speak Nia's completed response
              if (event.type === "done" && fullResponse) {
                speakNiaResponse(fullResponse, userLang);
              }
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
      const coords2 = userCoords ?? userLocation;
      if (coords2) {
        const lat = coords2.lat;
        const lng = (coords2 as { lat: number; lng?: number; lon?: number }).lng ?? (coords2 as { lat: number; lon?: number }).lon;
        if (lat != null && lng != null) {
          fetch(`${API_BASE}/api/nia/context?lat=${lat}&lng=${lng}`, { headers: authHeaders() })
            .then((r) => r.ok ? r.json() : null)
            .then((data: NiaContext | null) => { if (data) setLiveContext(data); })
            .catch(() => {});
        }
      }
    }
  }, [loading, sessionId, userCoords, userId, userName, userLocation, helperModeActive, activeRequestId, accountType, liveContext, userLang, speakNiaResponse]);

  const handleReset = () => {
    localStorage.removeItem("nia_session_id");
    setHistoryLoaded(false);
    setMessages([]);
    contextFetchedRef.current = false;
    setLiveContext(null);
    stopSpeech();
  };

  const showQuickPrompts = historyLoaded && !showSplash && messages.length <= 1 && !loading;

  // MOBILE FIX: dvh with px fallback for older iOS (< 15.4 — no dvh support)
  const drawerHeight = "min(96dvh, calc(100vh - env(safe-area-inset-top, 0px) - 16px))";

  return (
    // MOBILE FIX: @keyframes for shimmer injected here
    <>
      <style>{`
        @keyframes nia-shimmer { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .nia-quick-prompt {
          padding: 6px 12px;
          border-radius: 20px;
          border: 0.5px solid var(--color-border-secondary);
          background: var(--color-background-secondary);
          color: var(--color-text-secondary);
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .nia-quick-prompt:active { opacity: 0.7; }
      `}</style>
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
                height: drawerHeight,
                display: "flex",
                flexDirection: "column",
                background: "var(--color-background-primary)",
                borderRadius: "24px 24px 0 0",
                border: "0.5px solid var(--color-border-tertiary)",
                borderBottom: "none",
                // MOBILE FIX: overflow hidden on the outer container causes
                // iOS Safari scroll freeze. The inner scroll div handles overflow.
                overflow: "hidden",
                // GPU-promote the whole drawer to avoid repaint during spring animation
                willChange: "transform",
                transform: "translateZ(0)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border-secondary)" }} />
              </div>

              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px 12px",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <NiaOrb size={40} pulse={!loading} />
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.2 }}>Nia</div>
                    <div style={{ fontSize: 11, color: "#0F6E56", letterSpacing: "0.03em", fontWeight: 500 }}>Always here · Always free</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {locationStatus === "granted" && (
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 11, color: "#0F6E56",
                        background: "rgba(29,158,117,0.1)",
                        padding: "4px 9px", borderRadius: 20,
                        border: "0.5px solid rgba(29,158,117,0.25)",
                        fontWeight: 500,
                      }}
                    >
                      <MapPin size={11} />
                      {locationLabel ?? resolvedState ?? "Location on"}
                    </div>
                  )}
                  {locationStatus === "idle" && (
                    <button
                      onClick={requestLocation}
                      style={{
                        display: "flex", alignItems: "center", gap: 4,
                        fontSize: 11, color: "var(--color-text-tertiary)",
                        background: "transparent", border: "none", cursor: "pointer",
                        padding: "4px 6px",
                        touchAction: "manipulation",
                      }}
                    >
                      <MapPinOff size={12} /> Enable location
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    title="New conversation"
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "transparent",
                      border: "0.5px solid var(--color-border-tertiary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      touchAction: "manipulation",
                    }}
                  >
                    <RotateCcw size={14} color="var(--color-text-secondary)" />
                  </button>
                  <button
                    onClick={onClose}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "transparent",
                      border: "0.5px solid var(--color-border-tertiary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      touchAction: "manipulation",
                    }}
                  >
                    <X size={15} color="var(--color-text-secondary)" />
                  </button>
                </div>
              </div>

              {showSplash ? (
                <NiaWelcomeSplash
                  onDone={() => setShowSplash(false)}
                  userName={userName}
                  lang={userLang}
                />
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
                  {/* MOBILE FIX: -webkit-overflow-scrolling: touch for momentum scrolling
                      overscroll-behavior: contain prevents scroll chaining to parent body */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      WebkitOverflowScrolling: "touch",
                      overscrollBehavior: "contain",
                      padding: "12px 12px 4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
                    <div ref={bottomRef} />
                  </div>
                  <div
                    style={{
                      padding: "10px 12px 16px",
                      paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
                      borderTop: "0.5px solid var(--color-border-tertiary)",
                      flexShrink: 0,
                      background: "var(--color-background-primary)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex", alignItems: "center", gap: 9,
                        background: "var(--color-background-secondary)",
                        borderRadius: 26,
                        padding: "8px 8px 8px 16px",
                        border: "0.5px solid var(--color-border-tertiary)",
                      }}
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                        placeholder={getProfile(userLang).listeningPrompt}
                        disabled={loading}
                        style={{
                          flex: 1, background: "transparent", border: "none", outline: "none",
                          fontSize: 16, color: "var(--color-text-primary)", lineHeight: 1.4,
                          // MOBILE FIX: font-size 16px prevents iOS zoom on focus
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
                          touchAction: "manipulation",
                        }}
                      >
                        {loading
                          ? <Loader2 size={15} color="var(--color-text-tertiary)" />
                          : <Send size={14} color={!input.trim() ? "var(--color-text-tertiary)" : "#E1F5EE"} />
                        }
                      </button>
                    </div>
                    <p
                      style={{
                        fontSize: 10.5, color: "var(--color-text-tertiary)",
                        textAlign: "center", marginTop: 7, lineHeight: 1.5,
                      }}
                    >
                      Pamoja — together we rise. · Emergency: 911 · Crisis: 988
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function NiaFab({ onClick, enabled = true }: { onClick: () => void; enabled?: boolean }) {
  // Drag position — persisted in localStorage so Nia remembers where the user placed her
  const safeRead = (key: string, fallback: number) => {
    try { const v = localStorage.getItem(key); return v === null ? fallback : Number(v); } catch { return fallback; }
  };
  const safeWrite = (key: string, value: number) => {
    try { localStorage.setItem(key, String(value)); } catch {}
  };

  const [fabX, setFabX] = useState(() => safeRead("nia_fab_x", 0));
  const [fabY, setFabY] = useState(() => safeRead("nia_fab_y", 0));
  const [isDragging, setIsDragging] = useState(false);
  const dragStartTime = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const dragStartPos = useRef({ x: 0, y: 0 });

  // Only allow drag when Nia is enabled
  const handleDragStart = () => {
    if (!enabled) return;
    setIsDragging(true);
    dragStartTime.current = Date.now();
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number } }) => {
    if (!enabled) return;
    setIsDragging(false);
    const newX = fabX + info.offset.x;
    const newY = fabY + info.offset.y;
    setFabX(newX);
    setFabY(newY);
    safeWrite("nia_fab_x", newX);
    safeWrite("nia_fab_y", newY);
  };

  const handleClick = () => {
    // Only fire click if not dragging (drag distance < 8px)
    const dragDuration = Date.now() - dragStartTime.current;
    if (!isDragging || dragDuration < 150) {
      onClick();
    }
  };

  // Phase 7a — voice wake-word detection (LAST hooks — hook order must not change)
  // Supports all of Nia's languages: "Hey Nia", "Hujambo Nia", "Sawubona Nia",
  // "Abeg Nia", "Wasuze otya Nia", and others defined in culturalGreetings.ts.
  // When a wake word is detected, open the drawer just like a tap would.
  const userLang = detectUserLanguage();
  const { listeningState, isSupported } = useVoiceWakeWord({
    enabled: enabled ?? true,
    onWakeWordDetected: (_lang, _transcript) => {
      onClick();
    },
  });

  return (
    <motion.div
      drag={enabled}
      dragMomentum={false}
      dragElastic={0.1}
      dragConstraints={{
        // Constrain to reasonable screen bounds; center of orb stays visible
        left: -120,
        right: 120,
        top: -60,
        bottom: 120,
      }}
      animate={{ x: fabX, y: fabY }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      style={{
        cursor: enabled ? (isDragging ? "grabbing" : "grab") : "pointer",
        touchAction: enabled ? "none" : "manipulation",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
      }}
      aria-label="Open Nia — your community assistant"
    >
      {/* Phase 7a: Wake word listening indicator — appears above the orb when active */}
      {isSupported && listeningState !== "idle" && (
        <VoiceWakeWordIndicator
          state={listeningState}
          language={userLang}
          className="shadow-lg"
        />
      )}
      <motion.button
        onClick={handleClick}
        whileHover={!isDragging ? { scale: 1.06 } : {}}
        whileTap={!isDragging ? { scale: 0.93 } : {}}
        style={{
          background: "none",
          border: "none",
          cursor: "inherit",
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <NiaOrb size={68} pulse={enabled} />
      </motion.button>
    </motion.div>
  );
}
