import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Lock, CheckCircle2, Play,
  MapPin, Calendar, BookOpen, ChevronRight, Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { loadChapterScenes, createSession } from '@/lib/legacyEngine'
import type { LegacyChapter, LegacyScene, LegacyWorld } from '@/lib/types'

export default function LegacyChapterView() {
  const { chapterId } = useParams<{ chapterId: string }>()
  const navigate = useNavigate()
  const [chapter, setChapter] = useState<LegacyChapter | null>(null)
  const [world, setWorld] = useState<LegacyWorld | null>(null)
  const [scenes, setScenes] = useState<LegacyScene[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!chapterId) return
    (async () => {
      setLoading(true)
      try {
        const { data: chapterData } = await supabase
          .from('legacy_chapters')
          .select('*')
          .eq('id', chapterId)
          .maybeSingle()

        if (!chapterData) { navigate('/legacy'); return }
        setChapter(chapterData as LegacyChapter)

        const { data: worldData } = await supabase
          .from('legacy_worlds')
          .select('*')
          .eq('id', chapterData.world_id)
          .maybeSingle()
        if (worldData) setWorld(worldData as LegacyWorld)

        const sceneData = await loadChapterScenes(chapterId)
        setScenes(sceneData.scenes)
      } catch (err) {
        console.error('Failed to load chapter:', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [chapterId, navigate])

  const handlePlay = async () => {
    if (!chapter || !world) return
    setStarting(true)
    try {
      const session = await createSession(world.id, chapter.id)
      if (session) {
        await supabase
          .from('legacy_chapters')
          .update({ status: 'in_progress', updated_at: new Date().toISOString() })
          .eq('id', chapter.id)
        navigate(`/legacy/play/${session.id}`)
      }
    } catch (err) {
      console.error('Failed to start chapter:', err)
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center legacy-gradient">
        <Loader2 className="h-12 w-12 animate-spin text-legacy-400" />
      </div>
    )
  }

  if (!chapter) return null

  const isLocked = chapter.status === 'locked'
  const isCompleted = chapter.status === 'completed'

  return (
    <div className="min-h-screen legacy-gradient">
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate('/legacy')}
            className="flex items-center gap-1.5 text-sm text-legacy-200 transition hover:text-legacy-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hub
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="legacy-card overflow-hidden p-8 animate-fade-in">
          <div className="mb-4 flex items-center gap-2">
            <span className="rounded-full bg-legacy-700/30 px-3 py-1 text-xs uppercase tracking-widest text-legacy-400">
              Chapter {chapter.chapter_number}
            </span>
            {isLocked && (
              <span className="flex items-center gap-1 rounded-full bg-ink-800/50 px-3 py-1 text-xs text-ink-400">
                <Lock className="h-3 w-3" /> Locked
              </span>
            )}
            {isCompleted && (
              <span className="flex items-center gap-1 rounded-full bg-accent-500/20 px-3 py-1 text-xs text-accent-300">
                <CheckCircle2 className="h-3 w-3" /> Completed
              </span>
            )}
          </div>

          <h1 className="font-serif text-3xl font-bold text-legacy-100">{chapter.title}</h1>
          <p className="mt-2 text-legacy-300">{chapter.description}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            {chapter.year_label && (
              <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-2 text-sm text-legacy-300">
                <Calendar className="h-4 w-4 text-legacy-400" /> {chapter.year_label}
              </div>
            )}
            {chapter.location_label && (
              <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-2 text-sm text-legacy-300">
                <MapPin className="h-4 w-4 text-legacy-400" /> {chapter.location_label}
              </div>
            )}
            <div className="flex items-center gap-1.5 rounded-lg bg-ink-800/50 px-3 py-2 text-sm text-legacy-300">
              <BookOpen className="h-4 w-4 text-legacy-400" /> {chapter.scene_count} scenes
            </div>
          </div>

          {chapter.historical_context && (
            <div className="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="text-xs uppercase tracking-widest text-blue-400">Historical Context</p>
              <p className="mt-1 text-sm text-legacy-200">{chapter.historical_context}</p>
            </div>
          )}

          {/* Scenes preview */}
          {scenes.length > 0 && !isLocked && (
            <div className="mt-6 space-y-2">
              <h3 className="font-serif text-lg text-legacy-100">Scenes</h3>
              {scenes.map((scene, idx) => (
                <div key={scene.id} className="flex items-center gap-3 rounded-lg bg-ink-800/30 p-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-legacy-700/30 text-sm font-bold text-legacy-300">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm text-legacy-100">{scene.title}</p>
                    <p className="text-xs text-legacy-500 capitalize">{scene.type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Play button */}
          {!isLocked && (
            <button
              onClick={handlePlay}
              disabled={starting}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-legacy-600 to-legacy-500 px-6 py-4 font-semibold text-white transition hover:from-legacy-500 hover:to-legacy-400 disabled:opacity-50"
            >
              {starting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : isCompleted ? (
                <>
                  <Sparkles className="h-5 w-5" />
                  <span>Replay Chapter</span>
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" />
                  <span>Begin Chapter</span>
                </>
              )}
            </button>
          )}

          {isLocked && (
            <div className="mt-8 rounded-lg border border-ink-700/50 bg-ink-800/30 p-4 text-center">
              <Lock className="mx-auto mb-2 h-8 w-8 text-ink-500" />
              <p className="text-sm text-legacy-400">
                Complete the previous chapter to unlock this one.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
