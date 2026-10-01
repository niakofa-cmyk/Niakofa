export const UNKNOWN_BUILD_COMMIT = "unknown";

export function normalizeBuildCommit(commit: unknown): string | null {
  if (typeof commit !== "string") return null;
  const normalized = commit.trim();
  if (!normalized || normalized.toLowerCase() === UNKNOWN_BUILD_COMMIT) return null;
  return normalized;
}

/**
 * Returns true only when both build identities are known and differ.
 * Local/unknown builds therefore never show a potentially misleading notice.
 */
export function shouldNotifyForBuildUpdate(
  frontendCommit: unknown,
  serverCommit: unknown,
): boolean {
  const frontend = normalizeBuildCommit(frontendCommit);
  const server = normalizeBuildCommit(serverCommit);
  return frontend !== null && server !== null && frontend !== server;
}

export function isHealthCommitPayload(value: unknown): value is { commit: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "commit" in value &&
    typeof value.commit === "string"
  );
}