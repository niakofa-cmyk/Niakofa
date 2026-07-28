// Test-only environment defaults. Real secrets are never read from here --
// these only satisfy fail-fast startup guards (auth.ts, lib/db) so route
// modules can load under jest without a real SESSION_SECRET or database.
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production-use-only";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.INTERNAL_SECRET ??= "test-secret";
// Force-disable Redis in tests, overriding whatever real REDIS_URL secret is
// configured in this environment. Unit tests must never open a real network
// connection: besides being slow/flaky, a real ioredis connection created at
// module-load time (lib/queue.ts singletons) keeps an open handle that Jest
// won't exit on its own, which previously hung the `test && start` workflow
// chain indefinitely whenever a valid REDIS_URL was present.
process.env.REDIS_URL = "";
