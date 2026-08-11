/**
 * Legacy Interview Quest — Microphone as Gameplay
 * Route: /legacy/interview-quest
 *
 * Transforms the microphone from a utility into a core gameplay mechanic.
 * Players embark on structured interview quests:
 *
 *   Interview Quest → AI Transcribes → Extracts Facts → Updates Timeline
 *     → Updates Family Tree → Creates Dialogue → Unlocks Chapter
 *     → Expands Map → Generates Achievement
 *
 * This page:
 * 1. Lists available interview quests from GET /api/legacy/interview-quests/:familyId
 * 2. Lets the player start a quest (POST /start)
 * 3. Records audio via MediaRecorder
 * 4. Submits the recording (POST /submit)
 * 5. Shows AI extraction results (GET /result)
 * 6. Completes the quest and triggers world regeneration (POST /complete)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Mic, MicOff, Square, Play, Pause,
  CheckCircle2, Sparkles, ChevronRight, AlertCircle,
  Users, MapPin, Calendar, BookOpen, Trophy, Brain,
  Clock, Volume2, X, RefreshCw, Zap, Video, ShieldCheck,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";

interface InterviewQuest {
  questType: string;
  title: string;
  description: string;
  suggestedQuestions: string[];
  rewardXp: number;
  worldChanges: string[];
  unlocks: string[];
  targetMemberId: number | null;
  targetMemberName: string | null;
  urgency: "high" | "medium" | "low";
}

interface QuestResult {
  transcript: string;
  extractedFacts: Array<{ fact: string; type: string; confidence: number }>;
  newPlaces: string[];
  newEvents: Array<{ title: string; date: string | null }>;
  newPeople: string[];
  dialogueSnippet: string;
  chapterUnlocked: boolean;
  achievementGenerated: string | null;
  worldRegeneration: {
    status: "ready";
    worldVersion: number | null;
    newCharacters: Array<{
      characterId: string;
      name: string;
      relationship: string | null;
      evidence: "family-reported";
      renderStatus: "ready" | "pending_verified_appearance";
      portrait: {
        representation: "Face";
        runtime: "catalog-only";
        status: "catalog-only";
        catalogCategory: "Face";
        candidateIndex: number;
      };
      appearance: {
          age: number;
        ageGroup: "adult" | "kid";
        gender: "male" | "female";
        lifeStage: "youth" | "adult" | "mature" | "elder";
        era: string;
          eraProfile: string;
        appearanceSeed: string;
        layers: {
          body: string;
          clothing: string;
          rearHair: string;
          frontHair: string;
        };
      } | null;
    }>;
    newQuest: { id: string; title: string; reason: string; status: "seeded" } | null;
    chapterSeed: { id: string; title: string; reason: string; status: "seeded" } | null;
    newDialogue: string;
    worldChanges: Array<{
      type: string;
      title: string;
      description: string;
      evidence: string;
    }>;
    snapshot: {
      discoveries: Array<{ id: string; title: string; status: string }>;
      mapChanges: Array<{ placeId: string; label: string; status: string }>;
    };
  };
}

type CaptureMode = "audio" | "video";
type Phase = "browsing" | "recording" | "submitting" | "result" | "complete";

export default function LegacyInterviewQuestPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [quests, setQuests] = useState<InterviewQuest[]>([]);
  const [activeQuest, setActiveQuest] = useState<InterviewQuest | null>(null);
  const [phase, setPhase] = useState<Phase>("browsing");
  const [questId, setQuestId] = useState<number | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("audio");
  const [recordingConsent, setRecordingConsent] = useState(false);

  // Recording state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [playing, setPlaying] = useState(false);
  const audioPlaybackRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Result state
  const [result, setResult] = useState<QuestResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load family and quests
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        if (!famRes.ok) throw new Error("Failed to load family");
        const famData = await famRes.json() as { families?: { id: number }[] };
        if (!famData.families?.length) throw new Error("No family found");
        const fid = famData.families[0].id;
        setFamilyId(fid);

        const questsRes = await fetch(`/api/legacy/interview-quests/${fid}`, { headers: authHeaders() });
        if (!questsRes.ok) throw new Error("Failed to load interview quests");
        const questsData = await questsRes.json() as { quests: InterviewQuest[] };
        setQuests(questsData.quests ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!recordingConsent) {
      toast.error("Confirm that everyone being recorded has given permission first.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: captureMode === "video",
      });
      const supportedType = captureMode === "video"
        ? ["video/webm;codecs=vp9,opus", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type))
        : ["audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        supportedType ? { mimeType: supportedType } : undefined,
      );
      mediaChunksRef.current = [];
      mediaStreamRef.current = stream;
      if (captureMode === "video" && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) mediaChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(mediaChunksRef.current, {
          type: recorder.mimeType || (captureMode === "video" ? "video/webm" : "audio/webm"),
        });
        setMediaBlob(blob);
        setMediaUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      toast.error("Couldn't access microphone. Check permissions and try again.");
    }
  }, [captureMode, recordingConsent]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [isRecording]);

  // Submit recording
  const submitRecording = useCallback(async () => {
    if (!mediaBlob || !familyId || !activeQuest) return;
    setPhase("submitting");
    setSubmitError(null);

    try {
      // Start the quest first
      const startRes = await fetch(`/api/legacy/interview-quests/${familyId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          questType: activeQuest.questType,
          targetMemberId: activeQuest.targetMemberId,
          title: activeQuest.title,
        }),
      });
      if (!startRes.ok) throw new Error("Failed to start quest");
      const startData = await startRes.json() as { interviewId: number };
      setQuestId(startData.interviewId);

      let finalTranscript = transcript.trim();
      if (!finalTranscript && captureMode === "audio") {
        const transcriptionRes = await fetch("/api/nia/voice/transcribe", {
          method: "POST",
          headers: { "Content-Type": mediaBlob.type, ...authHeaders() },
          body: mediaBlob,
        });
        if (transcriptionRes.ok) {
          const transcriptionData = await transcriptionRes.json() as { text?: string };
          finalTranscript = transcriptionData.text?.trim() ?? "";
        }
      }
      if (finalTranscript.length < 10) {
        throw new Error(captureMode === "video"
          ? "Add a short transcript before submitting the video interview."
          : "We couldn't transcribe that recording. Add the transcript below and try again.");
      }

      const submitRes = await fetch(`/api/legacy/interview-quests/${startData.interviewId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ transcript: finalTranscript }),
      });
      if (!submitRes.ok) throw new Error("Failed to submit interview");

      const mediaRes = await fetch(`/api/legacy/interview-quests/${startData.interviewId}/media`, {
        method: "POST",
        headers: {
          "Content-Type": mediaBlob.type || (captureMode === "video" ? "video/webm" : "audio/webm"),
          "X-Filename": captureMode === "video" ? "legacy-interview.webm" : "legacy-interview-audio.webm",
          ...authHeaders(),
        },
        body: mediaBlob,
      });
      if (!mediaRes.ok) {
        throw new Error("Interview text was saved, but the recording could not be stored.");
      }

      // Get normalized results after media is preserved
      const resultRes = await fetch(`/api/legacy/interview-quests/${startData.interviewId}/result`, {
        headers: authHeaders(),
      });
      if (!resultRes.ok) throw new Error("Failed to get results");
      const resultData = await resultRes.json() as { result: QuestResult };
      setResult(resultData.result);
      setTranscript(finalTranscript);
      setPhase("result");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
      setPhase("recording");
    }
  }, [captureMode, familyId, activeQuest, mediaBlob, transcript]);

  // Complete quest
  const completeQuest = useCallback(async () => {
    if (!questId) return;
    try {
      const response = await fetch(`/api/legacy/interview-quests/${questId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
      });
      if (!response.ok) throw new Error("The interview was preserved, but world regeneration could not finish.");
      setPhase("complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete quest");
    }
  }, [questId]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [mediaUrl]);

  // Format time
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#1A1008]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-[100dvh] bg-[#1A1008] text-amber-100">
        <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Interview Quests</h1>
        </div>
        <div className="px-6 py-8 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <p className="text-sm text-amber-600">{error}</p>
        </div>
      </div>
    );
  }

  // ── Complete ──
  if (phase === "complete") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#1A1008] px-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-black text-stone-100 mb-2">Quest Complete!</h2>
          <p className="text-sm text-stone-400 mb-6">
            Your interview has been preserved. The world has regenerated with new memories, dialogue, and stories.
          </p>
          {result && (
            <div className="bg-amber-400/5 border border-amber-400/20 rounded-xl p-4 mb-6 text-left">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">World Regenerated</span>
              </div>
              <div className="space-y-2">
                {result.newPlaces.length > 0 && (
                  <p className="text-xs text-stone-400 flex items-center gap-2">
                    <MapPin className="w-3 h-3 text-amber-500" /> New place: {result.newPlaces[0]}
                  </p>
                )}
                {result.newEvents.length > 0 && (
                  <p className="text-xs text-stone-400 flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-amber-500" /> Timeline event: {result.newEvents[0].title}
                  </p>
                )}
                {result.dialogueSnippet && (
                  <p className="text-xs text-stone-400 flex items-center gap-2">
                    <BookOpen className="w-3 h-3 text-amber-500" /> New dialogue unlocked
                  </p>
                )}
                {result.chapterUnlocked && (
                  <p className="text-xs text-stone-400 flex items-center gap-2">
                    <Sparkles className="w-3 h-3 text-amber-500" /> New chapter unlocked
                  </p>
                )}
                {result.achievementGenerated && (
                  <p className="text-xs text-stone-400 flex items-center gap-2">
                    <Trophy className="w-3 h-3 text-amber-500" /> Achievement: {result.achievementGenerated}
                  </p>
                )}
              </div>
            </div>
          )}
          {result?.worldRegeneration && <WorldRegenerationSummary result={result} />}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/legacy")}
              className="bg-amber-500 text-stone-900 font-bold rounded-xl px-6 py-3 text-sm"
            >
              Return to Legacy Hub
            </button>
             <button
               onClick={() => navigate("/legacy/play")}
               className="border border-emerald-500/30 text-emerald-300 font-bold rounded-xl px-6 py-3 text-sm"
             >
               Enter Changed World
             </button>
            <button
              onClick={() => {
                setPhase("browsing");
                setActiveQuest(null);
                setResult(null);
                 setMediaBlob(null);
                 setMediaUrl(null);
                 setTranscript("");
                setQuestId(null);
              }}
              className="text-amber-400 font-medium rounded-xl px-6 py-3 text-sm border border-amber-700/30"
            >
              Start Another Interview
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Result ──
  if (phase === "result" && result) {
    return (
      <div className="min-h-[100dvh] bg-[#1A1008] text-stone-100 pb-8">
        <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Interview Results</h1>
        </div>

        <div className="px-4 pt-6 pb-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-center mx-auto mb-3">
            <Brain className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-black text-amber-200 text-center mb-1">AI Extraction Complete</h2>
          <p className="text-xs text-amber-600 text-center mb-6">Nia has analyzed your interview</p>
        </div>

        {/* Transcript */}
        {result.transcript && (
         <div className="px-4 mb-6">
            <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Volume2 className="w-3.5 h-3.5" /> Transcript
            </h3>
            <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
              <p className="text-sm text-stone-300 leading-relaxed italic">"{result.transcript.slice(0, 500)}..."</p>
            </div>
          </div>
        )}

        {/* Extracted Facts */}
        {result.extractedFacts.length > 0 && (
          <div className="px-4 mb-6">
            <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" /> Extracted Facts
            </h3>
            <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
              {result.extractedFacts.map((fact, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    fact.confidence > 0.8 ? "bg-emerald-400" : fact.confidence > 0.5 ? "bg-amber-400" : "bg-stone-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-300">{fact.fact}</p>
                    <p className="text-[10px] text-stone-500 mt-0.5 uppercase">{fact.type} · {Math.round(fact.confidence * 100)}% confidence</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* World Changes */}
        <div className="px-4 mb-6">
          <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> World Changes
          </h3>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
            {result.newPlaces.length > 0 && (
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-amber-300">New Places</p>
                  <p className="text-[10px] text-stone-400">{result.newPlaces.join(", ")}</p>
                </div>
              </div>
            )}
            {result.newEvents.length > 0 && (
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-amber-300">Timeline Events</p>
                  <p className="text-[10px] text-stone-400">{result.newEvents.map((e) => e.title).join(", ")}</p>
                </div>
              </div>
            )}
            {result.newPeople.length > 0 && (
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-amber-300">People Identified</p>
                  <p className="text-[10px] text-stone-400">{result.newPeople.join(", ")}</p>
                </div>
              </div>
            )}
            {result.dialogueSnippet && (
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-amber-300">New Dialogue</p>
                  <p className="text-[10px] text-stone-400 italic">"{result.dialogueSnippet.slice(0, 80)}..."</p>
                </div>
              </div>
            )}
            {result.chapterUnlocked && (
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <div>
                  <p className="text-xs font-bold text-purple-300">Chapter Unlocked</p>
                  <p className="text-[10px] text-stone-400">A new chapter is now available</p>
                </div>
              </div>
            )}
            {result.achievementGenerated && (
              <div className="flex items-center gap-3">
                <Trophy className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs font-bold text-amber-300">Achievement</p>
                  <p className="text-[10px] text-stone-400">{result.achievementGenerated}</p>
                </div>
              </div>
            )}
          </div>
        </div>

         <WorldRegenerationSummary result={result} />

        {/* Complete button */}
        <div className="px-4">
          <button
            onClick={completeQuest}
            className="w-full bg-amber-500 text-stone-900 font-black text-sm uppercase tracking-widest py-3.5 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
          >
            Complete Quest & Regenerate World
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Recording / Submitting ──
  if ((phase === "recording" || phase === "submitting") && activeQuest) {
    return (
      <div className="min-h-[100dvh] bg-[#1A1008] text-stone-100 flex flex-col">
        <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => {
              stopRecording();
              setPhase("browsing");
              setActiveQuest(null);
               setMediaBlob(null);
               setMediaUrl(null);
               setTranscript("");
            }}
            className="text-amber-500 active:opacity-70"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">{activeQuest.title}</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {/* Suggested questions */}
          <div className="mb-6">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Suggested Questions
            </h2>
            <div className="space-y-2">
              {activeQuest.suggestedQuestions.map((q, i) => (
                <div key={i} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                  <p className="text-sm text-amber-200">{q}</p>
                </div>
              ))}
            </div>
          </div>

           {/* Capture mode and consent */}
           {!isRecording && !mediaBlob && (
             <div className="space-y-3 mb-6">
               <div className="grid grid-cols-2 gap-2">
                 {(["audio", "video"] as CaptureMode[]).map((mode) => (
                   <button
                     key={mode}
                     type="button"
                     onClick={() => setCaptureMode(mode)}
                     className={`rounded-xl border px-3 py-2.5 text-xs font-bold uppercase tracking-wider ${
                       captureMode === mode
                         ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
                         : "border-stone-700 bg-stone-900/40 text-stone-500"
                     }`}
                   >
                     {mode === "video" ? <Video className="inline w-4 h-4 mr-1" /> : <Mic className="inline w-4 h-4 mr-1" />}
                     {mode} interview
                   </button>
                 ))}
               </div>
               <label className="flex items-start gap-2 rounded-xl border border-amber-900/30 bg-amber-500/5 p-3 text-xs text-stone-400">
                 <input
                   type="checkbox"
                   checked={recordingConsent}
                   onChange={(event) => setRecordingConsent(event.target.checked)}
                   className="mt-0.5 accent-amber-500"
                 />
                 <span>
                   <ShieldCheck className="inline w-3.5 h-3.5 text-emerald-400 mr-1" />
                   Everyone being recorded has agreed to preserve this interview in the Family Vault.
                 </span>
               </label>
             </div>
           )}

           {captureMode === "video" && (
             <video
               ref={videoPreviewRef}
               muted
               playsInline
               controls={Boolean(mediaBlob)}
               src={mediaBlob && mediaUrl ? mediaUrl : undefined}
               className={`w-full aspect-video rounded-2xl bg-black/40 object-cover mb-4 ${
                 isRecording || mediaBlob ? "block" : "hidden"
               }`}
             />
           )}

           {/* Recording indicator */}
          {isRecording && (
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center animate-pulse">
                 {captureMode === "video" ? <Video className="w-8 h-8 text-red-400" /> : <Mic className="w-8 h-8 text-red-400" />}
              </div>
              <p className="text-2xl font-black text-red-400 tabular-nums">{formatTime(recordingTime)}</p>
              <p className="text-xs text-stone-500 uppercase tracking-wider">Recording...</p>
            </div>
          )}

          {/* Recording controls */}
           {!isRecording && !mediaBlob && (
            <div className="flex flex-col items-center gap-4 mb-6">
              <button
                onClick={startRecording}
                className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                 {captureMode === "video" ? <Video className="w-8 h-8 text-amber-400" /> : <Mic className="w-8 h-8 text-amber-400" />}
              </button>
               <p className="text-xs text-stone-500 uppercase tracking-wider">
                 {recordingConsent ? "Tap to start recording" : "Confirm consent to start"}
               </p>
            </div>
          )}

          {/* Stop button */}
          {isRecording && (
            <div className="flex justify-center mb-6">
              <button
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center active:scale-95 transition-transform"
              >
                <Square className="w-6 h-6 text-red-400" />
              </button>
            </div>
          )}

           {/* Playback */}
           {mediaBlob && mediaUrl && captureMode === "audio" && (
            <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 mb-6">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">Recording Ready</h3>
              <audio
                ref={audioPlaybackRef}
                 src={mediaUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                className="hidden"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const el = audioPlaybackRef.current;
                    if (!el) return;
                    if (playing) { el.pause(); } else { el.play().catch(() => {}); }
                  }}
                  className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center active:scale-95"
                >
                  {playing ? <Pause className="w-5 h-5 text-amber-400" /> : <Play className="w-5 h-5 text-amber-400 ml-0.5" />}
                </button>
                <div className="flex-1">
                  <p className="text-xs text-stone-400">Your recording</p>
                   <p className="text-[10px] text-stone-500">{(mediaBlob.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => {
                     setMediaBlob(null);
                     setMediaUrl(null);
                  }}
                  className="text-stone-500 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

           {mediaBlob && (
             <div className="mb-6">
               <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                 Transcript fallback
               </label>
               <textarea
                 value={transcript}
                 onChange={(event) => setTranscript(event.target.value)}
                 placeholder={captureMode === "video"
                   ? "Type or paste what was said so Nia can extract the story..."
                   : "Optional: type the transcript if automatic transcription is unavailable..."}
                 rows={4}
                 className="w-full rounded-xl border border-amber-900/30 bg-[#2A1A0F] p-3 text-sm text-stone-200 placeholder:text-stone-600 outline-none focus:border-amber-500/60"
               />
             </div>
           )}

          {/* Submit error */}
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-red-400">{submitError}</p>
            </div>
          )}
        </div>

        {/* Submit button */}
        {mediaBlob && (
          <div className="px-4 py-3 border-t border-stone-800/50">
            <button
              onClick={submitRecording}
              disabled={phase === "submitting"}
              className="w-full bg-amber-500 text-stone-900 font-black text-sm uppercase tracking-widest py-3.5 rounded-xl active:opacity-80 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {phase === "submitting" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing with AI...</>
              ) : (
                <>Submit Interview <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Browsing (default) ──
  return (
    <div className="min-h-[100dvh] bg-[#1A1008] text-stone-100 pb-8">
      <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Interview Quests</h1>
      </div>

      {/* Hero */}
      <div className="px-4 pt-6 pb-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-center mx-auto mb-3">
          <Mic className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-black text-amber-200 mb-1">Interview Quests</h2>
        <p className="text-xs text-amber-600 leading-relaxed max-w-xs mx-auto">
          The microphone is your most powerful tool. Each interview regenerates your family's world —
          new dialogue, chapters, places, and memories.
        </p>
      </div>

      {/* ── Live Video Interview — Legacy Quest ── */}
      <div className="px-4 mb-4">
        <div className="relative overflow-hidden rounded-2xl border border-rose-700/30 bg-gradient-to-br from-rose-950/40 to-[#1A1008]">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-900/10 to-transparent pointer-events-none" />
          <div className="relative p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                <Video className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-amber-100">Live Video Interview</p>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400">Legacy Quest</span>
                </div>
                <p className="text-xs text-amber-600 mt-0.5">Interview a relative face-to-face — the highest-value Legacy quest.</p>
              </div>
            </div>
            <p className="text-xs text-stone-400 leading-relaxed mb-3">
              Conduct a live video interview with an elder or relative. AI listens in real time,
              extracts stories, places, and people — then regenerates dialogue, unlocks new chapters,
              and expands your family's world map. Something no other family platform does.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {["New Character", "New Memories", "New Storyline", "Map Expansion", "+250 XP"].map((tag, i) => (
                <span key={i} className="text-[9px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-full px-2 py-0.5">{tag}</span>
              ))}
            </div>
            <div className="bg-rose-950/30 border border-rose-800/30 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                 <p className="text-xs text-rose-300 italic">
                   Video capture is available now. Consent is required, and a typed transcript can be used when automatic transcription is unavailable.
                 </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="px-4 mb-3 flex items-center gap-3">
        <div className="flex-1 h-px bg-amber-900/30" />
        <p className="text-[10px] text-amber-800 uppercase tracking-widest font-bold">Audio Interview Quests</p>
        <div className="flex-1 h-px bg-amber-900/30" />
      </div>

      {/* Quest list */}
      {quests.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <Users className="w-10 h-10 text-amber-700 mx-auto mb-4" />
          <p className="text-sm text-amber-600 mb-2">No interview quests available yet.</p>
          <p className="text-xs text-stone-500">Add family members to unlock interview quests.</p>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {quests.map((quest, idx) => {
            const urgencyColor =
              quest.urgency === "high" ? "border-red-500/30 bg-red-500/5" :
              quest.urgency === "medium" ? "border-amber-500/30 bg-amber-500/5" :
              "border-stone-700/50 bg-stone-800/30";
            return (
              <button
                key={idx}
                onClick={() => {
                  setActiveQuest(quest);
                  setPhase("recording");
                  setMediaBlob(null);
                  setMediaUrl(null);
                  setTranscript("");
                  setResult(null);
                  setSubmitError(null);
                }}
                className={`w-full text-left border ${urgencyColor} rounded-2xl p-4 active:scale-[0.98] transition-transform group`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        quest.urgency === "high" ? "bg-red-500/20 text-red-400" :
                        quest.urgency === "medium" ? "bg-amber-500/20 text-amber-400" :
                        "bg-stone-600/20 text-stone-400"
                      }`}>{quest.urgency} priority</span>
                      <span className="text-[10px] text-amber-500 font-bold">+{quest.rewardXp} XP</span>
                    </div>
                    <h3 className="text-sm font-black text-amber-200">{quest.title}</h3>
                    {quest.targetMemberName && (
                      <p className="text-[10px] text-amber-600 mt-0.5">with {quest.targetMemberName}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-500 group-hover:text-amber-400 transition-colors flex-shrink-0 mt-1" />
                </div>
                <p className="text-xs text-stone-400 leading-relaxed mb-3">{quest.description}</p>
                {/* Unlocks */}
                <div className="flex flex-wrap gap-1.5">
                  {quest.unlocks.slice(0, 3).map((unlock, i) => (
                    <span key={i} className="text-[9px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                      {unlock}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WorldRegenerationSummary({ result }: { result: QuestResult }) {
  const [, navigate] = useLocation();
  const { worldRegeneration } = result;
  if (
    worldRegeneration.newCharacters.length === 0
    && !worldRegeneration.newQuest
    && !worldRegeneration.chapterSeed
    && !worldRegeneration.newDialogue
  ) {
    return null;
  }

  return (
    <div className="px-4 mb-6">
      <div className="rounded-2xl border border-emerald-700/30 bg-emerald-950/20 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-emerald-300">
            World regenerated
          </h3>
        </div>
        <p className="text-xs text-emerald-100/70 mb-2">
          Your family-reported evidence has created new, reviewable gameplay seeds.
          Visual identity remains pending when the interview did not state age and gender.
        </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80 mb-4">
            Knowledge world {worldRegeneration.worldVersion ? `v${worldRegeneration.worldVersion}` : "version pending"}
          </p>

        {worldRegeneration.worldChanges.length > 0 && (
          <div className="mb-4 rounded-xl border border-emerald-800/30 bg-black/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">World updated</p>
            <div className="space-y-2">
              {worldRegeneration.worldChanges.slice(0, 8).map((change, index) => (
                <div key={`${change.type}-${change.title}-${index}`} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-100">{change.title}</p>
                    <p className="text-[10px] text-emerald-200/60">{change.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {worldRegeneration.snapshot.mapChanges.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {worldRegeneration.snapshot.mapChanges.map((change) => (
              <span key={change.placeId} className="rounded-full border border-sky-700/30 bg-sky-950/30 px-2 py-1 text-[9px] font-bold text-sky-300">
                Map revealed · {change.label}
              </span>
            ))}
          </div>
        )}

        {worldRegeneration.newCharacters.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-2">
              New people in the story
            </p>
            <div className="space-y-2">
              {worldRegeneration.newCharacters.map((character) => {
                const appearance = character.appearance;
                const spriteAppearance = appearance
                  ? {
                      ageGroup: appearance.ageGroup,
                      gender: appearance.ageGroup === "kid" ? "unspecified" as const : appearance.gender,
                      characterId: character.characterId,
                      lifeStage: appearance.lifeStage,
                      era: appearance.era,
                      appearanceSeed: appearance.appearanceSeed,
                      layers: {
                        body: appearance.layers.body,
                        clothing: appearance.layers.clothing,
                        rearHair: appearance.layers.rearHair,
                        frontHair: appearance.layers.frontHair,
                      },
                    }
                  : null;
                return (
                  <div key={character.characterId} className="flex items-center gap-3 rounded-xl border border-emerald-800/30 bg-black/10 p-2.5">
                    {spriteAppearance ? (
                      <LegacyCharacterSprite {...spriteAppearance} size={44} />
                    ) : (
                      <div className="w-11 h-11 rounded-xl border border-amber-700/30 bg-amber-950/40 flex items-center justify-center text-amber-300 font-black">
                        {character.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-emerald-100">{character.name}</p>
                      <p className="text-[10px] text-emerald-200/60">
                        {character.relationship ?? "Family story connection"} · {character.evidence}
                      </p>
                      <p className={`text-[9px] uppercase tracking-wide mt-0.5 ${
                        character.renderStatus === "ready" ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        {character.renderStatus === "ready"
                          ? `TV map sprite ready · ${appearance?.lifeStage} · ${appearance?.era}`
                          : "Appearance pending explicit age + gender"}
                      </p>
                       <p className="text-[9px] text-emerald-200/50 mt-0.5">
                         Face portrait catalog-only · candidate {character.portrait.candidateIndex + 1}
                       </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          {worldRegeneration.newQuest && (
            <div className="rounded-xl border border-amber-800/30 bg-amber-950/20 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">New quest seed</p>
              <p className="text-xs font-bold text-amber-100 mt-1">{worldRegeneration.newQuest.title}</p>
              <p className="text-[10px] text-amber-200/60 mt-1">{worldRegeneration.newQuest.reason}</p>
            </div>
          )}
          {worldRegeneration.chapterSeed && (
            <div className="rounded-xl border border-sky-800/30 bg-sky-950/20 p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-sky-400">New chapter seed</p>
              <p className="text-xs font-bold text-sky-100 mt-1">{worldRegeneration.chapterSeed.title}</p>
              <p className="text-[10px] text-sky-200/60 mt-1">{worldRegeneration.chapterSeed.reason}</p>
            </div>
          )}
        </div>

        {worldRegeneration.newDialogue && (
          <div className="mt-3 border-t border-emerald-800/30 pt-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">New dialogue</p>
            <p className="text-xs text-emerald-100/80 italic mt-1">"{worldRegeneration.newDialogue.slice(0, 180)}"</p>
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate("/legacy/play")}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-500/20"
          >
            Enter changed world
            <span className="mt-1 block text-[9px] font-medium normal-case tracking-normal text-emerald-200/60">Resume the next playable chapter</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/legacy/map")}
            className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-sky-200 transition-colors hover:bg-sky-500/20"
          >
            Explore revealed map
            <span className="mt-1 block text-[9px] font-medium normal-case tracking-normal text-sky-200/60">See why each place matters</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/legacy/characters")}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-amber-200 transition-colors hover:bg-amber-500/20"
          >
            Meet new people
            <span className="mt-1 block text-[9px] font-medium normal-case tracking-normal text-amber-200/60">View persistent character identities</span>
          </button>
        </div>
      </div>
    </div>
  );
}
