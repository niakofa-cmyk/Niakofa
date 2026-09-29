import { db, exchangeListingsTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

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

let exchangeSpatialIndexReadyPromise: Promise<boolean> | null = null;

/**
 * Production databases must advertise both the PostGIS extension and the
 * migration-created geography column/index before the route uses ST_DWithin.
 * This catalog check is safe on the local PostgreSQL fallback, where PostGIS
 * is intentionally unavailable and the column may not exist.
 */
export async function exchangeSpatialIndexReady(
  database: Pick<typeof db, "execute"> = db,
): Promise<boolean> {
  if (!exchangeSpatialIndexReadyPromise) {
    exchangeSpatialIndexReadyPromise = database.execute(sql`
      SELECT (
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')
        AND EXISTS (
          SELECT 1
          FROM pg_attribute
          WHERE attrelid = 'exchange_listings'::regclass
            AND attname = 'geog'
            AND NOT attisdropped
        )
        AND EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = current_schema()
            AND tablename = 'exchange_listings'
            AND indexname = 'exchange_listings_geo_idx'
        )
      ) AS ready
    `).then((result) => {
      const value = (result.rows[0] as { ready?: unknown } | undefined)?.ready;
      return value === true || value === "t" || value === "true";
    }).catch(() => false);
  }
  return exchangeSpatialIndexReadyPromise;
}

/**
 * Build the authorized nearby predicate. The PostGIS branch is deliberately
 * parameterized and references the stored geography column, not an inline
 * ST_MakePoint(listing.latitude, listing.longitude), so the production GiST
 * index remains usable. The fallback is retained for local PostgreSQL without
 * PostGIS and still applies the same server-side radius cap in the route.
 */
export function exchangeNearbyCondition(
  viewerLocation: { lat: number; lng: number },
  radiusMiles: number,
  usePostgis: boolean,
) {
  if (usePostgis) {
    return sql`
      ${exchangeListingsTable.geog} IS NOT NULL
      AND ST_DWithin(
        ${exchangeListingsTable.geog},
        ST_SetSRID(ST_MakePoint(${viewerLocation.lng}, ${viewerLocation.lat}), 4326)::geography,
        ${radiusMiles * 1609.344}
      )
    `;
  }

  const latDelta = radiusMiles / 69;
  const lngDelta = radiusMiles / (69 * Math.max(0.25, Math.cos((viewerLocation.lat * Math.PI) / 180)));
  return and(
    sql`${exchangeListingsTable.latitude} IS NOT NULL AND ${exchangeListingsTable.longitude} IS NOT NULL`,
    sql`${exchangeListingsTable.latitude} BETWEEN ${viewerLocation.lat - latDelta} AND ${viewerLocation.lat + latDelta}`,
    sql`${exchangeListingsTable.longitude} BETWEEN ${viewerLocation.lng - lngDelta} AND ${viewerLocation.lng + lngDelta}`,
    sql`3958.8 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(${exchangeListingsTable.latitude} - ${viewerLocation.lat}) / 2), 2) +
      COS(RADIANS(${viewerLocation.lat})) * COS(RADIANS(${exchangeListingsTable.latitude})) *
      POWER(SIN(RADIANS(${exchangeListingsTable.longitude} - ${viewerLocation.lng}) / 2), 2)
    )) <= ${radiusMiles}`,
  );
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