import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MapPin, Globe2, Clock,
  ChevronRight, Navigation, Star,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { FamilyPlace, FamilyEvent } from '@/lib/types'

export default function LegacyMap() {
  const navigate = useNavigate()
  const [places, setPlaces] = useState<FamilyPlace[]>([])
  const [events, setEvents] = useState<FamilyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlace, setSelectedPlace] = useState<FamilyPlace | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [placesRes, eventsRes] = await Promise.all([
          supabase.from('family_places').select('*').order('created_at'),
          supabase.from('family_events').select('*').order('event_year'),
        ])
        setPlaces((placesRes.data || []) as FamilyPlace[])
        setEvents((eventsRes.data || []) as FamilyEvent[])
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

  const placeEvents = (placeId: string) => events.filter(e => e.place_id === placeId)

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
        {/* Migration route visualization */}
        <div className="mb-8 legacy-card p-6 animate-fade-in">
          <h2 className="mb-4 font-serif text-lg text-legacy-100">Migration Route</h2>
          <div className="space-y-2">
            {places.map((place, idx) => (
              <div key={place.id} className="flex items-center gap-3">
                <div className="flex flex-col items-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                    idx === 0 ? 'bg-legacy-500/30' : 'bg-ink-700/50'
                  }`}>
                    <MapPin className={`h-5 w-5 ${idx === 0 ? 'text-legacy-400' : 'text-legacy-500'}`} />
                  </div>
                  {idx < places.length - 1 && (
                    <div className="h-8 w-px bg-legacy-800/50" />
                  )}
                </div>
                <button
                  onClick={() => setSelectedPlace(place)}
                  className="flex-1 legacy-card p-3 text-left transition hover:border-legacy-500"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-serif text-lg text-legacy-100">{place.label}</h3>
                      {place.country && <p className="text-xs text-legacy-500">{place.country}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {placeEvents(place.id).length > 0 && (
                        <span className="rounded-full bg-legacy-500/20 px-2 py-0.5 text-xs text-legacy-300">
                          {placeEvents(place.id).length} events
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

        {/* Place details */}
        {selectedPlace && (
          <div className="legacy-card p-6 animate-fade-in">
            <div className="mb-4 flex items-center gap-3">
              <Globe2 className="h-6 w-6 text-legacy-400" />
              <h2 className="font-serif text-2xl text-legacy-100">{selectedPlace.label}</h2>
            </div>
            {selectedPlace.region && (
              <p className="text-sm text-legacy-400">{selectedPlace.region}, {selectedPlace.country}</p>
            )}
            {selectedPlace.historical_context && (
              <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="text-xs uppercase tracking-widest text-blue-400">Historical Context</p>
                <p className="mt-1 text-sm text-legacy-200">{selectedPlace.historical_context}</p>
              </div>
            )}
            {placeEvents(selectedPlace.id).length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 font-serif text-base text-legacy-100">Events at this location</h3>
                <div className="space-y-2">
                  {placeEvents(selectedPlace.id).map(event => (
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
          {places.map(place => (
            <button
              key={place.id}
              onClick={() => setSelectedPlace(place)}
              className={`legacy-card p-4 text-left transition ${
                selectedPlace?.id === place.id ? 'border-legacy-500 legacy-glow' : 'hover:border-legacy-600'
              }`}
            >
              <div className="flex items-start gap-3">
                <Navigation className="mt-1 h-5 w-5 text-legacy-400" />
                <div>
                  <h3 className="font-serif text-lg text-legacy-100">{place.label}</h3>
                  {place.country && <p className="text-xs text-legacy-500">{place.country}</p>}
                  <p className="mt-1 text-xs text-legacy-400">
                    {placeEvents(place.id).length} event(s)
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
