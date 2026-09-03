import { Router } from "express";
import {
  and, desc, eq, gt, lt, ne, or,
} from "drizzle-orm";
import {
  db,
  dnaMatchResultsTable,
  dnaMatchingConsentTable,
  familyDnaProfilesTable,
  familyMembersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { estimateDnaRelationship } from "../lib/dna-matching-engine";
import { logger } from "../lib/logger";

const router = Router();
const CONSENT_VERSION = "dna-matching-v1";
const FEATURE_ENABLED = process.env.DNA_MATCHING_ENABLED === "true";
const MIN_SKETCH_MARKERS = 32;

function parseFamilyId(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function isActiveFamilyMember(familyId: number, userId: number) {
  const [membership] = await db.select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(and(
      eq(familyMembersTable.family_id, familyId),
      eq(familyMembersTable.user_id, userId),
      eq(familyMembersTable.status, "active"),
    ))
    .limit(1);
  return Boolean(membership);
}

async function getReadyProfile(familyId: number, userId: number) {
  const [profile] = await db.select()
    .from(familyDnaProfilesTable)
    .where(and(
      eq(familyDnaProfilesTable.family_id, familyId),
      eq(familyDnaProfilesTable.user_id, userId),
      eq(familyDnaProfilesTable.status, "ready"),
      gt(familyDnaProfilesTable.retention_expires_at, new Date()),
    ))
    .limit(1);
  return profile ?? null;
}

async function getConsent(familyId: number, userId: number) {
  const [consent] = await db.select()
    .from(dnaMatchingConsentTable)
    .where(and(
      eq(dnaMatchingConsentTable.family_id, familyId),
      eq(dnaMatchingConsentTable.user_id, userId),
    ))
    .limit(1);
  return consent ?? null;
}

function publicConsent(consent: Awaited<ReturnType<typeof getConsent>>) {
  return consent ? {
    opted_in: consent.opted_in,
    consent_version: consent.consent_version,
    consented_at: consent.consented_at,
    revoked_at: consent.revoked_at,
  } : {
    opted_in: false,
    consent_version: CONSENT_VERSION,
    consented_at: null,
    revoked_at: null,
  };
}

// Status is available even while the experiment is disabled so the UI can
// explain the boundary without asking users to consent to an unavailable path.
router.get("/diaspora/dna/matching/status", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = parseFamilyId(req.query.family_id);
  if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });
  const userId = req.authenticatedUserId!;
  if (!await isActiveFamilyMember(familyId, userId)) return res.status(403).json({ error: "You must be an active Family Space member." });

  const [profile, consent] = await Promise.all([
    getReadyProfile(familyId, userId),
    getConsent(familyId, userId),
  ]);
  return res.json({
    enabled: FEATURE_ENABLED,
    consent: publicConsent(consent),
    has_ready_profile: Boolean(profile && Array.isArray(profile.marker_sketch) && profile.marker_sketch.length >= MIN_SKETCH_MARKERS),
    matching_source: FEATURE_ENABLED ? "private_derived_sketch_v1" : null,
    retention_days: 90,
  });
});

router.post("/diaspora/dna/matching/consent", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = parseFamilyId(req.body?.family_id);
  const optedIn = req.body?.opted_in;
  if (!familyId || typeof optedIn !== "boolean") {
    return res.status(400).json({ error: "family_id and a boolean opted_in value are required." });
  }
  const userId = req.authenticatedUserId!;
  if (!await isActiveFamilyMember(familyId, userId)) return res.status(403).json({ error: "You must be an active Family Space member." });

  const now = new Date();
  const [consent] = await db.insert(dnaMatchingConsentTable).values({
    family_id: familyId,
    user_id: userId,
    opted_in: optedIn,
    consent_version: CONSENT_VERSION,
    consented_at: optedIn ? now : null,
    revoked_at: optedIn ? null : now,
    updated_at: now,
  }).onConflictDoUpdate({
    target: [dnaMatchingConsentTable.family_id, dnaMatchingConsentTable.user_id],
    set: {
      opted_in: optedIn,
      consent_version: CONSENT_VERSION,
      consented_at: optedIn ? now : undefined,
      revoked_at: optedIn ? null : now,
      updated_at: now,
    },
  }).returning();

  // Revocation is immediate and removes previously computed relationship rows.
  if (!optedIn) {
    await db.transaction(async (tx) => {
      await tx.delete(dnaMatchResultsTable).where(or(
        and(
          eq(dnaMatchResultsTable.family_id, familyId),
          eq(dnaMatchResultsTable.user_id, userId),
        ),
        and(
          eq(dnaMatchResultsTable.matched_family_id, familyId),
          eq(dnaMatchResultsTable.matched_user_id, userId),
        ),
      ));
    });
  }
  logger.info({ userId, familyId, optedIn }, "dna_matching_consent_updated");
  return res.json({ consent: publicConsent(consent), matches: [] });
});

router.post("/diaspora/dna/matching/refresh", requireAuth, generalApiLimiter, async (req, res) => {
  if (!FEATURE_ENABLED) return res.status(503).json({ error: "DNA matching is not enabled for this environment." });
  const familyId = parseFamilyId(req.body?.family_id);
  if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });
  const userId = req.authenticatedUserId!;
  if (!await isActiveFamilyMember(familyId, userId)) return res.status(403).json({ error: "You must be an active Family Space member." });

  const [profile, consent] = await Promise.all([
    getReadyProfile(familyId, userId),
    getConsent(familyId, userId),
  ]);
  if (!consent?.opted_in) return res.status(409).json({ error: "Opt in before refreshing DNA matches." });
  if (!profile || !Array.isArray(profile.marker_sketch) || profile.marker_sketch.length < MIN_SKETCH_MARKERS) {
    return res.status(409).json({ error: "Import a valid DNA export before refreshing matches." });
  }

  const cohort = await db.select({
    profile: familyDnaProfilesTable,
    consent: dnaMatchingConsentTable,
  }).from(familyDnaProfilesTable)
    .innerJoin(dnaMatchingConsentTable, and(
      eq(dnaMatchingConsentTable.family_id, familyDnaProfilesTable.family_id),
      eq(dnaMatchingConsentTable.user_id, familyDnaProfilesTable.user_id),
      eq(dnaMatchingConsentTable.opted_in, true),
    ))
    .innerJoin(familyMembersTable, and(
      eq(familyMembersTable.family_id, familyDnaProfilesTable.family_id),
      eq(familyMembersTable.user_id, familyDnaProfilesTable.user_id),
      eq(familyMembersTable.status, "active"),
    ))
    .where(and(
      eq(familyDnaProfilesTable.status, "ready"),
      gt(familyDnaProfilesTable.retention_expires_at, new Date()),
      ne(familyDnaProfilesTable.user_id, userId),
    ));

  const estimates = cohort.map(({ profile: candidate }) => {
    const estimate = estimateDnaRelationship(
      { markerSketch: profile.marker_sketch, markerCount: profile.marker_count },
      { markerSketch: candidate.marker_sketch, markerCount: candidate.marker_count },
    );
    return estimate ? { candidate, estimate } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  await db.delete(dnaMatchResultsTable).where(and(
    eq(dnaMatchResultsTable.family_id, familyId),
    eq(dnaMatchResultsTable.user_id, userId),
  ));
  if (estimates.length > 0) {
    const expiresAt = new Date(Math.min(
      profile.retention_expires_at.getTime(),
      ...estimates.map(({ candidate }) => candidate.retention_expires_at.getTime()),
    ));
    await db.insert(dnaMatchResultsTable).values(estimates.map(({ candidate, estimate }) => ({
      family_id: familyId,
      user_id: userId,
      matched_family_id: candidate.family_id,
      matched_user_id: candidate.user_id,
      similarity_score: estimate.similarityScore,
      shared_cm_est: null,
      relationship_band: estimate.relationshipBand,
      confidence: estimate.confidence,
      source: estimate.source,
      expires_at: expiresAt,
    })));
  }
  await db.update(familyDnaProfilesTable)
    .set({ match_count: estimates.length, updated_at: new Date() })
    .where(eq(familyDnaProfilesTable.id, profile.id));

  return res.json({
    matches: estimates.map(({ candidate, estimate }) => ({
      matched_family_id: candidate.family_id,
      matched_user_id: candidate.user_id,
      relationship_band: estimate.relationshipBand,
      confidence: estimate.confidence,
      similarity_score: estimate.similarityScore,
      source: estimate.source,
    })),
    generated_at: new Date().toISOString(),
    caveat: "Similarity signals only; no shared-cM, relationship, legal, forensic, paternity, or ethnicity result is calculated.",
  });
});

router.get("/diaspora/dna/matching/results", requireAuth, generalApiLimiter, async (req, res) => {
  const familyId = parseFamilyId(req.query.family_id);
  if (!familyId) return res.status(400).json({ error: "A valid family_id is required." });
  const userId = req.authenticatedUserId!;
  if (!await isActiveFamilyMember(familyId, userId)) return res.status(403).json({ error: "You must be an active Family Space member." });
  if (!FEATURE_ENABLED) return res.json({ matches: [], enabled: false });

  await db.delete(dnaMatchResultsTable).where(and(
    eq(dnaMatchResultsTable.user_id, userId),
    lt(dnaMatchResultsTable.expires_at, new Date()),
  ));
  const matches = await db.select().from(dnaMatchResultsTable)
    .where(and(
      eq(dnaMatchResultsTable.family_id, familyId),
      eq(dnaMatchResultsTable.user_id, userId),
      gt(dnaMatchResultsTable.expires_at, new Date()),
    ))
    .orderBy(desc(dnaMatchResultsTable.similarity_score));
  return res.json({
    enabled: true,
    matches: matches.map((match) => ({
      matched_family_id: match.matched_family_id,
      matched_user_id: match.matched_user_id,
      relationship_band: match.relationship_band,
      confidence: match.confidence,
      similarity_score: match.similarity_score,
      source: match.source,
      created_at: match.created_at,
      expires_at: match.expires_at,
    })),
    caveat: "Similarity signals only; no shared-cM, relationship, legal, forensic, paternity, or ethnicity result is calculated.",
  });
});

export default router;