/**
 * Niakofa — Family Vault: Storytelling Consent API
 *
 * Manages per-member consent flags that control how a member's data is used in
 * Legacy Mode (AI-generated chapters, ancestor selection, quest generation).
 *
 * Consent rules:
 *   - Living member WITH a linked user_id: only that user can grant/revoke
 *     their own consent (self-consent). An owner/curator cannot consent on
 *     their behalf.
 *   - Deceased member OR living member with NO linked account: any owner or
 *     curator can set consent on their behalf (there is no "self" to ask).
 *   - The caller must always be a member of the family.
 *
 * Routes:
 *   GET   /api/family/:familyId/consent                  — list all consent records for the family
 *   GET   /api/family/:familyId/consent/:memberId       — get consent for a specific member
 *   PATCH /api/family/:familyId/consent/:memberId/:scope — grant or revoke consent
 *     Body: { granted: boolean }
 */

import { Router } from "express";
import {
  db,
  familiesTable,
  familyMembersTable,
  familyMemberConsentTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const CAN_MANAGE_ROLES: string[] = ["owner", "curator"];

async function getFamilyMembership(familyId: number, userId: number) {
  const [row] = await db
    .select()
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.user_id, userId),
        eq(familyMembersTable.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

router.get(
  "/family/:familyId/consent",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = Number(req.params.familyId);
    if (!familyId) return res.status(400).json({ error: "Invalid family id" });

    const userId = req.authenticatedUserId!;
    const membership = await getFamilyMembership(familyId, userId);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const consentRecords = await db
        .select()
        .from(familyMemberConsentTable)
        .where(eq(familyMemberConsentTable.family_id, familyId));

      return res.json({ consent: consentRecords });
    } catch (err) {
      logger.error({ err, familyId }, "family-consent: list failed");
      return res.status(500).json({ error: "Failed to list consent records" });
    }
  },
);

router.get(
  "/family/:familyId/consent/:memberId",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = Number(req.params.familyId);
    const memberId = Number(req.params.memberId);
    if (!familyId || !memberId) {
      return res.status(400).json({ error: "Invalid family or member id" });
    }

    const userId = req.authenticatedUserId!;
    const membership = await getFamilyMembership(familyId, userId);
    if (!membership) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    try {
      const consentRecords = await db
        .select()
        .from(familyMemberConsentTable)
        .where(
          and(
            eq(familyMemberConsentTable.family_id, familyId),
            eq(familyMemberConsentTable.member_id, memberId),
          ),
        );

      return res.json({ consent: consentRecords });
    } catch (err) {
      logger.error({ err, familyId, memberId }, "family-consent: get member failed");
      return res.status(500).json({ error: "Failed to get consent record" });
    }
  },
);

router.patch(
  "/family/:familyId/consent/:memberId/:scope",
  generalApiLimiter,
  requireAuth,
  async (req, res) => {
    const familyId = Number(req.params.familyId);
    const memberId = Number(req.params.memberId);
    const scope = String(req.params.scope);
    if (!familyId || !memberId) {
      return res.status(400).json({ error: "Invalid family or member id" });
    }

    const VALID_SCOPES = new Set(["storytelling", "reconnection", "publication"]);
    if (!VALID_SCOPES.has(scope)) {
      return res.status(400).json({ error: `Invalid consent scope "${scope}"` });
    }

    const { granted } = req.body as { granted?: boolean };
    if (typeof granted !== "boolean") {
      return res.status(400).json({ error: "Body must include { granted: boolean }" });
    }

    const userId = req.authenticatedUserId!;

    const [callerMembership] = await db
      .select()
      .from(familyMembersTable)
      .where(
        and(
          eq(familyMembersTable.family_id, familyId),
          eq(familyMembersTable.user_id, userId),
          eq(familyMembersTable.status, "active"),
        ),
      )
      .limit(1);

    if (!callerMembership) {
      return res.status(403).json({ error: "Not a member of this family" });
    }

    const [targetMember] = await db
      .select()
      .from(familyMembersTable)
      .where(eq(familyMembersTable.id, memberId))
      .limit(1);

    if (!targetMember) {
      return res.status(404).json({ error: "Member not found" });
    }

    if (targetMember.family_id !== familyId) {
      return res.status(404).json({ error: "Member not found" });
    }

    const isLivingWithAccount =
      targetMember.is_living === true && targetMember.user_id !== null;

    if (isLivingWithAccount) {
      if (targetMember.user_id !== userId) {
        return res.status(403).json({
          error:
            "Living members with a linked account must set their own storytelling consent. " +
            "An owner or curator cannot consent on their behalf.",
        });
      }
    } else {
      if (!CAN_MANAGE_ROLES.includes(callerMembership.role as string)) {
        return res.status(403).json({
          error: "Owner or curator access required to set consent for this member",
        });
      }
    }

    try {
      const [existing] = await db
        .select()
        .from(familyMemberConsentTable)
        .where(
          and(
            eq(familyMemberConsentTable.family_id, familyId),
            eq(familyMemberConsentTable.member_id, memberId),
            eq(familyMemberConsentTable.scope, scope as never),
          ),
        )
        .limit(1);

      let record;

      if (existing) {
        [record] = await db
          .update(familyMemberConsentTable)
          .set({
            granted,
            granted_by: callerMembership.id,
            granted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(familyMemberConsentTable.id, existing.id))
          .returning();
      } else {
        [record] = await db
          .insert(familyMemberConsentTable)
          .values({
            family_id: familyId,
            member_id: memberId,
            scope: scope as never,
            granted,
            granted_by: callerMembership.id,
            granted_at: new Date(),
          })
          .returning();
      }

      logger.info(
        { familyId, memberId, scope, granted, setBy: userId },
        "family-consent: consent updated",
      );

      return res.json({ consent: record });
    } catch (err) {
      logger.error({ err, familyId, memberId, scope }, "family-consent: update failed");
      return res.status(500).json({ error: "Failed to update consent" });
    }
  },
);

export default router;
