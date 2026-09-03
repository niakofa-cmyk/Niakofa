import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, diasporaResearchCasesTable, diasporaResearchEvidenceTable, diasporaResearchNotesTable, familyEventsTable, familyMembersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();
const STATUSES = new Set(["open", "paused", "resolved"]);
const CONFIDENCE = new Set(["unreviewed", "possible", "supported", "strong"]);
const EVIDENCE_TYPES = new Set(["document", "shared_segment", "pedigree", "oral_history", "place_history", "dna_profile"]);
function id(value: unknown): number | null { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
async function memberOf(familyId: number, userId: number) {
  const [m] = await db.select().from(familyMembersTable).where(and(eq(familyMembersTable.family_id, familyId), eq(familyMembersTable.user_id, userId), eq(familyMembersTable.status, "active"))).limit(1);
  return m ?? null;
}
async function familyPerson(familyId: number, memberId: number) {
  const [m] = await db.select({ id: familyMembersTable.id }).from(familyMembersTable).where(and(eq(familyMembersTable.id, memberId), eq(familyMembersTable.family_id, familyId))).limit(1);
  return m ?? null;
}
async function getCase(caseId: number, userId: number) {
  const [row] = await db.select().from(diasporaResearchCasesTable).where(eq(diasporaResearchCasesTable.id, caseId)).limit(1);
  if (!row) return null;
  return (await memberOf(row.family_id, userId)) ? row : null;
}

router.get("/diaspora/research/cases", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = id(req.query.family_id);
  if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });
  if (!await memberOf(familyId, req.authenticatedUserId!)) return res.status(403).json({ error: "You must be an active Family Space member." });
  const cases = await db.select().from(diasporaResearchCasesTable).where(eq(diasporaResearchCasesTable.family_id, familyId)).orderBy(desc(diasporaResearchCasesTable.updated_at));
  return res.json({ cases });
});

router.post("/diaspora/research/cases", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = id(req.body?.family_id); const personMemberId = req.body?.person_member_id == null ? null : id(req.body.person_member_id);
  const title = String(req.body?.title ?? "").trim(); const question = String(req.body?.research_question ?? "").trim();
  if (!familyId || !title || !question) return res.status(400).json({ error: "family_id, title, and research_question are required." });
  if (title.length > 180 || question.length > 4000) return res.status(400).json({ error: "Research text is too long." });
  if (!await memberOf(familyId, req.authenticatedUserId!)) return res.status(403).json({ error: "You must be an active Family Space member." });
  if (personMemberId && !await familyPerson(familyId, personMemberId)) return res.status(400).json({ error: "person_member_id does not belong to this family." });
  const [created] = await db.insert(diasporaResearchCasesTable).values({ family_id: familyId, created_by: req.authenticatedUserId!, person_member_id: personMemberId, title, research_question: question }).returning();
  return res.status(201).json({ case: created });
});

router.get("/diaspora/research/cases/:caseId", requireAuth, generalApiLimiter, async (req, res) => {
  const caseId = id(req.params.caseId); if (!caseId) return res.status(400).json({ error: "Invalid case id." });
  const row = await getCase(caseId, req.authenticatedUserId!); if (!row) return res.status(404).json({ error: "Research case not found." });
  const [evidence, notes] = await Promise.all([
    db.select().from(diasporaResearchEvidenceTable).where(eq(diasporaResearchEvidenceTable.case_id, caseId)).orderBy(desc(diasporaResearchEvidenceTable.created_at)),
    db.select().from(diasporaResearchNotesTable).where(eq(diasporaResearchNotesTable.case_id, caseId)).orderBy(desc(diasporaResearchNotesTable.created_at)),
  ]);
  let person = null; if (row.person_member_id) { const [p] = await db.select({ id: familyMembersTable.id, display_name: familyMembersTable.display_name, relation_note: familyMembersTable.relation_note }).from(familyMembersTable).where(eq(familyMembersTable.id, row.person_member_id)).limit(1); person = p ?? null; }
  return res.json({ case: row, person, evidence, notes });
});

router.patch("/diaspora/research/cases/:caseId", requireAuth, generalApiLimiter, async (req, res) => {
  const caseId = id(req.params.caseId); if (!caseId) return res.status(400).json({ error: "Invalid case id." });
  const row = await getCase(caseId, req.authenticatedUserId!); if (!row) return res.status(404).json({ error: "Research case not found." });
  const nextStatus = req.body?.status == null ? row.status : String(req.body.status); const nextConfidence = req.body?.confidence == null ? row.confidence : String(req.body.confidence);
  const nextPerson = req.body?.person_member_id === null ? null : (req.body?.person_member_id == null ? row.person_member_id : id(req.body.person_member_id));
  if (!STATUSES.has(nextStatus) || !CONFIDENCE.has(nextConfidence)) return res.status(400).json({ error: "Invalid status or confidence." });
  if (req.body?.person_member_id !== undefined && nextPerson !== null && !await familyPerson(row.family_id, nextPerson)) return res.status(400).json({ error: "person_member_id does not belong to this family." });
  const [updated] = await db.update(diasporaResearchCasesTable).set({ status: nextStatus, confidence: nextConfidence, person_member_id: nextPerson, updated_at: new Date() }).where(eq(diasporaResearchCasesTable.id, caseId)).returning();
  return res.json({ case: updated });
});

router.post("/diaspora/research/cases/:caseId/evidence", requireAuth, generalApiLimiter, async (req, res) => {
  const caseId = id(req.params.caseId); const title = String(req.body?.title ?? "").trim(); const evidenceType = String(req.body?.evidence_type ?? "document");
  if (!caseId || !title) return res.status(400).json({ error: "case id and title are required." }); if (!EVIDENCE_TYPES.has(evidenceType)) return res.status(400).json({ error: "Invalid evidence_type." });
  const row = await getCase(caseId, req.authenticatedUserId!); if (!row) return res.status(404).json({ error: "Research case not found." }); const confidence = String(req.body?.confidence ?? "possible"); if (!CONFIDENCE.has(confidence)) return res.status(400).json({ error: "Invalid confidence." });
  const [created] = await db.insert(diasporaResearchEvidenceTable).values({ case_id: caseId, created_by: req.authenticatedUserId!, title: title.slice(0, 240), source_url: req.body?.source_url ? String(req.body.source_url).slice(0, 2000) : null, citation: req.body?.citation ? String(req.body.citation).slice(0, 4000) : null, evidence_type: evidenceType, confidence, notes: req.body?.notes ? String(req.body.notes).slice(0, 6000) : null, source_date: req.body?.source_date ? new Date(String(req.body.source_date)) : null }).returning();
  await db.update(diasporaResearchCasesTable).set({ updated_at: new Date() }).where(eq(diasporaResearchCasesTable.id, caseId)); return res.status(201).json({ evidence: created });
});

router.post("/diaspora/research/cases/:caseId/notes", requireAuth, generalApiLimiter, async (req, res) => {
  const caseId = id(req.params.caseId); const body = String(req.body?.body ?? "").trim(); if (!caseId || !body) return res.status(400).json({ error: "case id and note body are required." });
  const row = await getCase(caseId, req.authenticatedUserId!); if (!row) return res.status(404).json({ error: "Research case not found." });
  const [created] = await db.insert(diasporaResearchNotesTable).values({ case_id: caseId, created_by: req.authenticatedUserId!, body: body.slice(0, 8000) }).returning(); await db.update(diasporaResearchCasesTable).set({ updated_at: new Date() }).where(eq(diasporaResearchCasesTable.id, caseId)); return res.status(201).json({ note: created });
});

router.post("/diaspora/research/cases/:caseId/handoff/timeline", requireAuth, generalApiLimiter, async (req, res) => {
  const caseId = id(req.params.caseId); if (!caseId) return res.status(400).json({ error: "Invalid case id." }); const row = await getCase(caseId, req.authenticatedUserId!); if (!row) return res.status(404).json({ error: "Research case not found." });
  if (!row.person_member_id) return res.status(409).json({ error: "Attach a family person to the case before handing off to the Timeline." });
  const title = String(req.body?.title ?? row.title).trim().slice(0, 240); const description = String(req.body?.description ?? row.research_question).trim().slice(0, 6000); const eventDate = req.body?.event_date ? new Date(String(req.body.event_date)) : null;
  const [event] = await db.insert(familyEventsTable).values({ family_id: row.family_id, member_id: row.person_member_id, title, description, event_date: eventDate, event_date_precision: req.body?.event_date ? "day" : "year", category: "other", metadata: { source: "diaspora_research", research_case_id: caseId, confidence: row.confidence } }).returning();
  await db.update(diasporaResearchCasesTable).set({ status: "resolved", updated_at: new Date() }).where(eq(diasporaResearchCasesTable.id, caseId)); return res.status(201).json({ event });
});

export default router;
