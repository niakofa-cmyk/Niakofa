import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Trophy, Star, Lock,
  CheckCircle2, Mic, Camera, Globe2, Users, Flame,
  BookHeart, Crown, Map, Target,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { seedAchievementsIfEmpty, updateAchievementProgress } from '@/lib/legacyEngine'
import type { LegacyAchievement, LegacyAchievementProgress, FamilyMember, FamilyMemory, FamilyPlace, FamilyInterview, FamilyArtifact } from '@/lib/types'

const ICON_MAP: Record<string, typeof Trophy> = {
  Trophy, Mic, Camera, Globe2, Users, Flame, BookHeart, Crown, Map, Target,
}

export default function LegacyAchievements() {
  const navigate = useNavigate()
  const [achievements, setAchievements] = useState<LegacyAchievement[]>([])
  const [progress, setProgress] = useState<LegacyAchievementProgress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        await seedAchievementsIfEmpty()

        const [achRes, progRes, memRes, memDataRes, plcRes, ivRes, artRes] = await Promise.all([
          supabase.from('legacy_achievements').select('*').order('created_at'),
          supabase.from('legacy_achievement_progress').select('*'),
          supabase.from('family_members').select('*'),
          supabase.from('family_memories').select('*'),
          supabase.from('family_places').select('*'),
          supabase.from('family_interviews').select('*'),
          supabase.from('family_artifacts').select('*'),
        ])

        const members = (memRes.data || []) as FamilyMember[]
        const memories = (memDataRes.data || []) as FamilyMemory[]
        const places = (plcRes.data || []) as FamilyPlace[]
        const interviews = (ivRes.data || []) as FamilyInterview[]
        const artifacts = (artRes.data || []) as FamilyArtifact[]

        if (members.length > 0) {
          const familyId = members[0].family_id
          const { count } = await supabase
            .from('legacy_chapters')
            .select('*', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .eq('status', 'completed')
          await updateAchievementProgress(familyId, members, memories, places, interviews, artifacts, count || 0)
        }

        const [achRes2, progRes2] = await Promise.all([
          supabase.from('legacy_achievements').select('*').order('created_at'),
          supabase.from('legacy_achievement_progress').select('*'),
        ])
        setAchievements((achRes2.data || []) as LegacyAchievement[])
        setProgress((progRes2.data || []) as LegacyAchievementProgress[])
      } catch (err) {
        console.error('Failed to load achievements:', err)
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

  const getProgress = (achievementId: string): LegacyAchievementProgress | null => {
    return progress.find(p => p.achievement_id === achievementId) || null
  }

  const unlockedCount = achievements.filter(a => getProgress(a.id)?.unlocked).length

  return (
    <div className="min-h-screen legacy-gradient">
      <header className="sticky top-0 z-10 border-b border-legacy-800/50 bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <button
            onClick={() => navigate('/legacy')}
            className="flex items-center gap-1.5 text-sm text-legacy-200 transition hover:text-legacy-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hub
          </button>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-legacy-400" />
            <span className="font-serif text-lg text-legacy-100">
              {unlockedCount} / {achievements.length} Unlocked
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 text-center animate-fade-in">
          <Trophy className="mx-auto mb-3 h-12 w-12 text-legacy-400" />
          <h1 className="font-serif text-3xl font-bold text-legacy-100">Achievements</h1>
          <p className="mt-2 text-legacy-300">
            Preserve your family's legacy and unlock these achievements through gameplay.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {achievements.map(achievement => {
            const prog = getProgress(achievement.id)
            const isUnlocked = prog?.unlocked ?? false
            const currentProgress = prog?.current_progress ?? 0
            const progressPercent = Math.min((currentProgress / achievement.max_progress) * 100, 100)
            const Icon = ICON_MAP[achievement.icon_name] || Trophy

            return (
              <div
                key={achievement.id}
                className={`legacy-card p-5 transition ${
                  isUnlocked ? 'border-legacy-500 legacy-glow' : 'opacity-80'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl ${
                    isUnlocked
                      ? 'bg-gradient-to-br from-legacy-500 to-legacy-600'
                      : 'bg-ink-800/50'
                  }`}>
                    <Icon className={`h-7 w-7 ${isUnlocked ? 'text-white' : 'text-ink-500'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-lg text-legacy-100">{achievement.title}</h3>
                      {isUnlocked && (
                        <CheckCircle2 className="h-4 w-4 text-accent-400" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-legacy-300">{achievement.description}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                        <div
                          className="stat-bar h-full rounded-full bg-gradient-to-r from-legacy-500 to-legacy-400"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-legacy-400">
                        {currentProgress} / {achievement.max_progress}
                      </span>
                    </div>
                    <span className="mt-2 inline-block rounded-full bg-ink-800/50 px-2 py-0.5 text-xs capitalize text-legacy-500">
                      {achievement.category}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
