import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Play, Crown, MapPin, BookOpen, Mic,
  Camera, Users, Star, Loader2, Sparkles, ChevronRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { selectAncestorCandidates, generateChapters, createOrUpdateWorld, createSession, calculateCompleteness } from '@/lib/legacyEngine'
import type { FamilyMember, FamilyMemory, FamilyPlace, FamilyEvent, FamilyInterview, FamilyArtifact, AncestorCandidate } from '@/lib/types'

export default function LegacyStart() {
  const navigate = useNavigate()
  const [ancestors, setAncestors] = useState<AncestorCandidate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [readiness, setReadiness] = useState<{ total: number; chapterUnlockReady: boolean } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [membersRes, memoriesRes, placesRes, eventsRes, interviewsRes, artifactsRes] = await Promise.all([
        supabase.from('family_members').select('*'),
        supabase.from('family_memories').select('*'),
        supabase.from('family_places').select('*'),
        supabase.from('family_events').select('*'),
        supabase.from('family_interviews').select('*'),
        supabase.from('family_artifacts').select('*'),
      ])

      const m = (membersRes.data || []) as FamilyMember[]
      const mem = (memoriesRes.data || []) as FamilyMemory[]
      const p = (placesRes.data || []) as FamilyPlace[]
      const ev = (eventsRes.data || []) as FamilyEvent[]
      const iv = (interviewsRes.data || []) as FamilyInterview[]
      const art = (artifactsRes.data || []) as FamilyArtifact[]

      const candidates = selectAncestorCandidates(m, mem, ev, p, iv, art)
      setAncestors(candidates)

      const score = calculateCompleteness(m, mem, ev, p, iv)
      setReadiness(score)

      if (candidates.length > 0) setSelectedId(candidates[0].member.id)
    } catch (err) {
      console.error('Failed to load ancestors:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleBegin = async () => {
    const candidate = ancestors.find(a => a.member.id === selectedId)
    if (!candidate) return
    setInitializing(true)
    try {
      const chapters = generateChapters(candidate.member, ancestors.flatMap(_ => []), [], [], [])
      const world = await createOrUpdateWorld(candidate.member.family_id, candidate.member, chapters)
      if (world) {
        const firstChapter = chapters[0]
        const { data: chapterRow } = await supabase
          .from('legacy_chapters')
          .select('id')
          .eq('world_id', world.id)
          .eq('chapter_number', 1)
          .maybeSingle()

        if (chapterRow) {
          const session = await createSession(world.id, chapterRow.id)
          if (session) {
            await supabase
              .from('legacy_chapters')
              .update({ status: 'in_progress', updated_at: new Date().toISOString() })
              .eq('id', chapterRow.id)
            navigate(`/legacy/play/${session.id}`)
            return
          }
        }
      }
      navigate('/legacy')
    } catch (err) {
      console.error('Failed to begin journey:', err)
      navigate('/legacy')
    } finally {
      setInitializing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <Loader2 className="h-12 w-12 animate-spin text-legacy-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen legacy-gradient">
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate('/legacy')}
            className="flex items-center gap-1.5 text-sm text-legacy-200 transition hover:text-legacy-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 text-center animate-fade-in">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-legacy-400" />
          <h1 className="font-serif text-3xl font-bold text-legacy-100">Choose Your Ancestor</h1>
          <p className="mt-2 text-legacy-300">
            You will experience the life of one of your family members. Choose wisely.
          </p>
        </div>

        {readiness && !readiness.chapterUnlockReady && (
          <div className="mb-6 legacy-card border-legacy-700/50 p-4 text-center">
            <p className="text-sm text-legacy-300">
              Your vault readiness is {readiness.total}/100. Add more family data to unlock the full experience.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {ancestors.map((candidate, idx) => {
            const isSelected = selectedId === candidate.member.id
            return (
              <button
                key={candidate.member.id}
                onClick={() => setSelectedId(candidate.member.id)}
                className={`legacy-card w-full p-6 text-left transition ${
                  isSelected ? 'border-legacy-500 legacy-glow' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-legacy-600 to-legacy-800 text-2xl font-bold text-legacy-100">
                    {candidate.member.display_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-2xl text-legacy-100">{candidate.member.display_name}</h3>
                      {idx === 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-legacy-500/20 px-2 py-0.5 text-xs text-legacy-300">
                          <Star className="h-3 w-3" /> Recommended
                        </span>
                      )}
                    </div>
                    <div className="mt-1 space-y-0.5 text-sm text-legacy-400">
                      <p>Born: {candidate.member.birth_year || 'Unknown'} — {candidate.member.birth_place || 'Unknown'}</p>
                      {candidate.member.role && <p>Role: {candidate.member.role}</p>}
                    </div>
                    {candidate.member.bio && (
                      <p className="mt-3 text-sm text-legacy-300 line-clamp-2">{candidate.member.bio}</p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="flex items-center gap-1 rounded-lg bg-ink-800/50 px-2.5 py-1 text-xs text-legacy-300">
                        <BookOpen className="h-3.5 w-3.5" /> {candidate.storyCount} stories
                      </span>
                      <span className="flex items-center gap-1 rounded-lg bg-ink-800/50 px-2.5 py-1 text-xs text-legacy-300">
                        <MapPin className="h-3.5 w-3.5" /> {candidate.placeCount} locations
                      </span>
                      <span className="flex items-center gap-1 rounded-lg bg-ink-800/50 px-2.5 py-1 text-xs text-legacy-300">
                        <Mic className="h-3.5 w-3.5" /> {candidate.interviewCount} interviews
                      </span>
                      <span className="flex items-center gap-1 rounded-lg bg-ink-800/50 px-2.5 py-1 text-xs text-legacy-300">
                        <Camera className="h-3.5 w-3.5" /> {candidate.photoCount} photo
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                          style={{ width: `${candidate.completenessScore}%` }}
                        />
                      </div>
                      <span className="text-xs text-legacy-400">{candidate.completenessScore}% complete</span>
                    </div>
                    {isSelected && (
                      <p className="mt-3 text-xs text-accent-400">
                        <ChevronRight className="mr-1 inline h-3 w-3" />
                        {candidate.selectionReason}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {selectedId && (
          <div className="mt-8 animate-slide-up">
            <button
              onClick={handleBegin}
              disabled={initializing}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-legacy-600 to-legacy-500 px-6 py-4 font-semibold text-white transition hover:from-legacy-500 hover:to-legacy-400 disabled:opacity-50"
            >
              {initializing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Initializing Your Journey...</span>
                </>
              ) : (
                <>
                  <Crown className="h-5 w-5" />
                  <span>Begin Journey</span>
                </>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
