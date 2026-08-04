/**
 * Legacy Engine — Storytelling Consent Gate
 *
 * Enforces the consent rule everywhere member data touches the AI or game
 * content. The rule:
 *
 *   - Living member (is_living = true): excluded from all AI/game content
 *     unless they've granted `storytelling` consent themselves (self-consent
 *     only — not even an owner/curator can consent on their behalf if they
 *     have a linked account).
 *
 *   - Deceased member (is_living = false): included by default, unless a
 *     curator/owner has explicitly recorded a `storytelling` decline.
 *
 *   - Living member with no linked account (an unclaimed invite placeholder):
 *     can have consent set by an owner/curator, same as a deceased member,
 *     since there's no "self" to ask.
 */

import { db, familyMembersTable, familyMemberConsentTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

export interface ConsentAwareMember {
  id: number;
  name: string;
  role: string;
  relation: string | null;
  is_living: boolean;
  user_id: number | null;
}

/**
 * Given a family ID, returns the set of member IDs that are ALLOWED to appear
 * in AI prompts and game content (ancestor selection, chapter seeds, etc.).
 *
 * Excludes:
 *   - Living members with a linked account who have NOT granted storytelling consent
 * Includes:
 *   - Deceased members (unless explicitly declined)
 *   - Living members without a linked account (unless explicitly declined)
 *   - Anyone who has explicitly granted storytelling consent
 */
export async function getConsentedMemberIds(familyId: number): Promise<Set<number>> {
  const members = await db
    .select({
      id: familyMembersTable.id,
      is_living: familyMembersTable.is_living,
      user_id: familyMembersTable.user_id,
    })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.family_id, familyId),
        eq(familyMembersTable.status, "active"),
      ),
    );

  if (members.length === 0) return new Set();

  const memberIds = members.map(m => m.id);
  const consentRows = await db
    .select({
      member_id: familyMemberConsentTable.member_id,
      granted: familyMemberConsentTable.granted,
    })
    .from(familyMemberConsentTable)
    .where(
      and(
        eq(familyMemberConsentTable.family_id, familyId),
        eq(familyMemberConsentTable.scope, "storytelling"),
        inArray(familyMemberConsentTable.member_id, memberIds),
      ),
    );

  const consentMap = new Map<number, boolean>();
  for (const row of consentRows) {
    consentMap.set(row.member_id, row.granted);
  }

  const allowed = new Set<number>();
  for (const m of members) {
    const consent = consentMap.get(m.id);

    if (m.is_living && m.user_id !== null) {
      // Living member with a linked account: needs explicit self-granted consent
      if (consent === true) {
        allowed.add(m.id);
      }
    } else {
      // Deceased member OR living member without a linked account:
      // included by default unless explicitly declined
      if (consent !== false) {
        allowed.add(m.id);
      }
    }
  }

  return allowed;
}

/**
 * Filters an array of member objects, returning only those who have consented
 * to storytelling. Use this at every site where member data is collected for
 * AI prompts or game content.
 */
export function filterConsentedMembers<T extends ConsentAwareMember>(
  members: T[],
  consentedIds: Set<number>,
): T[] {
  return members.filter(m => consentedIds.has(m.id));
}
