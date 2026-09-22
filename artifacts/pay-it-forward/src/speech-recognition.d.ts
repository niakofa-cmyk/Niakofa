// Minimal ambient types for the (non-standard, Chromium-only) Web Speech API.
// TypeScript's DOM lib does not ship these — Safari/Firefox don't implement
// SpeechRecognition at all, which is why every call site in NiaDrawer.tsx
// already feature-detects before use.

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface Window {
  SpeechRecognition?: { new (): SpeechRecognition };
  webkitSpeechRecognition?: { new (): SpeechRecognition };
  /** Non-standard, Safari/older-Chromium prefixed AudioContext constructor. */
  webkitAudioContext?: typeof AudioContext;
  /** Global escape hatch set by App.tsx so any component can open the Nia
   *  drawer (optionally seeded with a starter question) without prop drilling. */
  openNia?: (seedQuestion?: string) => void;
}
