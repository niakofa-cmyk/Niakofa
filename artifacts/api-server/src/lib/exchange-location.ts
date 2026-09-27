import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ExchangeMatchingLocation = {
  lat: number | null;
  lng: number | null;
};

function coarseCoordinate(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

/**
 * Exchange is intentionally isolated from the application's general location
 * model. Callers receive only privacy-rounded coordinates suitable for local
 * matching; exact user coordinates never leave this module.
 */
export async function getExchangeMatchingLocation(userId: number): Promise<ExchangeMatchingLocation | null> {
  const [user] = await db
    .select({ lat: usersTable.lat, lng: usersTable.lng })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;
  return { lat: coarseCoordinate(user.lat), lng: coarseCoordinate(user.lng) };
}