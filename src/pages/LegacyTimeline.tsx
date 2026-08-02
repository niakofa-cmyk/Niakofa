import { useState, useEffect } from "react";
import {
  ChevronLeft, Loader2, Calendar, MapPin, BookHeart, Mic, Camera,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import { getMemories, getChapters, type LegacyMemory, type LegacyChapter } from "@/lib/api";

export default function LegacyTimeline() {
  const [, navigate] = useRoute();
  const [memories, setMemories] = useState<LegacyMemory[]>([]);
  const [chapters, setChapters] = useState<LegacyChapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, ch] = await Promise.all([getMemories(), getChapters()]);
      setMemories(m);
      setChapters(ch);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen" style={{ background: "#1A0F08" }}>
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  type TimelineEntry = { year: number | null; title: string; location: string | null; source: string; type: "memory" | "chapter" };
  const entries: TimelineEntry[] = [
    ...memories.map(m => ({
      year: m.memory_date ? new Date(m.memory_date).getFullYear() : null,
      title: m.title,
      location: m.location_label,
      source: m.source,
      type: "memory" as const,
    })),
    ...chapters.map(c => ({
      year: c.year_start,
      title: c.title,
      location: c.location,
      source: "chapter",
      type: "chapter" as const,
    })),
  ].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Family Timeline</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-amber-500/40 via-amber-700/30 to-amber-900/20" />
          {entries.map((e, i) => (
            <div key={i} className="relative flex items-start gap-3 pb-5">
              <div className={`absolute -left-[18px] w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                e.type === "chapter" ? "bg-amber-500 border-amber-300" : "bg-teal-500 border-teal-300"
              }`} />
              <div className="flex-1 bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  {e.year && <span className="text-sm font-black text-amber-400">{e.year}</span>}
                  {e.type === "chapter" ? <BookHeart className="w-3.5 h-3.5 text-amber-500" /> :
                   e.source === "interview" ? <Mic className="w-3.5 h-3.5 text-rose-400" /> :
                   e.source === "upload" ? <Camera className="w-3.5 h-3.5 text-teal-400" /> :
                   <Calendar className="w-3.5 h-3.5 text-amber-500" />}
                </div>
                <p className="text-sm font-bold text-amber-200">{e.title}</p>
                {e.location && <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.location}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
