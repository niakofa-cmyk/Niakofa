// Test-only environment boundaries. Workspace secrets must never leak into
// backend verification: a production DATABASE_URL can make mocked suites hit a
// real database, while a production INTERNAL_SECRET can make in-process
// service-auth assertions depend on deployed configuration.
process.env.SESSION_SECRET = "test-session-secret-not-for-production-use-only";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.INTERNAL_SECRET = "test-secret";
// Keep API tests on the co-located Nia boundary even when the workspace has a
// production NIA_SERVICE_URL configured for running workflows.
process.env.NIA_SERVICE_URL = "http://localhost:3001";
// Force-disable Redis in tests, overriding whatever real REDIS_URL secret is
// configured in this environment. Unit tests must never open a real network
// connection: besides being slow/flaky, a real ioredis connection created at
// module-load time (lib/queue.ts singletons) keeps an open handle that Jest
// won't exit on its own, which previously hung the `test && start` workflow
// chain indefinitely whenever a valid REDIS_URL was present.
process.env.REDIS_URL = "";
process.env.REDIS_URLS = "";
