import { matchWakeWord, CulturalLanguage } from "./culturalGreetings";

export type ListeningState = "idle" | "listening" | "detected" | "error";

export interface VoiceWakeWordOptions {
  onWakeWordDetected: (language: CulturalLanguage, transcript: string) => void;
  onTranscript?: (transcript: string) => void;
  onStateChange?: (state: ListeningState) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  // Phase 7d: VAD threshold — 0.0–1.0, default 0.015
  // Speech Recognition only starts when RMS energy exceeds this
  vadThreshold?: number;
}

export class VoiceWakeWordEngine {
  private recognition: unknown = null;
  private options: VoiceWakeWordOptions;
  private state: ListeningState = "idle";
  private active = false;

  // Phase 7d: Web Audio VAD
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private vadInterval: ReturnType<typeof setInterval> | null = null;
  private recognitionActive = false;
  private readonly VAD_THRESHOLD: number;
  private readonly VAD_CHECK_MS = 100;

  constructor(options: VoiceWakeWordOptions) {
    this.options = options;
    this.VAD_THRESHOLD = options.vadThreshold ?? 0.015;
  }

  private setState(s: ListeningState) {
    this.state = s;
    this.options.onStateChange?.(s);
  }

  isSupported(): boolean {
    return (
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) &&
      "AudioContext" in window || "webkitAudioContext" in window
    );
  }

  private getRMS(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i] - 128) / 128;
      sum += norm * norm;
    }
    return Math.sqrt(sum / data.length);
  }

  private initSpeechRecognition() {
    const SR: unknown =
      (window as unknown).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false; // VAD controls restarts — don't auto-loop
    rec.interimResults = true;
    // Use a broad locale so all Nia wake words (English, Swahili, Yoruba, etc.)
    // are recognized. Empty string defaults to the OS locale which can silently
    // filter out cross-language wake words on strict browser implementations.
    rec.lang = navigator.language || "en-US";

    rec.onstart = () => {
      this.recognitionActive = true;
      this.setState("listening");
    };

    rec.onresult = (event: unknown) => {
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

    rec.onerror = (event: unknown) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        this.options.onError?.(event.error);
        this.setState("error");
      }
      this.recognitionActive = false;
    };

    rec.onend = () => {
      this.recognitionActive = false;
      // VAD loop will restart when energy detected again
    };

    return rec;
  }

  async start() {
    if (!this.isSupported()) {
      this.options.onError?.("Voice recognition not supported in this browser.");
      this.setState("error");
      return;
    }

    this.active = true;
    this.setState("listening");

    try {
      // Phase 7d: acquire mic stream for VAD
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AC: unknown = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AC();
      this.analyser = (this.audioCtx as AudioContext).createAnalyser();
      this.analyser.fftSize = 512;
      const source = (this.audioCtx as AudioContext).createMediaStreamSource(this.mediaStream!);
      source.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.fftSize);

      // VAD polling loop — only fire Speech Recognition when voice energy detected
      this.vadInterval = setInterval(() => {
        if (!this.active || !this.analyser) return;
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(buffer);
        const rms = this.getRMS(buffer);

        if (rms > this.VAD_THRESHOLD && !this.recognitionActive) {
          // Voice energy detected — start recognition
          this.recognition = this.initSpeechRecognition();
          try {
            this.recognition.start();
          } catch {
            // already started — ignore
          }
        }
      }, this.VAD_CHECK_MS);
    } catch (_err) {
      // Mic access denied or unavailable — fall back to continuous recognition
      this.options.onError?.("Microphone access denied. Using fallback mode.");
      this._startFallback();
    }
  }

  private _startFallback() {
    // Phase 7a fallback: continuous recognition without VAD
    const SR: unknown =
      (window as unknown).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.continuous = this.options.continuous ?? true;
    this.recognition.interimResults = true;
    this.recognition.lang = navigator.language || "en-US";

    this.recognition.onstart = () => { this.active = true; this.setState("listening"); };
    this.recognition.onresult = (event: unknown) => {
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
    this.recognition.onerror = (event: unknown) => {
      if (event.error !== "no-speech") {
        this.options.onError?.(event.error);
        this.setState("error");
      }
    };
    this.recognition.onend = () => {
      if (this.active) setTimeout(() => this.recognition?.start(), 300);
      else this.setState("idle");
    };
    this.recognition.start();
  }

  stop() {
    this.active = false;
    this.recognitionActive = false;
    if (this.vadInterval) { clearInterval(this.vadInterval); this.vadInterval = null; }
    this.recognition?.stop();
    this.analyser?.disconnect();
    this.audioCtx?.close().catch(() => {});
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.audioCtx = null;
    this.analyser = null;
    this.mediaStream = null;
    this.setState("idle");
  }

  getState(): ListeningState { return this.state; }
}
