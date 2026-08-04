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
 */

import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen, Mic,
  Users, Star, Heart, Globe2, Crown,
  Shield, Zap, Brain, Sparkles, Award,
  TreePine, GraduationCap, Compass, Hammer, MessageCircle,
  TrendingUp, Trophy, Lock,
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
  relationships: Array<{ id: number; fromMemberId: number; toMemberId: number; relationType: string; toMemberName?: string }>;
  achievements?: Array<{ key: string; title: string; unlocked: boolean; progress: number; goal: number }>;
  lineage?: {
    parents: Array<{ memberId: number; name: string; birthYear: number | null }>;
    children: Array<{ memberId: number; name: string; birthYear: number | null }>;
    siblings: Array<{ memberId: number; name: string; birthYear: number | null }>;
  };
}

const STAT_CONFIG = [
  { key: "knowledge" as const,      label: "Knowledge",       icon: Brain,      color: "bg-sky-500",    text: "text-sky-400" },
  { key: "relationships" as const,  label: "Relationships",   icon: Heart,      color: "bg-rose-500",   text: "text-rose-400" },
  { key: "culturalWisdom" as const, label: "Cultural Wisdom", icon: Globe2,     color: "bg-amber-500",   text: "text-amber-400" },
  { key: "courage" as const,        label: "Courage",          icon: Zap,        color: "bg-emerald-500", text: "text-emerald-400" },
  { key: "reputation" as const,     label: "Reputation",       icon: Star,       color: "bg-purple-500",  text: "text-purple-400" },
  { key: "legacy" as const,        label: "Legacy",            icon: Crown,      color: "bg-teal-500",    text: "text-teal-400" },
  { key: "faith" as const,          label: "Faith",            icon: Shield,     color: "bg-pink-500",    text: "text-pink-400" },
];

const SKILL_TREE = [
  { key: "leadership",     label: "Leadership",     icon: Crown,         color: "text-amber-400",   bg: "bg-amber-500/10",    border: "border-amber-500/30" },
  { key: "negotiation",    label: "Negotiation",    icon: MessageCircle,  color: "text-sky-400",     bg: "bg-sky-500/10",      border: "border-sky-500/30" },
  { key: "education",      label: "Education",      icon: GraduationCap,  color: "text-emerald-400", bg: "bg-emerald-500/10",  border: "border-emerald-500/30" },
  { key: "survival",       label: "Survival",       icon: Compass,        color: "text-orange-400",  bg: "bg-orange-500/10",   border: "border-orange-500/30" },
  { key: "craftsmanship",  label: "Craftsmanship",  icon: Hammer,         color: "text-rose-400",    bg: "bg-rose-500/10",     border: "border-rose-500/30" },
  { key: "storytelling",   label: "Storytelling",   icon: BookOpen,       color: "text-purple-400",  bg: "bg-purple-500/10",   border: "border-purple-500/30" },
];

const ACHIEVEMENT_ICONS: Record<string, typeof Trophy> = {
  story_keeper: BookOpen,
  roots_explorer: Compass,
  family_connector: Users,
  legacy_builder: Crown,
};

const CATEGORY_ICONS: Record<string, typeof Calendar> = {
  birth: Calendar,
  death: Heart,
  migration: Globe2,
  marriage: Heart,
  education: BookOpen,
  other: Star,
};

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
      <div className="h-2 bg-[#3A2A1A] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function SkillNode({ skill, level }: { skill: typeof SKILL_TREE[number]; level: number }) {
  const Icon = skill.icon;
  const isUnlocked = level > 0;
  return (
    <div className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border ${isUnlocked ? `${skill.bg} ${skill.border}` : "bg-[#2A1A0F] border-amber-900/20 opacity-50"}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isUnlocked ? skill.bg : "bg-[#3A2A1A]"}`}>
        <Icon className={`w-5 h-5 ${isUnlocked ? skill.color : "text-amber-800"}`} />
      </div>
      <span className={`text-[10px] font-bold ${isUnlocked ? skill.color : "text-amber-800"}`}>{skill.label}</span>
      {isUnlocked && (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < level ? skill.color.replace("text", "bg") : "bg-amber-900/40"}`} />
          ))}
        </div>
      )}
      {!isUnlocked && <Lock className="w-3 h-3 text-amber-800" />}
    </div>
  );
}

function LineageNode({ name, birthYear, onClick }: { name: string; birthYear: number | null; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-600/30 flex items-center justify-center group-active:scale-95 transition-transform">
        <Users className="w-5 h-5 text-amber-500" />
      </div>
      <span className="text-[10px] font-bold text-amber-300 text-center max-w-[80px] truncate">{name}</span>
      {birthYear && <span className="text-[9px] text-amber-700">{birthYear}</span>}
    </button>
  );
}

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

  // Derive skill levels from stats — each skill maps to a stat
  const skillLevels: Record<string, number> = {
    leadership:    Math.floor(character.stats.reputation / 20),
    negotiation:   Math.floor(character.stats.relationships / 20),
    education:     Math.floor(character.stats.knowledge / 20),
    survival:      Math.floor(character.stats.courage / 20),
    craftsmanship: Math.floor(character.stats.culturalWisdom / 20),
    storytelling:  Math.floor(character.stats.legacy / 20),
  };

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

      {/* Character Stats */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" />
          Character Stats
        </h2>
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-3">
          {STAT_CONFIG.map((stat) => (
            <StatBar
              key={stat.key}
              label={stat.label}
              value={character.stats[stat.key]}
              icon={stat.icon}
              color={stat.color}
              text={stat.text}
            />
          ))}
        </div>
      </div>

      {/* Skills Tree */}
      <div className="px-4 mb-6">
        <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          Skills Tree
        </h2>
        <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
          <div className="grid grid-cols-3 gap-3">
            {SKILL_TREE.map((skill) => (
              <SkillNode key={skill.key} skill={skill} level={skillLevels[skill.key] ?? 0} />
            ))}
          </div>
          <p className="text-[10px] text-amber-700 mt-3 text-center">
            Skills grow as you preserve more stories and memories about this ancestor.
          </p>
        </div>
      </div>

      {/* Family Lineage Tree */}
      {character.lineage && (character.lineage.parents.length > 0 || character.lineage.children.length > 0 || character.lineage.siblings.length > 0) && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <TreePine className="w-3.5 h-3.5" />
            Family Lineage
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg">
            {/* Parents */}
            {character.lineage.parents.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Parents</p>
                <div className="flex justify-center gap-4">
                  {character.lineage.parents.map((parent) => (
                    <LineageNode
                      key={parent.memberId}
                      name={parent.name}
                      birthYear={parent.birthYear}
                      onClick={() => navigate(`/legacy/character/${parent.memberId}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Connection lines */}
            {character.lineage.parents.length > 0 && (
              <div className="flex justify-center mb-2">
                <div className="w-px h-6 bg-gradient-to-b from-amber-600/40 to-amber-700/20" />
              </div>
            )}

            {/* Self */}
            <div className="flex justify-center mb-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-400/50 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-amber-300" />
                </div>
                <span className="text-xs font-black text-amber-200">{character.name}</span>
              </div>
            </div>

            {/* Connection lines to children */}
            {character.lineage.children.length > 0 && (
              <div className="flex justify-center mb-2">
                <div className="w-px h-6 bg-gradient-to-b from-amber-700/20 to-amber-600/40" />
              </div>
            )}

            {/* Children */}
            {character.lineage.children.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Children</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  {character.lineage.children.map((child) => (
                    <LineageNode
                      key={child.memberId}
                      name={child.name}
                      birthYear={child.birthYear}
                      onClick={() => navigate(`/legacy/character/${child.memberId}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Siblings */}
            {character.lineage.siblings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-amber-900/20">
                <p className="text-[10px] text-amber-700 uppercase tracking-wider mb-2">Siblings</p>
                <div className="flex justify-center gap-3 flex-wrap">
                  {character.lineage.siblings.map((sib) => (
                    <LineageNode
                      key={sib.memberId}
                      name={sib.name}
                      birthYear={sib.birthYear}
                      onClick={() => navigate(`/legacy/character/${sib.memberId}`)}
                    />
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
            <Award className="w-3.5 h-3.5" />
            Achievements
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {character.achievements.map((ach) => {
              const Icon = ACHIEVEMENT_ICONS[ach.key] ?? Trophy;
              return (
                <div
                  key={ach.key}
                  className={`rounded-xl p-3 border ${ach.unlocked ? "bg-amber-500/10 border-amber-500/30" : "bg-[#2A1A0F] border-amber-900/20 opacity-60"}`}
                >
                  <Icon className={`w-5 h-5 mb-1.5 ${ach.unlocked ? "text-amber-400" : "text-amber-800"}`} />
                  <p className={`text-xs font-bold ${ach.unlocked ? "text-amber-200" : "text-amber-700"}`}>{ach.title}</p>
                  {!ach.unlocked && (
                    <div className="mt-1.5">
                      <div className="h-1 bg-amber-950/50 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-600 rounded-full" style={{ width: `${(ach.progress / ach.goal) * 100}%` }} />
                      </div>
                      <p className="text-[9px] text-amber-700 mt-0.5">{ach.progress}/{ach.goal}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Relationships */}
      {character.relationships.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Heart className="w-3.5 h-3.5" />
            Relationships
          </h2>
          <div className="bg-[#2A1A0F] border border-amber-900/30 rounded-2xl p-4 shadow-lg space-y-2">
            {character.relationships.map((rel) => (
              <button
                key={rel.id}
                onClick={() => navigate(`/legacy/character/${rel.toMemberId}`)}
                className="w-full flex items-center gap-3 bg-amber-900/20 rounded-xl px-3 py-2 active:scale-[0.98] transition-transform"
              >
                <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-600/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 text-amber-500" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-bold text-amber-200 truncate">
                    {rel.toMemberName ?? `Member #${rel.toMemberId}`}
                  </p>
                  <p className="text-[10px] text-amber-600 capitalize">{rel.relationType}</p>
                </div>
                <ArrowLeft className="w-3 h-3 text-amber-700 rotate-180" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Life Events */}
      {character.events.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Life Events
          </h2>
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

      {/* Stories */}
      {character.stories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" />
            Stories
          </h2>
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

      {/* Memories */}
      {character.memories.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Star className="w-3.5 h-3.5" />
            Memories
          </h2>
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

      {/* Places */}
      {character.places.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" />
            Places
          </h2>
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

      {/* Interviews */}
      {character.interviews.length > 0 && (
        <div className="px-4 mb-6">
          <h2 className="text-xs font-black text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Mic className="w-3.5 h-3.5" />
            Interviews
          </h2>
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
    </div>
  );
}
