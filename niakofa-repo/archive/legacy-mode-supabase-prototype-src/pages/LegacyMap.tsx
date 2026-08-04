import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MapPin, Globe2, Clock,
  ChevronRight, Navigation, Star, Calendar,
  Sparkles, Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { generateFamilyStages, type FamilyStage } from '@/lib/legacyEngine'
import type { FamilyPlace, FamilyEvent, FamilyMember } from '@/lib/types'

export default function LegacyMap() {
  const navigate = useNavigate()
  const [places, setPlaces] = useState<FamilyPlace[]>([])
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [members, setMembers] = useState<FamilyMember[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStage, setSelectedStage] = useState<FamilyStage | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [placesRes, eventsRes, membersRes] = await Promise.all([
          supabase.from('family_places').select('*').order('created_at'),
          supabase.from('family_events').select('*').order('event_year'),
          supabase.from('family_members').select('*').order('created_at'),
        ])
        setPlaces((placesRes.data || []) as FamilyPlace[])
        setEvents((eventsRes.data || []) as FamilyEvent[])
        setMembers((membersRes.data || []) as FamilyMember[])
      } catch (err) {
        console.error('Failed to load map:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <Loader2 className="h-12 w-12 animate-spin text-legacy-400" />
      </div>
    )
  }

  const ancestor = members.length > 0 ? members[0] : null
  const stages = generateFamilyStages(places, events, ancestor)

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
          <h1 className="font-serif text-xl text-legacy-100">Family World Map</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {stages.length === 0 ? (
          <div className="legacy-card p-8 text-center">
            <MapPin className="mx-auto mb-4 h-12 w-12 text-legacy-500" />
            <h2 className="font-serif text-xl text-legacy-100">No places yet</h2>
            <p className="mt-2 text-sm text-legacy-300">Add family places to see the migration route.</p>
          </div>
        ) : (
          <>
            {/* Migration route visualization */}
            <div className="mb-8 legacy-card p-6 animate-fade-in">
              <div className="mb-4 flex items-center gap-2">
                <Navigation className="h-5 w-5 text-legacy-400" />
                <h2 className="font-serif text-lg text-legacy-100">Migration Route</h2>
              </div>
              <p className="mb-4 text-sm text-legacy-400">
                {ancestor
                  ? `Following the life of ${ancestor.display_name}`
                  : 'Following your family\'s journey through time'}
              </p>
              <div className="space-y-2">
                {stages.map((stage, idx) => (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                        stage.is_ancestral_origin
                          ? 'bg-legacy-500/30'
                          : idx === stages.length - 1
                            ? 'bg-accent-500/30'
                            : 'bg-ink-700/50'
                      }`}>
                        {stage.is_ancestral_origin ? (
                          <Star className={`h-5 w-5 ${stage.is_ancestral_origin ? 'text-legacy-400' : 'text-legacy-500'}`} />
                        ) : (
                          <MapPin className={`h-5 w-5 ${idx === stages.length - 1 ? 'text-accent-400' : 'text-legacy-500'}`} />
                        )}
                      </div>
                      {idx < stages.length - 1 && (
                        <div className="h-8 w-px bg-legacy-800/50" />
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedStage(stage)}
                      className={`flex-1 legacy-card p-3 text-left transition hover:border-legacy-500 ${
                        selectedStage?.id === stage.id ? 'border-legacy-500 legacy-glow' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-serif text-lg text-legacy-100">{stage.label}</h3>
                            {stage.is_ancestral_origin && (
                              <span className="rounded-full bg-legacy-500/20 px-2 py-0.5 text-xs text-legacy-300">
                                Origin
                              </span>
                            )}
                          </div>
                          {stage.country && <p className="text-xs text-legacy-500">{stage.country}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-2 py-0.5 text-xs text-legacy-400">
                            <Calendar className="h-3 w-3" /> {stage.year}
                          </span>
                          {stage.events.length > 0 && (
                            <span className="rounded-full bg-legacy-500/20 px-2 py-0.5 text-xs text-legacy-300">
                              {stage.events.length} events
                            </span>
                          )}
                          <ChevronRight className="h-4 w-4 text-legacy-500" />
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage details */}
            {selectedStage && (
              <div className="legacy-card p-6 animate-fade-in">
                <div className="mb-4 flex items-center gap-3">
                  <Globe2 className="h-6 w-6 text-legacy-400" />
                  <div>
                    <h2 className="font-serif text-2xl text-legacy-100">{selectedStage.label}</h2>
                    {selectedStage.region && (
                      <p className="text-sm text-legacy-400">{selectedStage.region}, {selectedStage.country}</p>
                    )}
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-3 py-1 text-xs text-legacy-400">
                    <Calendar className="h-3 w-3" /> {selectedStage.year}
                  </span>
                  {selectedStage.is_ancestral_origin && (
                    <span className="flex items-center gap-1 rounded-full bg-legacy-500/20 px-3 py-1 text-xs text-legacy-300">
                      <Star className="h-3 w-3" /> Ancestral Origin
                    </span>
                  )}
                </div>

                {selectedStage.historical_context && (
                  <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                    <p className="text-xs uppercase tracking-widest text-blue-400">Historical Context</p>
                    <p className="mt-1 text-sm text-legacy-200">{selectedStage.historical_context}</p>
                  </div>
                )}

                {selectedStage.events.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 font-serif text-base text-legacy-100">Events at this location</h3>
                    <div className="space-y-2">
                      {selectedStage.events.map(event => (
                        <div key={event.id} className="flex items-start gap-2 rounded-lg bg-ink-800/30 p-3">
                          <Clock className="mt-0.5 h-4 w-4 text-legacy-500" />
                          <div>
                            <p className="text-sm text-legacy-100">{event.title}</p>
                            {event.description && <p className="text-xs text-legacy-400">{event.description}</p>}
                            {event.event_year && <p className="text-xs text-legacy-500">{event.event_year}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* All places grid */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {places.map(place => {
                const stage = stages.find(s => s.place_id === place.id)
                return (
                  <button
                    key={place.id}
                    onClick={() => setSelectedStage(stage || null)}
                    className={`legacy-card p-4 text-left transition ${
                      selectedStage?.place_id === place.id ? 'border-legacy-500 legacy-glow' : 'hover:border-legacy-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Navigation className="mt-1 h-5 w-5 text-legacy-400" />
                      <div>
                        <h3 className="font-serif text-lg text-legacy-100">{place.label}</h3>
                        {place.country && <p className="text-xs text-legacy-500">{place.country}</p>}
                        <p className="mt-1 text-xs text-legacy-400">
                          {stage?.events.length || 0} event(s)
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
