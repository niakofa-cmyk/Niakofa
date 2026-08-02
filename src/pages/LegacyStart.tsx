import { useState, useEffect, useCallback } from "react";
import {
  BookHeart, Play, ChevronRight, ChevronLeft, Crown,
  Sparkles, MapPin, Calendar, Users, Mic, Camera, FileText,
  Loader2, Star, Zap,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import {
  getAncestors, getChapters, getActiveSession,
  type LegacyAncestor, type LegacyChapter, type LegacySession,
} from "@/lib/api";

function memberInitials(name: string): string {
  return name.split(" ").map(p => p[0] ?? "").join("").slice(0, 2).toUpperCase() || "?";
}

export default function LegacyStart() {
  const [, navigate] = useRoute();
  const [ancestors, setAncestors] = useState<LegacyAncestor[]>([]);
  const [chapters, setChapters] = useState<LegacyChapter[]>([]);
  const [session, setSession] = useState<LegacySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const [anc, ch, sess] = await Promise.all([getAncestors(), getChapters(), getActiveSession()]);
      setAncestors(anc);
      setChapters(ch);
      setSession(sess);
      if (sess) {
        const idx = anc.findIndex(a => a.id === sess.ancestor_id);
        if (idx >= 0) setSelectedIdx(idx);
      }
      setLoading(false);
    })();
  }, []);

  const handleBegin = useCallback(() => {
    if (!ancestors[selectedIdx]) return;
    setStarting(true);
    const inProgress = chapters.find(c => c.status === "in_progress" || c.status === "unlocked");
    if (inProgress) {
      setTimeout(() => navigate(`legacy/chapter/${inProgress.id}`), 600);
    } else {
      const firstChapter = chapters[0];
      if (firstChapter) setTimeout(() => navigate(`legacy/chapter/${firstChapter.id}`), 600);
    }
  }, [ancestors, selectedIdx, chapters, navigate]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ background: "#1A0F08" }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const ancestor = ancestors[selectedIdx];
  const ancestorChapters = ancestor ? chapters.filter(c => c.ancestor_id === ancestor.id) : [];
  const activeChapter = ancestorChapters.find(c => c.status === "in_progress") ?? ancestorChapters.find(c => c.status === "unlocked") ?? ancestorChapters[0];

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Start Journey</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Intro text */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-lg font-black text-amber-100 uppercase tracking-widest mb-2">Tonight, you will walk in the footsteps of someone who came before you.</h2>
          <p className="text-xs text-amber-700">Choose your ancestor to begin.</p>
        </div>

        {/* Ancestor Selection */}
        {ancestors.length > 0 && (
          <>
            {/* Main ancestor card */}
            <div className="bg-gradient-to-br from-amber-900/30 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-5 shadow-xl mb-4">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-20 h-20 rounded-xl bg-amber-900/40 border border-amber-700/30 flex items-center justify-center flex-shrink-0 text-2xl font-black text-amber-400">
                  {memberInitials(ancestor.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xl font-black text-amber-100">{ancestor.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs text-amber-500 bg-amber-900/30 px-2 py-0.5 rounded-full capitalize">{ancestor.role}</p>
                    {ancestor.relation && <p className="text-xs text-amber-600">{ancestor.relation}</p>}
                  </div>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-[#3A2A1A] rounded-lg px-3 py-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div><p className="text-xs text-amber-700">Born</p><p className="text-sm font-bold text-amber-300">{ancestor.birth_year ?? "Unknown"}</p></div>
                </div>
                <div className="bg-[#3A2A1A] rounded-lg px-3 py-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div><p className="text-xs text-amber-700">From</p><p className="text-sm font-bold text-amber-300 truncate">{ancestor.birth_location ?? "Unknown"}</p></div>
                </div>
              </div>

              {/* Data summary */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[
                  { icon: BookHeart, label: "Memories", value: ancestor.memory_count },
                  { icon: FileText, label: "Stories", value: ancestor.story_count },
                  { icon: Mic, label: "Interviews", value: ancestor.interview_count },
                  { icon: Camera, label: "Photos", value: ancestor.photo_count },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="text-center bg-[#3A2A1A] rounded-lg p-2">
                    <Icon className="w-4 h-4 text-amber-500 mx-auto mb-1" />
                    <p className="text-sm font-black text-amber-300">{value}</p>
                    <p className="text-xs text-amber-700">{label}</p>
                  </div>
                ))}
              </div>

              {/* Selection reason */}
              <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  <p className="text-xs font-bold text-purple-300 uppercase tracking-wide">Why this ancestor?</p>
                </div>
                <p className="text-xs text-purple-200/80 italic leading-relaxed">{ancestor.selection_reason}</p>
              </div>

              {/* Chapter preview */}
              {activeChapter && (
                <div className="bg-[#3A2A1A] rounded-xl p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                      <BookHeart className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-amber-200 uppercase tracking-wide">Chapter {activeChapter.chapter_number}</p>
                      <p className="text-sm font-bold text-amber-100">{activeChapter.title}</p>
                    </div>
                  </div>
                  {activeChapter.synopsis && <p className="text-xs text-amber-600 leading-relaxed">{activeChapter.synopsis}</p>}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-amber-500 capitalize">{activeChapter.status}</span>
                    {activeChapter.era && <span className="text-xs text-amber-700">· {activeChapter.era}</span>}
                    {activeChapter.year_start && <span className="text-xs text-amber-700">· {activeChapter.year_start}{activeChapter.year_end ? `–${activeChapter.year_end}` : ""}</span>}
                  </div>
                </div>
              )}

              {/* Begin button */}
              <button onClick={handleBegin} disabled={starting}
                className="w-full bg-amber-500 text-amber-950 font-black text-sm uppercase tracking-wide py-3.5 rounded-xl active:opacity-80 flex items-center justify-center gap-2 transition-opacity">
                {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {starting ? "Entering your world..." : "Begin Journey"}
              </button>
            </div>

            {/* Ancestor carousel */}
            {ancestors.length > 1 && (
              <div className="mb-4">
                <h3 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Other Ancestors</h3>
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 min-w-max px-1">
                    {ancestors.map((a, i) => (
                      <button key={a.id} onClick={() => setSelectedIdx(i)}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all active:opacity-70 ${
                          i === selectedIdx ? "bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500" : "bg-[#2A1A0F] border-amber-900/30"
                        }`} style={{ minWidth: 100 }}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black ${i === selectedIdx ? "bg-amber-500/30 text-amber-300" : "bg-amber-900/40 text-amber-700"}`}>
                          {memberInitials(a.name)}
                        </div>
                        <p className="text-xs font-bold text-amber-200 text-center leading-tight line-clamp-2" style={{ maxWidth: 90 }}>{a.name}</p>
                        <p className="text-xs text-amber-700">{a.birth_year ?? "?"}</p>
                        {a.completeness_score > 60 && <Star className="w-3 h-3 text-amber-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {ancestors.length === 0 && (
          <div className="text-center py-12">
            <BookHeart className="w-12 h-12 text-amber-900 mx-auto mb-4" />
            <p className="text-sm text-amber-600 mb-2">No playable ancestors yet.</p>
            <p className="text-xs text-amber-700">Add family members to your tree to unlock the Legacy Mode.</p>
          </div>
        )}
      </div>
    </div>
  );
}
