---
name: Niakofa heading-math tests
description: vitest setup for pay-it-forward frontend unit tests
---

# Heading-Math Tests (vitest)

## Setup
- `artifacts/pay-it-forward/package.json` — `"test": "vitest run"` script added
- `artifacts/pay-it-forward/vitest.config.ts` — defines `@/` alias to `src/`, test env: node, includes `src/**/__tests__/**/*.test.ts`
- vitest installed as devDependency in pay-it-forward

## Run
```
pnpm --filter @workspace/pay-it-forward run test
```
19/19 tests pass.

## Why
heading-math.ts uses circular arithmetic that has historically caused wrap-around bugs at 359°/0°. Tests exist to prevent silent regressions. Test file uses `vitest` (not jest) since the frontend uses Vite.
