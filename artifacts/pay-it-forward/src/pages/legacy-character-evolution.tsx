/**
 * Legacy Character Evolution — Living Characters
 * Route: /legacy/characters
 *
 * Shows how each family member's game character evolves as new stories,
 * memories, interviews, and photos are added. Characters never remain static
 * — they gain new dialogue, journal entries, quests, and stats as the family
 * preserves more about them.
 *
 * This is the "Living Characters" system from the design docs:
 *   "Grandfather — Yesterday: 5 known stories. Today: 18 known stories.
 *    Same person. Completely richer."
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Loader2, Users, BookOpen, Mic, Camera,
  MapPin, Star, TrendingUp, AlertCircle, Heart,
  Brain, Globe2, Crown, Zap, Sparkles,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface CharacterStats {
  knowledge: number;
  relationships: number;
  culturalWisdom: number;
  courage: number;
  reputation: number;
  legacy: number;
  faith: number;
}

interface Character {
  memberId: number;
  name: string;
  role: string;
  isLiving: boolean;
  birthYear: number | null;
  stats: CharacterStats;
  contentCounts: {
    stories: number;
    memories: number;
    interviews: number;
    events: number;
    places: number;
    relations: number;
  };
  latestEvolution: {
    summary: string | null;
    newDialogue: number;
    newJournal: number;
    newQuests: number;
    newMemories: number;
    version: number | null;
    createdAt: string;
  } | null;
}

const STAT_CONFIG = [
  { key: "knowledge" as const,      label: "Knowledge",        icon: Brain,   color: "bg-sky-500",   text: "text-sky-400" },
  { key: "relationships" as const, label: "Relationships",    icon: Heart,   color: "bg-rose-500",  text: "text-rose-400" },
  { key: "culturalWisdom" as const, label: "Cultural Wisdom",  icon: Globe2,  color: "bg-amber-500",  text: "text-amber-400" },
  { key: "courage" as const,        label: "Courage",          icon: Zap,     color: "bg-emerald-500", text: "text-emerald-400" },
  { key: "reputation" as const,     label: "Reputation",       icon: Star,    color: "bg-purple-500", text: "text-purple-400" },
  { key: "legacy" as const,         label: "Legacy",           icon: Crown,   color: "bg-teal-500",   text: "text-teal-400" },
  { key: "faith" as const,          label: "Faith",            icon: Heart,   color: "bg-pink-500",   text: "text-pink-400" },
];

function StatBar({ label, value, icon: Icon, color, text }: { label: string; value: number; icon: typeof Brain; color: string; text: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-amber-600 flex items-center gap-1">
          <Icon className={`w-3 h-3 ${text}`} />
          {label}
        </span>
        <span className="text-[10px] font-bold text-amber-400">{value}</span>
      </div>
      <div className="h-1.5 bg-amber-950/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export default function LegacyCharacterEvolutionPage() {
  const { currentUser } = useAppContext();
  const [, navigate] = useLocation();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      try {
        const famRes = await fetch("/api/family/mine", { headers: authHeaders() });
        const famBody = await famRes.json().catch(() => ({}));
        const famId = famBody?.families?.[0]?.id;
        if (!famId) {
          setError("Join or create a family to see characters.");
          return;
        }

        const res = await fetch(`/api/legacy/character-evolution/${famId}`, { headers: authHeaders() });
        if (!res.ok) {
          setError("Failed to load characters.");
          return;
        }
        const data = await res.json();
        setCharacters(data.characters ?? []);
      } catch {
        setError("Failed to load characters.");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A0F08]">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A0F08] flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <p className="text-amber-400 text-sm text-center">{error}</p>
        <button onClick={() => navigate("/legacy")} className="text-amber-500 text-xs underline">Back to Legacy</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A0F08] pb-28">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30 sticky top-0 bg-[#1A0F08] z-10">
        <button onClick={() => navigate("/legacy")} className="flex items-center gap-1 text-amber-500 text-xs font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black text-amber-100 uppercase tracking-widest">Characters</h1>
          <p className="text-[10px] text-amber-700">Living Family</p>
        </div>
        <div className="w-12" />
      </div>

      {/* Intro */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-gradient-to-br from-amber-900/20 to-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-200">Living Characters</p>
              <p className="text-xs text-amber-600 mt-1 leading-relaxed">
                Your ancestors never stay static. As the family preserves more stories, memories, and
                interviews, each character evolves — gaining new dialogue, journal entries, and quests.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Characters */}
      {characters.length === 0 ? (
        <div className="px-4 mt-8 text-center">
          <Users className="w-12 h-12 text-amber-700 mx-auto mb-3" />
          <p className="text-sm text-amber-500 font-semibold">No characters yet</p>
          <p className="text-xs text-amber-700 mt-1">Add family members to see them come to life.</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-4">
          {characters.map((char) => (
            <div key={char.memberId} className="bg-[#2A1A0F] border border-amber-700/30 rounded-2xl p-4 shadow-lg">
              {/* Character header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600/30 to-amber-900/30 border border-amber-700/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-black text-amber-300">
                    {char.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-100">{char.name}</p>
                  <p className="text-xs text-amber-600">{char.role}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {char.birthYear && (
                      <span className="text-[10px] text-amber-700 bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                        b. {char.birthYear}
                      </span>
                    )}
                    {char.isLiving ? (
                      <span className="text-[10px] text-emerald-400/70 bg-emerald-900/20 px-1.5 py-0.5 rounded-full">
                        Living
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-900/20 px-1.5 py-0.5 rounded-full">
                        Ancestor
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
                {STAT_CONFIG.map((stat) => (
                  <StatBar
                    key={stat.key}
                    label={stat.label}
                    value={char.stats[stat.key]}
                    icon={stat.icon}
                    color={stat.color}
                    text={stat.text}
                  />
                ))}
              </div>

              {/* Content counts */}
              <div className="grid grid-cols-6 gap-1 mb-3">
                {[
                  { label: "Stories", count: char.contentCounts.stories, icon: BookOpen },
                  { label: "Memories", count: char.contentCounts.memories, icon: Camera },
                  { label: "Interviews", count: char.contentCounts.interviews, icon: Mic },
                  { label: "Events", count: char.contentCounts.events, icon: Star },
                  { label: "Places", count: char.contentCounts.places, icon: MapPin },
                  { label: "Relations", count: char.contentCounts.relations, icon: Users },
                ].map((item) => (
                  <div key={item.label} className="text-center">
                    <item.icon className="w-3.5 h-3.5 text-amber-700 mx-auto mb-0.5" />
                    <p className="text-xs font-bold text-amber-400">{item.count}</p>
                    <p className="text-[8px] text-amber-800 uppercase">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Evolution summary */}
              {char.latestEvolution && (
                <div className="bg-amber-900/20 border border-amber-700/20 rounded-lg p-2.5 mt-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">Latest Evolution</span>
                  </div>
                  <p className="text-xs text-amber-400/80">{char.latestEvolution.summary}</p>
                  {(char.latestEvolution.newDialogue > 0 || char.latestEvolution.newMemories > 0 || char.latestEvolution.newQuests > 0) && (
                    <div className="flex gap-2 mt-2">
                      {char.latestEvolution.newDialogue > 0 && (
                        <span className="text-[10px] text-sky-400 bg-sky-900/20 px-1.5 py-0.5 rounded-full">
                          +{char.latestEvolution.newDialogue} dialogue
                        </span>
                      )}
                      {char.latestEvolution.newMemories > 0 && (
                        <span className="text-[10px] text-amber-400 bg-amber-900/20 px-1.5 py-0.5 rounded-full">
                          +{char.latestEvolution.newMemories} memories
                        </span>
                      )}
                      {char.latestEvolution.newQuests > 0 && (
                        <span className="text-[10px] text-emerald-400 bg-emerald-900/20 px-1.5 py-0.5 rounded-full">
                          +{char.latestEvolution.newQuests} quests
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
