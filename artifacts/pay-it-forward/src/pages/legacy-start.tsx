/**
 * Legacy Start — Cinematic Ancestor Selection & Journey Begin
 * Route: /legacy/start
 *
 * The "Start Journey" experience. Instead of immediately showing a dashboard,
 * the player enters a cinematic onboarding:
 *
 *   "You awaken..."
 *     Year · Village · Name · Age · Occupation
 *     Known family memories · Recorded stories · Known locations
 *   Chapter I — Before the Journey
 *     "Your family remembers that..."
 *   BEGIN
 *
 * When the player taps Begin, a full-screen cinematic transition plays
 * (fade to black, ancestor name materializes, chapter title fades in)
 * before navigating to the first playable scene.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Play, Crown, MapPin, BookOpen, Mic,
  Camera, Users, Star, Loader2, Sparkles, Gift,
  Sunrise, Moon, Heart,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { toast } from "sonner";

interface AncestorCandidate {
  memberId: number;
  name: string;
  role: string;
  relation: string | null;
  birthYear: string | null;
  deathYear: string | null;
  storyCount: number;
  eventCount: number;
  placeCount: number;
  memoryCount: number;
  interviewCount: number;
  photoCount: number;
  completenessScore: number;
  selectionReason: string;
}

interface CompletenessResponse {
  familyId: number;
  readinessScore: number;
  chapterUnlockReady: boolean;
  threshold: number;
  dimensions: { key: string; label: string; score: number; max: number; count: number; hint: string }[];
  missingData: string[];
  suggestions: string[];
}

type CinematicPhase = "idle" | "awakening" | "chapter" | "transitioning";

export default function LegacyStartPage() {
  const [, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const [ancestors, setAncestors] = useState<AncestorCandidate[]>([]);
  const [completeness, setCompleteness] = useState<CompletenessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [welcomeData, setWelcomeData] = useState<{
    hasChanges: boolean;
    worldVersion: number;
    newMemoryCount: number;
    newMemberCount: number;
    recentChanges: { changeType: string; description: string | null; createdAt: string }[];
    newChapters: { id: number; title: string; chapterNumber: number }[];
    upcomingEvents: { title: string; eventType: string; triggerDate: string | null }[];
  } | null>(null);

  // Cinematic onboarding state
  const [cinematicPhase, setCinematicPhase] = useState<CinematicPhase>("idle");
  const [revealStep, setRevealStep] = useState(0);


  const loadData = useCallback(async () => {
    if (!currentUser) { setLoading(false); return; }
    setLoading(true);
    try {
      const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
      if (!famRes.ok) { setLoading(false); return; }
      const famData = await famRes.json() as { families?: { id: number }[] };
      if (!famData.families?.length) { setLoading(false); return; }
      const fid = famData.families[0].id;
      setFamilyId(fid);

      const [ancRes, compRes, versionRes, seasonalEventsRes] = await Promise.all([
        fetch(`/api/legacy/ancestors/${fid}`, { headers: authHeaders() }),
        fetch(`/api/legacy/completeness/${fid}`, { headers: authHeaders() }),
        fetch(`/api/legacy/world-evolution/${fid}/version-summary`, { headers: authHeaders() }).catch(() => null),
        fetch(`/api/legacy/seasonal-events/${fid}`, { headers: authHeaders() }).catch(() => null),
      ]);

      if (ancRes.ok) {
        const data = await ancRes.json() as { ancestors: AncestorCandidate[] };
        setAncestors(data.ancestors ?? []);
        if (data.ancestors?.length > 0) setSelectedId(data.ancestors[0].memberId);
      }
      if (compRes.ok) {
        setCompleteness(await compRes.json() as CompletenessResponse);
      }

      // Parse seasonal events independently — do not gate on versionRes success
      const upcomingEvents: { title: string; eventType: string; triggerDate: string | null }[] = [];
      if (seasonalEventsRes?.ok) {
        const seasonalData = await seasonalEventsRes.json() as {
          events?: { title: string; event_type: string; trigger_date: string | null }[];
        };
        upcomingEvents.push(
          ...(seasonalData.events ?? [])
            .filter((event) => event.trigger_date)
            .slice(0, 5)
            .map((event) => ({
              title: event.title,
              eventType: event.event_type,
              triggerDate: event.trigger_date,
            })),
        );
      }

      if (versionRes?.ok) {
        const versionData = await versionRes.json() as {
          currentVersion?: number;
          recentChanges?: { changeType: string; description: string | null; createdAt: string }[];
        };
        const recentChanges = versionData.recentChanges ?? [];
        const countChanges = (pattern: RegExp) =>
          recentChanges.reduce((total, change) => (
            pattern.test(change.changeType) ? total + 1 : total
          ), 0);
        setWelcomeData({
          hasChanges: recentChanges.length > 0,
          worldVersion: versionData.currentVersion ?? 0,
          newMemoryCount: countChanges(/memory|story|interview/i),
          newMemberCount: countChanges(/member|relation|character|ancestor/i),
          recentChanges,
          newChapters: [],
          upcomingEvents,
        });
      } else if (upcomingEvents.length > 0) {
        // Version summary unavailable but we still have seasonal events — show them
        setWelcomeData({
          hasChanges: false,
          worldVersion: 0,
          newMemoryCount: 0,
          newMemberCount: 0,
          recentChanges: [],
          newChapters: [],
          upcomingEvents,
        });
      }
    } catch {
      toast.error("Failed to load ancestor data");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Cinematic reveal sequence ──────────────────────────────────────────────
  // When the player selects an ancestor and taps "Enter Their World", we play
  // a staged reveal: year → location → name → age → occupation → family stats
  // → chapter preview → BEGIN button. Each step fades in with a slight delay.
  useEffect(() => {
    if (cinematicPhase !== "awakening") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const stepDelay = 700;
    for (let i = 1; i <= 7; i++) {
      timers.push(setTimeout(() => setRevealStep(i), i * stepDelay));
    }
    return () => timers.forEach(clearTimeout);
  }, [cinematicPhase]);

  // Cleanup ref so deferred navigations don't fire after unmount
  const navTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => { navTimersRef.current.forEach(clearTimeout); navTimersRef.current = []; };
  }, []);
  const safeNav = (path: string, delayMs: number) => {
    const id = setTimeout(() => navigate(path), delayMs);
    navTimersRef.current.push(id);
  };

  const handleBegin = useCallback(async () => {
    if (!familyId || !selectedId) return;
    setCinematicPhase("transitioning");
    setInitializing(true);
    try {
      const res = await fetch(`/api/legacy/chapters/${familyId}/init`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ preferredAncestorMemberId: selectedId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; suggestions?: string[] };
        toast.error(err.error ?? "Not enough vault data to begin");
        if (err.suggestions?.length) {
          toast.info(err.suggestions[0], { duration: 6000 });
        }
        setInitializing(false);
        setCinematicPhase("idle");
        return;
      }

      const data = await res.json() as { worldId: number; chapters: { id: number; status: string }[] };
      const firstChapter = data.chapters.find(c => c.status === "unlocked") ?? data.chapters[0];

      if (firstChapter) {
        // Mark chapter as in-progress
        await fetch(`/api/legacy/chapters/${firstChapter.id}/status`, {
          method: "PATCH",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ status: "in_progress" }),
        }).catch(() => { /* non-fatal */ });

        // Create a play session so the chapter page can restore stats and
        // save progress from the very first scene, not just when the first
        // choice is made.
        const sessionRes = await fetch(`/api/legacy/sessions`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            familyId,
            worldId: data.worldId,
            ancestorMemberId: selectedId,
            chapterId: firstChapter.id,
          }),
        }).catch(() => null);

        if (!sessionRes?.ok) {
          // Non-fatal: warn the player but still navigate to the chapter.
          // legacy-play will fall back to chapter-based routing, and the chapter
          // page will create a fresh session on the first progress save.
          toast.warning("Journey started — your progress will sync on your first action.", {
            duration: 5000,
          });
          // Store chapter ID so /legacy/play can recover without an active session
          try {
            localStorage.setItem("legacy:lastChapterId", String(firstChapter.id));
          } catch { /* ignore */ }
        }

        // Hold the cinematic transition for 2.5s before navigating
        safeNav(`/legacy/chapter/${firstChapter.id}`, 2500);
      } else {
        safeNav("/legacy", 2000);
      }
    } catch {
      toast.error("Failed to start journey");
      setInitializing(false);
      setCinematicPhase("idle");
    }
  }, [familyId, selectedId, navigate]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1008] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-xs text-amber-700 uppercase tracking-widest">Consulting the ancestors…</p>
        </div>
      </div>
    );
  }

  const selected = ancestors.find(a => a.memberId === selectedId);
  const ready = completeness?.chapterUnlockReady ?? false;

  // ── Cinematic transition overlay ───────────────────────────────────────────
  if (cinematicPhase === "transitioning") {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-[fadeIn_0.5s_ease-out]">
        <div className="text-center px-6">
          {/* Ancestor name materializes */}
          <div className="animate-[fadeIn_1.2s_ease-out_0.3s_both]">
            <p className="text-xs text-amber-700 uppercase tracking-[0.3em] mb-4">You awaken as</p>
            <h1 className="text-4xl font-black text-amber-300 mb-2 tracking-wide">
              {selected?.name ?? "Your Ancestor"}
            </h1>
            {selected?.birthYear && (
              <p className="text-sm text-amber-600 mb-6">
                {selected.birthYear}
                {selected.role ? ` · ${selected.role}` : ""}
              </p>
            )}
          </div>
          {/* Chapter title fades in */}
          <div className="animate-[fadeIn_1s_ease-out_1.2s_both]">
            <div className="w-16 h-px bg-amber-700/40 mx-auto mb-4" />
            <p className="text-xs text-amber-700 uppercase tracking-[0.3em] mb-2">Chapter I</p>
            <p className="text-lg font-bold text-amber-200/80 italic">Before the Journey</p>
          </div>
          {/* Loading spinner */}
          <div className="mt-8 animate-[fadeIn_0.8s_ease-out_2s_both]">
            <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" />
            <p className="text-xs text-amber-800 mt-2 uppercase tracking-widest">Entering the world…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Cinematic "You awaken..." onboarding ─────────────────────────────────────
  if (cinematicPhase === "awakening" && selected) {
    const birthYear = selected.birthYear ? parseInt(selected.birthYear) : null;
    const deathYear = selected.deathYear ? parseInt(selected.deathYear) : null;
    const refYear = deathYear ?? new Date().getFullYear();
    const age = birthYear ? Math.max(0, refYear - birthYear) : null;
    const revealItems = [
      { label: "Year",      value: selected.birthYear ?? "Unknown",     icon: BookOpen },
      { label: "Location", value: selected.role ?? "The Homeland",     icon: MapPin },
      { label: "Name",      value: selected.name,                        icon: Crown },
      { label: "Age",       value: age ? String(age) : "Unknown",        icon: Sunrise },
      { label: "Occupation",value: selected.role ?? "Unknown",          icon: Star },
    ];

    return (
      <div className="fixed inset-0 z-40 bg-[#0A0604] flex flex-col animate-[fadeIn_0.8s_ease-out]">
        {/* Ambient starlight particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-amber-400/20"
              style={{
                width: `${1 + (i % 3)}px`,
                height: `${1 + (i % 3)}px`,
                top: `${(i * 37) % 100}%`,
                left: `${(i * 53) % 100}%`,
                animation: `pulse ${2 + (i % 4)}s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Back button */}
        <button
          onClick={() => { setCinematicPhase("idle"); setRevealStep(0); }}
          className="absolute top-4 left-4 z-10 text-amber-700 active:opacity-70 p-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          {/* "You awaken..." */}
          <div className={`transition-all duration-1000 ${revealStep >= 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <p className="text-center text-amber-500/60 text-sm uppercase tracking-[0.3em] mb-8">
              You awaken…
            </p>
          </div>

          {/* Reveal items one by one */}
          <div className="space-y-4 mb-8 max-w-sm w-full">
            {revealItems.map((item, i) => {
              const visible = revealStep > i;
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className={`flex items-center gap-4 transition-all duration-700 ${
                    visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
                  }`}
                  style={{ transitionDelay: `${i * 100}ms` }}
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-700/20 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-amber-700 uppercase tracking-widest">{item.label}</p>
                    <p className="text-base font-bold text-amber-200">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Family stats */}
          <div className={`transition-all duration-1000 ${revealStep >= 6 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="flex gap-6 mb-8">
              <div className="text-center">
                <BookOpen className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-black text-amber-300">{selected.storyCount}</p>
                <p className="text-xs text-amber-700 uppercase">Stories</p>
              </div>
              <div className="text-center">
                <Camera className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-black text-amber-300">{selected.memoryCount}</p>
                <p className="text-xs text-amber-700 uppercase">Memories</p>
              </div>
              <div className="text-center">
                <MapPin className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                <p className="text-lg font-black text-amber-300">{selected.placeCount}</p>
                <p className="text-xs text-amber-700 uppercase">Places</p>
              </div>
            </div>
          </div>

          {/* Chapter preview */}
          {revealStep >= 7 && (
            <div className="max-w-sm w-full animate-[fadeIn_1s_ease-out]">
              <div className="bg-amber-900/10 border border-amber-700/20 rounded-2xl p-5 mb-6">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-[0.2em] mb-2">Chapter I</p>
                <p className="text-sm font-bold text-amber-200 mb-2">Before the Journey</p>
                <p className="text-xs text-amber-400/70 leading-relaxed italic">
                  {selected.storyCount > 0
                    ? `Your family remembers ${selected.name}. ${selected.selectionReason}. Walk in their footsteps and discover the world they knew.`
                    : `${selected.name} is waiting to be discovered. Add stories and memories to bring their world to life.`}
                </p>
              </div>
              <button
                onClick={handleBegin}
                disabled={!ready || initializing}
                className={`w-full font-black text-sm uppercase tracking-[0.2em] py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                  ready && !initializing
                    ? "bg-amber-500 text-amber-950 active:opacity-80 shadow-lg shadow-amber-500/20"
                    : "bg-amber-900/30 text-amber-700 cursor-not-allowed"
                }`}
              >
                {initializing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating chapters…</>
                ) : (
                  <><Play className="w-4 h-4" /> Begin</>
                )}
              </button>
              {!ready && (
                <p className="text-xs text-amber-700 text-center mt-3 italic">
                  Readiness at {completeness?.readinessScore ?? 0}%. Add more vault data to unlock chapters.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Day/night cycle indicator at bottom */}
        <div className="px-6 pb-8 flex items-center justify-center gap-2 relative z-10">
          <Sunrise className={`w-4 h-4 transition-opacity duration-1000 ${revealStep >= 1 ? "text-amber-400" : "text-amber-900"}`} />
          <div className="w-16 h-px bg-gradient-to-r from-amber-700/20 via-amber-500/40 to-amber-700/20" />
          <Moon className={`w-4 h-4 transition-opacity duration-1000 ${revealStep >= 7 ? "text-amber-400" : "text-amber-900"}`} />
        </div>
      </div>
    );
  }

  // ── Main selection screen ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#1A1008] text-amber-100 pb-8 animate-[fadeIn_0.6s_ease-out]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Start Journey</h1>
      </div>

      {/* Hero text */}
      <div className="px-6 pt-8 pb-6 text-center animate-[fadeIn_0.8s_ease-out_0.2s_both]">
        <Sparkles className="w-6 h-6 text-amber-500 mx-auto mb-3 animate-pulse" />
        <p className="text-lg font-bold text-amber-200 leading-relaxed">
          Tonight, you will walk in the footsteps of someone who came before you.
        </p>
      </div>

      {/* Welcome Back — daily summary of world changes */}
      {welcomeData && welcomeData.hasChanges && (
        <div className="px-4 mb-6">
          <div className="bg-gradient-to-b from-[#2A1A0F] to-[#1A1008] border border-amber-600/30 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gift className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">Welcome Back</h3>
            </div>
            <div className="space-y-2">
              {welcomeData.worldVersion > 0 && (
                <p className="text-xs text-amber-300">
                  Your family world is at Version {welcomeData.worldVersion}.
                </p>
              )}
              {welcomeData.newMemoryCount > 0 && (
                <p className="text-xs text-amber-200">
                  {welcomeData.newMemoryCount} new {welcomeData.newMemoryCount === 1 ? "memory" : "memories"} added since your last visit.
                </p>
              )}
              {welcomeData.newMemberCount > 0 && (
                <p className="text-xs text-amber-200">
                  {welcomeData.newMemberCount} new {welcomeData.newMemberCount === 1 ? "family member" : "family members"} added.
                </p>
              )}
              {welcomeData.newChapters.length > 0 && (
                <p className="text-xs text-emerald-300">
                  {welcomeData.newChapters.length} new {welcomeData.newChapters.length === 1 ? "chapter" : "chapters"} unlocked!
                </p>
              )}
              {welcomeData.recentChanges.slice(0, 3).map((c, i) => (
                <div key={i} className="text-xs text-amber-500/70 italic border-l border-amber-700/30 pl-2">
                  {c.description ?? c.changeType.replace(/_/g, " ")}
                </div>
              ))}
              {welcomeData.upcomingEvents.length > 0 && (
                <p className="text-xs text-rose-300 pt-1">
                  Upcoming: {welcomeData.upcomingEvents[0].title}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Readiness score */}
      {completeness && (
        <div className="px-4 mb-6">
          <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Journey Readiness</span>
              <span className={`text-sm font-black ${ready ? "text-emerald-400" : "text-amber-500"}`}>
                {completeness.readinessScore}%
              </span>
            </div>
            <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${completeness.readinessScore}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {completeness.dimensions.map(d => (
                <div key={d.key} className="text-center">
                  <p className="text-xs text-amber-700">{d.label}</p>
                  <p className="text-xs font-bold text-amber-400">{d.score}/{d.max}</p>
                </div>
              ))}
            </div>
            {!ready && completeness.suggestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-900/30">
                <p className="text-xs text-amber-600 mb-1">To unlock playable chapters:</p>
                {completeness.suggestions.slice(0, 2).map((s, i) => (
                  <p key={i} className="text-xs text-amber-500 leading-relaxed">• {s}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ancestor selection */}
      {ancestors.length === 0 ? (
        <div className="px-6 text-center py-8">
          <Users className="w-10 h-10 text-amber-800 mx-auto mb-3" />
          <p className="text-sm text-amber-600 mb-4">No family members found yet.</p>
          <button
            onClick={() => navigate("/diaspora/tree")}
            className="bg-amber-500 text-amber-950 font-bold text-xs uppercase tracking-wide px-6 py-3 rounded-xl active:opacity-80"
          >
            Add Family Members
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 mb-4">
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Choose Your Ancestor</h2>
            <div className="space-y-3">
              {ancestors.map((a) => {
                const isSelected = a.memberId === selectedId;
                return (
                  <button
                    key={a.memberId}
                    onClick={() => setSelectedId(a.memberId)}
                    className={`w-full text-left rounded-2xl p-4 border transition-all ${
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/50 shadow-lg"
                        : "bg-[#2A1A0F] border-amber-900/30 active:opacity-70"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? "bg-amber-500/20" : "bg-amber-900/30"
                      }`}>
                        <Crown className={`w-5 h-5 ${isSelected ? "text-amber-400" : "text-amber-700"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-amber-200">{a.name}</p>
                        {a.relation && <p className="text-xs text-amber-600">{a.relation}</p>}
                        {a.birthYear && (
                          <p className="text-xs text-amber-700 mt-0.5">
                            Born: {a.birthYear}{a.deathYear ? ` — Died: ${a.deathYear}` : ""}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2">
                          {a.storyCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <BookOpen className="w-3 h-3" /> {a.storyCount} stories
                            </span>
                          )}
                          {a.memoryCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Star className="w-3 h-3" /> {a.memoryCount} memories
                            </span>
                          )}
                          {a.interviewCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Mic className="w-3 h-3" /> {a.interviewCount} interviews
                            </span>
                          )}
                          {a.photoCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-amber-500">
                              <Camera className="w-3 h-3" /> {a.photoCount} photos
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-amber-700 mt-1 italic">{a.selectionReason}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-amber-700">Score</p>
                        <p className={`text-sm font-black ${isSelected ? "text-amber-400" : "text-amber-600"}`}>
                          {a.completenessScore}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected ancestor preview + Enter Their World button */}
          {selected && (
            <div className="px-4 mb-6">
              <div className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-5">
                <div className="text-center mb-4">
                  <p className="text-xs text-amber-600 uppercase tracking-wide mb-1">Your Ancestor</p>
                  <p className="text-xl font-black text-amber-200">{selected.name}</p>
                  {selected.birthYear && (
                    <p className="text-xs text-amber-700 mt-1">
                      Born: {selected.birthYear}{selected.deathYear ? ` — Died: ${selected.deathYear}` : ""}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                    <BookOpen className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-[10px] text-amber-700">Stories</p>
                    <p className="text-sm font-bold text-amber-400">{selected.storyCount}</p>
                  </div>
                  <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                    <Camera className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-[10px] text-amber-700">Memories</p>
                    <p className="text-sm font-bold text-amber-400">{selected.memoryCount}</p>
                  </div>
                  <div className="bg-[#3A2A1A] rounded-xl p-3 text-center">
                    <MapPin className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-[10px] text-amber-700">Places</p>
                    <p className="text-sm font-bold text-amber-400">{selected.placeCount}</p>
                  </div>
                </div>
                {/* RPG Stats */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-sky-400">Knowledge</span>
                    <span className="text-sky-400">{Math.min(100, (selected.storyCount * 10) + (selected.memoryCount * 5))}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-sky-500 rounded-full" style={{ width: `${Math.min(100, (selected.storyCount * 10) + (selected.memoryCount * 5))}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-rose-400">Relationships</span>
                    <span className="text-rose-400">{Math.min(100, selected.eventCount * 15)}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, selected.eventCount * 15)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-amber-400">Cultural Wisdom</span>
                    <span className="text-amber-400">{Math.min(100, selected.interviewCount * 25)}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, selected.interviewCount * 25)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-emerald-400">Courage</span>
                    <span className="text-emerald-400">{Math.min(100, selected.completenessScore)}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, selected.completenessScore)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-teal-400">Legacy</span>
                    <span className="text-teal-400">{Math.min(100, selected.placeCount * 15)}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full" style={{ width: `${Math.min(100, selected.placeCount * 15)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-pink-400">Faith</span>
                    <span className="text-pink-400">{Math.min(100, selected.interviewCount * 15 + selected.storyCount * 5)}</span>
                  </div>
                  <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(100, selected.interviewCount * 15 + selected.storyCount * 5)}%` }} />
                  </div>
                </div>
                {/* Chapter Preview */}
                <div className="bg-[#1A1008] border border-amber-900/30 rounded-xl p-3 mb-4">
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">Chapter I</p>
                  <p className="text-xs text-amber-400/80 leading-relaxed">
                    {selected.storyCount > 0
                      ? `Your family remembers ${selected.name}. ${selected.selectionReason}. Walk in their footsteps and discover the world they knew.`
                      : `${selected.name} is waiting to be discovered. Add stories and memories to bring their world to life.`}
                  </p>
                </div>
                <p className="text-xs text-amber-600 text-center italic mb-4">
                  {ready
                    ? "Chapter I is ready. Your journey begins now."
                    : `Readiness at ${completeness?.readinessScore ?? 0}%. Add more vault data to unlock chapters.`}
                </p>
                {/* Enter Their World — triggers cinematic onboarding */}
                <button
                  onClick={() => { setRevealStep(0); setCinematicPhase("awakening"); }}
                  disabled={!ready}
                  className={`w-full font-black text-sm uppercase tracking-[0.2em] py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                    ready
                      ? "bg-gradient-to-r from-amber-600 to-amber-500 text-amber-950 active:opacity-80 shadow-lg shadow-amber-500/20"
                      : "bg-amber-900/30 text-amber-700 cursor-not-allowed"
                  }`}
                >
                  <Sparkles className="w-4 h-4" /> Enter Their World
                </button>
                {!ready && (
                  <button
                    onClick={() => navigate("/diaspora/family")}
                    className="mt-2 w-full text-xs text-amber-500 underline py-2"
                  >
                    Add more family data →
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
