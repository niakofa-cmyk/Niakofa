export interface FamilyMember {
  id: string
  family_id: string
  display_name: string
  role: string | null
  relation_note: string | null
  birth_year: string | null
  death_year: string | null
  birth_place: string | null
  generation: number
  photo_url: string | null
  bio: string | null
  storytelling_consent: boolean
  created_at: string
  updated_at: string
}

export interface FamilyMemory {
  id: string
  family_id: string
  member_id: string | null
  title: string | null
  description: string
  memory_type: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface FamilyPlace {
  id: string
  family_id: string
  label: string
  country: string | null
  region: string | null
  latitude: number | null
  longitude: number | null
  historical_context: string | null
  created_at: string
}

export interface FamilyEvent {
  id: string
  family_id: string
  member_id: string | null
  title: string
  description: string | null
  event_date: string | null
  event_year: string | null
  place_id: string | null
  event_type: string
  created_at: string
}

export interface FamilyInterview {
  id: string
  family_id: string
  member_id: string | null
  interviewer: string | null
  transcript: string | null
  audio_url: string | null
  duration_seconds: number | null
  created_at: string
}

export interface FamilyArtifact {
  id: string
  family_id: string
  member_id: string | null
  name: string
  description: string | null
  artifact_type: string
  date_origin: string | null
  location: string | null
  photo_url: string | null
  story: string | null
  unlocked_by: string | null
  created_at: string
}

export interface LegacyWorld {
  id: string
  family_id: string
  status: 'generating' | 'ready' | 'stale'
  knowledge_version_id: string | null
  world_data: Record<string, unknown>
  ancestor_id: string | null
  ancestor_name: string | null
  ancestor_birth_year: string | null
  ancestor_birth_place: string | null
  chapter_count: number
  created_at: string
  updated_at: string
}

export interface LegacyChapter {
  id: string
  world_id: string
  family_id: string
  chapter_number: number
  title: string
  description: string | null
  status: 'locked' | 'unlocked' | 'in_progress' | 'completed' | 'skipped'
  unlock_threshold: number
  scene_count: number
  era_label: string | null
  location_label: string | null
  year_label: string | null
  historical_context: string | null
  created_at: string
  updated_at: string
}

export interface LegacyScene {
  id: string
  chapter_id: string
  scene_number: number
  title: string
  type: 'narration' | 'dialogue' | 'reflection' | 'quest' | 'transition'
  content: string
  place_id: string | null
  event_id: string | null
  memory_id: string | null
  historical_layer: 'verified' | 'historical_context' | 'narrative_interpretation'
  time_of_day: string | null
  atmosphere: string | null
  created_at: string
}

export interface LegacyDialogue {
  id: string
  scene_id: string
  speaker: string
  speaker_relation: string | null
  line: string
  tone: string
  created_at: string
}

export interface LegacyChoice {
  id: string
  scene_id: string
  choice_number: number
  text: string
  consequence: string
  action: string
  stat_effects: Record<string, number>
  created_at: string
}

export interface LegacySession {
  id: string
  world_id: string
  chapter_id: string | null
  scene_index: number
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  stats: GameStats
  choices_made: ChoiceRecord[]
  memories_created: number
  started_at: string
  updated_at: string
  completed_at: string | null
}

export interface LegacyQuest {
  id: string
  world_id: string | null
  family_id: string | null
  member_id: string | null
  title: string
  description: string
  quest_type: 'mystery' | 'preservation' | 'reconnection' | 'exploration' | 'cultural'
  status: 'available' | 'in_progress' | 'completed' | 'expired'
  prompt: string | null
  reward: string | null
  knowledge_gap: string | null
  created_at: string
  updated_at: string
}

export interface LegacyAchievement {
  id: string
  title: string
  description: string
  category: 'vault_prompt' | 'reconnection' | 'gameplay' | 'preservation'
  icon_name: string
  max_progress: number
  created_at: string
}

export interface LegacyAchievementProgress {
  id: string
  achievement_id: string
  world_id: string | null
  current_progress: number
  unlocked: boolean
  unlocked_at: string | null
  created_at: string
  updated_at: string
}

export interface LegacyWorldArtifact {
  id: string
  world_id: string
  artifact_id: string | null
  name: string
  description: string | null
  artifact_type: string
  source: string | null
  date_origin: string | null
  location: string | null
  story: string | null
  unlocked_by: string | null
  is_unlocked: boolean
  created_at: string
}

export interface FamilyKnowledgeVersion {
  id: string
  family_id: string
  version_number: number
  knowledge_hash: string
  member_count: number
  memory_count: number
  interview_count: number
  place_count: number
  event_count: number
  artifact_count: number
  change_description: string | null
  created_at: string
}

export interface GameStats {
  knowledge: number
  relationships: number
  cultural_wisdom: number
  courage: number
  reputation: number
  legacy: number
}

export interface ChoiceRecord {
  scene_id: string
  choice_text: string
  consequence: string
  stat_effects: Partial<GameStats>
  timestamp: string
}

export type GameMode = 'legacy' | 'exploration' | 'quests' | 'reunion'

export interface AncestorCandidate {
  member: FamilyMember
  storyCount: number
  eventCount: number
  placeCount: number
  memoryCount: number
  interviewCount: number
  photoCount: number
  completenessScore: number
  selectionReason: string
}
