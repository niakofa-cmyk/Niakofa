import { db, communitiesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeMapboxStateCode } from "./civic-geo.js";

export interface CommunityJurisdiction {
  communityId: number;
  county: string;
  state: string;
  name: string;
}

function normalizeCounty(value: string): string {
  return value.replace(/\s+County$/i, "").replace(/\s+/g, " ").trim();
}

/**
 * Resolve the canonical US county/state for a reverse-geocoded place.
 *
 * Community rows are created lazily when a real GPS fix first enters a
 * county. This means the platform can serve every county without shipping a
 * brittle, incomplete seed list, while the unique county/state lookup keeps
 * each pool isolated.
 */
export function canonicalCountyState(place: {
  county?: string | null;
  state?: string | null;
  state_short?: string | null;
}): { county: string; state: string } | null {
  const county = place.county ? normalizeCounty(place.county) : "";
  const state = normalizeMapboxStateCode(place.state_short, place.state);
  if (!county || !state) return null;
  return { county, state };
}

export async function findOrCreateCommunityForJurisdiction(
  jurisdiction: { county: string; state: string },
): Promise<CommunityJurisdiction> {
  const existing = await db.execute<{
    id: number;
    name: string;
    county: string;
    state: string;
  }>(sql`
    SELECT id, name, county, state
    FROM communities
    WHERE LOWER(TRIM(REGEXP_REPLACE(county, '\\s+County$', '', 'i'))) = LOWER(TRIM(${jurisdiction.county}))
      AND UPPER(TRIM(state)) = UPPER(TRIM(${jurisdiction.state}))
    ORDER BY id ASC
    LIMIT 1
  `);

  const row = existing.rows[0];
  if (row) {
    return {
      communityId: row.id,
      county: normalizeCounty(row.county),
      state: row.state.toUpperCase(),
      name: row.name,
    };
  }

  const name = `${jurisdiction.county} County, ${jurisdiction.state}`;
  const [created] = await db
    .insert(communitiesTable)
    .values({
      name,
      county: jurisdiction.county,
      state: jurisdiction.state,
      description: `Community Pool, civic needs, and local resources for ${name}.`,
    })
    .onConflictDoNothing()
    .returning({
      id: communitiesTable.id,
      name: communitiesTable.name,
      county: communitiesTable.county,
      state: communitiesTable.state,
    });

  if (!created) {
    // Another request may have inserted this county after our initial read.
    // The canonical unique index makes that insert the winner; return it
    // rather than creating a split pool or surfacing a transient conflict.
    const winner = await db.execute<{
      id: number;
      name: string;
      county: string;
      state: string;
    }>(sql`
      SELECT id, name, county, state
      FROM communities
      WHERE LOWER(TRIM(REGEXP_REPLACE(county, '\\s+County$', '', 'i'))) = LOWER(TRIM(${jurisdiction.county}))
        AND UPPER(TRIM(state)) = UPPER(TRIM(${jurisdiction.state}))
      ORDER BY id ASC
      LIMIT 1
    `);
    const row = winner.rows[0];
    if (!row) throw new Error("Community jurisdiction could not be persisted");
    return {
      communityId: row.id,
      county: normalizeCounty(row.county),
      state: row.state.toUpperCase(),
      name: row.name,
    };
  }

  if (!created.id || !created.county || !created.state) {
    throw new Error("Community jurisdiction could not be persisted");
  }

  return {
    communityId: created.id,
    county: normalizeCounty(created.county),
    state: created.state.toUpperCase(),
    name: created.name,
  };
}