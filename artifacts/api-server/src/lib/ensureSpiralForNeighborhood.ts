import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/** Ensure a discovery Spiral exists for a promoted city_neighborhoods row. */
export async function ensureSpiralForNeighborhood(row: {
  id: number;
  city_key: string;
  city_display: string;
  name: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
      VALUES (
        ${row.city_key},
        ${row.city_display},
        ${row.id},
        ${row.name + " Spiral"}
      )
      ON CONFLICT (neighborhood_id) WHERE neighborhood_id IS NOT NULL DO NOTHING
    `);
  } catch (err) {
    logger.error({ err, neighborhoodId: row.id }, "ensureSpiralForNeighborhood failed");
  }
}
