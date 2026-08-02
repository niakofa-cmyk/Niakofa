import { useState, useEffect } from "react";
import {
  ChevronLeft, Loader2, Sparkles, TrendingUp,
  BookHeart, Users, MapPin, Target, BookOpen, Crown, Star,
} from "lucide-react";
import { useRoute } from "@/lib/router";
import { getWorldVersions, getWorld, type LegacyWorldVersion, type LegacyWorld } from "@/lib/api";

export default function LegacyWorldEvolution() {
  const [, navigate] = useRoute();
  const [versions, setVersions] = useState<LegacyWorldVersion[]>([]);
  const [world, setWorld] = useState<LegacyWorld | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [v, w] = await Promise.all([getWorldVersions(), getWorld()]);
      setVersions(v);
      setWorld(w);
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

  const totalNew = versions.reduce((acc, v) => ({
    stories: acc.stories + v.new_stories,
    characters: acc.characters + v.new_characters,
    places: acc.places + v.new_places,
    quests: acc.quests + v.new_quests,
    chapters: acc.chapters + v.new_chapters,
    landmarks: acc.landmarks + v.new_landmarks,
    collectibles: acc.collectibles + v.new_collectibles,
  }), { stories: 0, characters: 0, places: 0, quests: 0, chapters: 0, landmarks: 0, collectibles: 0 });

  return (
    <div className="min-h-screen pb-20" style={{ background: "#1A0F08" }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "linear-gradient(to bottom, #0A0604 0%, #1A0F08 100%)", borderBottom: "1px solid rgba(180,120,40,0.15)" }}>
        <button onClick={() => navigate("legacy")} className="text-amber-500 active:opacity-70"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">World Evolution</h1>
          <p className="text-xs text-amber-700">Your family world is alive and growing</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        {/* Current version banner */}
        {world && (
          <div className="bg-gradient-to-br from-teal-900/30 to-[#2A1A0F] border border-teal-700/30 rounded-2xl p-5 shadow-xl mb-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-teal-400" />
              <p className="text-xs font-black text-teal-300 uppercase tracking-widest">Your Family World Has Evolved</p>
            </div>
            <p className="text-4xl font-black text-amber-400 mb-1">Version {world.world_version}</p>
            <p className="text-xs text-amber-600">Built from {versions.length} generations of family knowledge</p>
          </div>
        )}

        {/* Total growth stats */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {[
            { icon: BookHeart, label: "Stories Added", value: totalNew.stories, color: "text-amber-400" },
            { icon: Users, label: "New Characters", value: totalNew.characters, color: "text-rose-400" },
            { icon: MapPin, label: "New Places", value: totalNew.places, color: "text-teal-400" },
            { icon: Target, label: "New Quests", value: totalNew.quests, color: "text-purple-400" },
            { icon: BookOpen, label: "New Chapters", value: totalNew.chapters, color: "text-blue-400" },
            { icon: MapPin, label: "New Landmarks", value: totalNew.landmarks, color: "text-emerald-400" },
            { icon: Crown, label: "New Collectibles", value: totalNew.collectibles, color: "text-orange-400" },
            { icon: TrendingUp, label: "Total Versions", value: versions.length, color: "text-amber-300" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 flex items-center gap-3">
              <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
              <div>
                <p className={`text-lg font-black ${color}`}>{value}</p>
                <p className="text-xs text-amber-700">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Version timeline */}
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Evolution Timeline</h2>
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-teal-500/40 via-amber-700/30 to-amber-900/20" />
          {versions.map((v, i) => (
            <div key={v.id} className="relative flex items-start gap-3 pb-5">
              <div className={`absolute -left-[18px] w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                i === 0 ? "bg-teal-500 border-teal-300" : "bg-amber-500 border-amber-300"
              }`}>
                {i === 0 && <Star className="w-2.5 h-2.5 text-teal-100" />}
              </div>
              <div className="flex-1 bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-amber-300">Version {v.version_number}</span>
                  {i === 0 && <span className="text-xs text-teal-400 font-bold">CURRENT</span>}
                  <span className="text-xs text-amber-700">{new Date(v.created_at).toLocaleDateString()}</span>
                </div>
                {v.change_summary && <p className="text-xs text-amber-200/80 leading-relaxed mb-2">{v.change_summary}</p>}
                <div className="flex items-center gap-2 flex-wrap">
                  {v.new_stories > 0 && <span className="text-xs text-amber-500 bg-amber-900/20 rounded-full px-2 py-0.5">+{v.new_stories} stories</span>}
                  {v.new_characters > 0 && <span className="text-xs text-rose-400 bg-rose-900/20 rounded-full px-2 py-0.5">+{v.new_characters} characters</span>}
                  {v.new_places > 0 && <span className="text-xs text-teal-400 bg-teal-900/20 rounded-full px-2 py-0.5">+{v.new_places} places</span>}
                  {v.new_quests > 0 && <span className="text-xs text-purple-400 bg-purple-900/20 rounded-full px-2 py-0.5">+{v.new_quests} quests</span>}
                  {v.new_chapters > 0 && <span className="text-xs text-blue-400 bg-blue-900/20 rounded-full px-2 py-0.5">+{v.new_chapters} chapters</span>}
                  {v.new_landmarks > 0 && <span className="text-xs text-emerald-400 bg-emerald-900/20 rounded-full px-2 py-0.5">+{v.new_landmarks} landmarks</span>}
                  {v.new_collectibles > 0 && <span className="text-xs text-orange-400 bg-orange-900/20 rounded-full px-2 py-0.5">+{v.new_collectibles} collectibles</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
