import { supabase } from "./supabase";
import type {
  LegacyWorld, LegacyAncestor, LegacyChapter, LegacyScene,
  LegacyChoice, LegacySession, LegacyWorldVersion, LegacyPlace,
  LegacyQuest, LegacyAchievement, LegacyInventoryItem, LegacyMemory,
  LegacyFamilyMember, LegacyDialogue, LegacyJournalEntry,
  StatEffects, StatKey,
} from "./types";

export type {
  LegacyWorld, LegacyAncestor, LegacyChapter, LegacyScene,
  LegacyChoice, LegacySession, LegacyWorldVersion, LegacyPlace,
  LegacyQuest, LegacyAchievement, LegacyInventoryItem, LegacyMemory,
  LegacyFamilyMember, LegacyDialogue, LegacyJournalEntry,
  StatEffects, StatKey,
};

export async function getWorld(): Promise<LegacyWorld | null> {
  const { data, error } = await supabase
    .from("legacy_worlds")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as LegacyWorld | null;
}

export async function getAncestors(): Promise<LegacyAncestor[]> {
  const { data, error } = await supabase
    .from("legacy_ancestors")
    .select("*")
    .order("completeness_score", { ascending: false });
  if (error) return [];
  return (data ?? []) as LegacyAncestor[];
}

export async function getFamilyMembers(): Promise<LegacyFamilyMember[]> {
  const { data, error } = await supabase
    .from("legacy_family_members")
    .select("*")
    .order("birth_year", { ascending: true });
  if (error) return [];
  return (data ?? []) as LegacyFamilyMember[];
}

export async function getChapters(ancestorId?: string): Promise<LegacyChapter[]> {
  let q = supabase.from("legacy_chapters").select("*").order("chapter_number", { ascending: true });
  if (ancestorId) q = q.eq("ancestor_id", ancestorId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as LegacyChapter[];
}

export async function getScenes(chapterId: string): Promise<LegacyScene[]> {
  const { data, error } = await supabase
    .from("legacy_scenes")
    .select("*")
    .eq("chapter_id", chapterId)
    .order("scene_number", { ascending: true });
  if (error) return [];
  return (data ?? []) as LegacyScene[];
}

export async function getChoices(sceneId: string): Promise<LegacyChoice[]> {
  const { data, error } = await supabase
    .from("legacy_choices")
    .select("*")
    .eq("scene_id", sceneId)
    .order("choice_number", { ascending: true });
  if (error) return [];
  return (data ?? []) as LegacyChoice[];
}

export async function getDialogues(sceneId: string): Promise<LegacyDialogue[]> {
  const { data, error } = await supabase
    .from("legacy_dialogues")
    .select("*")
    .eq("scene_id", sceneId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as LegacyDialogue[];
}

export async function getActiveSession(): Promise<LegacySession | null> {
  const { data, error } = await supabase
    .from("legacy_sessions")
    .select("*")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .maybeSingle();
  if (error) return null;
  return data as LegacySession | null;
}

export async function getPlaces(): Promise<LegacyPlace[]> {
  const { data, error } = await supabase
    .from("legacy_places")
    .select("*")
    .order("year", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as LegacyPlace[];
}

export async function getQuests(): Promise<LegacyQuest[]> {
  const { data, error } = await supabase
    .from("legacy_quests")
    .select("*")
    .order("is_completed", { ascending: true })
    .order("xp", { ascending: false });
  if (error) return [];
  return (data ?? []) as LegacyQuest[];
}

export async function getAchievements(): Promise<LegacyAchievement[]> {
  const { data, error } = await supabase
    .from("legacy_achievements")
    .select("*")
    .order("is_unlocked", { ascending: false })
    .order("target_progress", { ascending: false });
  if (error) return [];
  return (data ?? []) as LegacyAchievement[];
}

export async function getInventory(): Promise<LegacyInventoryItem[]> {
  const { data, error } = await supabase
    .from("legacy_inventory_items")
    .select("*")
    .order("is_earned", { ascending: false })
    .order("year", { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as LegacyInventoryItem[];
}

export async function getMemories(): Promise<LegacyMemory[]> {
  const { data, error } = await supabase
    .from("legacy_memories")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as LegacyMemory[];
}

export async function getWorldVersions(): Promise<LegacyWorldVersion[]> {
  const { data, error } = await supabase
    .from("legacy_world_versions")
    .select("*")
    .order("version_number", { ascending: false });
  if (error) return [];
  return (data ?? []) as LegacyWorldVersion[];
}

export async function getJournalEntries(sessionId: string): Promise<LegacyJournalEntry[]> {
  const { data, error } = await supabase
    .from("legacy_journal_entries")
    .select("*")
    .eq("session_id", sessionId)
    .order("entry_number", { ascending: true });
  if (error) return [];
  return (data ?? []) as LegacyJournalEntry[];
}

export async function updateSessionStats(
  sessionId: string,
  stats: StatEffects,
): Promise<void> {
  await supabase
    .from("legacy_sessions")
    .update({ stats, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function advanceSessionScene(
  sessionId: string,
  sceneNumber: number,
): Promise<void> {
  await supabase
    .from("legacy_sessions")
    .update({ current_scene_number: sceneNumber, updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function selectChoice(
  choiceId: string,
): Promise<void> {
  await supabase
    .from("legacy_choices")
    .update({ is_selected: true, selected_at: new Date().toISOString() })
    .eq("id", choiceId);
}

export async function completeChapter(chapterId: string): Promise<void> {
  await supabase
    .from("legacy_chapters")
    .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", chapterId);
}

export async function completeQuest(questId: string): Promise<void> {
  await supabase
    .from("legacy_quests")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("id", questId);
}

export async function discoverPlace(placeId: string): Promise<void> {
  await supabase
    .from("legacy_places")
    .update({ is_discovered: true, discovered_at: new Date().toISOString() })
    .eq("id", placeId);
}

export function capStat(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function applyStatEffects(
  current: StatEffects,
  effects: Partial<StatEffects>,
): StatEffects {
  const result = { ...current };
  for (const key of Object.keys(effects) as StatKey[]) {
    result[key] = capStat((result[key] ?? 0) + (effects[key] ?? 0));
  }
  return result;
}
