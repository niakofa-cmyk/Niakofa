// ============================================================
// useVoiceWakeWord React Hook
// Manages voice listening state and wake-word activation
// ============================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  initializeVoiceWakeWord,
  stopVoiceWakeWord,
  isVoiceWakeWordListening,
  type SupportedLanguage,
} from "./voiceWakeWord";

interface UseVoiceWakeWordConfig {
  enabled?: boolean;
  language?: SupportedLanguage;
  onWakeWordDetected?: (language: SupportedLanguage) => void;
  onError?: (error: string) => void;
}

export function useVoiceWakeWord(config: UseVoiceWakeWordConfig = {}) {
  const {
    enabled = true,
    language = "en",
    onWakeWordDetected,
    onError,
  } = config;

  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listeningState, setListeningState] = useState<"idle" | "listening" | "processing">("idle");
  const initializeAttemptedRef = useRef(false);

  const handleWakeWordDetected = useCallback(
    (detectedLanguage: SupportedLanguage) => {
      setListeningState("processing");
      onWakeWordDetected?.(detectedLanguage);
      // Resume listening after processing
      setTimeout(() => setListeningState("listening"), 1500);
    },
    [onWakeWordDetected]
  );

  const handleListeningStart = useCallback(() => {
    setListening(true);
    setListeningState("listening");
    setError(null);
  }, []);

  const handleListeningStop = useCallback(() => {
    setListening(false);
    setListeningState("idle");
  }, []);

  const handleError = useCallback(
    (errorMsg: string) => {
      setError(errorMsg);
      setListening(false);
      setListeningState("idle");
      onError?.(errorMsg);
    },
    [onError]
  );

  // Initialize voice wake-word detection
  useEffect(() => {
    if (!enabled || initializeAttemptedRef.current) return;

    initializeAttemptedRef.current = true;

    (async () => {
      try {
        await initializeVoiceWakeWord({
          language: language as SupportedLanguage,
          sensitivity: 0.75,
          onWakeWord: handleWakeWordDetected,
          onListeningStart: handleListeningStart,
          onListeningStop: handleListeningStop,
          onError: handleError,
        });
      } catch (err) {
        handleError(
          err instanceof Error ? err.message : "Failed to initialize voice wake-word detection"
        );
      }
    })();

    return () => {
      if (isVoiceWakeWordListening()) {
        stopVoiceWakeWord();
      }
    };
  }, [enabled, language, handleWakeWordDetected, handleListeningStart, handleListeningStop, handleError]);

  const startListening = useCallback(async () => {
    if (listening) return;
    try {
      await initializeVoiceWakeWord({
        language: language as SupportedLanguage,
        sensitivity: 0.75,
        onWakeWord: handleWakeWordDetected,
        onListeningStart: handleListeningStart,
        onListeningStop: handleListeningStop,
        onError: handleError,
      });
    } catch (err) {
      handleError(
        err instanceof Error ? err.message : "Failed to start voice wake-word detection"
      );
    }
  }, [listening, language, handleWakeWordDetected, handleListeningStart, handleListeningStop, handleError]);

  const stopListening = useCallback(() => {
    stopVoiceWakeWord();
    setListening(false);
    setListeningState("idle");
  }, []);

  return {
    listening,
    listeningState,
    error,
    startListening,
    stopListening,
  };
}
