/**
 * Legacy Character — Living Character Biography
 * Route: /legacy/character/:memberId
 *
 * Shows a rich character profile for a family member with their RPG stats,
 * life events, stories, memories, interviews, places, relationships,
 * a skills tree, achievements, and a family lineage tree.
 *
 * Enhanced with:
 *  - Skills tree (Leadership, Negotiation, Education, Survival, Craftsmanship, Storytelling)
 *  - Family Lineage tree visualization
 *  - Achievements section
 *  - Relationships panel with member names
 *  - Health/Faith/Wisdom/Reputation stat bars matching design reference
 *  - AI-generated personality traits, archetype, speech style, emotional profile,
 *    beliefs, legacy score
 */

import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen, Mic,
  Users, Star, Heart, Globe2, Crown,
  Shield, Zap, Brain, Sparkles, Award,
  TreePine, GraduationCap, Compass, Hammer, MessageCircle,
  Trophy, Lock,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { authHeaders } from "@/lib/auth";
import { deriveLifeStage, inferAppearance } from "@/lib/legacy-character-engine";
import { LegacyCharacterSprite } from "@/components/legacy-character-sprite";

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
  personality?: {
    traits: string[];
    archetype: string;
    description: string;
  };
  skills?: {
    occupation: string | null;
    knownSkills: string[];
    craftLevel: number;
  };
  beliefs?: {
    spiritual: string | null;
    values: string[];
    lifePhilosophy: string | null;
  };
  speechStyle?: {
    tone: string;
    vocabulary: string;
    sampleLine: string;
  };
  emotionalProfile?: {
    dominantEmotion: string;
    emotionalRange: string[];
    triggers: string[];
  };
  historicalKnowledge?: {
    era: string | null;
    keyEvents: string[];
    culturalContext: string | null;
  };
  reputation?: {
    communityStanding: string;
    knownFor: string[];
  };
  legacyScore?: {
    total: number;
    breakdown: {
      storiesPreserved: number;
      memoriesRecorded: number;
      interviewCompleted: boolean;
      descendantsCount: number;
      placesConnected: number;
    };
  };
  events: Array<{ id: number; title: string; description: string | null; eventDate: string | null; category: string }>;
  stories: Array<{ id: number; title: string; excerpt: string; category: string | null }>;
  memories: Array<{ id: number; title: string | null; description: string | null; memoryDate: string | null; locationLabel: string | null }>;
  interviews: Array<{ id: number; title: string; status: string }>;
  places: Array<{ id: number; label: string; placeType: string | null; country: string | null }>;
  relationships: Array<{ id: number; fromMemberId: number; toMemberId: number; relationType: string; toMemberName?: string }>;
  achievements?: Array<{ key: string; title: string; unlocked: boolean; progress: number; goal: number }>;
  lineage?: {
    parents: Array<{ memberId: number; name: string; birthYear: number | null }>;
    children: Array<{ memberId: number; name: string; birthYear: number | null }>;
    siblings: Array<{ memberId: number; name: string; birthYear: number | null }>;
  };
}

const STAT_CONFIG: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  knowledge: { label: "Knowledge", icon: Brain, color: "text-sky-400" },
  relationships: { label: "Relationships", icon: Heart, color: "text-rose-400" },
  culturalWisdom: { label: "Cultural Wisdom", icon: Globe2, color: "text-amber-400" },
  courage: { label: "Courage", icon: Shield, color: "text-orange-400" },
  reputation: { label: "Reputation", icon: Star, color: "text-emerald-400" },
  legacy: { label: "Legacy", icon: Crown, color: "text-purple-400" },
  faith: { label: "Faith", icon: Sparkles, color: "text-teal-400" },
};

const SKILL_CONFIG: Record<string, { label: string; icon: typeof Hammer; stat: string }> = {
  leadership: { label: "Leadership", icon: Crown, stat: "reputation" },
  negotiation: { label: "Negotiation", icon: MessageCircle, stat: "relationships" },
  education: { label: "Education", icon: GraduationCap, stat: "knowledge" },
  survival: { label: "Survival", icon: Compass, stat: "courage" },
  craftsmanship: { label: "Craftsmanship", icon: Hammer, stat: "culturalWisdom" },
  storytelling: { label: "Storytelling", icon: BookOpen, stat: "legacy" },
};

export default function LegacyCharacterPage() {
  const { currentUser } = useAppContext();
  const params = useParams<{ memberId: string }>();
  const [, navigate] = useLocation();
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

  const skillLevels: Record<string, number> = {
    leadership: Math.floor(character.stats.reputation / 20),
    negotiation: Math.floor(character.stats.relationships / 20),
    education: Math.floor(character.stats.knowledge / 20),
    survival: Math.floor(character.stats.courage / 20),
    craftsmanship: Math.floor(character.stats.culturalWisdom / 20),
    storytelling: Math.floor(character.stats.legacy / 20),
  };
  const appearance = inferAppearance({
    characterId: character.memberId,
    role: character.role,
    birthYear: character.birthYear,
    deathYear: character.deathYear,
    era: character.birthYear ? `${Math.floor(character.birthYear / 10) * 10}s` : undefined,
    appearanceSeed: character.memberId,
    libraryId: "niakofa-original-art-demo-v1",
  });
  const lifeStage = deriveLifeStage({
    birthYear: character.birthYear,
    deathYear: character.deathYear,
  });

  return (
    <div className="min-h-screen bg-[#1A1008] text-amber-100 pb-8">
      <div className="sticky top-0 z-20 bg-[#1A1008]/95 backdrop-blur border-b border-amber-900/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/legacy")} className="text-amber-500 active:opacity-70">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-sm font-black text-amber-300 uppercase tracking-widest">Character</h1>
      </div>

      {/* Hero Header */}
      <div className="px-4 pt-6 pb-4 text-center">
        <div className="w-20 h-20 mx-auto mb-3 flex items-center justify-center">
          {appearance ? (
            <LegacyCharacterSprite {...appearance} size={80} className="rounded-2xl" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-600/30 flex items-center justify-center">
              <Users className="w-10 h-10 text-amber-500" />
            </div>
          )}
        </div>
        <h2 className="text-xl font-black text-amber-200">{character.name}</h2>
        <p className="text-xs text-amber-600 mt-0.5">
          {character.role}
          {character.relation ? ` · ${character.relation}` : ""}
        </p>
        <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-amber-700">
          {character.birthYear && <span>{character.birthYear}</span>}
          {character.birthYear && character.deathYear && <span>—</span>}
          {character.deathYear && <span>{character.deathYear}</span>}
          {!character.birthYear && !character.deathYear && <span>Dates unknown</span>}
          {character.isLiving && !character.deathYear && <span>· Living</span>}
        </div>
        <div className="max-w-sm mx-auto mt-3 rounded-xl border border-sky-900/30 bg-sky-950/20 px-3 py-2 text-left">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-400">
            Character engine · {lifeStage.label}
            {lifeStage.age !== null ? ` · age ${lifeStage.age}` : ""}
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-sky-200/60">{lifeStage.description}</p>
          <p className="mt-1 text-[9px] text-sky-300/40">Stylized RPG rendering · not a historical likeness</p>
        </div>
      </div>

      {/* Personality & Archetype */}
      {character.personality && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            Personality
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <p className="text-sm font-black text-amber-300 mb-2">{character.personality.archetype}</p>
            <p className="text-xs text-amber-600 leading-relaxed mb-3">{character.personality.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {character.personality.traits.map((trait) => (
                <span key={trait} className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1">
                  {trait}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Speech Style */}
      {character.speechStyle && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5" />
            Speech Style
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-amber-700 uppercase tracking-wider mt-0.5">Tone</span>
                <p className="text-xs text-amber-300 flex-1">{character.speechStyle.tone}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-amber-700 uppercase tracking-wider mt-0.5">Voice</span>
                <p className="text-xs text-amber-300 flex-1">{character.speechStyle.vocabulary}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-amber-900/20">
              <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-1">Sample Line</p>
              <p className="text-sm text-amber-200 italic leading-relaxed">"{character.speechStyle.sampleLine}"</p>
            </div>
          </div>
        </div>
      )}

      {/* Emotional Profile */}
      {character.emotionalProfile && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Heart className="w-3.5 h-3.5" />
            Emotional Profile
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <p className="text-sm font-bold text-amber-300 mb-2">{character.emotionalProfile.dominantEmotion}</p>
            {character.emotionalProfile.emotionalRange.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {character.emotionalProfile.emotionalRange.map((emo) => (
                  <span key={emo} className="text-[10px] text-amber-500 bg-amber-900/20 rounded-full px-2 py-0.5">{emo}</span>
                ))}
              </div>
            )}
            {character.emotionalProfile.triggers.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-900/20">
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-1">Triggers</p>
                <div className="flex flex-wrap gap-1">
                  {character.emotionalProfile.triggers.map((trigger) => (
                    <span key={trigger} className="text-[10px] text-amber-600 bg-amber-950/30 rounded px-1.5 py-0.5">{trigger}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Beliefs & Values */}
      {character.beliefs && (character.beliefs.values.length > 0 || character.beliefs.spiritual || character.beliefs.lifePhilosophy) && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5" />
            Beliefs & Values
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            {character.beliefs.spiritual && (
              <p className="text-xs text-amber-300 mb-2"><span className="text-amber-700">Faith:</span> {character.beliefs.spiritual}</p>
            )}
            {character.beliefs.lifePhilosophy && (
              <p className="text-xs text-amber-400 italic mb-2">"{character.beliefs.lifePhilosophy}"</p>
            )}
            {character.beliefs.values.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {character.beliefs.values.map((value) => (
                  <span key={value} className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">{value}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legacy Score */}
      {character.legacyScore && character.legacyScore.total > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Crown className="w-3.5 h-3.5" />
            Legacy Score
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-amber-600">Total Legacy</span>
              <span className="text-2xl font-black text-amber-300">{character.legacyScore.total}</span>
            </div>
            <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden mb-3">
              <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full" style={{ width: `${Math.min(100, character.legacyScore.total)}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="text-amber-600">Stories: <span className="text-amber-400 font-bold">{character.legacyScore.breakdown.storiesPreserved}</span></div>
              <div className="text-amber-600">Memories: <span className="text-amber-400 font-bold">{character.legacyScore.breakdown.memoriesRecorded}</span></div>
              <div className="text-amber-600">Interviews: <span className="text-amber-400 font-bold">{character.legacyScore.breakdown.interviewCompleted ? "Yes" : "No"}</span></div>
              <div className="text-amber-600">Descendants: <span className="text-amber-400 font-bold">{character.legacyScore.breakdown.descendantsCount}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* Character Stats */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" />
          Character Stats
        </h2>
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
          {Object.entries(STAT_CONFIG).map(([key, config]) => {
            const value = character.stats[key as keyof typeof character.stats];
            const Icon = config.icon;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 text-xs text-amber-500">
                    <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                    {config.label}
                  </span>
                  <span className={`text-xs font-bold ${config.color}`}>{value}</span>
                </div>
                <div className="h-1.5 bg-[#3A2A1A] rounded-full overflow-hidden">
                  <div className={`h-full ${config.color.replace("text-", "bg-")} rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, value)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skills Tree */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Award className="w-3.5 h-3.5" />
          Skills Tree
        </h2>
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
          {Object.entries(SKILL_CONFIG).map(([key, config]) => {
            const level = skillLevels[key] ?? 0;
            const Icon = config.icon;
            return (
              <div key={key} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-600/20 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-400">{config.label}</span>
                    <span className="text-[10px] text-amber-700">Lv {level}</span>
                  </div>
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${i < level ? "bg-amber-500" : "bg-stone-800"}`} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Life Events */}
      {character.events.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Life Events
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
            {character.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-300">{event.title}</p>
                  {event.description && <p className="text-[10px] text-amber-600 mt-0.5">{event.description}</p>}
                  {event.eventDate && <p className="text-[10px] text-amber-700 mt-0.5">{new Date(event.eventDate).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stories */}
      {character.stories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Stories
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
            {character.stories.map((story) => (
              <div key={story.id} className="border-b border-amber-900/20 last:border-0 pb-3 last:pb-0">
                <p className="text-xs font-bold text-amber-300">{story.title}</p>
                <p className="text-[10px] text-amber-600 mt-1 leading-relaxed">{story.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories */}
      {character.memories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Heart className="w-3.5 h-3.5" />
            Memories
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
            {character.memories.map((memory) => (
              <div key={memory.id} className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-300">{memory.title ?? "Untitled Memory"}</p>
                  {memory.description && <p className="text-[10px] text-amber-600 mt-0.5">{memory.description}</p>}
                  {memory.locationLabel && (
                    <p className="text-[10px] text-amber-700 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-2.5 h-2.5" /> {memory.locationLabel}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interviews */}
      {character.interviews.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Mic className="w-3.5 h-3.5" />
            Interviews
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
            {character.interviews.map((interview) => (
              <div key={interview.id} className="flex items-center justify-between">
                <span className="text-xs text-amber-400">{interview.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  interview.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                  interview.status === "transcribed" ? "bg-sky-500/20 text-sky-400" :
                  "bg-amber-500/20 text-amber-400"
                }`}>
                  {interview.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Places */}
      {character.places.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5" />
            Places
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
            {character.places.map((place) => (
              <div key={place.id} className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-300">{place.label}</p>
                  {place.country && <p className="text-[10px] text-amber-700">{place.country}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      {character.relationships.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            Relationships
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
            {character.relationships.map((rel) => (
              <div key={rel.id} className="flex items-center justify-between">
                <span className="text-xs text-amber-400">
                  {rel.toMemberName ?? `Member #${rel.toMemberId}`}
                </span>
                <span className="text-[10px] text-amber-700 capitalize">{rel.relationType}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lineage Tree */}
      {character.lineage && (character.lineage.parents.length > 0 || character.lineage.children.length > 0 || character.lineage.siblings.length > 0) && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TreePine className="w-3.5 h-3.5" />
            Family Lineage
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-4">
            {character.lineage.parents.length > 0 && (
              <div>
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Parents</p>
                <div className="space-y-1">
                  {character.lineage.parents.map((parent) => (
                    <button
                      key={parent.memberId}
                      onClick={() => navigate(`/legacy/character/${parent.memberId}`)}
                      className="block text-xs text-amber-400 hover:text-amber-300 active:opacity-70"
                    >
                      {parent.name}{parent.birthYear ? ` (${parent.birthYear})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {character.lineage.siblings.length > 0 && (
              <div>
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Siblings</p>
                <div className="space-y-1">
                  {character.lineage.siblings.map((sib) => (
                    <button
                      key={sib.memberId}
                      onClick={() => navigate(`/legacy/character/${sib.memberId}`)}
                      className="block text-xs text-amber-400 hover:text-amber-300 active:opacity-70"
                    >
                      {sib.name}{sib.birthYear ? ` (${sib.birthYear})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {character.lineage.children.length > 0 && (
              <div>
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Children</p>
                <div className="space-y-1">
                  {character.lineage.children.map((child) => (
                    <button
                      key={child.memberId}
                      onClick={() => navigate(`/legacy/character/${child.memberId}`)}
                      className="block text-xs text-amber-400 hover:text-amber-300 active:opacity-70"
                    >
                      {child.name}{child.birthYear ? ` (${child.birthYear})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Achievements */}
      {character.achievements && character.achievements.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5" />
            Achievements
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
            {character.achievements.map((ach) => (
              <div key={ach.key} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  ach.unlocked ? "bg-amber-500/20 border border-amber-500/30" : "bg-stone-900 border border-stone-800"
                }`}>
                  {ach.unlocked ? <Trophy className="w-4 h-4 text-amber-400" /> : <Lock className="w-4 h-4 text-stone-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold ${ach.unlocked ? "text-amber-300" : "text-stone-500"}`}>{ach.title}</p>
                  <div className="flex gap-0.5 mt-0.5">
                    {Array.from({ length: Math.max(1, ach.goal) }).map((_, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full ${i < ach.progress ? "bg-amber-500" : "bg-stone-800"}`} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
