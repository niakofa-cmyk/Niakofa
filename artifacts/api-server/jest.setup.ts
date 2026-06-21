// Test-only environment defaults. Real secrets are never read from here --
// these only satisfy fail-fast startup guards (auth.ts, lib/db) so route
// modules can load under jest without a real SESSION_SECRET or database.
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production-use-only";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
