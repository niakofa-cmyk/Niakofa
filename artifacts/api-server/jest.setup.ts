// Test-only environment defaults. Real secrets are never read from here --
// these only satisfy fail-fast startup guards (auth.ts, lib/db) so route
// modules can load under jest without a real SESSION_SECRET or database.
// NODE_ENV=test is also relied on by middlewares/rate-limit.ts (skipInTest)
// to disable rate limiting during the test run — set explicitly rather than
// assuming jest's CLI sets it, since it wasn't reliably present under the
// ESM preset used here.
process.env.NODE_ENV ??= "test";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production-use-only";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
