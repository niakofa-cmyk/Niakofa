import { runRailwayStorageProbe } from "./railway-storage-probe-core.mjs";

try {
  const result = await runRailwayStorageProbe(Bun.env);
  console.log(`TEMP_STORAGE_PROBE_RESULT ${JSON.stringify(result)}`);
} catch (error) {
  const result = {
    ok: false,
    error:
      error?.safeForLogging === true
        ? error.message
        : "storage client initialization or certification failed",
    cleanupComplete:
      typeof error?.cleanupComplete === "boolean"
        ? error.cleanupComplete
        : null,
    cleanupAttempts: Number.isInteger(error?.cleanupAttempts)
      ? error.cleanupAttempts
      : 0,
    ...(typeof error?.manualCleanupKey === "string"
      ? { manualCleanupKey: error.manualCleanupKey }
      : {}),
  };
  console.log(`TEMP_STORAGE_PROBE_RESULT ${JSON.stringify(result)}`);
  process.exitCode = 1;
}
