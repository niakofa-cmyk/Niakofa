// useNiaTTS — Phase 7b: Nia speaks back in community language
// Uses browser-native Web Speech Synthesis API (zero dependencies)

import { useCallback, useRef } from "react";
import { CulturalLanguage } from "../lib/culturalGreetings";

const LANG_BCP47: Record<CulturalLanguage, string> = {
  en: "en-US",
  sw: "sw-KE",
  zu: "zu-ZA",
  tw: "ak-GH",
  yo: "yo-NG",
  ha: "ha-NG",
  am: "am-ET",
  so: "so-SO",
};

interface UseNiaTTSOptions {
  enabled?: boolean;
  rate?: number;
  pitch?: number;
}

export function useNiaTTS({ enabled = true, rate = 0.92, pitch = 1.05 }: UseNiaTTSOptions = {}) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speak = useCallback((text: string, language: CulturalLanguage = "en") => {
    if (!enabled || !("speechSynthesis" in window)) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_BCP47[language] ?? "en-US";
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Pick best available voice for the language
    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(
      (v) => v.lang.startsWith(utterance.lang.split("-")[0])
    );
    if (match) utterance.voice = match;

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [enabled, rate, pitch]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  const isSupported = "speechSynthesis" in window;

  return { speak, stop, isSupported };
}
