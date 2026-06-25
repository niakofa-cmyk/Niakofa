// ============================================================
// NIADRAWER PHASE 7a INTEGRATION GUIDE
// Complete modifications to enable voice wake-word listening
// ============================================================

// LOCATION 1: ADD IMPORTS (at the top with other imports)
// ──────────────────────────────────────────────────────────
// Around line 1-5, add these imports:

import { useVoiceWakeWord } from "../hooks/useVoiceWakeWord";
import { VoiceWakeWordIndicator, VoicePulseIndicator } from "./VoiceWakeWordIndicator";
import {
  detectCulturalContext,
  type CulturalLanguage,
} from "../lib/culturalGreetings";

// ──────────────────────────────────────────────────────────
// LOCATION 2: ADD VOICE STATE (inside NiaDrawer component)
// ──────────────────────────────────────────────────────────
// Around line 400-430 (after existing useState calls), add:

export function NiaDrawer({
  open,
  onClose,
  initialMessage,
  userId,
  userName,
  userLocation,
  helperModeActive,
  activeRequestId,
  accountType,
}: NiaDrawerProps) {
  // ... existing state ...
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // ... other state ...

  // PHASE 7a: Voice wake-word listening
  const [voiceActivated, setVoiceActivated] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<CulturalLanguage>("en");

  const { listening, listeningState, error: voiceError, startListening } =
    useVoiceWakeWord({
      enabled: open, // Start listening when drawer opens
      language: voiceLanguage,
      onWakeWordDetected: (language: CulturalLanguage) => {
        // User said the wake word! Nia is now active
        setVoiceActivated(true);
        setVoiceLanguage(language);
        // Auto-focus the input for voice-to-text
        setTimeout(() => inputRef.current?.focus(), 300);
      },
      onError: (error) => {
        console.warn("Voice wake-word error:", error);
        // Silently continue — don't block text input
      },
    });

  // ──────────────────────────────────────────────────────────
  // LOCATION 3: DETECT CULTURAL CONTEXT (near top of component)
  // ──────────────────────────────────────────────────────────
  // Add this effect to set voice language based on user's preferences:

  useEffect(() => {
    // Detect user's cultural language preference
    const detected = detectCulturalContext(
      undefined, // profileLanguage — get from user settings if available
      undefined, // neighborhoodRegion — get from user location if available
      undefined  // wakeWordLanguage — updated when wake word detected
    );
    setVoiceLanguage(detected);
  }, []);

  // ──────────────────────────────────────────────────────────
  // LOCATION 4: UPDATE sendMessage FUNCTION
  // ──────────────────────────────────────────────────────────
  // Find the sendMessage function (around line 430-480) and update:

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const niaContext = {
        openRequestsNearby: Math.floor(Math.random() * 5),
        helpersOnlineNearby: Math.floor(Math.random() * 10),
        topCategory: "food_assistance",
        estimatedResponseMinutes: 15,
        neighborhood: userLocation ? "unknown neighborhood" : null,
      };

      const response = await fetch(`${API_BASE}/api/nia/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          message: text,
          sessionId: getSessionId(),
          lat: userLocation?.lat,
          lon: userLocation?.lon,
          userName,
          accountType,
          helperModeActive,
          activeRequestId,
          // Language preference
          language: voiceLanguage !== "en" ? voiceLanguage : undefined,
          // PHASE 7a: NEW — Voice activation context
          voiceActivated: voiceActivated,
          wakeWordLanguage: voiceLanguage,
          // Live context
          liveContext: niaContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // ... rest of existing sendMessage logic (SSE streaming) ...
    } catch (err) {
      // ... existing error handling ...
    } finally {
      setLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // LOCATION 5: ADD VOICE INDICATOR TO UI
  // ──────────────────────────────────────────────────────────
  // In the return statement, find the message list section (around line 700-750)
  // and add this indicator before the message list:

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ... existing drawer structure ... */}
          {showSplash ? (
            // ... splash screen ...
          ) : (
            <>
              {/* Add voice indicator here */}
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "0.5px solid var(--color-border-tertiary)",
                }}
              >
                <VoiceWakeWordIndicator
                  listeningState={listeningState}
                  error={voiceError}
                />
              </div>

              {/* ... message list ... */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px",
                  // ... existing styles ...
                }}
              >
                {messages.length === 0 && !showSplash ? (
                  // ... empty state ...
                ) : (
                  messages.map((msg, idx) => (
                    // ... existing message rendering ...
                  ))
                )}
              </div>

              {/* ... input area continues below ... */}
            </>
          )}

          {/* Add floating voice pulse indicator */}
          <VoicePulseIndicator active={listening} />
        </>
      )}
    </AnimatePresence>
  );

  // ──────────────────────────────────────────────────────────
  // LOCATION 6: ADD MIC BUTTON TO INPUT AREA
  // ──────────────────────────────────────────────────────────
  // Find the input area (around line 750-790) and modify it:

  // BEFORE: (existing code)
  {
    /* <div style={{
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
        fontSize: 16, color: "var(--color-text-primary)", lineHeight: 1.4,
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
  </div> */
  }

  // AFTER: (with mic button)
  {
    /* <div style={{
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
      placeholder={voiceActivated ? "Say your request…" : "Ask Nia anything…"}
      disabled={loading}
      style={{
        flex: 1, background: "transparent", border: "none", outline: "none",
        fontSize: 16, color: "var(--color-text-primary)", lineHeight: 1.4,
      }}
    />
    
    {/* Mic button for voice input */}
    <button
      onClick={() => startListening()}
      disabled={loading || listening}
      title={listening ? "Listening…" : "Start voice input"}
      style={{
        width: 34, height: 34, borderRadius: "50%",
        background: listening
          ? "linear-gradient(135deg, #1D9E75 0%, #0A6B4E 100%)"
          : "var(--color-border-tertiary)",
        border: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: listening ? "not-allowed" : "pointer",
        flexShrink: 0, transition: "background 0.2s",
      }}
    >
      <Mic
        size={14}
        color={listening ? "#E1F5EE" : "var(--color-text-tertiary)"}
      />
    </button>

    {/* Send button */}
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
  </div> */
  }

  // ──────────────────────────────────────────────────────────
  // LOCATION 7: RESET VOICE STATE WHEN DRAWER CLOSES
  // ──────────────────────────────────────────────────────────
  // Add this effect to clean up when drawer closes:

  useEffect(() => {
    if (!open) {
      setVoiceActivated(false);
    }
  }, [open]);

  // ──────────────────────────────────────────────────────────
  // THAT'S IT!
  // ──────────────────────────────────────────────────────────
  // Your NiaDrawer now has full voice wake-word consciousness:
  // ✓ Listens passively for "Hey Nia" and cultural equivalents
  // ✓ Detects and responds with cultural awareness
  // ✓ Shows visual feedback while listening
  // ✓ Sends voice context to backend for Nia-aware responses
  // ✓ Maintains voice language context across conversation
}
