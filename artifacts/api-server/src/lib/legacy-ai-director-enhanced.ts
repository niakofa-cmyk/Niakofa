/**
 * Niakofa — Enhanced AI Director Gap Analysis
 *
 * The AI Director should understand:
 *   - Missing ancestors (family members with no stories, memories, or interviews)
 *   - Incomplete branches (family tree gaps — missing parent/spouse connections)
 *   - Unanswered questions (interviews started but never completed)
 *   - Undocumented locations (places with no stories or events attached)
 *   - Missing emotional coverage (which ancestors have no emotional context)
 *   - Unpreserved traditions (cultural practices mentioned but not recorded)
 */

import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyTreeRelationsTable,
  familyMemoryPeopleTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getConsentedMemberIds } from "./legacy-consent";

export interface VaultGap {
  type: string;
  description: string;
  severity: "high" | "medium" | "low";
  targetMemberId?: number;
  targetMemberName?: string;
  suggestedMission: string;
  missionType: "record_interview" | "identify_photo" | "add_ancestor" | "tag_location" | "add_event" | "upload_document" | "reconnect_relative" | "complete_chapter" | "preserve_tradition" | "discover_missing_ancestor" | "complete_incomplete_branch" | "document_undocumented_location";
  rewardXp: number;
  rewardDescription: string;
  emotionalWeight?: "light" | "reflective" | "deep";
}

export async function analyzeVaultGapsEnhanced(familyId: number): Promise<VaultGap[]> {
  const gaps: VaultGap[] = [];

  const consentedIds = await getConsentedMemberIds(familyId);
  if (consentedIds.size === 0) return gaps;

  const [members, memories, interviews, stories, places, events, relations] = await Promise.all([
    db.select().from(familyMembersTable).where(
      and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.status, "active"))),
    db.select().from(familyMemoriesTable).where(eq(familyMemoriesTable.family_id, familyId)).limit(200),
    db.select().from(familyInterviewsTable).where(eq(familyInterviewsTable.family_id, familyId)).limit(50),
    db.select().from(familyStoriesTable).where(eq(familyStoriesTable.family_id, familyId)).limit(200),
    db.select().from(familyPlacesTable).where(eq(familyPlacesTable.family_id, familyId)).limit(100),
    db.select().from(familyEventsTable).where(eq(familyEventsTable.family_id, familyId)).limit(200),
    db.select().from(familyTreeRelationsTable).where(eq(familyTreeRelationsTable.family_id, familyId)).limit(200),
  ]);

  const familyMemoryIds = memories.map((m) => m.id);
  const memoryPeople = familyMemoryIds.length > 0
    ? await db.select({ memory_id: familyMemoryPeopleTable.memory_id, member_id: familyMemoryPeopleTable.member_id })
        .from(familyMemoryPeopleTable)
        .where(inArray(familyMemoryPeopleTable.memory_id, familyMemoryIds))
    : [];
  const memoriesByMember = new Map<number, number>();
  for (const mp of memoryPeople) {
    if (mp.member_id !== null) {
      memoriesByMember.set(mp.member_id, (memoriesByMember.get(mp.member_id) ?? 0) + 1);
    }
  }

  for (const member of members) {
    if (!consentedIds.has(member.id)) continue;
    const memberMemoryCount = memoriesByMember.get(member.id) ?? 0;
    const memberStories = stories.filter((s) => s.about_member_id === member.id);
    const memberInterviews = interviews.filter((i) => i.subject_member_id === member.id);

    if (memberMemoryCount === 0 && memberStories.length === 0 && memberInterviews.length === 0) {
      gaps.push({
        type: "missing_ancestor",
        description: `${member.display_name} has no stories, memories, or interviews. Their legacy is at risk of being lost.`,
        severity: "high",
        targetMemberId: member.id, targetMemberName: member.display_name,
        suggestedMission: `Discover ${member.display_name}'s story — interview a relative who knew them`,
        missionType: "discover_missing_ancestor",
        rewardXp: 200,
        rewardDescription: `New playable character: ${member.display_name}`,
        emotionalWeight: "deep",
      });
    }
  }

  const membersWithoutParents = members.filter(
    (m) => !relations.some((r) => r.to_member_id === m.id && (r.relation_type === "parent" || r.relation_type === "father" || r.relation_type === "mother")),
  );
  for (const member of membersWithoutParents.slice(0, 5)) {
    if (!consentedIds.has(member.id)) continue;
    gaps.push({
      type: "incomplete_branch",
      description: `${member.display_name} has no parents connected in the family tree. Their lineage is incomplete.`,
      severity: "medium",
      targetMemberId: member.id, targetMemberName: member.display_name,
      suggestedMission: `Find ${member.display_name}'s parents — ask relatives or search records`,
      missionType: "complete_incomplete_branch",
      rewardXp: 75,
      rewardDescription: "Family tree branch completed",
      emotionalWeight: "reflective",
    });
  }

  const incompleteInterviews = interviews.filter(
    (i) => i.status === "in_progress" || i.status === "transcribed",
  );
  for (const interview of incompleteInterviews.slice(0, 3)) {
    gaps.push({
      type: "unanswered_question",
      description: `Interview "${interview.title}" was started but never completed. The story is unfinished.`,
      severity: "medium",
      targetMemberId: interview.subject_member_id ?? undefined,
      suggestedMission: `Complete the interview: ${interview.title}`,
      missionType: "record_interview",
      rewardXp: 100,
      rewardDescription: "Story preserved and world regenerated",
      emotionalWeight: "reflective",
    });
  }

  for (const place of places) {
    const placeEvents = events.filter((e) => e.place_id === place.id);
    if (placeEvents.length === 0) {
      gaps.push({
        type: "undocumented_location",
        description: `${place.label} is on your map but has no stories or events connected to it yet.`,
        severity: "low",
        suggestedMission: `Record a story about ${place.label} — what happened there?`,
        missionType: "document_undocumented_location",
        rewardXp: 50,
        rewardDescription: "Location enriched with history",
        emotionalWeight: "light",
      });
    }
  }

  for (const member of members) {
    if (member.is_living === false) continue;
    if (!consentedIds.has(member.id)) continue;
    const memberInterviews = interviews.filter((i) => i.subject_member_id === member.id);
    if (memberInterviews.length === 0) {
      gaps.push({
        type: "missing_interview",
        description: `${member.display_name} hasn't been interviewed yet. Their voice isn't in the vault.`,
        severity: "high",
        targetMemberId: member.id, targetMemberName: member.display_name,
        suggestedMission: `Record an oral history interview with ${member.display_name}`,
        missionType: "record_interview",
        rewardXp: 150,
        rewardDescription: "Voice of the Elders achievement + new dialogue unlocked",
        emotionalWeight: "deep",
      });
    }
  }

  const taggedMemoryIds = new Set(memoryPeople.map((mp) => mp.memory_id));
  const untagged = memories.filter((m) => !taggedMemoryIds.has(m.id));
  if (untagged.length > 0) {
    gaps.push({
      type: "unidentified_people",
      description: `${untagged.length} ${untagged.length === 1 ? "memory has" : "memories have"} no people tagged. Who are they about?`,
      severity: "medium",
      suggestedMission: `Identify people in ${untagged.length === 1 ? "this memory" : "these memories"} — who are they about?`,
      missionType: "identify_photo",
      rewardXp: 40,
      rewardDescription: "Family connections strengthened",
    });
  }

  if (places.length === 0) {
    gaps.push({
      type: "no_places",
      description: "Your family world map is empty. Tag your first family landmark.",
      severity: "high",
      suggestedMission: "Tag your first family landmark — a home, church, school, or cemetery",
      missionType: "tag_location",
      rewardXp: 75,
      rewardDescription: "World Map unlocked",
    });
  }

  for (const member of members) {
    if (!consentedIds.has(member.id)) continue;
    const memberEvents = events.filter((e) => e.member_id === member.id);
    if (memberEvents.length === 0) {
      gaps.push({
        type: "missing_events",
        description: `${member.display_name} has no life events recorded.`,
        severity: "low",
        targetMemberId: member.id, targetMemberName: member.display_name,
        suggestedMission: `Add a life event for ${member.display_name} — birth, graduation, marriage, or migration`,
        missionType: "add_event",
      rewardXp: 30,
      rewardDescription: "Timeline enrichment",
    });
  }
  }

  if (members.length >= 3 && relations.length < members.length) {
    gaps.push({
      type: "incomplete_tree",
      description: `Your family tree has ${members.length} members but only ${relations.length} connections. Some relationships are missing.`,
      severity: "medium",
      suggestedMission: "Add parent or spouse connections to complete your family tree",
      missionType: "add_ancestor",
      rewardXp: 60,
      rewardDescription: "Family Detective achievement progress",
    });
  }

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const emotionalOrder = { deep: 0, reflective: 1, light: 2, undefined: 3 };
  gaps.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return emotionalOrder[a.emotionalWeight ?? "undefined"] - emotionalOrder[b.emotionalWeight ?? "undefined"];
  });

  return gaps;
}
