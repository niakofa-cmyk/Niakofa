// ============================================================
// Nia Voice Wake-Word Detection
// Listens for "Hey Nia", "Sawubona Nia", "Habari Nia", etc.
// ============================================================

export const WAKE_WORDS = {
  en: ["hey nia", "hi nia", "nia"],
  sw: ["habari nia", "sawubona nia", "nia"], // Swahili
  ak: ["ei nia", "nia"], // Akan/Twi
  zu: ["sawubona nia", "nia"], // Zulu
  yo: ["e o nia", "nia"], // Yoruba (Nigeria)
  lg: ["nia", "habari nia"], // Luganda
};

export type SupportedLanguage = keyof typeof WAKE_WORDS;

interface WakeWordConfig {
  language: SupportedLanguage;
  sensitivity: number; // 0.5 to 1.0 (higher = more sensitive)
  onWakeWord: (language: SupportedLanguage) => void;
  onListeningStart: () => void;
  onListeningStop: () => void;
  onError: (error: string) => void;
}

class VoiceWakeWordDetector {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private listening = false;
  private config: WakeWordConfig | null = null;
  private recordedChunks: Blob[] = [];
  private mediaRecorder: MediaRecorder | null = null;

  async initialize(config: WakeWordConfig): Promise<void> {
    this.config = config;
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.mediaRecorder.ondataavailable = (event) => {
        this.recordedChunks.push(event.data);
      };
      
      config.onListeningStart();
      this.startListening();
    } catch (error) {
      config.onError(
        error instanceof Error ? error.message : "Failed to access microphone"
      );
    }
  }

  private startListening(): void {
    if (!this.processor || !this.config) return;
    
    this.listening = true;
    this.processor.onaudioprocess = (event) => {
      this.processAudio(event.inputBuffer);
    };
  }

  private processAudio(buffer: AudioBuffer): void {
    if (!this.listening || !this.config) return;
    
    // In production, this would use a proper speech-to-text model
    // For MVP, we'll use the Web Speech API for transcription
    // and match against wake words
    
    const data = buffer.getChannelData(0);
    const rms = Math.sqrt(data.reduce((sum, val) => sum + val * val, 0) / data.length);
    
    // Only transcribe if there's audible speech (RMS > 0.01)
    if (rms > 0.01) {
      this.captureAudioForTranscription();
    }
  }

  private captureAudioForTranscription(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === "recording") return;
    
    this.recordedChunks = [];
    this.mediaRecorder.start();
    
    // Stop recording after 3 seconds to capture potential wake word
    setTimeout(() => {
      if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
        this.transcribeAndCheckWakeWord();
      }
    }, 3000);
  }

  private async transcribeAndCheckWakeWord(): Promise<void> {
    if (!this.config || this.recordedChunks.length === 0) return;
    
    const audioBlob = new Blob(this.recordedChunks, { type: "audio/webm" });
    
    try {
      // Use browser's built-in Web Speech API for quick transcription
      const transcript = await this.transcribeWithWebSpeech(audioBlob);
      const normalizedTranscript = transcript.toLowerCase().trim();
      
      const wakeWordsForLanguage = WAKE_WORDS[this.config.language] || WAKE_WORDS.en;
      
      for (const wakeWord of wakeWordsForLanguage) {
        if (normalizedTranscript.includes(wakeWord)) {
          // Wake word detected!
          this.config.onWakeWord(this.config.language);
          return;
        }
      }
    } catch (error) {
      // Silently continue listening if transcription fails
      console.debug("Transcription skipped, continuing to listen");
    }
  }

  private transcribeWithWebSpeech(audioBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        reject(new Error("Web Speech API not supported"));
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.language = this.getLanguageCode(this.config?.language || "en");
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
      };

      recognition.onerror = (event) => {
        reject(new Error(event.error));
      };

      // For production, you'd send the audioBlob to the OpenAI Whisper API
      // For now, use Web Speech API
      recognition.start();
    });
  }

  private getLanguageCode(language: SupportedLanguage): string {
    const langMap: Record<SupportedLanguage, string> = {
      en: "en-US",
      sw: "sw-KE",
      ak: "en-GH", // Akan uses en-GH as fallback
      zu: "zu-ZA",
      yo: "en-NG", // Yoruba uses en-NG as fallback
      lg: "en-UG", // Luganda uses en-UG as fallback
    };
    return langMap[language] || "en-US";
  }

  stop(): void {
    this.listening = false;
    
    if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
      this.mediaRecorder.stop();
    }
    
    if (this.processor) {
      this.processor.disconnect();
    }
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
    }
    
    if (this.config) {
      this.config.onListeningStop();
    }
  }

  isListening(): boolean {
    return this.listening;
  }
}

// Singleton instance
let detector: VoiceWakeWordDetector | null = null;

export async function initializeVoiceWakeWord(
  config: WakeWordConfig
): Promise<void> {
  if (!detector) {
    detector = new VoiceWakeWordDetector();
  }
  await detector.initialize(config);
}

export function stopVoiceWakeWord(): void {
  if (detector) {
    detector.stop();
    detector = null;
  }
}

export function isVoiceWakeWordListening(): boolean {
  return detector?.isListening() ?? false;
}
