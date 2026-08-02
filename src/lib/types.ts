export interface LegacyWorld {
  id: string;
  family_id: number;
  world_version: number;
  readiness_score: number;
  is_ready: boolean;
  total_chapters: number;
  completed_chapters: number;
  total_quests: number;
  completed_quests: number;
  created_at: string;
  updated_at: string;
}

export interface LegacyAncestor {
  id: string;
  world_id: string;
  member_id: number;
  name: string;
  role: string | null;
  relation: string | null;
  birth_year: number | null;
  death_year: number | null;
  birth_location: string | null;
  story_count: number;
  event_count: number;
  place_count: number;
  memory_count: number;
  interview_count: number;
  photo_count: number;
  completeness_score: number;
  selection_reason: string | null;
  is_playable: boolean;
  created_at: string;
}

export interface LegacyChapter {
  id: string;
  world_id: string;
  ancestor_id: string;
  chapter_number: number;
  title: string;
  synopsis: string | null;
  era: string | null;
  year_start: number | null;
  year_end: number | null;
  location: string | null;
  status: "locked" | "unlocked" | "in_progress" | "completed";
  chapter_data: Record<string, unknown>;
  unlocked_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegacyScene {
  id: string;
  chapter_id: string;
  scene_number: number;
  title: string;
  scene_type: string;
  content: string;
  narration: string | null;
  historical_layer: string;
  place_id: string | null;
  event_id: number | null;
  memory_id: number | null;
  is_ai_generated: boolean;
  created_at: string;
}

export interface LegacyChoice {
  id: string;
  scene_id: string;
  choice_number: number;
  label: string;
  description: string | null;
  stat_effects: Partial<StatEffects>;
  consequence_text: string | null;
  next_scene_number: number | null;
  is_selected: boolean;
  selected_at: string | null;
  created_at: string;
}

export type StatKey =
  | "knowledge"
  | "relationships"
  | "cultural_wisdom"
  | "courage"
  | "legacy";

export type StatEffects = Record<StatKey, number>;

export interface LegacySession {
  id: string;
  world_id: string;
  ancestor_id: string;
  chapter_id: string;
  current_scene_number: number;
  stats: StatEffects;
  choices_made: unknown[];
  journal_entries: unknown[];
  status: "active" | "completed" | "abandoned";
  started_at: string;
  completed_at: string | null;
  updated_at: string;
}

export interface LegacyWorldVersion {
  id: string;
  world_id: string;
  version_number: number;
  change_summary: string | null;
  changes: Record<string, unknown>;
  new_stories: number;
  new_characters: number;
  new_places: number;
  new_quests: number;
  new_chapters: number;
  new_landmarks: number;
  new_collectibles: number;
  created_at: string;
}

export interface LegacyPlace {
  id: string;
  world_id: string;
  label: string;
  place_type: string | null;
  country: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  year: number | null;
  chapter_numbers: number[];
  is_discovered: boolean;
  discovered_at: string | null;
  created_at: string;
}

export interface LegacyQuest {
  id: string;
  world_id: string;
  title: string;
  description: string | null;
  xp: number;
  category: string;
  action_path: string | null;
  ancestor_name: string | null;
  is_ai_generated: boolean;
  is_completed: boolean;
  completed_at: string | null;
  fingerprint: string | null;
  created_at: string;
}

export interface LegacyAchievement {
  id: string;
  world_id: string;
  title: string;
  description: string | null;
  icon_name: string;
  category: string;
  current_progress: number;
  target_progress: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
}

export interface LegacyInventoryItem {
  id: string;
  world_id: string;
  label: string;
  description: string | null;
  item_type: string;
  icon_name: string;
  source: string | null;
  owner: string | null;
  year: number | null;
  location: string | null;
  story: string | null;
  unlock_reason: string | null;
  is_earned: boolean;
  earned_at: string | null;
  created_at: string;
}

export interface LegacyMemory {
  id: string;
  world_id: string;
  title: string;
  description: string | null;
  memory_date: string | null;
  location_label: string | null;
  source: string;
  ancestor_id: string | null;
  asset_count: number;
  created_at: string;
}

export interface LegacyFamilyMember {
  id: string;
  world_id: string;
  display_name: string;
  role: string | null;
  relation_note: string | null;
  birth_year: number | null;
  death_year: number | null;
  location: string | null;
  is_ancestor: boolean;
  created_at: string;
}

export interface LegacyDialogue {
  id: string;
  scene_id: string;
  speaker: string;
  line: string;
  tone: string | null;
  is_ai_generated: boolean;
  created_at: string;
}

export interface LegacyJournalEntry {
  id: string;
  session_id: string;
  chapter_id: string;
  entry_number: number;
  title: string | null;
  content: string;
  mood: string | null;
  stats_snapshot: Record<string, number>;
  created_at: string;
}

export const STAT_LABELS: Record<StatKey, string> = {
  knowledge: "Knowledge",
  relationships: "Relationships",
  cultural_wisdom: "Cultural Wisdom",
  courage: "Courage",
  legacy: "Legacy",
};

export const STAT_ICONS: Record<StatKey, string> = {
  knowledge: "BookOpen",
  relationships: "Users",
  cultural_wisdom: "Sparkles",
  courage: "Flame",
  legacy: "Crown",
};

export const STAT_COLORS: Record<StatKey, string> = {
  knowledge: "text-blue-400",
  relationships: "text-rose-400",
  cultural_wisdom: "text-amber-400",
  courage: "text-orange-400",
  legacy: "text-purple-400",
};

export const STAT_BAR_COLORS: Record<StatKey, string> = {
  knowledge: "bg-blue-500",
  relationships: "bg-rose-500",
  cultural_wisdom: "bg-amber-500",
  courage: "bg-orange-500",
  legacy: "bg-purple-500",
};
