// Test runner: node:test + tsx (replaces vitest, which is blocked by the
// Replit package firewall for all 2.x versions).
//
// Run tests with:
//   pnpm --filter @workspace/pay-it-forward run test
//
// Which executes:
//   node --import tsx/esm --test src/lib/__tests__/**/*.test.ts
//
// The `expect` package (jest's standalone assertion library) provides the
// .toBe / .toBeCloseTo / .toBeLessThanOrEqual matchers used in the test files.
// The describe / it functions come from node:test (Node 20 built-in).
//
// This file is kept for documentation; the actual config is in package.json.
export {};
