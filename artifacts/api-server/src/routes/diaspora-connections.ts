import { Router } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, dnaMatchResultsTable, dnaMatchingConsentTable, familyMembersTable, familiesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();
function parseId(v: unknown) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }
async function activeMember(familyId: number, userId: number) { const [m] = await db.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active"))).limit(1); return Boolean(m); }

router.get("/diaspora/dna/connections", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = parseId(req.query.family_id); if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });
  const userId = req.authenticatedUserId!; if (!await activeMember(familyId, userId)) return res.status(403).json({ error: "You must be an active Family Space member." });
  const [consent] = await db.select({ opted_in: dnaMatchingConsentTable.opted_in }).from(dnaMatchingConsentTable).where(and(eq(dnaMatchingConsentTable.family_id, familyId), eq(dnaMatchingConsentTable.user_id, userId))).limit(1);
  if (!consent?.opted_in) return res.json({ enabled: true, opted_in: false, candidates: [], caveat: "Opt in to see consented DNA similarity candidates." });
  const results = await db.select().from(dnaMatchResultsTable).where(and(eq(dnaMatchResultsTable.family_id, familyId), eq(dnaMatchResultsTable.user_id, userId), gt(dnaMatchResultsTable.expires_at, new Date()))).orderBy(desc(dnaMatchResultsTable.similarity_score));
  const candidates = await Promise.all(results.map(async (r) => {
    const [member] = await db.select({ id: familyMembersTable.id, display_name: familyMembersTable.display_name, relation_note: familyMembersTable.relation_note, family_name: familiesTable.name }).from(familyMembersTable).innerJoin(familiesTable, eq(familiesTable.id, familyMembersTable.family_id)).where(and(eq(familyMembersTable.family_id, r.matched_family_id), eq(familyMembersTable.user_id, r.matched_user_id), eq(familyMembersTable.status, "active"))).limit(1);
    return { ...r, candidate_name: member?.display_name ?? "Another opted-in member", candidate_family_name: member?.family_name ?? "Another Family Space", relation_note: member?.relation_note ?? null };
  }));
  return res.json({ enabled: true, opted_in: true, candidates, caveat: "These are low-confidence derived-sketch similarity signals. They are not shared-cM, identity, parentage, paternity, legal, forensic, or ethnicity findings. Review with documentary/genealogical evidence before linking a tree relationship." });
});

export default router;
