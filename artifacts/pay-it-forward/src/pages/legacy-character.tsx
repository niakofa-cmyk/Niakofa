/**
 * Legacy Character — Living Character Biography
 * Route: /legacy/character/:memberId
 *
 * Shows a rich character profile for a family member with their RPG stats,
 * life events, stories, memories, interviews, places, and relationships.
 */

import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen, Mic,
  Users, Star, Heart, Globe2, Crown,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";

interface CharacterBio {
  memberId: number;
  name: string;
  role: string;
  relation: string | null;
  isLiving: boolean;
  birthYear: number | null;
  deathYear: number | null;
  stats: {
    knowledge: number;
    relationships: number;
    culturalWisdom: number;
    courage: number;
    reputation: number;
    legacy: number;
    faith: number;
  };
  events: Array<{ id: number; title: string; description: string | null; eventDate: string | null; category: string }>;
  stories: Array<{ id: number; title: string; excerpt: string; category: string | null }>;
  memories: Array<{ id: number; title: string | null; description: string | null; memoryDate: string | null; locationLabel: string | null }>;
  interviews: Array<{ id: number; title: string; status: string }>;
  places: Array<{ id: number; label: string; placeType: string | null; country: string | null }>;
  relationships: Array<{ id: number; fromMemberId: number; toMemberId: number; relationType: string }>;
}

const STAT_CONFIG = [
  { key: "knowledge", label: "Knowledge", color: "bg-sky-500", text: "text-sky-400" },
  { key: "relationships", label: "Relationships", color: "bg-rose-500", text: "text-rose-400" },
  { key: "culturalWisdom", label: "Cultural Wisdom", color: "bg-amber-500", text: "text-amber-400" },
  { key: "courage", label: "Courage", color: "bg-emerald-500", text: "text-emerald-400" },
  { key: "reputation", label: "Reputation", color: "bg-purple-500", text: "text-purple-400" },
  { key: "legacy", label: "Legacy", color: "bg-teal-500", text: "text-teal-400" },
  { key: "faith", label: "Faith", color: "bg-orange-500", text: "text-orange-400" },
] as const;

const CATEGORY_ICONS: Record<string, typeof Calendar> = {
  birth: Calendar,
  death: Heart,
  migration: Globe2,
  marriage: Heart,
  education: BookOpen,
  other: Star,
};

export default function LegacyCharacterPage() {
  const params = useParams<{ memberId: string }>();
  const [, navigate] = useLocation();
  const { currentUser } = useAppContext();
  const [character, setCharacter] = useState<CharacterBio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const familyId = famData.families[0].id;

        const res = await fetch(`/api/legacy/game-master/${familyId}/character/${params.memberId}`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to load character" }));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json() as { character: CharacterBio };
        setCharacter(data.character);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load character");
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser, params.memberId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1008] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-screen bg-[#1A1008] text-amber-100">
        <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Character</h1>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-amber-600">{error ?? "Character not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1008] text-amber-100 pb-8">
      <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Character</h1>
      </div>

      <div className="px-4 pt-6 pb-4 text-center">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-center mx-auto mb-3">
          <Crown className="w-8 h-8 text-amber-400" />
        </div>
        <p className="text-xl font-black text-amber-200">{character.name}</p>
        {character.role && <p className="text-xs text-amber-500 capitalize mt-1">{character.role}</p>}
        {character.relation && <p className="text-xs text-amber-600 mt-0.5">{character.relation}</p>}
        {character.birthYear && (
          <p className="text-xs text-amber-700 mt-1">
            {character.birthYear}{character.deathYear ? ` - ${character.deathYear}` : character.isLiving ? " - Present" : ""}
          </p>
        )}
      </div>

      <div className="px-4 mb-6">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Character Stats</h2>
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
          {STAT_CONFIG.map((stat) => {
            const value = character.stats[stat.key];
            return (
              <div key={stat.key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={stat.text}>{stat.label}</span>
                  <span className={stat.text}>{value}</span>
                </div>
                <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden">
                  <div className={`h-full ${stat.color} rounded-full transition-all`} style={{ width: `${value}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {character.events.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Life Events</h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <div className="relative pl-5">
              <div className="absolute left-1.5 top-1 bottom-1 w-0.5 bg-gradient-to-b from-amber-600/40 via-amber-700/30 to-amber-900/20" />
              {character.events.map((event) => {
                const Icon = CATEGORY_ICONS[event.category] ?? Star;
                return (
                  <div key={event.id} className="relative flex items-start gap-3 pb-4">
                    <div className="absolute -left-[14px] w-3 h-3 rounded-full bg-amber-500 border-2 border-amber-300 flex-shrink-0 mt-0.5" />
                    <Icon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-amber-200">{event.title}</p>
                      {event.eventDate && (
                        <p className="text-xs text-amber-600 mt-0.5">
                          {new Date(event.eventDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                      )}
                      {event.description && <p className="text-xs text-amber-700 mt-1 leading-relaxed">{event.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {character.stories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Stories</h2>
          <div className="space-y-2">
            {character.stories.map((story) => (
              <div key={story.id} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-sm font-bold text-amber-200">{story.title}</p>
                </div>
                <p className="text-xs text-amber-600 leading-relaxed line-clamp-3">{story.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {character.memories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Memories</h2>
          <div className="space-y-2">
            {character.memories.map((memory) => (
              <div key={memory.id} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-sm font-bold text-amber-200">{memory.title ?? "Memory"}</p>
                </div>
                {memory.description && <p className="text-xs text-amber-600 leading-relaxed line-clamp-2">{memory.description}</p>}
                <div className="flex items-center gap-3 mt-1">
                  {memory.memoryDate && (
                    <span className="text-xs text-amber-700">{new Date(memory.memoryDate).toLocaleDateString("en-US", { year: "numeric", month: "short" })}</span>
                  )}
                  {memory.locationLabel && (
                    <span className="text-xs text-amber-700 flex items-center gap-1"><MapPin className="w-3 h-3" /> {memory.locationLabel}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {character.places.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Places</h2>
          <div className="grid grid-cols-2 gap-2">
            {character.places.map((place) => (
              <div key={place.id} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3">
                <MapPin className="w-4 h-4 text-amber-500 mb-1" />
                <p className="text-sm font-bold text-amber-200">{place.label}</p>
                {place.placeType && <p className="text-xs text-amber-600 capitalize">{place.placeType}</p>}
                {place.country && <p className="text-xs text-amber-700">{place.country}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {character.interviews.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Interviews</h2>
          <div className="space-y-2">
            {character.interviews.map((interview) => (
              <div key={interview.id} className="bg-[#2A1A0F] border border-amber-900/30 rounded-xl p-3 flex items-center gap-3">
                <Mic className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-200">{interview.title}</p>
                  <p className="text-xs text-amber-600 capitalize">{interview.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {character.relationships.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3">Relationships</h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-wrap gap-2">
              {character.relationships.map((rel) => (
                <div key={rel.id} className="flex items-center gap-2 bg-amber-900/20 rounded-full px-3 py-1.5">
                  <Users className="w-3 h-3 text-amber-500" />
                  <span className="text-xs text-amber-400 capitalize">{rel.relationType}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
