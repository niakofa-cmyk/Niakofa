// useVoiceWakeWord — Phase 7a
import { useEffect, useRef, useState, useCallback } from "react";
import type { ListeningState } from "../lib/voiceWakeWord";
import { VoiceWakeWordEngine } from "../lib/voiceWakeWord";
import type { CulturalLanguage } from "../lib/culturalGreetings";

interface UseVoiceWakeWordOptions {
  enabled?: boolean;
  onWakeWordDetected: (language: CulturalLanguage, transcript: string) => void;
  continuous?: boolean;
}

interface UseVoiceWakeWordReturn {
  listening: boolean;
  listeningState: ListeningState;
  error: string | null;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  lastTranscript: string;
}

export function useVoiceWakeWord({
  enabled = true,
  onWakeWordDetected,
  continuous = true,
}: UseVoiceWakeWordOptions): UseVoiceWakeWordReturn {
  const engineRef = useRef<VoiceWakeWordEngine | null>(null);
  const [listeningState, setListeningState] = useState<ListeningState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState("");

  const startListening = useCallback(() => {
    engineRef.current?.start();
  }, []);

  const stopListening = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  useEffect(() => {
    const engine = new VoiceWakeWordEngine({
      onWakeWordDetected,
      onTranscript: setLastTranscript,
      onStateChange: setListeningState,
      onError: setError,
      continuous,
    });
    engineRef.current = engine;

    if (enabled) {
      engine.start();
    }

    return () => {
      engine.stop();
    };
  }, [enabled, continuous, onWakeWordDetected]);

  return {
    listening: listeningState === "listening",
    listeningState,
    error,
    isSupported: engineRef.current?.isSupported() ?? false,
    startListening,
    stopListening,
    lastTranscript,
  };
}
