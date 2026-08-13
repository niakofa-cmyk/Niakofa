/**
 * Legacy Onboarding — Chapter 0: Awaken the Legacy
 * Route: /legacy/onboarding
 *
 * The first-run experience for Niakofa Legacy Mode.
 * Three quests bring the family world to life:
 *   Quest 1 — The First Ancestor (add oldest relative)
 *   Quest 2 — Their Voice Lives On (record a 30s memory, transcribed via Nia)
 *   Quest 3 — Every Story Has a Place (pin a family location)
 *
 * After all three: "LEGACY AWAKENED!" → init chapters → navigate to first chapter.
 *
 * Audio recording uses a real MediaRecorder that saves audio to the vault
 * and sends it to /api/nia/voice/transcribe for a real voice transcript.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Play, Users, Mic, MapPin, Sparkles, CheckCircle2,
  Loader2, ArrowRight, Square, BookHeart, _Globe2, Home,
  Building2, Church, School, Trees, Volume2, _AlertCircle,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────

type OnboardingPhase =
  | "splash"
  | "quest1"
  | "quest1_complete"
  | "quest2"
  | "quest2_complete"
  | "quest3"
  | "quest3_complete"
  | "awakened"
  | "launching";

interface WorldRegen {
  items: string[];
  version: number;
}

const PLACE_TYPES = [
  { id: "home",     label: "Home",     icon: Home,      desc: "A place your family lived" },
  { id: "village",  label: "Village",  icon: Trees,     desc: "A village or town they came from" },
  { id: "church",   label: "Church",   icon: Church,    desc: "A place of worship or community" },
  { id: "school",   label: "School",   icon: School,    desc: "Where they learned and grew" },
  { id: "business", label: "Business", icon: Building2, desc: "Where they worked or built something" },
  { id: "other",    label: "Other",    icon: MapPin,    desc: "Any meaningful place" },
];

// ─── Waveform visualizer ────────────────────────────────────────────────────

function AudioWaveform({ active, seconds }: { active: boolean; seconds: number }) {
  const bars = 28;
  return (
    <div className="flex items-center gap-[2px] h-10 px-2">
      {Array.from({ length: bars }).map((_, i) => {
        const height = active
          ? 4 + Math.abs(Math.sin((Date.now() / 300 + i * 0.7))) * 28 + Math.random() * 8
          : i < Math.floor((seconds / 30) * bars)
          ? 4 + Math.abs(Math.sin(i * 0.6)) * 20
          : 4;
        return (
          <div
            key={i}
            className="rounded-full transition-all duration-100"
            style={{
              width: 3,
              height: `${Math.max(4, Math.min(36, height))}px`,
              background: active
                ? `rgba(251,191,36,${0.4 + Math.abs(Math.sin(i * 0.5)) * 0.6})`
                : i < Math.floor((seconds / 30) * bars)
                ? "rgba(251,191,36,0.7)"
                : "rgba(180,120,40,0.2)",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Progress bar ───────────────────────────────────────────────────────────

function QuestProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3].map(n => (
        <div key={n} className="flex-1 flex flex-col items-center gap-1">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border transition-all duration-500 ${
              n < current
                ? "bg-amber-500 border-amber-500 text-amber-950"
                : n === current
                ? "bg-amber-500/20 border-amber-400 text-amber-300"
                : "bg-transparent border-amber-800/40 text-amber-800"
            }`}
          >
            {n < current ? <CheckCircle2 className="w-4 h-4" /> : n}
          </div>
          <div className={`h-1 w-full rounded-full transition-all duration-700 ${
            n < current ? "bg-amber-500" : n === current ? "bg-amber-500/40" : "bg-amber-900/30"
          }`} />
          <p className={`text-[9px] uppercase tracking-widest ${n === current ? "text-amber-400" : "text-amber-800"}`}>
            {n === 1 ? "Ancestor" : n === 2 ? "Memory" : "Place"}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── World Regeneration card ────────────────────────────────────────────────

function WorldRegenCard({ regen, onContinue, loading }: {
  regen: WorldRegen;
  onContinue: () => void;
  loading?: boolean;
}) {
  const [visible, setVisible] = useState<number>(0);

  useEffect(() => {
    regen.items.forEach((_, i) => {
      setTimeout(() => setVisible(v => Math.max(v, i + 1)), (i + 1) * 400);
    });
  }, [regen.items]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0A0604]/95 flex items-center justify-center px-6 animate-[fadeIn_0.4s_ease-out]">
      <div className="max-w-sm w-full text-center">
        {/* Version badge */}
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            World Regenerated — v{regen.version}
          </span>
        </div>

        <h2 className="text-2xl font-black text-amber-100 mb-2">Your World Has Changed</h2>
        <p className="text-xs text-amber-600 mb-8">The legacy grows with every memory added.</p>

        {/* Unlocked items */}
        <div className="space-y-2.5 mb-8 text-left">
          {regen.items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 transition-all duration-500 ${
                i < visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-200">{item}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onContinue}
          disabled={loading || visible < regen.items.length}
          className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-4 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function LegacyOnboardingPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();

  const [phase, setPhase]     = useState<OnboardingPhase>("splash");
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [loading, setLoading]  = useState(false);
  const [regen, setRegen]      = useState<WorldRegen | null>(null);

  // Quest 1 state
  const [q1Name,       setQ1Name]       = useState("");
  const [q1BirthYear,  setQ1BirthYear]  = useState("");
  const [q1Village,    setQ1Village]    = useState("");
  const [q1Occupation, setQ1Occupation] = useState("");
  const [q1MemberId,   setQ1MemberId]   = useState<number | null>(null);

  // Quest 2 state
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const [recording,        setRecording]        = useState(false);
  const [recordSeconds,    setRecordSeconds]    = useState(0);
  const [recordingDone,    setRecordingDone]    = useState(false);
  const [transcript,       setTranscript]       = useState<string | null>(null);
  const [transcribing,     setTranscribing]     = useState(false);
  const [q2MemoryId,       setQ2MemoryId]       = useState<number | null>(null);

  // Quest 3 state
  const [q3PlaceType,  setQ3PlaceType]  = useState<string>("");
  const [q3PlaceName,  setQ3PlaceName]  = useState("");
  const [q3Country,    setQ3Country]    = useState("");

  // ── On mount: resolve or create family ──────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const res = await fetch("/api/family/mine", { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json() as { families?: { id: number }[] };
        if (data.families?.length) {
          setFamilyId(data.families[0].id);
        } else {
          // Create a default family space
          const cr = await fetch("/api/family", {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ name: "My Family Legacy", description: "Our living family legacy" }),
          });
          if (cr.ok) {
            const cd = await cr.json() as { family?: { id: number }; id?: number };
            const fid = cd.family?.id ?? cd.id;
            if (fid) setFamilyId(fid);
          }
        }
      } catch {
        // Non-fatal — will fail gracefully on quest submit
      }
    })();
  }, [currentUser]);

  // ── Recording timer ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setRecordSeconds(s => {
        if (s >= 60) {
          handleStopRecording();
          return 60;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Stop on unmount
  useEffect(() => () => {
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
    mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
  }, []);

  // ── Splash → Quest 1 ─────────────────────────────────────────────────────

  const handleBeginJourney = useCallback(() => setPhase("quest1"), []);

  // ── Quest 1: Add oldest relative ─────────────────────────────────────────

  const handleQ1Submit = useCallback(async () => {
    if (!q1Name.trim()) { toast.error("Please enter a name"); return; }
    if (!familyId) { toast.error("Setting up your family space…"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/family/${familyId}/members`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: q1Name.trim(),
          relation_note: [
            q1Village ? `From ${q1Village}` : null,
            q1BirthYear ? `Born ${q1BirthYear}` : null,
            q1Occupation || null,
          ].filter(Boolean).join(", ") || undefined,
          role: "contributor",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { member?: { id: number }; id?: number };
      const memberId = data.member?.id ?? data.id;
      if (memberId) setQ1MemberId(memberId);

      // Log world evolution
      fetch(`/api/legacy/reservoir/${familyId}/invalidate`, { method: "POST", headers: authHeaders() }).catch(() => {});

      setRegen({
        version: 1,
        items: [
          `${q1Name.trim()} added to your family`,
          "Character profile created",
          "Timeline started",
          "First chapter seed unlocked",
        ],
      });
      setPhase("quest1_complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add family member");
    } finally {
      setLoading(false);
    }
  }, [q1Name, q1BirthYear, q1Village, q1Occupation, familyId]);

  // ── Quest 2: Record a memory ──────────────────────────────────────────────

  const handleStartRecording = useCallback(async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); };
      recorder.start(100); // collect data every 100ms for live waveform feel
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      setRecordingDone(false);
      setTranscript(null);
    } catch (err) {
      toast.error(err instanceof Error ? `Microphone error: ${err.message}` : "Couldn't access microphone");
    }
  }, [recording]);

  const handleStopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
    setRecordingDone(true);
  }, []);

  const handleSaveRecording = useCallback(async () => {
    if (!familyId || audioChunksRef.current.length === 0) {
      toast.error("No recording to save");
      return;
    }
    setLoading(true);
    setTranscribing(true);
    try {
      const mimeType = audioChunksRef.current[0]?.type || "audio/webm";
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

      // 1. Create memory record
      const memRes = await fetch(`/api/family/${familyId}/memories`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `First Story — ${q1Name || "Family Memory"}`,
          source: "interview",
          description: "Recorded during Legacy onboarding",
        }),
      });
      if (!memRes.ok) throw new Error("Failed to create memory record");
      const { memory } = await memRes.json() as { memory: { id: number } };
      setQ2MemoryId(memory.id);

      // 2. Upload audio to vault
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });
      const uploadRes = await fetch(`/api/family/${familyId}/memories/${memory.id}/assets/upload-direct`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          filename: `legacy-onboarding-memory-${Date.now()}.webm`,
          mimeType,
          assetType: "audio",
        }),
      });
      if (!uploadRes.ok) throw new Error("Failed to upload audio");

      // 3. Transcribe via Nia Voice (Whisper STT) — wire all the way through
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, `memory-${Date.now()}.webm`);
        formData.append("familyId", String(familyId));
        const transcribeRes = await fetch("/api/nia/voice/transcribe", {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        });
        if (transcribeRes.ok) {
          const td = await transcribeRes.json() as { text?: string };
          if (td.text) {
            setTranscript(td.text);
            // Patch memory description with real transcript
            await fetch(`/api/family/${familyId}/memories/${memory.id}`, {
              method: "PATCH",
              headers: { ...authHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ description: td.text.slice(0, 500) }),
            }).catch(() => {});
          }
        }
      } catch {
        // Transcription is best-effort — audio is already saved
      }

      // 4. Invalidate world cache
      fetch(`/api/legacy/reservoir/${familyId}/invalidate`, { method: "POST", headers: authHeaders() }).catch(() => {});

      setRegen({
        version: 2,
        items: [
          "Voice memory saved to vault",
          transcript ? "Story transcribed and indexed" : "Audio story preserved",
          "New dialogue unlocked for your ancestor",
          "Journal entry created",
          "Recipe / tradition quest seeded",
        ],
      });
      setPhase("quest2_complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save recording");
    } finally {
      setLoading(false);
      setTranscribing(false);
    }
  }, [familyId, q1Name, transcript]);

  // ── Quest 3: Pin a place ─────────────────────────────────────────────────

  const handleQ3Submit = useCallback(async () => {
    if (!q3PlaceType) { toast.error("Please select a place type"); return; }
    if (!q3PlaceName.trim()) { toast.error("Please enter a place name"); return; }
    if (!familyId) { toast.error("Family not set up yet"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/legacy/map/${familyId}/places`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          label: q3PlaceName.trim(),
          placeType: q3PlaceType,
          country: q3Country.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      fetch(`/api/legacy/reservoir/${familyId}/invalidate`, { method: "POST", headers: authHeaders() }).catch(() => {});

      setRegen({
        version: 3,
        items: [
          `${q3PlaceName.trim()} added to family map`,
          "World map expanded",
          "Exploration quest unlocked",
          "New area revealed on your legacy map",
        ],
      });
      setPhase("quest3_complete");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to pin place");
    } finally {
      setLoading(false);
    }
  }, [q3PlaceType, q3PlaceName, q3Country, familyId]);

  // ── After all quests: init chapters → launch ──────────────────────────────

  const handleBeginLegacy = useCallback(async () => {
    if (!familyId) { navigate("/legacy"); return; }
    setPhase("launching");
    try {
      // Find a good ancestor member to use
      const ancRes = await fetch(`/api/legacy/ancestors/${familyId}`, { headers: authHeaders() });
      const ancData = ancRes.ok ? await ancRes.json() as { ancestors?: { memberId: number }[] } : {};
      const ancestorMemberId = ancData.ancestors?.[0]?.memberId ?? q1MemberId ?? undefined;

      const initRes = await fetch(`/api/legacy/chapters/${familyId}/init`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ preferredAncestorMemberId: ancestorMemberId }),
      });

      if (!initRes.ok) {
        const errData = await initRes.json().catch(() => ({ error: `Server error (${initRes.status})` }));
        const msg = (errData as { error?: string }).error ?? `Chapter init failed (${initRes.status})`;
        toast.error(`Could not build your world: ${msg}. You can try starting your journey manually.`);
        try { localStorage.setItem("legacy:setupDone", "1"); } catch {}
        setTimeout(() => navigate("/legacy/start"), 1200);
        return;
      }

      const data = await initRes.json() as { worldId: number; chapters: { id: number; status: string }[] };
      const firstChapter = data.chapters.find(c => c.status === "unlocked") ?? data.chapters[0];

      if (!firstChapter) {
        // World created but no chapters returned — go to start to try ancestor selection
        toast("Your world is being built. Choose an ancestor to begin.", { icon: "✨" });
        try { localStorage.setItem("legacy:setupDone", "1"); } catch {}
        setTimeout(() => navigate("/legacy/start"), 1000);
        return;
      }

      // Mark in progress
      await fetch(`/api/legacy/chapters/${firstChapter.id}/status`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }).catch(() => {});
      // Create session
      await fetch("/api/legacy/sessions", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          familyId,
          worldId: data.worldId,
          ancestorMemberId: ancestorMemberId ?? null,
          chapterId: firstChapter.id,
        }),
      }).catch(() => {});
      // Mark onboarding complete
      try { localStorage.setItem("legacy:setupDone", "1"); } catch {}
      setTimeout(() => navigate(`/legacy/chapter/${firstChapter.id}`), 1000);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(`Could not launch your legacy: ${msg}`);
    }
    try { localStorage.setItem("legacy:setupDone", "1"); } catch {}
    navigate("/legacy/start");
  }, [familyId, q1MemberId, navigate]);

  // ── Auth guard ────────────────────────────────────────────────────────────

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0A0604] flex items-center justify-center">
        <p className="text-amber-500">Sign in to begin your legacy.</p>
      </div>
    );
  }

  const mm = Math.floor(recordSeconds / 60);
  const ss = recordSeconds % 60;

  // ─── LAUNCHING overlay ────────────────────────────────────────────────────

  if (phase === "launching") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-[fadeIn_0.5s_ease-out]">
        <div className="text-center px-6">
          <div className="animate-[fadeIn_1.2s_ease-out_0.3s_both]">
            <p className="text-xs text-amber-700 uppercase tracking-[0.3em] mb-4">Your World Awakens</p>
            <h1 className="text-4xl font-black text-amber-300 mb-2 tracking-wide">Legacy Begins</h1>
            <p className="text-sm text-amber-600 mb-8">Generating your family's story…</p>
          </div>
          <div className="animate-[fadeIn_0.8s_ease-out_1s_both]">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  // ─── WORLD REGEN overlay ──────────────────────────────────────────────────

  if (phase === "quest1_complete" && regen) {
    return (
      <WorldRegenCard
        regen={regen}
        loading={false}
        onContinue={() => { setRegen(null); setPhase("quest2"); }}
      />
    );
  }
  if (phase === "quest2_complete" && regen) {
    return (
      <WorldRegenCard
        regen={regen}
        loading={false}
        onContinue={() => { setRegen(null); setPhase("quest3"); }}
      />
    );
  }
  if (phase === "quest3_complete" && regen) {
    return (
      <WorldRegenCard
        regen={regen}
        loading={false}
        onContinue={() => { setRegen(null); setPhase("awakened"); }}
      />
    );
  }

  // ─── SPLASH ───────────────────────────────────────────────────────────────

  if (phase === "splash") {
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center text-center px-6"
        style={{ background: "radial-gradient(ellipse at top, #1a1308 0%, #0a0604 70%)" }}
      >
        {/* Ambient particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-amber-400/15"
              style={{
                width: `${1 + (i % 3)}px`,
                height: `${1 + (i % 3)}px`,
                top: `${(i * 41) % 100}%`,
                left: `${(i * 67) % 100}%`,
                animation: `pulse ${2.5 + (i % 4)}s ease-in-out ${i * 0.15}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Logo */}
        <div className="relative z-10 animate-[fadeIn_1s_ease-out]">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/10">
            <BookHeart className="w-10 h-10 text-amber-400" />
          </div>
          <p className="text-xs text-amber-700 uppercase tracking-[0.4em] mb-2">Niakofa Legacy</p>
          <h1 className="text-3xl font-black text-amber-100 mb-2 leading-tight">
            Awaken<br />the Legacy
          </h1>
          <p className="text-sm text-amber-600/80 max-w-xs mx-auto leading-relaxed mt-4">
            Your family's world has faded.<br />Only memories remain.<br />Together, we will bring it back to life.
          </p>
        </div>

        {/* Chapter 0 badge */}
        <div className="relative z-10 mt-8 mb-8 animate-[fadeIn_1s_ease-out_0.5s_both]">
          <div className="inline-flex items-center gap-2 bg-amber-900/30 border border-amber-700/30 rounded-full px-4 py-2">
            <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Chapter 0</span>
            <span className="text-amber-700">·</span>
            <span className="text-xs text-amber-600">3 quests to awaken your world</span>
          </div>
        </div>

        {/* Quest preview pills */}
        <div className="relative z-10 flex flex-col gap-2 w-full max-w-xs mb-10 animate-[fadeIn_1s_ease-out_0.8s_both]">
          {[
            { icon: Users,  text: "Add your oldest relative" },
            { icon: Mic,    text: "Record a family memory" },
            { icon: MapPin, text: "Pin a meaningful place" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-3 bg-amber-900/20 border border-amber-800/30 rounded-xl px-4 py-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <p className="text-sm text-amber-200/80">{text}</p>
            </div>
          ))}
        </div>

        {/* Begin */}
        <button
          onClick={handleBeginJourney}
          className="relative z-10 w-full max-w-xs bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-4 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 animate-[fadeIn_1s_ease-out_1.2s_both]"
        >
          <Play className="w-4 h-4" /> Begin Journey
        </button>
      </div>
    );
  }

  // ─── AWAKENED ────────────────────────────────────────────────────────────

  if (phase === "awakened") {
    return (
      <div
        className="fixed inset-0 z-40 flex flex-col items-center justify-center text-center px-6 animate-[fadeIn_0.6s_ease-out]"
        style={{ background: "radial-gradient(ellipse at top, #1a1308 0%, #0a0604 70%)" }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-amber-400/20"
              style={{
                width: `${1 + (i % 4)}px`,
                height: `${1 + (i % 4)}px`,
                top: `${(i * 37) % 100}%`,
                left: `${(i * 53) % 100}%`,
                animation: `pulse ${1.5 + (i % 4)}s ease-in-out ${i * 0.1}s infinite`,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 max-w-sm w-full">
          {/* Trophy */}
          <div className="w-20 h-20 rounded-3xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/20 animate-pulse">
            <Sparkles className="w-10 h-10 text-amber-300" />
          </div>

          <p className="text-xs text-amber-600 uppercase tracking-[0.4em] mb-2">Chapter 0 Complete</p>
          <h1 className="text-3xl font-black text-amber-100 mb-4">Legacy Awakened!</h1>
          <p className="text-sm text-amber-400/80 leading-relaxed mb-8">
            Your family's world is beginning to awaken.<br />
            New chapters are now available.
          </p>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { icon: Users,  label: "Ancestor", value: q1Name || "Added" },
              { icon: Mic,    label: "Memory",   value: "Recorded" },
              { icon: MapPin, label: "Place",    value: q3PlaceName || "Pinned" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3 text-center">
                <Icon className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <p className="text-xs text-amber-700 uppercase tracking-wider">{label}</p>
                <p className="text-xs font-bold text-amber-300 truncate mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleBeginLegacy}
            className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-5 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30"
          >
            <Play className="w-4 h-4" /> Begin Your Journey
          </button>
          <p className="text-xs text-amber-800 mt-4">
            Chapter I · Estimated 12 minutes
          </p>
        </div>
      </div>
    );
  }

  // ─── QUEST SCREENS ────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen pb-8 pt-6 px-4"
      style={{ background: "linear-gradient(to bottom, #0A0604, #1A0F08)" }}
    >
      <div className="max-w-sm mx-auto">

        {/* Top progress */}
        <QuestProgress current={phase === "quest1" ? 1 : phase === "quest2" ? 2 : 3} />

        {/* ── QUEST 1 ─────────────────────────────────────────────────────── */}
        {phase === "quest1" && (
          <div className="animate-[fadeIn_0.5s_ease-out]">
            {/* Quest badge */}
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 mb-4">
              <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Quest 1 of 3</span>
            </div>

            <h2 className="text-2xl font-black text-amber-100 mb-1">The First Ancestor</h2>
            <p className="text-sm text-amber-600 mb-6 leading-relaxed">
              Every family world begins with someone.<br />Who is the first person you remember?
            </p>

            {/* Form */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={q1Name}
                  onChange={e => setQ1Name(e.target.value)}
                  placeholder="Nana Kwame Mensah"
                  className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Born (year)</label>
                  <input
                    type="number"
                    value={q1BirthYear}
                    onChange={e => setQ1BirthYear(e.target.value)}
                    placeholder="1872"
                    className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Village / Origin</label>
                  <input
                    type="text"
                    value={q1Village}
                    onChange={e => setQ1Village(e.target.value)}
                    placeholder="Kumasi, Ashanti"
                    className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Occupation</label>
                <input
                  type="text"
                  value={q1Occupation}
                  onChange={e => setQ1Occupation(e.target.value)}
                  placeholder="Gold Trader, Farmer, Teacher…"
                  className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Reward preview */}
            <div className="bg-amber-900/20 border border-amber-700/20 rounded-xl p-4 mb-6">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Reward</p>
              <div className="flex flex-wrap gap-2">
                {["Unlock Character", "Unlock Timeline", "+100 Legacy XP"].map(r => (
                  <span key={r} className="text-xs bg-amber-800/30 text-amber-400 px-2.5 py-1 rounded-full">{r}</span>
                ))}
              </div>
            </div>

            <button
              onClick={handleQ1Submit}
              disabled={loading || !q1Name.trim()}
              className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-4 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Add to Family
            </button>
          </div>
        )}

        {/* ── QUEST 2 ─────────────────────────────────────────────────────── */}
        {phase === "quest2" && (
          <div className="animate-[fadeIn_0.5s_ease-out]">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 mb-4">
              <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Quest 2 of 3</span>
            </div>

            <h2 className="text-2xl font-black text-amber-100 mb-1">Their Voice Lives On</h2>
            <p className="text-sm text-amber-600 mb-6 leading-relaxed">
              Record at least 30 seconds of a memory, story, or advice from a loved one.
            </p>

            {/* Recorder */}
            <div className="bg-[#1A1008] border border-amber-800/30 rounded-2xl p-5 mb-4">
              {/* Timer */}
              <div className="text-center mb-4">
                <p className="text-4xl font-black text-amber-300 font-mono">
                  {mm}:{ss.toString().padStart(2, "0")}
                </p>
                {recording && (
                  <p className="text-xs text-amber-600 mt-1 animate-pulse">● Recording…</p>
                )}
                {recordingDone && !recording && (
                  <p className="text-xs text-emerald-400 mt-1">Recording complete</p>
                )}
                {!recording && !recordingDone && (
                  <p className="text-xs text-amber-700 mt-1">Tap to begin recording</p>
                )}
              </div>

              {/* Waveform */}
              <div className="flex justify-center mb-4">
                <AudioWaveform active={recording} seconds={recordSeconds} />
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                {!recording && !recordingDone && (
                  <button
                    onClick={handleStartRecording}
                    className="flex-1 bg-rose-600 text-white font-black text-sm uppercase tracking-wide py-3.5 rounded-xl flex items-center justify-center gap-2 active:opacity-80"
                  >
                    <Mic className="w-4 h-4" /> Record
                  </button>
                )}
                {recording && (
                  <button
                    onClick={handleStopRecording}
                    className="flex-1 bg-amber-800 text-amber-200 font-black text-sm uppercase tracking-wide py-3.5 rounded-xl flex items-center justify-center gap-2 active:opacity-80"
                  >
                    <Square className="w-4 h-4" /> Stop
                  </button>
                )}
                {recordingDone && !recording && (
                  <>
                    <button
                      onClick={() => { setRecordingDone(false); setRecordSeconds(0); audioChunksRef.current = []; }}
                      className="flex-1 bg-[#2A1A0F] border border-amber-800/40 text-amber-500 font-bold text-xs uppercase tracking-wide py-3.5 rounded-xl flex items-center justify-center gap-1.5 active:opacity-70"
                    >
                      <Mic className="w-3.5 h-3.5" /> Re-record
                    </button>
                    <button
                      onClick={handleSaveRecording}
                      disabled={loading}
                      className="flex-1 bg-amber-500 text-amber-950 font-black text-xs uppercase tracking-wide py-3.5 rounded-xl flex items-center justify-center gap-1.5 active:opacity-80 disabled:opacity-50"
                    >
                      {loading || transcribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {transcribing ? "Saving…" : "Save Story"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Transcript preview */}
            {transcript && (
              <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Transcribed by Nia</p>
                <p className="text-xs text-emerald-200/80 leading-relaxed italic">"{transcript.slice(0, 200)}{transcript.length > 200 ? "…" : ""}"</p>
              </div>
            )}

            {/* Skip */}
            <button
              onClick={() => setPhase("quest3")}
              className="w-full text-xs text-amber-700 py-3 text-center"
            >
              Skip for now →
            </button>

            {/* Reward preview */}
            <div className="bg-amber-900/20 border border-amber-700/20 rounded-xl p-4 mt-2">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Unlocks</p>
              <div className="flex flex-wrap gap-2">
                {["New Dialogue", "Memory Quest", "Journal Entry", "Character Growth"].map(r => (
                  <span key={r} className="text-xs bg-amber-800/30 text-amber-400 px-2.5 py-1 rounded-full">{r}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── QUEST 3 ─────────────────────────────────────────────────────── */}
        {phase === "quest3" && (
          <div className="animate-[fadeIn_0.5s_ease-out]">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1 mb-4">
              <span className="text-xs font-black text-amber-500 uppercase tracking-widest">Quest 3 of 3</span>
            </div>

            <h2 className="text-2xl font-black text-amber-100 mb-1">Every Story Has a Place</h2>
            <p className="text-sm text-amber-600 mb-6 leading-relaxed">
              Pin a location that matters to your family.
            </p>

            {/* Place type selector */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              {PLACE_TYPES.map(({ id, label, icon: Icon, _desc }) => (
                <button
                  key={id}
                  onClick={() => setQ3PlaceType(id)}
                  className={`bg-[#2A1A0F] border rounded-xl p-3 text-center transition-all active:opacity-80 ${
                    q3PlaceType === id
                      ? "border-amber-500/60 bg-amber-500/10"
                      : "border-amber-800/30"
                  }`}
                >
                  <Icon className={`w-5 h-5 mx-auto mb-1.5 ${q3PlaceType === id ? "text-amber-400" : "text-amber-700"}`} />
                  <p className={`text-xs font-bold ${q3PlaceType === id ? "text-amber-300" : "text-amber-700"}`}>{label}</p>
                </button>
              ))}
            </div>

            {q3PlaceType && (
              <p className="text-xs text-amber-600 italic mb-4 text-center">
                {PLACE_TYPES.find(p => p.id === q3PlaceType)?.desc}
              </p>
            )}

            {/* Name + country */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Place Name *</label>
                <input
                  type="text"
                  value={q3PlaceName}
                  onChange={e => setQ3PlaceName(e.target.value)}
                  placeholder="Nana's House, St. Mary's Church…"
                  className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-amber-700 uppercase tracking-widest block mb-1.5">Country / Region</label>
                <input
                  type="text"
                  value={q3Country}
                  onChange={e => setQ3Country(e.target.value)}
                  placeholder="Ghana, USA, Nigeria…"
                  className="w-full bg-[#2A1A0F] border border-amber-800/40 rounded-xl px-4 py-3 text-sm text-amber-100 placeholder-amber-800 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>
            </div>

            {/* Reward */}
            <div className="bg-amber-900/20 border border-amber-700/20 rounded-xl p-4 mb-5">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Unlocks</p>
              <div className="flex flex-wrap gap-2">
                {["Map Expansion", "Exploration Quest", "New Location", "Fog Cleared"].map(r => (
                  <span key={r} className="text-xs bg-amber-800/30 text-amber-400 px-2.5 py-1 rounded-full">{r}</span>
                ))}
              </div>
            </div>

            <button
              onClick={handleQ3Submit}
              disabled={loading || !q3PlaceType || !q3PlaceName.trim()}
              className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-widest py-4 rounded-xl active:opacity-80 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
              Pin Place
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
