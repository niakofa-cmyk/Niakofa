/**
 * community-context.ts
 *
 * Queries the main DB for live community stats to inject into Nia's context:
 *   - open request count (total or nearby)
 *   - online helper count
 *
 * Always best-effort — never blocks a chat response if it fails.
 * Results are formatted as a context prefix for the Anthropic system prompt.
 */
import { pool } from "./db.js";
import pino from "pino";

const logger = pino({ level: "info" });

/**
 * Builds a live community awareness prefix for Nia's system prompt.
 *
 * @param opts.lat  User latitude (from GPS or IP geo)
 * @param opts.lon  User longitude
 * @param opts.radiusMiles  Radius for "nearby" queries (default 5 miles)
 */
export async function buildCommunityAwarenessPrefix(opts?: {
  lat?: number | null;
  lon?: number | null;
  radiusMiles?: number;
}): Promise<string> {
  try {
    const { lat, lon, radiusMiles = 5 } = opts ?? {};
    const hasCoords = lat != null && lon != null;
    const radiusKm = (radiusMiles ?? 5) * 1.60934;

    const [openResult, helpersResult, nearbyResult] = await Promise.all([
      // Total open requests in the community
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM help_requests WHERE status = 'open'`
      ),

      // Helpers currently active (helper_mode_active = true, not suspended)
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM users
         WHERE helper_mode_active = TRUE
           AND (is_suspended IS NULL OR is_suspended = FALSE)`
      ),

      // Nearby open requests using Haversine formula (requires lat/lng columns)
      hasCoords
        ? pool.query<{ count: string }>(
            `SELECT COUNT(*) AS count
             FROM help_requests
             WHERE status = 'open'
               AND lat IS NOT NULL
               AND lng IS NOT NULL
               AND (
                 6371 * acos(
                   LEAST(1.0, GREATEST(-1.0,
                     cos(radians($1::float)) * cos(radians(lat::float)) *
                     cos(radians(lng::float) - radians($2::float)) +
                     sin(radians($1::float)) * sin(radians(lat::float))
                   ))
                 )
               ) <= $3::float`,
            [lat, lon, radiusKm]
          )
        : Promise.resolve(null),
    ]);

    const openCount = parseInt(openResult.rows[0]?.count ?? "0", 10);
    const helpersCount = parseInt(helpersResult.rows[0]?.count ?? "0", 10);
    const nearbyCount = nearbyResult
      ? parseInt(nearbyResult.rows[0]?.count ?? "0", 10)
      : null;

    const parts: string[] = [];

    if (nearbyCount != null && nearbyCount > 0) {
      parts.push(
        `${nearbyCount} open help request${nearbyCount !== 1 ? "s" : ""} near you right now`
      );
    } else if (openCount > 0) {
      parts.push(
        `${openCount} open help request${openCount !== 1 ? "s" : ""} in the community right now`
      );
    }

    if (helpersCount > 0) {
      parts.push(
        `${helpersCount} helper${helpersCount !== 1 ? "s" : ""} currently active on the platform`
      );
    }

    if (parts.length === 0) return "";

    return (
      `[Live community context — weave in naturally when relevant, never recite as a list: ` +
      `${parts.join("; ")}. ` +
      `If someone wants to help or needs help urgently, this real-time data is a bridge.]\n\n`
    );
  } catch (err) {
    logger.warn({ err }, "community-context: failed to fetch live stats (non-fatal)");
    return "";
  }
}
