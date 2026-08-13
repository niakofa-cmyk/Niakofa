// useNiaStory — Phase 7c
// Records a voice story, sends transcript to Nia, returns polished text
import { useState, useRef, useCallback } from "react";
import { detectVoiceLocale } from "@/lib/locale-utils";

// share-story routes through the api-server proxy
const API_BASE = (import.meta as unknown).env?.BASE_URL?.replace(/\/$/, "") ?? "";

export type StoryState = "idle" | "recording" | "processing" | "done" | "error";

export interface NiaStory {
  story: string;
  userName: string;
  helperName: string | null;
  category: string;
}

export function useNiaStory(userName: string) {
  const [state, setState] = useState<StoryState>("idle");
  const [story, setStory] = useState<NiaStory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<unknown>(null);

  const startRecording = useCallback(() => {
    const SR: unknown = (window as unknown).SpeechRecognition || (window as unknown).webkitSpeechRecognition;
    if (!SR) {
      setError("Voice recording not supported in this browser.");
      setState("error");
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    // Use the user's detected voice locale so non-English story recordings
    // (Swahili, Yoruba, French, etc.) are correctly transcribed.
    rec.lang = detectVoiceLocale();
    let fullTranscript = "";

    rec.onstart = () => setState("recording");
    rec.onresult = (event: unknown) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          fullTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(fullTranscript + interim);
    };
    rec.onerror = (e: unknown) => {
      setError(e.error);
      setState("error");
    };

    recognitionRef.current = rec;
    rec.start();
  }, []);

  const stopAndSubmit = useCallback(async (helperName?: string, category?: string) => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    const raw = transcript.trim();
    if (!raw || raw.length < 10) {
      setError("Please record a longer story.");
      setState("error");
      return;
    }

    setState("processing");
    try {
      const res = await fetch(`${API_BASE}/api/nia/share-story`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...((() => { try { const t = localStorage.getItem("niakofa_token"); return t ? { Authorization: `Bearer ${t}` } : {} as Record<string,string>; } catch { return {} as Record<string,string>; } })()),
        },
        body: JSON.stringify({ transcript: raw, userName, helperName, category }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error("Nia is resting right now 💙 — try again when she's awake.");
        }
        if (res.status === 401) {
          throw new Error("Please sign in to share your story.");
        }
        const errBody = await res.json().catch(() => ({})) as unknown;
        throw new Error(errBody.error ?? `Something went wrong (${res.status})`);
      }
      const data = await res.json();
      setStory(data);
      setState("done");
    } catch (err: unknown) {
      setError(err.message ?? "Failed to craft story");
      setState("error");
    }
  }, [transcript, userName]);

  const reset = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
    setStory(null);
    setError(null);
    setTranscript("");
  }, []);

  return { state, story, error, transcript, startRecording, stopAndSubmit, reset };
}
