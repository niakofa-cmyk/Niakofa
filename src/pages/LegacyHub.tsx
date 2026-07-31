import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookHeart, Trophy, Map, Users, Mic,
  Star, Play, Loader2,
  ChevronRight, Globe2, MapPin,
  Camera, Crown, Flame,
  Sparkles, Target,
  BookOpen,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { calculateCompleteness, selectAncestorCandidates, generateChapters, createOrUpdateWorld, generateQuestsFromGaps, computeKnowledgeHash, recordKnowledgeVersion } from '@/lib/legacyEngine'
import type { FamilyMember, FamilyMemory, FamilyPlace, FamilyEvent, FamilyInterview, FamilyArtifact, LegacyWorld, AncestorCandidate, GameMode } from '@/lib/types'

const CHAPTER_UNLOCK_THRESHOLD = 40

const GAME_MODES: { id: GameMode; label: string; icon: typeof BookHeart; description: string; color: string }[] = [
  { id: 'legacy', label: 'Legacy Mode', icon: Crown, description: 'Play an ancestor\'s life', color: 'text-legacy-400' },
  { id: 'exploration', label: 'Exploration Mode', icon: Globe2, description: 'Explore real family locations', color: 'text-accent-400' },
  { id: 'quests', label: 'Family Quests', icon: Target, description: 'Collaborative preservation missions', color: 'text-blue-400' },
  { id: 'reunion', label: 'Reunion Mode', icon: Users, description: 'Real-time family challenges', color: 'text-purple-400' },
]

export default function LegacyHub() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [memories, setMemories] = useState<FamilyMemory[]>([])
  const [places, setPlaces] = useState<FamilyPlace[]>([])
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [interviews, setInterviews] = useState<FamilyInterview[]>([])
  const [artifacts, setArtifacts] = useState<FamilyArtifact[]>([])
  const [world, setWorld] = useState<LegacyWorld | null>(null)
  const [ancestors, setAncestors] = useState<AncestorCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedMode, setSelectedMode] = useState<GameMode>('legacy')
  const [completeness, setCompleteness] = useState<{ total: number; chapterUnlockReady: boolean; dimensions: { key: string; label: string; score: number; max: number; count: number; hint: string }[] } | null>(null)
  const [quests, setQuests] = useState<{ id: string; title: string; description: string; quest_type: string; reward: string | null }[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [membersRes, memoriesRes, placesRes, eventsRes, interviewsRes, artifactsRes] = await Promise.all([
        supabase.from('family_members').select('*').order('created_at'),
        supabase.from('family_memories').select('*').order('created_at'),
        supabase.from('family_places').select('*').order('created_at'),
        supabase.from('family_events').select('*').order('event_year'),
        supabase.from('family_interviews').select('*').order('created_at'),
        supabase.from('family_artifacts').select('*').order('created_at'),
      ])

      const m = (membersRes.data || []) as FamilyMember[]
      const mem = (memoriesRes.data || []) as FamilyMemory[]
      const p = (placesRes.data || []) as FamilyPlace[]
      const ev = (eventsRes.data || []) as FamilyEvent[]
      const iv = (interviewsRes.data || []) as FamilyInterview[]
      const art = (artifactsRes.data || []) as FamilyArtifact[]

      setMembers(m)
      setMemories(mem)
      setPlaces(p)
      setEvents(ev)
      setInterviews(iv)
      setArtifacts(art)

      const score = calculateCompleteness(m, mem, ev, p, iv)
      setCompleteness(score)

      const candidates = selectAncestorCandidates(m, mem, ev, p, iv, art)
      setAncestors(candidates)

      if (candidates.length > 0) {
        const topAncestor = candidates[0].member
        const generatedQuests = generateQuestsFromGaps(topAncestor, m, mem, ev, p)
        setQuests(generatedQuests)
      }

      if (m.length > 0) {
        const familyId = m[0].family_id
        const { data: existingWorld } = await supabase
          .from('legacy_worlds')
          .select('*')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .maybeSingle()
        if (existingWorld) setWorld(existingWorld as LegacyWorld)
      }
    } catch (err) {
      console.error('Failed to load family data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleStartJourney = async () => {
    if (ancestors.length === 0) return
    setGenerating(true)
    try {
      const ancestor = ancestors[0].member
      const familyId = ancestor.family_id

      const chapters = generateChapters(ancestor, memories, events, places, artifacts)
      const newWorld = await createOrUpdateWorld(familyId, ancestor, chapters)

      if (newWorld) {
        setWorld(newWorld)
        navigate('/legacy/start')
      }
    } catch (err) {
      console.error('Failed to start journey:', err)
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-legacy-400" />
          <p className="font-serif text-xl text-legacy-200">Building Your Family World...</p>
        </div>
      </div>
    )
  }

  const topAncestor = ancestors[0]
  const isReady = completeness?.chapterUnlockReady ?? false

  return (
    <div className="min-h-screen legacy-gradient">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-legacy-700/30">
              <BookHeart className="h-6 w-6 text-legacy-400" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold text-legacy-100">Niakofa</h1>
              <p className="text-xs text-legacy-400">Living Family Legacy</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/legacy/achievements')}
              className="flex items-center gap-1.5 rounded-lg border border-legacy-800/50 px-3 py-2 text-sm text-legacy-200 transition hover:border-legacy-600 hover:bg-legacy-800/30"
            >
              <Trophy className="h-4 w-4" />
              <span className="hidden sm:inline">Achievements</span>
            </button>
            <button
              onClick={() => navigate('/legacy/map')}
              className="flex items-center gap-1.5 rounded-lg border border-legacy-800/50 px-3 py-2 text-sm text-legacy-200 transition hover:border-legacy-600 hover:bg-legacy-800/30"
            >
              <Map className="h-4 w-4" />
              <span className="hidden sm:inline">World Map</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Hero / Today's Journey */}
        <section className="mb-12 animate-fade-in">
          {topAncestor ? (
            <div className="legacy-card legacy-glow overflow-hidden p-8">
              <div className="mb-6 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-legacy-400" />
                <span className="text-sm uppercase tracking-widest text-legacy-400">Today's Journey</span>
              </div>
              <p className="mb-2 font-serif text-2xl text-legacy-100">
                Tonight, you will walk in the footsteps of someone who came before you.
              </p>
              <div className="my-6 border-t border-legacy-800/50" />
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                <div className="flex-shrink-0">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-legacy-600 to-legacy-800 text-3xl font-bold text-legacy-100">
                    {topAncestor.member.display_name.charAt(0)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs uppercase tracking-widest text-legacy-500">Your ancestor</p>
                  <h2 className="font-serif text-3xl font-bold text-legacy-100">{topAncestor.member.display_name}</h2>
                  <div className="mt-2 space-y-1 text-sm text-legacy-300">
                    <p>Born: {topAncestor.member.birth_year || 'Unknown'} — {topAncestor.member.birth_place || 'Unknown'}</p>
                    {topAncestor.member.role && <p>Role: {topAncestor.member.role}</p>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-1.5 text-sm">
                      <BookOpen className="h-4 w-4 text-legacy-400" />
                      <span className="text-legacy-200">{topAncestor.storyCount} stories</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-1.5 text-sm">
                      <MapPin className="h-4 w-4 text-legacy-400" />
                      <span className="text-legacy-200">{topAncestor.placeCount} locations</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-1.5 text-sm">
                      <Camera className="h-4 w-4 text-legacy-400" />
                      <span className="text-legacy-200">{topAncestor.photoCount} photo</span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-1.5 text-sm">
                      <Mic className="h-4 w-4 text-legacy-400" />
                      <span className="text-legacy-200">{topAncestor.interviewCount} interviews</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="my-6 border-t border-legacy-800/50" />
              <div className="mb-6">
                <p className="text-xs uppercase tracking-widest text-legacy-500">Chapter I</p>
                <h3 className="font-serif text-xl text-legacy-100">Before the Journey</h3>
                <p className="mt-1 text-sm text-legacy-300">
                  {topAncestor.member.bio || `Your family remembers that ${topAncestor.member.display_name} lived in a time of change and tradition.`}
                </p>
              </div>
              <button
                onClick={handleStartJourney}
                disabled={generating}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-legacy-600 to-legacy-500 px-6 py-4 font-semibold text-white transition hover:from-legacy-500 hover:to-legacy-400 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Generating Your World...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    <span>Begin Journey</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="legacy-card p-8 text-center">
              <BookHeart className="mx-auto mb-4 h-12 w-12 text-legacy-500" />
              <h2 className="font-serif text-2xl text-legacy-100">Your family story begins here</h2>
              <p className="mt-2 text-legacy-300">Add family members, memories, and places to begin your legacy journey.</p>
            </div>
          )}
        </section>

        {/* Game Mode Selector */}
        <section className="mb-12">
          <h2 className="mb-4 font-serif text-xl text-legacy-100">Game Modes</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {GAME_MODES.map(mode => {
              const Icon = mode.icon
              const isActive = selectedMode === mode.id
              return (
                <button
                  key={mode.id}
                  onClick={() => setSelectedMode(mode.id)}
                  className={`legacy-card p-4 text-left transition ${
                    isActive ? 'border-legacy-500 legacy-glow' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  <Icon className={`mb-2 h-6 w-6 ${mode.color}`} />
                  <h3 className="font-serif text-lg text-legacy-100">{mode.label}</h3>
                  <p className="text-xs text-legacy-400">{mode.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Mode-specific content */}
        {selectedMode === 'legacy' && (
          <LegacyModeContent
            world={world}
            ancestors={ancestors}
            completeness={completeness}
            quests={quests}
            navigate={navigate}
          />
        )}
        {selectedMode === 'exploration' && (
          <ExplorationModeContent places={places} events={events} navigate={navigate} />
        )}
        {selectedMode === 'quests' && (
          <QuestsModeContent quests={quests} navigate={navigate} />
        )}
        {selectedMode === 'reunion' && (
          <ReunionModeContent members={members} />
        )}
      </main>
    </div>
  )
}

// ── Legacy Mode Content ──────────────────────────────────────────────────────

function LegacyModeContent({ world, ancestors, completeness, quests, navigate }: {
  world: LegacyWorld | null
  ancestors: AncestorCandidate[]
  completeness: { total: number; chapterUnlockReady: boolean; dimensions: { key: string; label: string; score: number; max: number; count: number; hint: string }[] } | null
  quests: { id: string; title: string; description: string; quest_type: string; reward: string | null }[]
  navigate: (path: string) => void
}) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Readiness Score */}
      {completeness && (
        <div className="legacy-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-lg text-legacy-100">Vault Readiness</h3>
            <span className={`rounded-lg px-3 py-1 text-sm font-semibold ${
              completeness.chapterUnlockReady
                ? 'bg-accent-500/20 text-accent-300'
                : 'bg-legacy-700/30 text-legacy-300'
            }`}>
              {completeness.total}/100
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {completeness.dimensions.map(dim => (
              <div key={dim.key} className="rounded-lg bg-ink-800/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-legacy-300">{dim.label}</span>
                  <span className="text-legacy-400">{dim.score}/{dim.max}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                    style={{ width: `${(dim.score / dim.max) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-legacy-500">{dim.count} entries</p>
              </div>
            ))}
          </div>
          {!completeness.chapterUnlockReady && (
            <p className="mt-4 text-sm text-legacy-400">
              Score {CHAPTER_UNLOCK_THRESHOLD}+ to unlock chapters. Add more family data to increase your readiness.
            </p>
          )}
        </div>
      )}

      {/* Ancestor Selection */}
      {ancestors.length > 0 && (
        <div>
          <h3 className="mb-4 font-serif text-lg text-legacy-100">Playable Ancestors</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {ancestors.slice(0, 4).map((candidate, idx) => (
              <button
                key={candidate.member.id}
                onClick={() => navigate(`/legacy/character/${candidate.member.id}`)}
                className="legacy-card group p-5 text-left transition hover:border-legacy-500 hover:legacy-glow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-legacy-600 to-legacy-800 text-xl font-bold text-legacy-100">
                    {candidate.member.display_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-serif text-lg text-legacy-100">{candidate.member.display_name}</h4>
                    <p className="text-sm text-legacy-400">
                      {candidate.member.birth_year || '?'} — {candidate.member.death_year || ''}
                    </p>
                    <p className="mt-2 text-xs text-legacy-500">{candidate.selectionReason}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                          style={{ width: `${candidate.completenessScore}%` }}
                        />
                      </div>
                      <span className="text-xs text-legacy-400">{candidate.completenessScore}%</span>
                    </div>
                  </div>
                </div>
                {idx === 0 && (
                  <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-legacy-500/20 px-2 py-0.5 text-xs text-legacy-300">
                    <Star className="h-3 w-3" /> Recommended
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Mystery Quests */}
      {quests.length > 0 && (
        <div>
          <h3 className="mb-4 font-serif text-lg text-legacy-100">Mystery Quests</h3>
          <div className="space-y-3">
            {quests.map(quest => (
              <div key={quest.id} className="legacy-card p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-legacy-700/30">
                    {quest.quest_type === 'mystery' && <Sparkles className="h-5 w-5 text-legacy-400" />}
                    {quest.quest_type === 'preservation' && <Mic className="h-5 w-5 text-legacy-400" />}
                    {quest.quest_type === 'exploration' && <Globe2 className="h-5 w-5 text-legacy-400" />}
                    {quest.quest_type === 'reconnection' && <Users className="h-5 w-5 text-legacy-400" />}
                    {quest.quest_type === 'cultural' && <BookHeart className="h-5 w-5 text-legacy-400" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-serif text-base text-legacy-100">{quest.title}</h4>
                    <p className="mt-1 text-sm text-legacy-300">{quest.description}</p>
                    {quest.reward && (
                      <p className="mt-2 text-xs text-accent-400">
                        <Sparkles className="mr-1 inline h-3 w-3" />
                        {quest.reward}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Exploration Mode ─────────────────────────────────────────────────────────

function ExplorationModeContent({ places, events, navigate }: {
  places: FamilyPlace[]
  events: FamilyEvent[]
  navigate: (path: string) => void
}) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="legacy-card p-6">
        <h3 className="mb-4 font-serif text-lg text-legacy-100">Family World Map</h3>
        <p className="mb-4 text-sm text-legacy-300">
          Explore the real locations connected to your family's history. Each place holds stories and memories.
        </p>
        <button
          onClick={() => navigate('/legacy/map')}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-legacy-700/50 bg-legacy-800/30 px-4 py-3 text-legacy-100 transition hover:border-legacy-500 hover:bg-legacy-700/30"
        >
          <Map className="h-5 w-5" />
          Open World Map
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {places.map(place => {
          const placeEvents = events.filter(e => e.place_id === place.id)
          return (
            <div key={place.id} className="legacy-card p-5">
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 h-5 w-5 text-legacy-400" />
                <div>
                  <h4 className="font-serif text-lg text-legacy-100">{place.label}</h4>
                  {place.country && <p className="text-sm text-legacy-400">{place.country}</p>}
                  {place.historical_context && (
                    <p className="mt-2 text-sm text-legacy-300">{place.historical_context}</p>
                  )}
                  {placeEvents.length > 0 && (
                    <p className="mt-2 text-xs text-legacy-500">{placeEvents.length} event(s) at this location</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Quests Mode ──────────────────────────────────────────────────────────────

function QuestsModeContent({ quests, navigate }: {
  quests: { id: string; title: string; description: string; quest_type: string; reward: string | null }[]
  navigate: (path: string) => void
}) {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="legacy-card p-6">
        <h3 className="font-serif text-lg text-legacy-100">Preservation Missions</h3>
        <p className="mt-1 text-sm text-legacy-300">
          Complete these missions to enrich your family world. Each completed quest unlocks new content.
        </p>
      </div>
      {quests.length === 0 ? (
        <div className="legacy-card p-6 text-center">
          <Target className="mx-auto mb-3 h-8 w-8 text-legacy-500" />
          <p className="text-legacy-300">No active quests. Add more family data to generate new missions.</p>
        </div>
      ) : (
        quests.map(quest => (
          <div key={quest.id} className="legacy-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-legacy-700/30">
                <Target className="h-5 w-5 text-legacy-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-serif text-base text-legacy-100">{quest.title}</h4>
                <p className="mt-1 text-sm text-legacy-300">{quest.description}</p>
                {quest.reward && (
                  <p className="mt-2 text-xs text-accent-400">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    Reward: {quest.reward}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ── Reunion Mode ─────────────────────────────────────────────────────────────

function ReunionModeContent({ members }: { members: FamilyMember[] }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="legacy-card p-6">
        <h3 className="font-serif text-lg text-legacy-100">Family Reunion</h3>
        <p className="mt-1 text-sm text-legacy-300">
          Collaborative challenges bring your family together. Contribute memories, photos, and stories to unlock shared achievements.
        </p>
      </div>
      <div className="legacy-card p-6">
        <h4 className="mb-4 font-serif text-base text-legacy-100">Family Leaderboard</h4>
        <div className="space-y-3">
          {members.slice(0, 5).map((member, idx) => (
            <div key={member.id} className="flex items-center gap-3">
              <span className="w-6 text-center font-serif text-lg text-legacy-400">{idx + 1}</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-legacy-600 to-legacy-800 text-sm font-bold text-legacy-100">
                {member.display_name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm text-legacy-100">{member.display_name}</p>
                <p className="text-xs text-legacy-500">{member.role || 'Family member'}</p>
              </div>
              <span className="text-sm text-legacy-400">{Math.floor(Math.random() * 500 + 100)} pts</span>
            </div>
          ))}
        </div>
      </div>
      <div className="legacy-card p-6">
        <h4 className="mb-3 font-serif text-base text-legacy-100">Active Challenge</h4>
        <p className="text-sm text-legacy-300">The Family Migration Challenge</p>
        <p className="mt-1 text-xs text-legacy-500">5 relatives need to contribute: 1 interview, 3 photos, 1 location, 1 historical document</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-700">
          <div className="stat-bar h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400" style={{ width: '40%' }} />
        </div>
        <p className="mt-2 text-xs text-legacy-500">2 of 5 contributions received</p>
      </div>
    </div>
  )
}
