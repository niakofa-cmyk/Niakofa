export const COMMUNITY_POOL_ACTIVE_WINDOW_DAYS = 30;

export type CommunityPoolReadiness =
  | "unpaid_minimums_queued"
  | "empty"
  | "below_target"
  | "ready"
  | "unscoped"
  | "inactive";

export function getCommunityPoolReadiness(params: {
  isCountyPool: boolean;
  activeUserCount: number;
  balance: number;
  targetReserveAmount: number;
  pendingMinimumCount: number;
}): CommunityPoolReadiness {
  if (params.pendingMinimumCount > 0) return "unpaid_minimums_queued";
  if (!params.isCountyPool && params.activeUserCount > 0) return "unscoped";
  if (params.activeUserCount <= 0) return "inactive";
  if (params.balance <= 0) return "empty";
  if (params.balance < params.targetReserveAmount) return "below_target";
  return "ready";
}
