---
name: Niakofa rating trust propagation + tier stickiness
description: How star ratings feed trust_score, highest_tier_reached stickiness, quality gate, and community pool health ratio work together.
---

# Rating → trust_score propagation

After POST /requests/:id/rate, if `role === "requester"` (requester rating helper):
- stars 5 → +2, 4 → +1, 3 → 0, 2 → -1, 1 → -2 to ratee's trust_score
- Clamped LEAST(100, GREATEST(1, …)) — ratings can push ABOVE the 80 participation cap
- Only applied to helpers (is_helper=true)
- If `role === "helper"` (helper rating requester): goodwill_score ±1, capped [0, 200]

**Why:** Participation bump (completion) caps at 80 — below all tier thresholds. Only ratings can push trust_score above 80, so quality is the only path to tier advancement.

# Tier stickiness (highest_tier_reached)

Column on usersTable: `highest_tier_reached TEXT NOT NULL DEFAULT 'member'`

Updated in /complete after participation bump via **atomic SQL**:
```sql
UPDATE users SET highest_tier_reached = $newTier
WHERE id = $helperId
  AND CASE highest_tier_reached WHEN 'anchor' THEN 4 WHEN 'elite' THEN 3
    WHEN 'trusted' THEN 2 WHEN 'verified' THEN 1 ELSE 0 END < $candidateRank
```

**Why atomic:** Two concurrent completions cannot regress the tier — only a strictly higher tier wins the WHERE.

# Quality gate

Defined in `lib/trust-tiers/src/index.ts`:
- `QUALITY_GATED_TIERS = Set { "trusted", "elite", "anchor" }`
- `meetsQualityGate(candidateTier, avgRating)`: null avgRating = benefit of doubt (passes); avgRating < 4.0 = blocked
- Member and verified are NOT gated (participation alone can reach them)

Tier advancement in /complete:
1. Compute raw tier (trust_score + help_count thresholds)
2. Only if computed rank > stored rank: check quality gate
3. If gate passes: atomic SQL update
4. If gate fails: log "blocked by quality gate" — no update

# getEffectiveTier (stickiness API)

`getEffectiveTier(trustScore, helpCount, highestTierReached)` in trust-tiers/src/index.ts:
- Returns max(getTrustTier(…), stored highest_tier_reached)
- Used in getGuaranteedMinimum() so wage multiplier respects sticky tier

# Community pool health ratio

In `getGuaranteedMinimum` (community-pool.ts):
- Final = base × tier_multiplier × pool_health_ratio
- pool_health_ratio = clamp(balance / target_reserve_amount, 0.5, 1.0)
- community_id from helper's users row scopes the balance query
- NULL community_id = global bucket (uses 4× low_balance_threshold as proxy target)
- All pool ledger writes now include community_id (payHelperFromPool, recordPoolRepayment, recordPoolContribution accept communityId param)

**Why community_id on ledger writes matters:** If writes omit community_id, per-community balance queries return 0 → ratio always clamps to 0.5 → multiplier is always half. Balance check inside payHelperFromPool remains GLOBAL (one liquid pool), community_id is a reporting/multiplier label only.

# Schema additions (migration 0047)

- `communities` table: id, name, target_reserve_amount REAL DEFAULT 10000
- Seeded: "Tarrant County" row on install
- `users.community_id INTEGER` (nullable FK → communities)
- `users.highest_tier_reached TEXT NOT NULL DEFAULT 'member'`
- `community_pool_ledger.community_id INTEGER` (nullable FK → communities)
