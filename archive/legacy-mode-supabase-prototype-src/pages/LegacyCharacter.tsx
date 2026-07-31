import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen, Mic,
  Camera, Users, Star, Crown, Heart, Brain, Globe2,
  Flame, BookHeart, FileText, Play,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { FamilyMember, FamilyMemory, FamilyEvent, FamilyPlace, FamilyArtifact, GameStats } from '@/lib/types'

const STAT_DESCRIPTIONS: Record<keyof GameStats, { label: string; icon: typeof Brain; description: string }> = {
  knowledge: { label: 'Knowledge', icon: Brain, description: 'Unlocks historical clues and context in scenes' },
  relationships: { label: 'Relationships', icon: Users, description: 'Changes how family and community characters respond' },
  cultural_wisdom: { label: 'Cultural Wisdom', icon: Globe2, description: 'Unlocks traditions, languages, recipes, and music' },
  courage: { label: 'Courage', icon: Flame, description: 'Allows facing difficult historical challenges' },
  reputation: { label: 'Reputation', icon: Crown, description: 'Affects how NPCs treat you in the story' },
  legacy: { label: 'Legacy', icon: Heart, description: 'The lasting impact you leave for future generations' },
}

export default function LegacyCharacter() {
  const { memberId } = useParams<{ memberId: string }>()
  const navigate = useNavigate()
  const [member, setMember] = useState<FamilyMember | null>(null)
  const [memories, setMemories] = useState<FamilyMemory[]>([])
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [places, setPlaces] = useState<FamilyPlace[]>([])
  const [artifacts, setArtifacts] = useState<FamilyArtifact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!memberId) return
    (async () => {
      setLoading(true)
      try {
        const { data: memberData } = await supabase
          .from('family_members')
          .select('*')
          .eq('id', memberId)
          .maybeSingle()
        if (!memberData) { navigate('/legacy'); return }
        setMember(memberData as FamilyMember)

        const [memRes, evtRes, plcRes, artRes] = await Promise.all([
          supabase.from('family_memories').select('*').eq('member_id', memberId),
          supabase.from('family_events').select('*').eq('member_id', memberId).order('event_year'),
          supabase.from('family_places').select('*'),
          supabase.from('family_artifacts').select('*').eq('member_id', memberId),
        ])
        setMemories((memRes.data || []) as FamilyMemory[])
        setEvents((evtRes.data || []) as FamilyEvent[])
        setPlaces((plcRes.data || []) as FamilyPlace[])
        setArtifacts((artRes.data || []) as FamilyArtifact[])
      } catch (err) {
        console.error('Failed to load character:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [memberId, navigate])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <Loader2 className="h-12 w-12 animate-spin text-legacy-400" />
      </div>
    )
  }

  if (!member) return null

  const stats: GameStats = {
    knowledge: Math.min(memories.length * 8 + 10, 100),
    relationships: Math.min(events.length * 5 + 10, 100),
    cultural_wisdom: Math.min(places.length * 6 + 5, 100),
    courage: Math.min(events.filter(e => e.event_type === 'migration').length * 15 + 10, 100),
    reputation: Math.min(memories.length * 3 + 20, 100),
    legacy: Math.min(memories.length * 5 + artifacts.length * 10, 100),
  }

  const memberPlaces = places.filter(p =>
    events.some(e => e.place_id === p.id && e.member_id === memberId) ||
    member.birth_place?.toLowerCase().includes(p.label.toLowerCase())
  )

  return (
    <div className="min-h-screen legacy-gradient">
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate('/legacy')}
            className="flex items-center gap-1.5 text-sm text-legacy-200 transition hover:text-legacy-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hub
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Character header */}
        <div className="legacy-card overflow-hidden p-8 animate-fade-in">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex-shrink-0">
              {member.photo_url ? (
                <img src={member.photo_url} alt={member.display_name} className="h-32 w-32 rounded-full object-cover" />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-legacy-500 to-legacy-800 text-5xl font-bold text-white">
                  {member.display_name.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-3xl font-bold text-legacy-100">{member.display_name}</h1>
                {member.storytelling_consent && (
                  <span className="flex items-center gap-1 rounded-full bg-accent-500/20 px-2 py-0.5 text-xs text-accent-300">
                    <Star className="h-3 w-3" /> Consent Given
                  </span>
                )}
              </div>
              {member.role && <p className="mt-1 text-legacy-400">{member.role}</p>}
              {member.relation_note && <p className="mt-0.5 text-sm text-legacy-500">{member.relation_note}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-legacy-300">
                {member.birth_year && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-legacy-500" />
                    Born: {member.birth_year}
                  </span>
                )}
                {member.death_year && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-legacy-500" />
                    Died: {member.death_year}
                  </span>
                )}
                {member.birth_place && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-legacy-500" />
                    {member.birth_place}
                  </span>
                )}
              </div>
              {member.bio && (
                <div className="mt-4 rounded-lg border border-legacy-800/50 bg-ink-800/30 p-4">
                  <p className="text-sm text-legacy-200" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem' }}>
                    {member.bio}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Stats with descriptions */}
          <div className="mt-6">
            <h2 className="mb-3 font-serif text-lg text-legacy-100">Character Stats</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.entries(STAT_DESCRIPTIONS) as [keyof GameStats, typeof STAT_DESCRIPTIONS[keyof GameStats]][]).map(([key, config]) => {
                const value = stats[key]
                const Icon = config.icon
                return (
                  <div key={key} className="rounded-lg bg-ink-800/40 p-4">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${value > 0 ? 'text-legacy-400' : 'text-ink-600'}`} />
                      <span className="text-sm font-semibold text-legacy-100">{config.label}</span>
                      <span className="ml-auto text-lg font-bold text-legacy-100">{value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                        style={{ width: `${Math.min(value, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-legacy-500">{config.description}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Play button */}
          <button
            onClick={() => navigate('/legacy/start')}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-legacy-600 to-legacy-500 px-6 py-4 font-semibold text-white transition hover:from-legacy-500 hover:to-legacy-400"
          >
            <Play className="h-5 w-5" />
            Play as {member.display_name}
          </button>
        </div>

        {/* Life Timeline */}
        {events.length > 0 && (
          <div className="mt-8 legacy-card p-6">
            <h2 className="mb-4 font-serif text-xl text-legacy-100">Life Timeline</h2>
            <div className="space-y-3">
              {events.map(event => {
                const eventPlace = places.find(p => p.id === event.place_id)
                return (
                  <div key={event.id} className="flex items-start gap-3 rounded-lg bg-ink-800/30 p-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-legacy-700/30">
                      <Calendar className="h-4 w-4 text-legacy-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-legacy-100">{event.title}</h3>
                        {event.event_year && <span className="text-xs text-legacy-500">{event.event_year}</span>}
                      </div>
                      {event.description && <p className="mt-1 text-xs text-legacy-300">{event.description}</p>}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-block rounded-full bg-ink-700/50 px-2 py-0.5 text-xs capitalize text-legacy-500">
                          {event.event_type}
                        </span>
                        {eventPlace && (
                          <span className="flex items-center gap-1 text-xs text-legacy-500">
                            <MapPin className="h-3 w-3" /> {eventPlace.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Memories */}
        {memories.length > 0 && (
          <div className="mt-8 legacy-card p-6">
            <h2 className="mb-4 font-serif text-xl text-legacy-100">
              <BookOpen className="mr-2 inline h-5 w-5 text-legacy-400" />
              Stories & Memories
            </h2>
            <div className="space-y-3">
              {memories.map(memory => (
                <div key={memory.id} className="rounded-lg bg-ink-800/30 p-4">
                  {memory.title && <h3 className="text-sm font-semibold text-legacy-100">{memory.title}</h3>}
                  <p className="mt-1 text-sm text-legacy-300">{memory.description}</p>
                  {memory.tags && memory.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {memory.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-legacy-700/30 px-2 py-0.5 text-xs text-legacy-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Artifacts */}
        {artifacts.length > 0 && (
          <div className="mt-8 legacy-card p-6">
            <h2 className="mb-4 font-serif text-xl text-legacy-100">
              <FileText className="mr-2 inline h-5 w-5 text-legacy-400" />
              Artifacts & Heirlooms
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {artifacts.map(artifact => (
                <div key={artifact.id} className="rounded-lg bg-ink-800/30 p-4">
                  {artifact.photo_url && (
                    <img src={artifact.photo_url} alt={artifact.name} className="mb-2 h-32 w-full rounded-lg object-cover" />
                  )}
                  <h3 className="font-serif text-base text-legacy-100">{artifact.name}</h3>
                  {artifact.date_origin && <p className="text-xs text-legacy-500">{artifact.date_origin}</p>}
                  {artifact.location && <p className="text-xs text-legacy-500"><MapPin className="mr-1 inline h-3 w-3" />{artifact.location}</p>}
                  {artifact.description && <p className="mt-1 text-sm text-legacy-300">{artifact.description}</p>}
                  {artifact.story && (
                    <p className="mt-2 text-xs text-legacy-400 italic">{artifact.story}</p>
                  )}
                  {artifact.unlocked_by && (
                    <p className="mt-2 text-xs text-accent-400">Unlocked by: {artifact.unlocked_by}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Connected Places */}
        {memberPlaces.length > 0 && (
          <div className="mt-8 legacy-card p-6">
            <h2 className="mb-4 font-serif text-xl text-legacy-100">
              <MapPin className="mr-2 inline h-5 w-5 text-legacy-400" />
              Connected Places
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {memberPlaces.map(place => (
                <div key={place.id} className="rounded-lg bg-ink-800/30 p-3">
                  <h3 className="text-sm font-semibold text-legacy-100">{place.label}</h3>
                  {place.country && <p className="text-xs text-legacy-500">{place.country}</p>}
                  {place.historical_context && (
                    <p className="mt-1 text-xs text-legacy-400 line-clamp-2">{place.historical_context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
