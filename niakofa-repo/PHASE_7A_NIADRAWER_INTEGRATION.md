# NiaDrawer Phase 7a Integration Guide

Complete modifications to enable voice wake-word listening in `NiaDrawer`.

---

## Location 1 — Add Imports

At the top of `NiaDrawer.tsx`, add:

```tsx
import { useVoiceWakeWord } from "../hooks/useVoiceWakeWord";
import { VoiceWakeWordIndicator, VoicePulseIndicator } from "./VoiceWakeWordIndicator";
import {
  detectCulturalContext,
  type CulturalLanguage,
} from "../lib/culturalGreetings";
```

---

## Location 2 — Add Voice State (inside `NiaDrawer` component)

After existing `useState` calls (around line 400–430), add:

```tsx
// Phase 7a: Voice wake-word listening
const [voiceActivated, setVoiceActivated] = useState(false);
const [voiceLanguage, setVoiceLanguage] = useState<CulturalLanguage>("en");

const { listening, listeningState, error: voiceError, startListening } =
  useVoiceWakeWord({
    enabled: open, // Start listening when drawer opens
    language: voiceLanguage,
    onWakeWordDetected: (language: CulturalLanguage) => {
      // User said the wake word — Nia is now active
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
```

---

## Location 3 — Detect Cultural Context

Add this effect near the top of the component to set the voice language from the user's preferences:

```tsx
useEffect(() => {
  const detected = detectCulturalContext(
    undefined, // profileLanguage — from user settings if available
    undefined, // neighborhoodRegion — from user location if available
    undefined  // wakeWordLanguage — updated when wake word detected
  );
  setVoiceLanguage(detected);
}, []);
```

---

## Location 4 — Update `sendMessage`

Add voice context to the request body:

```tsx
body: JSON.stringify({
  message: text,
  sessionId: getSessionId(),
  lat: userLocation?.lat,
  lon: userLocation?.lon,
  userName,
  accountType,
  helperModeActive,
  activeRequestId,
  language: voiceLanguage !== "en" ? voiceLanguage : undefined,
  // Phase 7a additions:
  voiceActivated,
  wakeWordLanguage: voiceLanguage,
  liveContext: niaContext,
}),
```

---

## Location 5 — Add Voice Indicator to UI

In the return statement, before the message list, add:

```tsx
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
```

At the bottom of the drawer (after the message list), add the floating pulse:

```tsx
<VoicePulseIndicator active={listening} />
```

---

## Location 6 — Add Mic Button to Input Area

Replace the existing send-only input row with:

```tsx
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
    onKeyDown={(e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(input);
      }
    }}
    placeholder={voiceActivated ? "Say your request…" : "Ask Nia anything…"}
    disabled={loading}
    style={{
      flex: 1, background: "transparent", border: "none", outline: "none",
      fontSize: 16, color: "var(--color-text-primary)", lineHeight: 1.4,
    }}
  />

  {/* Mic button */}
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
    <Mic size={14} color={listening ? "#E1F5EE" : "var(--color-text-tertiary)"} />
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
</div>
```

---

## Location 7 — Reset Voice State on Close

Add this effect to clean up when the drawer closes:

```tsx
useEffect(() => {
  if (!open) {
    setVoiceActivated(false);
  }
}, [open]);
```

---

## Summary

After applying all 7 locations, `NiaDrawer` gains full voice wake-word consciousness:

- ✓ Listens passively for "Hey Nia" and cultural equivalents
- ✓ Detects and responds with cultural awareness
- ✓ Shows visual feedback while listening
- ✓ Sends voice context to the backend for Nia-aware responses
- ✓ Maintains voice language context across the conversation
