// Niakofa Voice Wake Word Engine — Phase 7a
// Uses Web Speech API (browser-native, no ML5/TF dependency needed for MVP)

import { matchWakeWord, CulturalLanguage } from "./culturalGreetings";

export type ListeningState = "idle" | "listening" | "detected" | "error";

export interface VoiceWakeWordOptions {
  onWakeWordDetected: (language: CulturalLanguage, transcript: string) => void;
  onTranscript?: (transcript: string) => void;
  onStateChange?: (state: ListeningState) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
}

export class VoiceWakeWordEngine {
  private recognition: SpeechRecognition | null = null;
  private options: VoiceWakeWordOptions;
  private state: ListeningState = "idle";
  private active = false;

  constructor(options: VoiceWakeWordOptions) {
    this.options = options;
  }

  private setState(s: ListeningState) {
    this.state = s;
    this.options.onStateChange?.(s);
  }

  isSupported(): boolean {
    return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  }

  start() {
    if (!this.isSupported()) {
      this.options.onError?.("Voice recognition not supported in this browser.");
      this.setState("error");
      return;
    }

    const SR = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = this.options.continuous ?? true;
    this.recognition.interimResults = true;
    this.recognition.lang = ""; // auto-detect

    this.recognition.onstart = () => {
      this.active = true;
      this.setState("listening");
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        this.options.onTranscript?.(transcript);

        if (event.results[i].isFinal) {
          const lang = matchWakeWord(transcript);
          if (lang) {
            this.setState("detected");
            this.options.onWakeWordDetected(lang, transcript);
          }
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        this.options.onError?.(event.error);
        this.setState("error");
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if still active (continuous listening)
      if (this.active && this.options.continuous !== false) {
        setTimeout(() => this.recognition?.start(), 300);
      } else {
        this.setState("idle");
      }
    };

    this.recognition.start();
  }

  stop() {
    this.active = false;
    this.recognition?.stop();
    this.setState("idle");
  }

  getState(): ListeningState {
    return this.state;
  }
}
