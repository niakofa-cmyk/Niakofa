import { useState, useEffect } from "react";
import {
  ChevronLeft, Loader2, CheckCircle2, Lock, Star,
  Trophy, BookHeart, Globe2, Users, Mic, Map as MapIcon,
  Search, Heart, Crown, Leaf,
  type LucideIcon,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import { getAchievements, type LegacyAchievement } from "@/lib/api";

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Trophy, BookHeart, Globe2, Users, Mic, Map: MapIcon, Search, Heart, Crown, Leaf,
};

export default function LegacyAchievements() {
  const [, navigate] = useRoute();
  const [achievements, setAchievements] = useState<LegacyAchievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const ach = await getAchievements();
      setAchievements(ach);
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

  const unlocked = achievements.filter(a => a.is_unlocked);
  const locked = achievements.filter(a => !a.is_unlocked);

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Achievements</h1>
          <p className="text-xs text-amber-700">{unlocked.length} unlocked · {locked.length} in progress</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Summary */}
        <div className="bg-gradient-to-br from-amber-900/30 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-700 uppercase tracking-widest">Achievement Progress</p>
              <p className="text-3xl font-black text-amber-400">{Math.round((unlocked.length / achievements.length) * 100)}%</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-amber-950 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${(unlocked.length / achievements.length) * 100}%` }} />
          </div>
        </div>

        {/* Unlocked achievements */}
        {unlocked.length > 0 && (
          <div className="mb-5">
            <h2 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Unlocked
            </h2>
            <div className="space-y-2.5">
              {unlocked.map(a => {
                const Icon = ACHIEVEMENT_ICONS[a.icon_name] ?? Trophy;
                return (
                  <div key={a.id} className="bg-gradient-to-r from-emerald-900/20 to-[#2A1A0F] border border-emerald-700/30 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-100">{a.title}</p>
                      <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">{a.description}</p>
                      <p className="text-xs text-emerald-400 mt-1">Unlocked</p>
                    </div>
                    <Star className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* In progress achievements */}
        {locked.length > 0 && (
          <div>
            <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" /> In Progress
            </h2>
            <div className="space-y-2.5">
              {locked.map(a => {
                const Icon = ACHIEVEMENT_ICONS[a.icon_name] ?? Trophy;
                const pct = Math.min(100, Math.round((a.current_progress / a.target_progress) * 100));
                return (
                  <div key={a.id} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#3A2A1A] flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-amber-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-200">{a.title}</p>
                      <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">{a.description}</p>
                      <div className="mt-2 h-1.5 rounded-full bg-amber-900/40 overflow-hidden">
                        <div className="h-full rounded-full bg-amber-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-amber-700 mt-1">{a.current_progress} / {a.target_progress}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
