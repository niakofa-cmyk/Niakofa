import { Router } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  db,
  dnaMatchResultsTable,
  dnaMatchingConsentTable,
  familyMembersTable,
  familiesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { sanitizeConnectionsPayload } from "../lib/sanitize-dna-connections";

const router = Router();
const FEATURE_ENABLED = process.env.DNA_MATCHING_ENABLED === "true";
const MAX_CONNECTIONS = 50;

function parseId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function activeMember(familyId: number, userId: number) {
  const [membership] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.family_id, familyId),
      eq(familyMembersTable.user_id, userId),
      eq(familyMembersTable.status, "active"),
    ))
    .limit(1);
  return Boolean(membership);
}

router.get("/diaspora/dna/connections", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = parseId(req.query.family_id);
  if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });

  const userId = req.authenticatedUserId!;
  if (!await activeMember(familyId, userId)) {
    return res.status(403).json({ error: "You must be an active Family Space member." });
  }

  if (!FEATURE_ENABLED) {
    return res.json({
      enabled: false,
      opted_in: false,
      candidates: [],
      caveat: "DNA connection review is disabled for this environment.",
    });
  }

  const [consent] = await db
    .select({ opted_in: dnaMatchingConsentTable.opted_in })
    .from(dnaMatchingConsentTable)
    .where(and(
      eq(dnaMatchingConsentTable.family_id, familyId),
      eq(dnaMatchingConsentTable.user_id, userId),
    ))
    .limit(1);

  if (!consent?.opted_in) {
    return res.json({
      enabled: true,
      opted_in: false,
      candidates: [],
      caveat: "Opt in to see consented DNA similarity candidates.",
    });
  }

  // Join the candidate identity in one query instead of issuing one database
  // lookup per result. Only fields needed by the review UI are selected.
  const candidates = await db
    .select({
      id: dnaMatchResultsTable.id,
      candidate_name: familyMembersTable.display_name,
      candidate_family_name: familiesTable.name,
      relation_note: familyMembersTable.relation_note,
      similarity_score: dnaMatchResultsTable.similarity_score,
      confidence: dnaMatchResultsTable.confidence,
      source: dnaMatchResultsTable.source,
      relationship_band: dnaMatchResultsTable.relationship_band,
    })
    .from(dnaMatchResultsTable)
    .innerJoin(familyMembersTable, and(
      eq(familyMembersTable.family_id, dnaMatchResultsTable.matched_family_id),
      eq(familyMembersTable.user_id, dnaMatchResultsTable.matched_user_id),
      eq(familyMembersTable.status, "active"),
    ))
    .innerJoin(familiesTable, eq(familiesTable.id, familyMembersTable.family_id))
    .where(and(
      eq(dnaMatchResultsTable.family_id, familyId),
      eq(dnaMatchResultsTable.user_id, userId),
      gt(dnaMatchResultsTable.expires_at, new Date()),
    ))
    .orderBy(desc(dnaMatchResultsTable.similarity_score))
    .limit(MAX_CONNECTIONS);

  return res.json(sanitizeConnectionsPayload({
    enabled: true,
    opted_in: true,
    candidates,
    caveat: "These are low-confidence derived-sketch similarity signals. They are not shared-cM, identity, parentage, paternity, legal, forensic, or ethnicity findings. Review with documentary/genealogical evidence before linking a tree relationship.",
  }));
});

export default router;
