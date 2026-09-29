import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type ExchangeMatchingLocation = {
  lat: number | null;
  lng: number | null;
};

export function coarseExchangeCoordinate(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

export function exchangeDistanceMiles(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
): number {
  const lat1 = first.lat * Math.PI / 180;
  const lat2 = second.lat * Math.PI / 180;
  const dLat = (second.lat - first.lat) * Math.PI / 180;
  const dLng = (second.lng - first.lng) * Math.PI / 180;
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}

export function isWithinExchangeRadius(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
  radiusMiles: number,
): boolean {
  return Number.isFinite(radiusMiles) && radiusMiles >= 0
    && exchangeDistanceMiles(first, second) <= radiusMiles;
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
  return { lat: coarseExchangeCoordinate(user.lat), lng: coarseExchangeCoordinate(user.lng) };
}