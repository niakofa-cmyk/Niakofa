/**
 * Niakofa — Family Vault Completeness API
 *
 * Calculates a readiness score for a family's vault — how complete their
 * Family Graph and Memory Graph are for the Legacy Engine to generate
 * meaningful gameplay.
 *
 * The readiness score is NOT a simple count. It evaluates six dimensions:
 *   1. People       — members + tree relations
 *   2. Relations    — parent/spouse edges
 *   3. Events       — dated life events (births, migrations, etc.)
 *   4. Stories      — narrative stories + memories
 *   5. Places       — geographic locations
 *   6. Consent      — storytelling consent flags
 *
 * Each dimension contributes a weighted score. The total is 0–100.
 * Chapters unlock at >= 40 (Phase 1 threshold).
 *
 * Routes:
 *   GET /api/legacy/completeness/:familyId — readiness score + breakdown
 */

import { Router } from "express";
import {
  db,
  familiesTable,
  familyMembersTable,
  familyMemoriesTable,
  familyInterviewsTable,
  familyTreeRelationsTable,
  familyPlacesTable,
  familyEventsTable,
  familyStoriesTable,
  familyMemberConsentTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ── Readiness score weights ──────────────────────────────────────────────────
// Each dimension contributes up to its max points. Total = 100.
const WEIGHTS = {
  people:    20,  // members + tree relations
  relations: 15,  // parent/spouse edges
  events:    20,  // dated life events
  stories:   20,  // memories + stories
  places:    15,  // geographic locations
  consent:   10,  // storytelling consent flags
} as const;

// ── Phase 1 chapter unlock threshold ─────────────────────────────────────────
export const CHAPTER_UNLOCK_THRESHOLD = 40;

// ── Membership guard ──────────────────────────────────────────────────────────

async function isMember(userId: number, familyId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ── Completeness calculation ─────────────────────────────────────────────────

export interface CompletenessDimension {
  key: string;
  label: string;
  score: number;
  max: number;
  count: number;
  hint: string;
}

export interface CompletenessResponse {
  familyId: number;
  readinessScore: number;
  chapterUnlockReady: boolean;
  threshold: number;
  dimensions: CompletenessDimension[];
  missingData: string[];
  suggestions: string[];
}

async function calculateCompleteness(familyId: number): Promise<CompletenessResponse> {
  // People: active members
  const [{ memberCount }] = await db
    .select({ memberCount: sql<number>`count(*)::int` })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.status, "active"),
      ),
    );

  // Relations: tree edges
  const [{ relationCount }] = await db
    .select({ relationCount: sql<number>`count(*)::int` })
    .from(familyTreeRelationsTable)
    .where(eq(familyTreeRelationsTable.family_id, familyId));

  // Events
  const [{ eventCount }] = await db
    .select({ eventCount: sql<number>`count(*)::int` })
    .from(familyEventsTable)
    .where(eq(familyEventsTable.family_id, familyId));

  // Stories: memories + family_stories
  const [{ memoryCount }] = await db
    .select({ memoryCount: sql<number>`count(*)::int` })
    .from(familyMemoriesTable)
    .where(eq(familyMemoriesTable.family_id, familyId));

  const [{ storyCount }] = await db
    .select({ storyCount: sql<number>`count(*)::int` })
    .from(familyStoriesTable)
    .where(eq(familyStoriesTable.family_id, familyId));

  // Places
  const [{ placeCount }] = await db
    .select({ placeCount: sql<number>`count(*)::int` })
    .from(familyPlacesTable)
    .where(eq(familyPlacesTable.family_id, familyId));

  // Interviews
  const [{ interviewCount }] = await db
    .select({ interviewCount: sql<number>`count(*)::int` })
    .from(familyInterviewsTable)
    .where(eq(familyInterviewsTable.family_id, familyId));

  // Consent: members with storytelling consent granted
  const [{ consentCount }] = await db
    .select({ consentCount: sql<number>`count(*)::int` })
    .from(familyMemberConsentTable)
    .where(
      and(
        eq(familyMemberConsentTable.family_id, familyId),
        eq(familyMemberConsentTable.scope, "storytelling"),
        eq(familyMemberConsentTable.granted, true),
      ),
    );

  // ── Score each dimension ──────────────────────────────────────────────────
  const peopleScore = Math.min(WEIGHTS.people, Math.round((memberCount / 5) * WEIGHTS.people));
  const relationsScore = memberCount > 1
    ? Math.min(WEIGHTS.relations, Math.round((relationCount / (memberCount - 1)) * WEIGHTS.relations))
    : 0;
  const eventsScore = Math.min(WEIGHTS.events, Math.round((eventCount / 3) * WEIGHTS.events));
  const storiesScore = Math.min(WEIGHTS.stories, Math.round(((memoryCount + storyCount) / 5) * WEIGHTS.stories));
  const placesScore = Math.min(WEIGHTS.places, Math.round((placeCount / 2) * WEIGHTS.places));
  const consentScore = Math.min(WEIGHTS.consent, Math.round((consentCount / 2) * WEIGHTS.consent));

  const dimensions: CompletenessDimension[] = [
    { key: "people", label: "People", score: peopleScore, max: WEIGHTS.people, count: memberCount,
      hint: memberCount < 5 ? "Add at least 5 family members to unlock more content." : "Good coverage." },
    { key: "relations", label: "Relations", score: relationsScore, max: WEIGHTS.relations, count: relationCount,
      hint: relationCount === 0 ? "Add parent/spouse relationships between members." : "Family tree is connected." },
    { key: "events", label: "Events", score: eventsScore, max: WEIGHTS.events, count: eventCount,
      hint: eventCount < 3 ? "Add life events (births, migrations, marriages)." : "Life timeline is forming." },
    { key: "stories", label: "Stories", score: storiesScore, max: WEIGHTS.stories, count: memoryCount + storyCount,
      hint: memoryCount + storyCount < 5 ? "Record stories and memories in the vault." : "Rich narrative material." },
    { key: "places", label: "Places", score: placesScore, max: WEIGHTS.places, count: placeCount,
      hint: placeCount < 2 ? "Add locations your family lived in or migrated through." : "Geographic context available." },
    { key: "consent", label: "Consent", score: consentScore, max: WEIGHTS.consent, count: consentCount,
      hint: consentCount < 2 ? "Ask relatives for storytelling consent." : "Consent granted for AI use." },
  ];

  const readinessScore = dimensions.reduce((sum, d) => sum + d.score, 0);

  // ── Missing data + suggestions ────────────────────────────────────────────
  const missingData: string[] = [];
  const suggestions: string[] = [];

  if (memberCount < 5) {
    missingData.push("family_members");
    suggestions.push("Add more relatives to your family tree to unlock richer chapters.");
  }
  if (relationCount === 0) {
    missingData.push("family_tree_relations");
    suggestions.push("Connect family members with parent/spouse relationships.");
  }
  if (eventCount < 3) {
    missingData.push("family_events");
    suggestions.push("Add key life events — births, migrations, marriages — to build the timeline.");
  }
  if (memoryCount + storyCount < 5) {
    missingData.push("family_stories");
    suggestions.push("Record oral histories or write down family stories.");
  }
  if (placeCount < 2) {
    missingData.push("family_places");
    suggestions.push("Add locations your family lived in to generate the world map.");
  }
  if (interviewCount === 0) {
    missingData.push("family_interviews");
    suggestions.push("Record an oral history interview to unlock the Voice of the Elders achievement.");
  }
  if (consentCount < 2) {
    missingData.push("family_member_consent");
    suggestions.push("Ask relatives for storytelling consent so the AI can use their stories.");
  }

  return {
    familyId,
    readinessScore,
    chapterUnlockReady: readinessScore >= CHAPTER_UNLOCK_THRESHOLD,
    threshold: CHAPTER_UNLOCK_THRESHOLD,
    dimensions,
    missingData,
    suggestions,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get(
  "/legacy/completeness/:familyId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = parseInt(String(req.params.familyId), 10);
    if (isNaN(familyId)) return res.status(400).json({ error: "Invalid family ID" });

    const userId = req.authenticatedUserId!;
    if (!(await isMember(userId, familyId))) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const result = await calculateCompleteness(familyId);
      return res.json(result);
    } catch (err) {
      logger.error({ err, familyId }, "legacy-completeness: calculation failed");
      return res.status(500).json({ error: "Failed to calculate completeness" });
    }
  },
);

export default router;
export { calculateCompleteness, CHAPTER_UNLOCK_THRESHOLD };
export type { CompletenessResponse, CompletenessDimension };
