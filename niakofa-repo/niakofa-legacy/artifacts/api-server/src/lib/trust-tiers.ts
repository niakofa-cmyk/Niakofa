/**
 * Trust-tier logic — server-side counterpart to the frontend TrustTierBadge.
 *
 * Kept in sync with artifacts/pay-it-forward/src/components/TrustTierBadge.tsx.
 * If thresholds change here they must be updated there too (and vice-versa).
 *
 * Tier hierarchy (lowest → highest):
 *   member → verified → trusted → elite → anchor
 */

import { db, ratingsTable, requestsTable } from "@workspace/db";
import { eq, sql, and, count, avg } from "drizzle-orm";

export type TrustTier = "member" | "verified" | "trusted" | "elite" | "anchor";

/**
 * Returns the tier name for the given trust score (0–100) and lifetime help count.
 * Used server-side for sorting, filtering, and notification-routing logic.
 */
export function getTierName(trustScore: number, helpCount: number): TrustTier {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}

export interface ReliabilityMetrics {
  onTimeRate: number;       // 0-100, % of completed requests where helper arrived (en_route or arrived set before completed_at)
  noShowRate: number;       // 0-100, % of claimed requests cancelled due to helper no-show
  avgRating: number;        // 0-5, average stars received as a helper
  totalCompleted: number;  // lifetime completed requests as helper
  totalNoShows: number;    // lifetime no-show cancellations
  totalClaimed: number;    // lifetime claimed requests (completed + cancelled + active)
  reliabilityScore: number; // 0-100, composite score
}

/**
 * Computes a helper's reliability score from their actual request history.
 *
 * Score = 40% on-time rate + 30% (5 - no-show rate) + 30% avg rating * 20
 * Clamped to 0-100. Returns 50 (neutral) for helpers with no history yet.
 */
export async function computeReliabilityScore(helperId: number): Promise<ReliabilityMetrics> {
  const [stats] = await db
    .select({
      total_completed: count(sql`CASE WHEN ${requestsTable.status} = 'completed' THEN 1 END`),
      total_cancelled: count(sql`CASE WHEN ${requestsTable.status} = 'cancelled' AND ${requestsTable.last_cancelled_by_helper_id} = ${helperId} THEN 1 END`),
      total_claimed: count(sql`CASE WHEN ${requestsTable.status} IN ('completed', 'cancelled') THEN 1 END`),
      on_time: count(sql`CASE WHEN ${requestsTable.status} = 'completed' AND ${requestsTable.en_route_at} IS NOT NULL THEN 1 END`),
    })
    .from(requestsTable)
    .where(eq(requestsTable.helper_id, helperId));

  const [ratingStats] = await db
    .select({
      avg_stars: avg(ratingsTable.stars),
      rating_count: count(),
    })
    .from(ratingsTable)
    .where(and(eq(ratingsTable.ratee_id, helperId), eq(ratingsTable.role, "helper")));

  const totalCompleted = Number(stats?.total_completed ?? 0);
  const totalNoShows = Number(stats?.total_cancelled ?? 0);
  const totalClaimed = Number(stats?.total_claimed ?? 0);
  const onTimeCount = Number(stats?.on_time ?? 0);
  const avgRating = ratingStats?.avg_stars ? Number(ratingStats.avg_stars) : 0;

  const onTimeRate = totalCompleted > 0 ? (onTimeCount / totalCompleted) * 100 : 100;
  const noShowRate = totalClaimed > 0 ? (totalNoShows / totalClaimed) * 100 : 0;
  const ratingComponent = avgRating > 0 ? (avgRating / 5) * 100 : 50;

  const reliabilityScore = totalClaimed === 0
    ? 50
    : Math.round(Math.max(0, Math.min(100,
        onTimeRate * 0.4 + (100 - noShowRate) * 0.3 + ratingComponent * 0.3
      )));

  return {
    onTimeRate: Math.round(onTimeRate),
    noShowRate: Math.round(noShowRate),
    avgRating: Math.round(avgRating * 10) / 10,
    totalCompleted,
    totalNoShows,
    totalClaimed,
    reliabilityScore,
  };
}
