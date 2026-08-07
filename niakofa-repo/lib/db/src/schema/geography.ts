import { customType } from "drizzle-orm/pg-core";

/**
 * PostGIS geography(Point, 4326) column type. Drizzle has no native PostGIS
 * support, so we declare a custom type. The actual column, GiST index, and
 * a BEFORE-INSERT/UPDATE trigger that keeps geog in sync with lat/lng all
 * live in the database (added via SQL during the PostGIS migration). On the
 * TS side we only ever read it through ST_* SQL expressions, so the stored
 * driver value is treated as an opaque string (WKB hex).
 */
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});
