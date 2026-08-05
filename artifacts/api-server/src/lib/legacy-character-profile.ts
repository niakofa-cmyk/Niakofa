/**
 * Niakofa — Enhanced Character Profile Generator
 *
 * Every family member should eventually contain:
 *   Personality traits, Skills, Occupation, Beliefs, Relationships,
 *   Speech style, Memories, Historical knowledge, Emotional profile,
 *   Reputation, Legacy score
 *
 * The AI uses these attributes to generate grounded dialogue and quests
 * that feel personal and rooted in real family history.
 */

import {
  db,
  familyMembersTable,
  familyMemoriesTable,
  familyMemoryPeopleTable,
  familyStoriesTable,
  familyEventsTable,
  familyPlacesTable,
  familyTreeRelationsTable,
  familyInterviewsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { legacyAI } from "./legacy-ai-gateway";
import { getConsentedMemberIds } from "./legacy-consent";

export interface RichCharacterProfile {
  memberId: number;
  name: string;
  role: string;
  relation: string | null;
  isLiving: boolean;
  birthYear: number | null;
  deathYear: number | null;
  stats: {
    knowledge: number;
    relationships: number;
    culturalWisdom: number;
    courage: number;
    reputation: number;
    legacy: number;
    faith: number;
  };
  personality: {
    traits: string[];
    archetype: string;
    description: string;
  };
  skills: {
    occupation: string | null;
    knownSkills: string[];
    craftLevel: number;
  };
  beliefs: {
    spiritual: string | null;
    values: string[];
    lifePhilosophy: string | null;
  };
  speechStyle: {
    tone: string;
    vocabulary: string;
    sampleLine: string;
  };
  emotionalProfile: {
    dominantEmotion: string;
    emotionalRange: string[];
    triggers: string[];
  };
  historicalKnowledge: {
    era: string | null;
    keyEvents: string[];
    culturalContext: string | null;
  };
  reputation: {
    communityStanding: string;
    knownFor: string[];
  };
  legacyScore: {
    total: number;
    breakdown: {
      storiesPreserved: number;
      memoriesRecorded: number;
      interviewCompleted: boolean;
      descendantsCount: number;
      placesConnected: number;
    };
  };
  events: Array<{ id: number; title: string; description: string | null; eventDate: string | null; category: string }>;
  stories: Array<{ id: number; title: string; excerpt: string; category: string | null }>;
  memories: Array<{ id: number; title: string | null; description: string | null; memoryDate: string | null; locationLabel: string | null }>;
  interviews: Array<{ id: number; title: string; status: string }>;
  places: Array<{ id: number; label: string; placeType: string | null; country: string | null }>;
  relationships: Array<{ id: number; fromMemberId: number; toMemberId: number; relationType: string; toMemberName?: string }>;
  achievements?: Array<{ key: string; title: string; unlocked: boolean; progress: number; goal: number }>;
  lineage?: {
    parents: Array<{ memberId: number; name: string; birthYear: number | null }>;
    children: Array<{ memberId: number; name: string; birthYear: number | null }>;
    siblings: Array<{ memberId: number; name: string; birthYear: number | null }>;
  };
}

export async function generateRichCharacterProfile(
  familyId: number,
  memberId: number,
): Promise<RichCharacterProfile | null> {
  const consentedIds = await getConsentedMemberIds(familyId);
  if (!consentedIds.has(memberId)) return null;

  const [member] = await db
    .select().from(familyMembersTable)
    .where(and(eq(familyMembersTable.id, memberId), eq(familyMembersTable.family_id, familyId)))
    .limit(1);

  if (!member) return null;

  const [memories, stories, events, places, relations, interviews] = await Promise.all([
    db.select({
      id: familyMemoriesTable.id, title: familyMemoriesTable.title,
      description: familyMemoriesTable.description,
      memory_date: familyMemoriesTable.memory_date,
      location_label: familyMemoriesTable.location_label,
    }).from(familyMemoriesTable)
      .innerJoin(familyMemoryPeopleTable, eq(familyMemoryPeopleTable.memory_id, familyMemoriesTable.id))
      .where(eq(familyMemoryPeopleTable.member_id, memberId)).limit(50),
    db.select().from(familyStoriesTable)
      .where(eq(familyStoriesTable.about_member_id, memberId)).limit(50),
    db.select().from(familyEventsTable)
      .where(eq(familyEventsTable.member_id, memberId))
      .orderBy(familyEventsTable.event_date).limit(50),
    db.select().from(familyPlacesTable)
      .where(eq(familyPlacesTable.family_id, familyId)).limit(20),
    db.select().from(familyTreeRelationsTable)
      .where(eq(familyTreeRelationsTable.family_id, familyId)).limit(100),
    db.select().from(familyInterviewsTable)
      .where(eq(familyInterviewsTable.subject_member_id, memberId)).limit(10),
  ]);

  const memoryCount = memories.length;
  const storyCount = stories.length;
  const eventCount = events.length;
  const interviewCount = interviews.filter((i) => i.status === "completed").length;

  const stats = {
    knowledge: Math.min(100, memoryCount * 8 + storyCount * 10 + interviewCount * 15),
    relationships: Math.min(100, storyCount * 12 + relations.filter((r) => r.from_member_id === memberId || r.to_member_id === memberId).length * 8),
    culturalWisdom: Math.min(100, memoryCount * 6 + storyCount * 8 + interviewCount * 10),
    courage: Math.min(100, storyCount * 5 + eventCount * 4),
    reputation: Math.min(100, memoryCount * 4 + storyCount * 6 + interviewCount * 8),
    legacy: Math.min(100, memoryCount * 7 + storyCount * 9 + interviewCount * 12),
    faith: Math.min(100, memoryCount * 5 + storyCount * 7),
  };

  const descendantCount = relations.filter(
    (r) => r.from_member_id === memberId && (r.relation_type === "parent" || r.relation_type === "father" || r.relation_type === "mother"),
  ).length;

  const legacyScore = {
    total: Math.min(100, memoryCount * 10 + storyCount * 12 + interviewCount * 20 + descendantCount * 8 + places.length * 5),
    breakdown: {
      storiesPreserved: storyCount, memoriesRecorded: memoryCount,
      interviewCompleted: interviewCount > 0, descendantsCount: descendantCount,
      placesConnected: places.length,
    },
  };

  const allMembers = await db
    .select({ id: familyMembersTable.id, name: familyMembersTable.display_name, birth_year: familyMembersTable.birth_year })
    .from(familyMembersTable)
    .where(eq(familyMembersTable.family_id, familyId)).limit(200);

  const memberMap = new Map(allMembers.map((m) => [m.id, m]));
  const parents: Array<{ memberId: number; name: string; birthYear: number | null }> = [];
  const children: Array<{ memberId: number; name: string; birthYear: number | null }> = [];
  const siblings: Array<{ memberId: number; name: string; birthYear: number | null }> = [];

  for (const rel of relations) {
    if (rel.from_member_id === memberId && (rel.relation_type === "parent" || rel.relation_type === "father" || rel.relation_type === "mother")) {
      const child = memberMap.get(rel.to_member_id);
      if (child) children.push({ memberId: child.id, name: child.name, birthYear: child.birth_year ?? null });
    }
    if (rel.to_member_id === memberId && (rel.relation_type === "parent" || rel.relation_type === "father" || rel.relation_type === "mother")) {
      const parent = memberMap.get(rel.from_member_id);
      if (parent) parents.push({ memberId: parent.id, name: parent.name, birthYear: parent.birth_year ?? null });
    }
  }

  const parentIds = new Set(parents.map((p) => p.memberId));
  if (parentIds.size > 0) {
    for (const rel of relations) {
      if (parentIds.has(rel.from_member_id) && rel.to_member_id !== memberId) {
        const sib = memberMap.get(rel.to_member_id);
        if (sib && !siblings.some((s) => s.memberId === sib.id)) {
          siblings.push({ memberId: sib.id, name: sib.name, birthYear: sib.birth_year ?? null });
        }
      }
    }
  }

  const contextParts: string[] = [];
  if (stories.length > 0) contextParts.push(`Stories: ${stories.map((s) => s.title).join(", ")}`);
  if (memories.length > 0) contextParts.push(`Memories: ${memories.map((m) => m.title ?? m.description?.slice(0, 50) ?? "untitled").join(", ")}`);
  if (events.length > 0) contextParts.push(`Life events: ${events.map((e) => e.title).join(", ")}`);
  if (interviews.length > 0) contextParts.push(`Interviews: ${interviews.map((i) => i.title).join(", ")}`);
  if (places.length > 0) contextParts.push(`Places: ${places.map((p) => p.label).join(", ")}`);

  const vaultContext = contextParts.join("\n") || "No vault data yet — this is a new character.";

  const profilePrompt = `You are Nia, the AI guardian of a family legacy. Generate a rich character profile for this family member.

Name: ${member.display_name}
Role: ${member.role ?? "family member"}
Is Living: ${member.is_living}
Birth Year: ${member.birth_year ?? "unknown"}

Vault Data:
${vaultContext}

Generate a JSON object with these fields:
{
  "personality": { "traits": ["3-5 traits"], "archetype": "short archetype name", "description": "2-3 sentence summary" },
  "skills": { "occupation": "occupation or null", "knownSkills": ["3-5 skills"], "craftLevel": 0-100 },
  "beliefs": { "spiritual": "tradition or null", "values": ["2-4 values"], "lifePhilosophy": "guiding principle or null" },
  "speechStyle": { "tone": "e.g., Warm and measured", "vocabulary": "e.g., Simple, proverb-rich", "sampleLine": "one dialogue line in their voice" },
  "emotionalProfile": { "dominantEmotion": "e.g., Quiet pride", "emotionalRange": ["2-4 tendencies"], "triggers": ["topics that evoke responses"] },
  "historicalKnowledge": { "era": "historical era", "keyEvents": ["events they lived through"], "culturalContext": "brief context" },
  "reputation": { "communityStanding": "e.g., Respected elder", "knownFor": ["2-3 things"] }
}

Never fabricate specific facts — use "unknown" where you have no basis.`;

  let deepAttributes: {
    personality: { traits: string[]; archetype: string; description: string };
    skills: { occupation: string | null; knownSkills: string[]; craftLevel: number };
    beliefs: { spiritual: string | null; values: string[]; lifePhilosophy: string | null };
    speechStyle: { tone: string; vocabulary: string; sampleLine: string };
    emotionalProfile: { dominantEmotion: string; emotionalRange: string[]; triggers: string[] };
    historicalKnowledge: { era: string | null; keyEvents: string[]; culturalContext: string | null };
    reputation: { communityStanding: string; knownFor: string[] };
  };

  try {
    const aiResponse = await legacyAI.generate({
      system: "You are Nia, the AI guardian of a family legacy. Generate rich character profiles in valid JSON only.",
      userPrompt: profilePrompt,
      maxTokens: 800,
    });
    deepAttributes = JSON.parse(aiResponse.content);
  } catch (err) {
    logger.warn({ err, memberId }, "legacy-character-profile: AI generation failed, using fallback");
    deepAttributes = {
      personality: { traits: ["Family-oriented", "Resilient"], archetype: "The Family Pillar",
        description: `${member.display_name} is a member of your family whose story is still being discovered.` },
      skills: { occupation: null, knownSkills: [], craftLevel: Math.min(100, memoryCount * 10 + storyCount * 12) },
      beliefs: { spiritual: null, values: ["Family", "Heritage"], lifePhilosophy: null },
      speechStyle: { tone: "Unknown — more interviews needed", vocabulary: "Unknown",
        sampleLine: "Record an interview to unlock their voice." },
      emotionalProfile: { dominantEmotion: "Unknown", emotionalRange: [], triggers: [] },
      historicalKnowledge: { era: member.birth_year ? `${Math.floor(member.birth_year / 10) * 10}s` : null,
        keyEvents: [], culturalContext: null },
      reputation: { communityStanding: "Family member", knownFor: [] },
    };
  }

  const relationships: Array<{ id: number; fromMemberId: number; toMemberId: number; relationType: string; toMemberName?: string }> = [];
  for (const rel of relations) {
    const otherId = rel.from_member_id === memberId ? rel.to_member_id : rel.to_member_id === memberId ? rel.from_member_id : null;
    if (otherId === null) continue;
    const otherMember = memberMap.get(otherId);
    relationships.push({ id: rel.id, fromMemberId: rel.from_member_id, toMemberId: rel.to_member_id,
      relationType: rel.relation_type, toMemberName: otherMember?.name });
  }

  const birthEvent = events.find((e) => e.category === "birth");
  const deathEvent = events.find((e) => e.category === "death");
  const birthYear = member.birth_year ?? (birthEvent?.event_date ? new Date(birthEvent.event_date).getFullYear() : null);
  const deathYear = member.death_year ?? (deathEvent?.event_date ? new Date(deathEvent.event_date).getFullYear() : null);

  return {
    memberId, name: member.display_name, role: member.role ?? "family member",
    relation: member.relation_note ?? null, isLiving: member.is_living ?? true,
    birthYear, deathYear, stats, ...deepAttributes, legacyScore,
    events: events.map((e) => ({ id: e.id, title: e.title, description: e.description,
      eventDate: e.event_date ? new Date(e.event_date).toISOString() : null, category: e.category ?? "other" })),
    stories: stories.map((s) => ({ id: s.id, title: s.title, excerpt: s.body?.slice(0, 200) ?? "", category: s.category })),
    memories: memories.map((m) => ({ id: m.id, title: m.title, description: m.description,
      memoryDate: m.memory_date ? new Date(m.memory_date).toISOString() : null, locationLabel: m.location_label })),
    interviews: interviews.map((i) => ({ id: i.id, title: i.title ?? `Interview #${i.id}`, status: i.status as string })),
    places: places.map((p) => ({ id: p.id, label: p.label, placeType: p.place_type, country: p.country })),
    relationships, lineage: { parents, children, siblings },
  };
}
