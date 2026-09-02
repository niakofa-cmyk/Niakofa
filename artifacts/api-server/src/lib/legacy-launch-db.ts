import {
  db,
  familyMembersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export async function getFamilyMembership(
  familyId: number,
  userId: number,
): Promise<{ id: number } | undefined> {
  const [membership] = await db
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
  return membership;
}

export async function getFamilyCharacter(
  familyId: number,
  characterId: string,
): Promise<{ id: number } | undefined> {
  const numericId = Number(characterId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) return undefined;

  const [member] = await db
    .select({ id: familyMembersTable.id })
    .from(familyMembersTable)
    .where(
      and(
        eq(familyMembersTable.id, numericId),
        eq(familyMembersTable.family_id, familyId),
        inArray(familyMembersTable.status, ["active", "invited"]),
      ),
    )
    .limit(1);
  return member;
}