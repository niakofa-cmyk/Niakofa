// Test-only environment boundaries. Workspace secrets must never leak into
// backend verification: a production DATABASE_URL can make mocked suites hit a
// real database, while a production INTERNAL_SECRET can make in-process
// service-auth assertions depend on deployed configuration.
process.env.SESSION_SECRET = "test-session-secret-not-for-production-use-only";
const realLocalMediaRuntime = process.env.COMMUNITY_MEDIA_BROWSER_ACCEPTANCE === "1";
if (realLocalMediaRuntime) {
  const localDatabaseUrl = process.env.FAMILY_STORY_RUNTIME_TEST_DATABASE_URL;
  const databaseUrl = localDatabaseUrl ? new URL(localDatabaseUrl) : null;
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!databaseUrl
    || !["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || !loopbackHosts.has(databaseUrl.hostname)
    || !/(^|[-_])(dev|test)([-_]|$)/i.test(decodeURIComponent(databaseUrl.pathname.slice(1)))) {
    throw new Error("The real local media browser suite requires its disposable loopback PostgreSQL database.");
  }
  const localRedisUrl = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;
  if (!localRedisUrl
    || localRedisUrl.protocol !== "redis:"
    || !loopbackHosts.has(localRedisUrl.hostname)) {
    throw new Error("The real local media browser suite requires its loopback-only disposable Redis instance.");
  }
  process.env.DATABASE_URL = localDatabaseUrl;
} else {
  process.env.DATABASE_URL = process.env.FAMILY_STORY_RUNTIME_TEST_DATABASE_URL
    ?? "postgresql://test:test@localhost:5432/test";
  // Unit tests must never open a real Redis connection. The explicitly
  // opt-in browser harness above is the only path that keeps its loopback
  // Redis URL so the real BullMQ media worker can process uploaded files.
  process.env.REDIS_URL = "";
  process.env.REDIS_URLS = "";
}
process.env.INTERNAL_SECRET = "test-secret";
// Keep API tests on the co-located Nia boundary even when the workspace has a
// production NIA_SERVICE_URL configured for running workflows.
process.env.NIA_SERVICE_URL = "http://localhost:3001";
