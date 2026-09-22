import { execFileSync } from "node:child_process";

const COMMIT_ENV_KEYS = [
  "GIT_COMMIT",
  "RAILWAY_GIT_COMMIT_SHA",
  "REPLIT_GIT_COMMIT",
  "SOURCE_VERSION",
];
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;

/**
 * Resolve the immutable source revision that the API should report in health
 * responses. CI/deployment providers can provide an explicit value; local
 * builds fall back to the checked-out Git revision.
 */
export function resolveBuildCommit(env = process.env, cwd = process.cwd()) {
  for (const key of COMMIT_ENV_KEYS) {
    const value = env[key]?.trim();
    if (value && value !== "unknown" && COMMIT_PATTERN.test(value)) {
      return value;
    }
  }

  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (COMMIT_PATTERN.test(value)) return value;
  } catch {
    // Source archives and container builds may not include a .git directory.
  }

  return "unknown";
}