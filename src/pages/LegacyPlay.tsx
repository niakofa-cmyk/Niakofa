import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, MapPin, Calendar, BookOpen,
  CheckCircle2, ChevronRight, Sparkles, AlertCircle,
  Shield, Clock, Volume2, Heart, Brain, Users,
  Globe2, Flame, Crown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadChapterScenes, updateSessionProgress, completeChapter, unlockNextChapter } from '@/lib/legacyEngine'
import type { LegacyScene, LegacyDialogue, LegacyChoice, LegacySession, GameStats, ChoiceRecord, LegacyChapter } from '@/lib/types'

const DEFAULT_STATS: GameStats = {
  knowledge: 0,
  relationships: 0,
  cultural_wisdom: 0,
  courage: 0,
  reputation: 0,
  legacy: 0,
}

const STAT_ICONS: Record<keyof GameStats, typeof Brain> = {
  knowledge: Brain,
  relationships: Users,
  cultural_wisdom: Globe2,
  courage: Flame,
  reputation: Crown,
  legacy: Heart,
}

const STAT_LABELS: Record<keyof GameStats, string> = {
  knowledge: 'Knowledge',
  relationships: 'Relationships',
  cultural_wisdom: 'Cultural Wisdom',
  courage: 'Courage',
  reputation: 'Reputation',
  legacy: 'Legacy',
}

export default function LegacyPlay() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<LegacySession | null>(null)
  const [chapter, setChapter] = useState<LegacyChapter | null>(null)
  const [scenes, setScenes] = useState<LegacyScene[]>([])
  const [dialogues, setDialogues] = useState<LegacyDialogue[]>([])
  const [choices, setChoices] = useState<LegacyChoice[]>([])
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS)
  const [choicesMade, setChoicesMade] = useState<ChoiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showConsequence, setShowConsequence] = useState<string | null>(null)
  const [chapterComplete, setChapterComplete] = useState(false)
  const [dialogueIndex, setDialogueIndex] = useState(0)

  const loadSession = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const { data: sessionData } = await supabase
        .from('legacy_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle()

      if (!sessionData) {
        navigate('/legacy')
        return
      }

      const s = sessionData as LegacySession
      setSession(s)
      setStats(s.stats || DEFAULT_STATS)
      setChoicesMade(s.choices_made || [])
      setCurrentSceneIndex(s.scene_index || 0)

      if (s.chapter_id) {
        const { data: chapterData } = await supabase
          .from('legacy_chapters')
          .select('*')
          .eq('id', s.chapter_id)
          .maybeSingle()

        if (chapterData) {
          setChapter(chapterData as LegacyChapter)
          const sceneData = await loadChapterScenes(s.chapter_id)
          setScenes(sceneData.scenes)
          setDialogues(sceneData.dialogues)
          setChoices(sceneData.choices)
        }
      }
    } catch (err) {
      console.error('Failed to load session:', err)
    } finally {
      setLoading(false)
    }
  }, [sessionId, navigate])

  useEffect(() => { loadSession() }, [loadSession])

  const currentScene = scenes[currentSceneIndex]
  const sceneDialogues = currentScene
    ? dialogues.filter(d => d.scene_id === currentScene.id)
    : []
  const sceneChoices = currentScene
    ? choices.filter(c => c.scene_id === currentScene.id)
    : []

  const handleChoice = async (choice: LegacyChoice) => {
    setShowConsequence(choice.consequence)

    const newStats = { ...stats }
    for (const [key, value] of Object.entries(choice.stat_effects)) {
      const statKey = key as keyof GameStats
      newStats[statKey] = Math.min(100, newStats[statKey] + (value || 0))
    }
    setStats(newStats)

    const choiceRecord: ChoiceRecord = {
      scene_id: currentScene.id,
      choice_text: choice.text,
      consequence: choice.consequence,
      stat_effects: choice.stat_effects,
      timestamp: new Date().toISOString(),
    }
    const newChoicesMade = [...choicesMade, choiceRecord]
    setChoicesMade(newChoicesMade)

    if (session) {
      await updateSessionProgress(session.id, currentSceneIndex, newStats, newChoicesMade)
    }

    setTimeout(() => {
      setShowConsequence(null)
      setDialogueIndex(0)
      if (currentSceneIndex < scenes.length - 1) {
        const nextIndex = currentSceneIndex + 1
        setCurrentSceneIndex(nextIndex)
        if (session) {
          updateSessionProgress(session.id, nextIndex, newStats, newChoicesMade)
        }
      } else {
        handleChapterComplete()
      }
    }, 2500)
  }

  const handleChapterComplete = async () => {
    setChapterComplete(true)
    if (session?.chapter_id) {
      await completeChapter(session.chapter_id)
      if (chapter?.world_id && chapter?.chapter_number) {
        await unlockNextChapter(chapter.world_id, chapter.chapter_number)
      }
    }
  }

  const handleNextChapter = async () => {
    if (!chapter?.world_id) { navigate('/legacy'); return }
    const { data: nextChapter } = await supabase
      .from('legacy_chapters')
      .select('*')
      .eq('world_id', chapter.world_id)
      .eq('status', 'unlocked')
      .order('chapter_number')
      .maybeSingle()

    if (nextChapter && session) {
      const newSession = await (async () => {
        const { data } = await supabase
          .from('legacy_sessions')
          .insert({
            world_id: session.world_id,
            chapter_id: nextChapter.id,
            scene_index: 0,
            status: 'active',
            stats,
            choices_made: [],
          })
          .select()
          .maybeSingle()
        return data
      })()

      await supabase
        .from('legacy_chapters')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', nextChapter.id)

      if (newSession) {
        navigate(`/legacy/play/${newSession.id}`)
        return
      }
    }
    navigate('/legacy')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <Loader2 className="h-12 w-12 animate-spin text-legacy-400" />
      </div>
    )
  }

  if (chapterComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient px-4">
        <div className="legacy-card max-w-lg p-8 text-center animate-fade-in">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-accent-400" />
          <h2 className="font-serif text-3xl font-bold text-legacy-100">Chapter Complete</h2>
          <p className="mt-2 text-legacy-300">
            You have experienced "{chapter?.title}". The choices you made have shaped your family's legacy.
          </p>
          <div className="my-6 grid grid-cols-3 gap-3">
            {Object.entries(stats).filter(([_, v]) => v > 0).map(([key, value]) => {
              const Icon = STAT_ICONS[key as keyof GameStats]
              return (
                <div key={key} className="rounded-lg bg-ink-800/40 p-3">
                  <Icon className="mx-auto mb-1 h-5 w-5 text-legacy-400" />
                  <p className="text-xs text-legacy-400">{STAT_LABELS[key as keyof GameStats]}</p>
                  <p className="text-lg font-bold text-legacy-100">+{value}</p>
                </div>
              )
            })}
          </div>
          <button
            onClick={handleNextChapter}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-legacy-600 to-legacy-500 px-6 py-4 font-semibold text-white transition hover:from-legacy-500 hover:to-legacy-400"
          >
            <ChevronRight className="h-5 w-5" />
            Continue to Next Chapter
          </button>
          <button
            onClick={() => navigate('/legacy')}
            className="mt-3 w-full text-sm text-legacy-400 transition hover:text-legacy-200"
          >
            Return to Hub
          </button>
        </div>
      </div>
    )
  }

  if (!currentScene) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient px-4">
        <div className="legacy-card max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-legacy-500" />
          <h2 className="font-serif text-xl text-legacy-100">No scenes available</h2>
          <p className="mt-2 text-sm text-legacy-300">This chapter has no scenes yet.</p>
          <button
            onClick={() => navigate('/legacy')}
            className="mt-4 w-full rounded-xl bg-legacy-700/40 px-4 py-3 text-legacy-100 transition hover:bg-legacy-600/40"
          >
            Return to Hub
          </button>
        </div>
      </div>
    )
  }

  const layerColors: Record<string, string> = {
    verified: 'text-accent-400 bg-accent-500/10 border-accent-500/30',
    historical_context: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    narrative_interpretation: 'text-legacy-400 bg-legacy-500/10 border-legacy-500/30',
  }

  const layerLabels: Record<string, string> = {
    verified: 'Verified Family History',
    historical_context: 'Historical Context',
    narrative_interpretation: 'Narrative Interpretation',
  }

  return (
    <div className="min-h-screen legacy-gradient">
      {/* Header with chapter info */}
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/legacy')}
              className="flex items-center gap-1.5 text-sm text-legacy-200 transition hover:text-legacy-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Exit
            </button>
            <div className="text-center">
              <p className="font-serif text-sm text-legacy-200">{chapter?.title}</p>
              <p className="text-xs text-legacy-500">
                Scene {currentSceneIndex + 1} of {scenes.length}
              </p>
            </div>
            <div className="w-12" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* Scene content */}
        <div key={currentScene.id} className="animate-fade-in">
          {/* Scene meta */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs ${layerColors[currentScene.historical_layer]}`}>
              <Shield className="mr-1 inline h-3 w-3" />
              {layerLabels[currentScene.historical_layer]}
            </span>
            {chapter?.year_label && (
              <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-3 py-1 text-xs text-legacy-400">
                <Calendar className="h-3 w-3" /> {chapter.year_label}
              </span>
            )}
            {chapter?.location_label && (
              <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-3 py-1 text-xs text-legacy-400">
                <MapPin className="h-3 w-3" /> {chapter.location_label}
              </span>
            )}
            {currentScene.time_of_day && (
              <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-3 py-1 text-xs text-legacy-400">
                <Clock className="h-3 w-3" /> {currentScene.time_of_day}
              </span>
            )}
          </div>

          {/* Scene title */}
          <h2 className="mb-4 font-serif text-2xl font-bold text-legacy-100">{currentScene.title}</h2>

          {/* Narration */}
          <div className="mb-6 scene-narration text-legacy-200">
            {currentScene.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="mb-4">{paragraph}</p>
            ))}
          </div>

          {/* Dialogue */}
          {sceneDialogues.length > 0 && !showConsequence && (
            <div className="mb-6 space-y-3">
              {sceneDialogues.slice(0, dialogueIndex + 1).map((dialogue, i) => (
                <div
                  key={dialogue.id}
                  className={`animate-slide-up rounded-lg p-4 ${
                    dialogue.speaker_relation === null
                      ? 'bg-legacy-700/20 border border-legacy-600/30'
                      : 'bg-ink-800/40 border border-ink-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-legacy-700/40 text-sm font-bold text-legacy-200">
                      {dialogue.speaker.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-legacy-100">{dialogue.speaker}</p>
                      {dialogue.speaker_relation && (
                        <p className="text-xs text-legacy-500">{dialogue.speaker_relation}</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-legacy-200" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem' }}>
                    "{dialogue.line}"
                  </p>
                  {i === dialogueIndex && dialogueIndex < sceneDialogues.length - 1 && (
                    <button
                      onClick={() => setDialogueIndex(dialogueIndex + 1)}
                      className="mt-2 flex items-center gap-1 text-xs text-legacy-400 transition hover:text-legacy-200"
                    >
                      <ChevronRight className="h-3 w-3" /> Continue dialogue
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Consequence display */}
          {showConsequence && (
            <div className="mb-6 animate-fade-in rounded-lg border border-legacy-500/30 bg-legacy-500/10 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-1 h-5 w-5 text-legacy-400" />
                <p className="text-legacy-100" style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.15rem' }}>
                  {showConsequence}
                </p>
              </div>
            </div>
          )}

          {/* Choices */}
          {!showConsequence && dialogueIndex >= sceneDialogues.length - 1 && (
            <div className="space-y-3">
              {sceneChoices.map(choice => (
                <button
                  key={choice.id}
                  onClick={() => handleChoice(choice)}
                  className="choice-button group flex w-full items-center justify-between rounded-xl border border-legacy-800/50 bg-ink-800/30 px-5 py-4 text-left transition"
                >
                  <span className="text-legacy-100">{choice.text}</span>
                  <div className="flex items-center gap-2">
                    {Object.entries(choice.stat_effects).map(([key, value]) => {
                      if (!value) return null
                      const Icon = STAT_ICONS[key as keyof GameStats]
                      return (
                        <span key={key} className="flex items-center gap-0.5 text-xs text-legacy-400">
                          <Icon className="h-3 w-3" /> +{value}
                        </span>
                      )
                    })}
                    <ChevronRight className="h-4 w-4 text-legacy-500 transition group-hover:text-legacy-300" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="fixed bottom-0 left-0 right-0 border-t border-legacy-800/50 bg-ink-950/90 backdrop-blur-md">
          <div className="mx-auto max-w-3xl px-4 py-3">
            <div className="grid grid-cols-6 gap-2">
              {Object.entries(stats).map(([key, value]) => {
                const Icon = STAT_ICONS[key as keyof GameStats]
                return (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <Icon className={`h-4 w-4 ${value > 0 ? 'text-legacy-400' : 'text-ink-600'}`} />
                    <div className="h-1 w-full overflow-hidden rounded-full bg-ink-700">
                      <div
                        className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                        style={{ width: `${Math.min(value, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-legacy-500">{value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div className="h-20" />
      </main>
    </div>
  )
}
