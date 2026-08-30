import runSeed from "./seed-civic-coverage.js";

runSeed().catch((err: unknown) => {
  console.error("civic coverage seed failed", err);
  process.exit(1);
});