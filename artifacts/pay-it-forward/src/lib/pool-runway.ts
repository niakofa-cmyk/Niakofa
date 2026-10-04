export type PoolRunwayLevel = "critical" | "caution" | "healthy" | "neutral";

export interface PoolRunwayDisplay {
  label: string;
  level: PoolRunwayLevel;
  warning: string | null;
}

export function getPoolRunwayDisplay(
  days: number | null | undefined,
): PoolRunwayDisplay {
  if (days === null) {
    return { label: "Not estimated", level: "neutral", warning: null };
  }

  if (days === undefined || !Number.isFinite(days)) {
    return { label: "Unavailable", level: "neutral", warning: null };
  }

  const wholeDays = Math.max(0, Math.round(days));
  const label = days < 0
    ? "No runway"
    : wholeDays > 999
      ? "999+ days"
      : `${wholeDays} day${wholeDays === 1 ? "" : "s"}`;
  const level = days < 7 ? "critical" : days < 30 ? "caution" : "healthy";

  return {
    label,
    level,
    warning: days < 7
      ? "The Community Pool has less than 7 days of estimated runway at its recent payout pace."
      : null,
  };
}