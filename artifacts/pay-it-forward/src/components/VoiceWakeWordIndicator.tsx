// VoiceWakeWordIndicator — Phase 7a
// Visual feedback for voice listening states

import React from "react";
import { ListeningState } from "../lib/voiceWakeWord";
import { CulturalLanguage, getProfile } from "../lib/culturalGreetings";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

interface VoiceWakeWordIndicatorProps {
  state: ListeningState;
  language: CulturalLanguage;
  className?: string;
}

export function VoiceWakeWordIndicator({
  state,
  language,
  className = "",
}: VoiceWakeWordIndicatorProps) {
  const profile = getProfile(language);

  if (state === "idle") return null;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
        state === "listening"
          ? "bg-blue-100 text-blue-700"
          : state === "detected"
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      } ${className}`}
    >
      <VoicePulseIndicator state={state} />
      <span>
        {state === "listening"
          ? profile.listeningPrompt
          : state === "detected"
          ? profile.greetingResponse.slice(0, 40) + "…"
          : profile.errorMessage}
      </span>
    </div>
  );
}

interface VoicePulseIndicatorProps {
  state: ListeningState;
}

export function VoicePulseIndicator({ state }: VoicePulseIndicatorProps) {
  const suppressed = useIsAnimationSuppressed();
  return (
    <span className="relative flex h-2.5 w-2.5">
      {state === "listening" && !suppressed && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
          state === "listening"
            ? "bg-blue-500"
            : state === "detected"
            ? "bg-green-500"
            : "bg-red-500"
        }`}
      />
    </span>
  );
}
