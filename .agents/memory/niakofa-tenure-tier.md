---
name: Niakofa tenure tier wage multiplier
description: TIER_WAGE_MULTIPLIER in trust-tiers; getGuaranteedMinimum(hours, helperId) applies the multiplier; trust-tiers needs tsconfig.json
---

# Tenure Tier Wage Multiplier

## The rule
`lib/trust-tiers/src/index.ts` exports `TIER_WAGE_MULTIPLIER` (Record<TrustTier, number>) and `getTierWageMultiplier(tier)`.
`artifacts/api-server/src/lib/community-pool.ts` `getGuaranteedMinimum(estimatedHours?, helperId?)` — when helperId is supplied, looks up trust_score + help_count, resolves TrustTier, and multiplies the base floor by the tier multiplier.
`artifacts/api-server/src/routes/requests.ts` calls `getGuaranteedMinimum(request.estimated_hours, helperId)`.

## Values
member 1.0×, verified 1.05×, trusted 1.1×, elite 1.15×, anchor 1.2×

## Why
Implements "livable wage that grows over time" (Roadmap: Tenure Tiers) on top of the existing trust_score/help_count ladder. Anchors (50+ helps, 97+ score) earn 20% more from the pool floor.

## Build notes
`lib/trust-tiers` needs its own `tsconfig.json` (extends `../../tsconfig.base.json`, composite:true) and must be listed in root `tsconfig.json` references AND `artifacts/api-server/tsconfig.json` references for type-checking. The package.json uses `exports: { ".": "./src/index.ts" }` — esbuild bundles TS source directly, no dist/ needed at runtime.
