import {
  db,
  communityPoolLedgerTable,
  communityPoolFinancialEventsTable,
  poolPendingMinimumsTable,
  systemSettingsTable,
  usersTable,
  transactionsTable,
  communitiesTable,
  diasporaHubsTable,
} from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { broadcast } from "./ws-hub";
import { getEffectiveTier, getTierWageMultiplier } from "@workspace/trust-tiers";

/**
 * Community Pool service.
 *
 * The pool fronts helper payments immediately when a pay-it-forward request
 * completes and pays a guaranteed minimum per completed task. All debits are
 * serialized with a transaction-scoped advisory lock so two simultaneous
 * completions can never overdraw the pool.
 */

// Advisory lock key for pool debits. Distinct from the migration lock (727501).
const POOL_LOCK_KEY = 727502;

/** Round a dollar amount to whole cents to avoid float drift in pool math. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Round a dollar amount to a cents-exact dollar value. */
export function roundMoney(dollars: number): number {
  return toCents(dollars) / 100;
}

export async function isPoolEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_enabled"))
      .limit(1);
    // Default ON when the setting row is missing
    return row ? row.value === "true" : true;
  } catch (err) {
    // Log so DB connectivity issues are visible in monitoring rather than
    // silently returning a default that may mask infrastructure failures.
    logger.error({ err }, "community-pool: isPoolEnabled DB error — defaulting to disabled");
    return false;
  }
}

/**
 * Per-hour minimum wage used to scale the guaranteed minimum by estimated task
 * duration.
 *
 * Resolution order (per-county livable wage override):
 *   1. communities.hourly_rate for the given communityId (county-level override)
 *   2. system_settings pool_minimum_hourly_rate (global platform default)
 *   3. Hard-coded $15/hr (DB unavailable fallback)
 *
 * This lets sponsoring counties set their own livable wage floor at onboarding
 * via POST /admin/communities/:id (sets communities.hourly_rate) rather than
 * being locked to the single global $15/hr default.
 */
export async function getHourlyMinimumRate(communityId?: number | null): Promise<number> {
  try {
    // 1. Check for a community-level override when a communityId is provided.
    if (communityId != null) {
      const [community] = await db
        .select({ hourly_rate: communitiesTable.hourly_rate })
        .from(communitiesTable)
        .where(eq(communitiesTable.id, communityId))
        .limit(1);
      if (community?.hourly_rate != null && community.hourly_rate > 0) {
        return community.hourly_rate;
      }
    }

    // 2. Fall back to the global system setting.
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_minimum_hourly_rate"))
      .limit(1);
    const parsed = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
  } catch (err) {
    // Log so DB connectivity issues are visible in monitoring rather than
    // silently returning a default that may mask infrastructure failures.
    logger.error({ err }, "community-pool: getHourlyMinimumRate DB error — defaulting to $15/hr");
    return 15;
  }
}

/**
 * Returns the community_id new users should be assigned to at registration.
 *
 * Prior to this function, `users.community_id` was never written anywhere in
 * the codebase — every user resolved to the NULL/global bucket regardless of
 * getGuaranteedMinimum()'s per-community pool-health-ratio logic below, which
 * was fully implemented but silently inert. This closes that gap.
 *
 * Resolution order:
 *   1. system_settings.default_community_id, if set and it references a real
 *      community row (lets an admin designate a primary county explicitly).
 *   2. The lowest-id community row — the seeded "Tarrant County" row on a
 *      fresh install.
 *   3. null — no communities exist yet; new user falls back to the legacy
 *      global pool bucket, exactly as every user did before this change.
 */
export async function getDefaultCommunityId(): Promise<number | null> {
  try {
    const [settingRow] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "default_community_id"))
      .limit(1);
    const configured = settingRow ? parseInt(settingRow.value, 10) : NaN;
    if (Number.isFinite(configured)) {
      const [exists] = await db
        .select({ id: communitiesTable.id })
        .from(communitiesTable)
        .where(eq(communitiesTable.id, configured))
        .limit(1);
      if (exists) return exists.id;
      logger.warn(
        { configured },
        "community-pool: default_community_id setting points to a missing community — falling back",
      );
    }

    const [first] = await db
      .select({ id: communitiesTable.id })
      .from(communitiesTable)
      .orderBy(asc(communitiesTable.id))
      .limit(1);
    return first?.id ?? null;
  } catch (err) {
    logger.error({ err }, "community-pool: getDefaultCommunityId DB error — new user will fall back to global pool");
    return null;
  }
}

/**
 * Compute the guaranteed minimum for a completed task.
 *
 * When `estimatedHours` is supplied (from `help_requests.estimated_hours`),
 * the floor is: max(flat_floor, estimatedHours × hourlyRate).
 * This makes the "livable wage" guarantee real math rather than a flat number
 * regardless of how long the job actually takes.
 *
 * When no hours estimate exists, falls back to the flat `pool_guaranteed_minimum`
 * setting so existing completed tasks are unchanged.
 */
// Hard-coded safety floor: if the DB is unavailable we never pay $0.
// This matches the seed value in migration 0024 ('5').
const GUARANTEED_MINIMUM_FALLBACK = 5;

/**
 * Compute the guaranteed minimum for a completed task, optionally scaled by:
 *   1. The helper's effective tenure tier (highest_tier_reached stickiness).
 *   2. The community's pool-health ratio (balance ÷ target_reserve, clamped to
 *      [0.5, 1.0]) — richer pools give bigger bonuses; depleted pools scale back
 *      without zeroing out helpers' bonuses entirely.
 *
 * Final minimum = hours_scaled_floor × tier_multiplier × pool_health_ratio
 *
 * This implements the roadmap spec: "the multiplier should depend on the amount
 * of funds in that particular community/county's pool — richer pools give bigger
 * bonuses, thinner pools scale it back to protect solvency."
 */
export async function getGuaranteedMinimum(
  estimatedHours?: number | null,
  helperId?: number | null,
): Promise<number> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_guaranteed_minimum"))
      .limit(1);
    const parsed = row ? parseFloat(row.value) : NaN;
    // Fall back to seeded default ($5) when row is missing or unparseable.
    const flatFloor = Number.isFinite(parsed) && parsed >= 0 ? parsed : GUARANTEED_MINIMUM_FALLBACK;

    // Hours-scaled floor: take the GREATER of flat floor and hours × rate.
    // Pass helperId-resolved communityId so the per-county rate is used when set.
    let base = flatFloor;
    if (estimatedHours && estimatedHours > 0) {
      // Peek at the helper's community to honour their county's livable-wage rate.
      let helperCommunityId: number | null = null;
      if (helperId != null) {
        try {
          const [h] = await db
            .select({ community_id: usersTable.community_id })
            .from(usersTable)
            .where(eq(usersTable.id, helperId))
            .limit(1);
          helperCommunityId = h?.community_id ?? null;
        } catch { /* non-fatal: fall through to global rate */ }
      }
      const hourlyRate = await getHourlyMinimumRate(helperCommunityId);
      const hoursFloor = roundMoney(estimatedHours * hourlyRate);
      base = Math.max(flatFloor, hoursFloor);
    }

    // ── Tenure-tier wage multiplier + community pool-health ratio ─────────
    // Fetch the helper's tier and their community's target_reserve in one shot.
    // Falls back gracefully: tier → 1.0×, pool_health → 1.0× on any DB error.
    if (helperId != null) {
      try {
        const [helperRow] = await db
          .select({
            trust_score: usersTable.trust_score,
            help_count: usersTable.help_count,
            highest_tier_reached: usersTable.highest_tier_reached,
            community_id: usersTable.community_id,
          })
          .from(usersTable)
          .where(eq(usersTable.id, helperId))
          .limit(1);

        if (helperRow) {
          // Effective tier respects stickiness: max(computed, highest_tier_reached)
          const tier = getEffectiveTier(
            helperRow.trust_score ?? 0,
            helperRow.help_count ?? 0,
            helperRow.highest_tier_reached,
          );
          const tierMultiplier = getTierWageMultiplier(tier);

          // Community pool-health ratio
          // balance / target_reserve_amount, clamped to [0.5, 1.0]
          // - At 100 %+ funded → 1.0 (full tier bonus)
          // - At 50 % or below → 0.5 (half tier bonus; pool protected from over-drain)
          let poolHealthRatio = 1.0;
          try {
            const communityId = helperRow.community_id;
            // Fetch the balance scoped to this community (NULL community_id rows
            // are the historical "global" bucket — include them when no community
            // is set so legacy data is counted correctly).
            const [balRow] = await db
              .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
              .from(communityPoolLedgerTable)
              .where(
                communityId != null
                  ? eq(communityPoolLedgerTable.community_id, communityId)
                  : sql`${communityPoolLedgerTable.community_id} IS NULL`
              );
            const balance = balRow?.balance ?? 0;

            if (communityId != null) {
              const [communityRow] = await db
                .select({ target_reserve_amount: communitiesTable.target_reserve_amount })
                .from(communitiesTable)
                .where(eq(communitiesTable.id, communityId))
                .limit(1);
              const target = communityRow?.target_reserve_amount ?? 10000;
              if (target > 0) {
                poolHealthRatio = Math.min(1.0, Math.max(0.5, balance / target));
              }
            } else {
              // Global pool: use pool_low_balance_threshold as a proxy for
              // "healthy" target (default $25 → above threshold = ratio 1.0)
              const [threshRow] = await db
                .select({ value: systemSettingsTable.value })
                .from(systemSettingsTable)
                .where(eq(systemSettingsTable.key, "pool_low_balance_threshold"))
                .limit(1);
              const threshold = threshRow ? parseFloat(threshRow.value) : 25;
              // Use 4× the low-balance threshold as the "healthy" target.
              // e.g. threshold=$25 → target=$100; balance ≥ $100 → full multiplier.
              const globalTarget = threshold * 4;
              if (globalTarget > 0) {
                poolHealthRatio = Math.min(1.0, Math.max(0.5, balance / globalTarget));
              }
            }
          } catch {
            // Pool-health lookup failure → keep ratio at 1.0 (full bonus)
          }

          base = roundMoney(base * tierMultiplier * poolHealthRatio);
        }
      } catch {
        // Non-fatal: tier/pool-health lookup failure still pays base minimum
      }
    }

    return base;
  } catch {
    return GUARANTEED_MINIMUM_FALLBACK;
  }
}

export async function getPoolBalance(): Promise<number> {
  const result = await db
    .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
    .from(communityPoolLedgerTable);
  const row = Array.isArray(result) ? result[0] : undefined;
  return row?.balance ?? 0;
}

/**
 * Live sum of all hub-tagged ledger entries for a given hub — the
 * authoritative "how much is reserved for this hub right now" figure.
 * Positive credits (sponsor_contribution / hub pledges) minus debits
 * (helper_front / guaranteed_minimum spent on that hub's requests).
 *
 * This is the source of truth; diasporaHubsTable.reserved_balance is a
 * denormalised convenience column kept in step with this via
 * syncHubReservedBalance() inside the same transaction as every hub-tagged
 * ledger write.
 */
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getHubReservedBalance(hubId: number, tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
    .from(communityPoolLedgerTable)
    .where(eq(communityPoolLedgerTable.hub_id, hubId));
  return row?.balance ?? 0;
}

/** Keep diaspora_hubs.reserved_balance in sync with the live ledger sum. Call inside the same tx as the ledger write. */
export async function syncHubReservedBalance(hubId: number, tx: DbOrTx): Promise<void> {
  const balance = await getHubReservedBalance(hubId, tx);
  await tx
    .update(diasporaHubsTable)
    .set({ reserved_balance: String(roundMoney(balance)) })
    .where(eq(diasporaHubsTable.id, hubId));
}

/**
 * Total pool balance currently ring-fenced across ALL hubs (i.e. money
 * pledged to specific hubs that must not be spent on unrelated requests).
 * Used to compute the "unrestricted" balance available for non-hub-scoped
 * spending: unrestricted = totalBalance - sumOfAllPositiveHubReserves.
 */
async function getTotalHubReservedBalance(tx: DbOrTx = db): Promise<number> {
  const [row] = await tx
    .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
    .from(communityPoolLedgerTable)
    .where(sql`${communityPoolLedgerTable.hub_id} IS NOT NULL`);
  // Only positive reserves count as "locked away" — a hub that has gone
  // negative (shouldn't normally happen) doesn't free up extra global funds.
  const reserved = row?.balance ?? 0;
  return reserved > 0 ? reserved : 0;
}

interface PoolDebitParams {
  entryType: "helper_front" | "guaranteed_minimum";
  amount: number; // positive dollars to pay OUT of the pool
  requestId: number;
  helperId: number;
  requestTitle: string;
  /** Community scope — written to the ledger row so per-community balance queries work. */
  communityId?: number | null;
  /**
   * Diaspora hub scope (migration 0057 ring-fencing). When the request being
   * paid out is tagged to a hub, pass its id so the debit is charged first
   * against that hub's ring-fenced reserve. When null/undefined, the debit
   * may ONLY draw from the unrestricted (non-hub-reserved) portion of the
   * pool — it must never spend down money pledged to a specific hub.
   */
  hubId?: number | null;
}

/** Outcome of a pool debit attempt — callers must distinguish these. */
export type PoolPayOutcome = "paid" | "insufficient" | "duplicate" | "error";

/**
 * Atomically debit the pool and credit the helper's benevolence_wallet.
 * Returns "paid" on success, "insufficient" when the pool can't cover it,
 * "duplicate" when this request was already fronted/minimum'd (unique partial
 * indexes make double-pay impossible), "error" on unexpected failure.
 */
export async function payHelperFromPool(params: PoolDebitParams): Promise<PoolPayOutcome> {
  const { entryType, requestId, helperId, requestTitle, communityId, hubId } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return "error";

  try {
    return await db.transaction(async (tx): Promise<PoolPayOutcome> => {
      // Serialize pool debits — balance check + debit must be atomic.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${POOL_LOCK_KEY})`);

      const [balRow] = await tx
        .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
        .from(communityPoolLedgerTable);
      const balance = balRow?.balance ?? 0;

      // ── Ring-fencing guard (migration 0057) ──────────────────────────────
      // Money pledged to a specific diaspora hub may ONLY be spent on
      // requests tagged to that same hub. Concretely:
      //   - If this request IS hub-scoped, its spendable ceiling is that
      //     hub's own reserved balance (never more, even if the global pool
      //     has more cash — otherwise a hub could overdraw by borrowing
      //     against money reserved for a *different* hub).
      //   - If this request is NOT hub-scoped, it may only draw from the
      //     UNRESTRICTED portion of the pool (global balance minus the sum of
      //     every hub's positive reserve) — it must never dip into money
      //     earmarked for a hub in crisis.
      let spendableCeiling = balance;
      if (hubId != null) {
        spendableCeiling = await getHubReservedBalance(hubId, tx);
        if (toCents(spendableCeiling) < toCents(amount)) {
          logger.warn(
            { request_id: requestId, helper_id: helperId, hub_id: hubId, hub_balance: spendableCeiling, needed: amount, entry_type: entryType },
            "Hub-reserved pool balance insufficient — payment skipped (ring-fenced)"
          );
          return "insufficient";
        }
      } else {
        const totalReserved = await getTotalHubReservedBalance(tx);
        const unrestricted = balance - totalReserved;
        if (toCents(unrestricted) < toCents(amount)) {
          logger.warn(
            { request_id: requestId, helper_id: helperId, balance, total_hub_reserved: totalReserved, unrestricted, needed: amount, entry_type: entryType },
            "Unrestricted pool balance insufficient — payment skipped (hub reserves are ring-fenced off)"
          );
          return "insufficient";
        }
      }

      // Debit the pool. The partial unique indexes on (request_id) for
      // helper_front / guaranteed_minimum throw on duplicates, aborting the
      // transaction — no double-pay possible.
      // community_id is written here so per-community balance queries in
      // getGuaranteedMinimum() see real data, not all-NULL rows.
      // hub_id is written when the request is hub-scoped so this debit nets
      // against that hub's ring-fenced reserve going forward.
      await tx.insert(communityPoolLedgerTable).values({
        entry_type: entryType,
        amount: -amount,
        request_id: requestId,
        user_id: helperId,
        community_id: communityId ?? null,
        hub_id: hubId ?? null,
        notes:
          entryType === "helper_front"
            ? `Pool fronted helper payment for: ${requestTitle}`
            : `Guaranteed minimum for completed task: ${requestTitle}`,
      });

      if (hubId != null) {
        await syncHubReservedBalance(hubId, tx);
      }

      // Credit the helper's Goodwill Fund
      await tx
        .update(usersTable)
        .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${amount}` })
        .where(eq(usersTable.id, helperId));

      // Helper-visible ledger entry
      await tx.insert(transactionsTable).values({
        user_id: helperId,
        request_id: requestId,
        type: "pledge_received",
        amount,
        description:
          entryType === "helper_front"
            ? `Community Pool paid you now for: ${requestTitle}`
            : `Community Pool thank-you minimum: ${requestTitle}`,
      });

      return "paid";
    });
  } catch (err: unknown) {
    // Unique-violation = already paid for this request — safe skip, no retry needed
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      logger.warn({ request_id: requestId, entry_type: entryType }, "Pool entry already exists for request — skipped duplicate");
      return "duplicate";
    }
    logger.error({ err, request_id: requestId, helper_id: helperId }, "Pool payment failed");
    return "error";
  }
}

/** One helper's share of a split pool payment. Shares must be pre-rounded to cents and sum to totalAmount. */
export interface HelperShare {
  helperId: number;
  amount: number;
}

/**
 * Multi-helper variant of payHelperFromPool: ONE pool ledger debit for the
 * full amount (respecting the same partial-unique-index-on-request_id
 * duplicate guard as the single-helper path), but the money is credited
 * across every helper who worked the request — split proportionally by
 * whatever `shares` the caller computed (equal split by default; see
 * requests.ts completion handler).
 *
 * This is the real payment-splitting feature: co-helpers previously got
 * only a flat +1 goodwill credit while the primary helper kept the entire
 * pledge. Now every helper who coordinated on a request gets a genuine cut
 * of the money, not just a goodwill point. The goodwill bump is unaffected
 * and still applied separately in requests.ts.
 *
 * Only used for entryType "helper_front" (the pay-it-forward pledge itself).
 * Guaranteed-minimum top-ups intentionally stay primary-helper-only — see
 * the comment at that call site for why.
 */
export async function payHelpersFromPool(params: {
  entryType: "helper_front" | "guaranteed_minimum";
  requestId: number;
  requestTitle: string;
  shares: HelperShare[];
  communityId?: number | null;
  hubId?: number | null;
}): Promise<PoolPayOutcome> {
  const { entryType, requestId, requestTitle, communityId, hubId } = params;
  const shares = params.shares
    .map((s) => ({ helperId: s.helperId, amount: roundMoney(s.amount) }))
    .filter((s) => s.amount > 0);
  if (shares.length === 0) return "error";
  const totalAmount = roundMoney(shares.reduce((sum, s) => sum + s.amount, 0));
  if (totalAmount <= 0) return "error";
  const primaryHelperId = shares[0].helperId;

  try {
    return await db.transaction(async (tx): Promise<PoolPayOutcome> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${POOL_LOCK_KEY})`);

      const [balRow] = await tx
        .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
        .from(communityPoolLedgerTable);
      const balance = balRow?.balance ?? 0;

      let spendableCeiling = balance;
      if (hubId != null) {
        spendableCeiling = await getHubReservedBalance(hubId, tx);
        if (toCents(spendableCeiling) < toCents(totalAmount)) {
          logger.warn(
            { request_id: requestId, hub_id: hubId, hub_balance: spendableCeiling, needed: totalAmount, entry_type: entryType },
            "Hub-reserved pool balance insufficient for split payment — skipped (ring-fenced)"
          );
          return "insufficient";
        }
      } else {
        const totalReserved = await getTotalHubReservedBalance(tx);
        const unrestricted = balance - totalReserved;
        if (toCents(unrestricted) < toCents(totalAmount)) {
          logger.warn(
            { request_id: requestId, balance, total_hub_reserved: totalReserved, unrestricted, needed: totalAmount, entry_type: entryType },
            "Unrestricted pool balance insufficient for split payment — skipped"
          );
          return "insufficient";
        }
      }

      // Single ledger debit for the whole amount — same partial unique index
      // (entry_type, request_id) as the solo-helper path, so a request can
      // still only be fronted once no matter how many helpers split it.
      await tx.insert(communityPoolLedgerTable).values({
        entry_type: entryType,
        amount: -totalAmount,
        request_id: requestId,
        user_id: primaryHelperId,
        community_id: communityId ?? null,
        hub_id: hubId ?? null,
        notes:
          shares.length > 1
            ? `Pool fronted split payment across ${shares.length} helpers for: ${requestTitle}`
            : `Pool fronted helper payment for: ${requestTitle}`,
      });

      if (hubId != null) {
        await syncHubReservedBalance(hubId, tx);
      }

      for (const share of shares) {
        await tx
          .update(usersTable)
          .set({ benevolence_wallet: sql`${usersTable.benevolence_wallet} + ${share.amount}` })
          .where(eq(usersTable.id, share.helperId));

        await tx.insert(transactionsTable).values({
          user_id: share.helperId,
          request_id: requestId,
          type: "pledge_received",
          amount: share.amount,
          description:
            shares.length > 1
              ? `Your share of the Community Pool payment for: ${requestTitle}`
              : `Community Pool paid you now for: ${requestTitle}`,
        });
      }

      return "paid";
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      logger.warn({ request_id: requestId, entry_type: entryType }, "Pool entry already exists for request — skipped duplicate (split payment)");
      return "duplicate";
    }
    logger.error({ err, request_id: requestId }, "Split pool payment failed");
    return "error";
  }
}

/** Has the pool fronted this request's helper payment? */
export async function wasRequestFronted(requestId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: communityPoolLedgerTable.id })
    .from(communityPoolLedgerTable)
    .where(
      sql`${communityPoolLedgerTable.request_id} = ${requestId} AND ${communityPoolLedgerTable.entry_type} = 'helper_front'`
    )
    .limit(1);
  return !!row;
}

/** Record a repayment flowing back into the pool (requester repaid a fronted pledge). */
export async function recordPoolRepayment(params: {
  amount: number;
  requestId: number;
  requesterId: number | null;
  stripePaymentIntentId?: string;
  /** Community scope — must match the original debit's community_id so per-community
   *  balance queries remain accurate when the repayment arrives. */
  communityId?: number | null;
}): Promise<void> {
  const { requestId, requesterId, stripePaymentIntentId, communityId } = params;
  const amount = roundMoney(params.amount);
  if (amount <= 0) return;
  await db.insert(communityPoolLedgerTable).values({
    entry_type: "pledge_repayment",
    amount,
    request_id: requestId,
    user_id: requesterId,
    community_id: communityId ?? null,
    stripe_payment_intent_id: stripePaymentIntentId ?? null,
    notes: "Requester repaid a pool-fronted pledge — pool replenished",
  });
}

/**
 * Queue a guaranteed minimum the pool couldn't cover. The backfill worker
 * retries these FIFO whenever the pool is replenished — no helper silently
 * loses their guarantee. Unique index on request_id = queue-once.
 */
export async function queuePendingMinimum(params: {
  requestId: number;
  helperId: number;
  amount: number;
  requestTitle: string;
}): Promise<void> {
  const amount = roundMoney(params.amount);
  if (amount <= 0) return;
  try {
    await db
      .insert(poolPendingMinimumsTable)
      .values({
        request_id: params.requestId,
        helper_id: params.helperId,
        amount,
        request_title: params.requestTitle,
      })
      .onConflictDoNothing();
    logger.warn(
      { request_id: params.requestId, helper_id: params.helperId, amount },
      "Guaranteed minimum QUEUED — pool balance insufficient, will backfill when replenished"
    );
  } catch (err) {
    logger.error({ err, request_id: params.requestId }, "Failed to queue pending minimum");
  }
}

/**
 * Backfill queued guaranteed minimums (FIFO) while the pool can cover them.
 * Called after every pool credit (contribution / repayment) and by the
 * interval worker as a safety net. Returns how many were paid.
 */
export async function processPendingMinimums(): Promise<number> {
  if (!(await isPoolEnabled())) return 0;

  let paidCount = 0;
  try {
    const pending = await db
      .select()
      .from(poolPendingMinimumsTable)
      .where(eq(poolPendingMinimumsTable.status, "pending"))
      .orderBy(asc(poolPendingMinimumsTable.created_at))
      .limit(50);

    for (const row of pending) {
      const outcome = await payHelperFromPool({
        entryType: "guaranteed_minimum",
        amount: row.amount,
        requestId: row.request_id,
        helperId: row.helper_id,
        requestTitle: row.request_title,
      });

      if (outcome === "paid" || outcome === "duplicate") {
        // duplicate = a minimum already exists for this request — mark satisfied
        await db
          .update(poolPendingMinimumsTable)
          .set({ status: "paid", paid_at: new Date() })
          .where(eq(poolPendingMinimumsTable.id, row.id));
        if (outcome === "paid") {
          paidCount++;
          logger.info(
            { request_id: row.request_id, helper_id: row.helper_id, amount: row.amount },
            "Backfilled guaranteed minimum from replenished pool"
          );
          // Lazy import avoids a circular dependency (routes/push imports lib modules)
          const { sendPushToUser } = await import("../routes/push");
          sendPushToUser(row.helper_id, {
            title: "💙 Community Pool Thank-You (backfilled)",
            body: `The pool was replenished — $${row.amount.toFixed(2)} was just added to your Goodwill Fund for: "${row.request_title}".`,
            requestId: row.request_id,
            notifType: "wallet" as const,
          }).catch(err => logger.warn({ err, helper_id: row.helper_id }, "sendPushToUser (backfill): non-critical side effect failed — continuing"));
        }
      } else if (outcome === "insufficient") {
        // FIFO: stop at the first one the pool can't cover
        break;
      }
      // "error": leave pending, move on next cycle
    }

    if (paidCount > 0) {
      const balance = await getPoolBalance();
      broadcast({ type: "pool_updated", payload: { balance } });
    }
  } catch (err) {
    logger.error({ err }, "processPendingMinimums failed");
  }
  return paidCount;
}

// ── Low-balance admin alert ──────────────────────────────────────────────────

const LOW_BALANCE_ALERT_INTERVAL_MS = 6 * 60 * 60 * 1000; // at most once per 6h
let _lastLowBalanceAlertAt = 0;

export async function getLowBalanceThreshold(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "pool_low_balance_threshold"))
      .limit(1);
    const parsed = row ? parseFloat(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 25;
  } catch {
    return 25;
  }
}

/**
 * If the pool balance is below the alert threshold, warn admins: warn-level
 * log, `pool_low_balance` WS broadcast, and a push to every is_admin user.
 * Deduped to once per 6 hours per process.
 */
export async function maybeAlertLowBalance(): Promise<void> {
  try {
    const [balance, threshold] = await Promise.all([getPoolBalance(), getLowBalanceThreshold()]);
    if (toCents(balance) >= toCents(threshold)) return;
    if (Date.now() - _lastLowBalanceAlertAt < LOW_BALANCE_ALERT_INTERVAL_MS) return;
    _lastLowBalanceAlertAt = Date.now();

    logger.warn({ balance, threshold }, "COMMUNITY POOL LOW BALANCE — guaranteed minimums at risk");
    broadcast({ type: "pool_low_balance", payload: { balance, threshold } });

    const adminsResult = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.is_admin, true));
    const admins = Array.isArray(adminsResult) ? adminsResult : [];
    // Lazy import avoids a circular dependency (routes/push imports lib modules)
    const { sendPushToUser } = await import("../routes/push");
    for (const admin of admins) {
      sendPushToUser(admin.id, {
        title: "⚠️ Community Pool low balance",
        body: `Pool balance is $${balance.toFixed(2)} (threshold $${threshold.toFixed(2)}). Guaranteed minimums may be queued until the pool is replenished.`,
        notifType: "wallet" as const,
      }).catch(err => logger.warn({ err, admin_id: admin.id }, "sendPushToUser (admin low-balance): non-critical side effect failed — continuing"));
    }
  } catch (err) {
    logger.error({ err }, "maybeAlertLowBalance failed");
  }
}

/** Record a sponsor contribution into the pool. */
export async function recordPoolContribution(params: {
  amount: number;
  userId: number | null;
  stripePaymentIntentId?: string;
  notes?: string;
  governmentSponsorId?: number;
  /** Community this contribution is designated for. Null = global/Tarrant County bucket. */
  communityId?: number | null;
  /**
   * Diaspora hub scope (migration 0057 ring-fencing). When set, this
   * contribution is earmarked for that hub only — payHelperFromPool() will
   * refuse to spend it on requests that aren't tagged to the same hub_id.
   * Null = unrestricted/global pool contribution.
   */
  hubId?: number | null;
  settlement?: PoolContributionSettlement;
}): Promise<boolean> {
  const { userId, stripePaymentIntentId, notes, governmentSponsorId, communityId, hubId, settlement } = params;
  const amount = roundMoney(settlement ? settlement.netAmountCents / 100 : params.amount);
  if (amount <= 0 && !settlement) return false;
  try {
    await db.transaction(async (tx) => {
      const [ledgerEntry] = await tx.insert(communityPoolLedgerTable).values({
        entry_type: "sponsor_contribution",
        amount,
        user_id: userId,
        community_id: communityId ?? null,
        hub_id: hubId ?? null,
        stripe_payment_intent_id: stripePaymentIntentId ?? null,
        notes: notes ?? "Sponsor contribution to the Community Pool",
        government_sponsor_id: governmentSponsorId ?? null,
      }).returning({ id: communityPoolLedgerTable.id });
      if (settlement && ledgerEntry) {
        await tx.insert(communityPoolFinancialEventsTable).values({
          community_pool_ledger_id: ledgerEntry.id,
          user_id: userId,
          community_id: communityId ?? null,
          stripe_payment_intent_id: settlement.stripePaymentIntentId,
          stripe_charge_id: settlement.stripeChargeId,
          stripe_balance_transaction_id: settlement.stripeBalanceTransactionId,
          stripe_climate_transaction_id: settlement.stripeClimateTransactionId ?? null,
          gross_amount_cents: settlement.grossAmountCents,
          stripe_fee_cents: settlement.stripeFeeCents,
          climate_contribution_cents: settlement.climateContributionCents,
          net_amount_cents: settlement.netAmountCents,
          currency: settlement.currency,
          settlement_status: settlement.settlementStatus,
          available_on: settlement.availableOn,
          stripe_livemode: settlement.stripeLivemode,
        });
      }
      if (hubId != null) {
        await syncHubReservedBalance(hubId, tx);
      }
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      // Webhook retry — contribution already recorded for this payment intent
      logger.info({ stripe_pi: stripePaymentIntentId }, "Pool contribution already recorded — webhook retry ignored");
      return false;
    }
    throw err;
  }
}

export interface PoolContributionSettlement {
  stripePaymentIntentId: string;
  stripeChargeId: string;
  stripeBalanceTransactionId: string;
  stripeClimateTransactionId?: string | null;
  grossAmountCents: number;
  stripeFeeCents: number;
  climateContributionCents: number;
  netAmountCents: number;
  currency: string;
  settlementStatus: "pending" | "available" | "paid_out" | "failed";
  availableOn: Date | null;
  stripeLivemode: boolean;
}

/**
 * Record a Stripe settlement and its spendable net amount. If an older repair
 * already posted the gross amount, append a balancing adjustment instead of
 * mutating the append-only pool ledger.
 */
export async function recordPoolContributionSettlement(params: {
  settlement: PoolContributionSettlement;
  userId: number | null;
  communityId?: number | null;
  notes?: string;
}): Promise<{ recorded: boolean; alreadyRecorded: boolean; ledgerId: number | null }> {
  const { settlement, userId, communityId, notes } = params;
  if (settlement.grossAmountCents <= 0 || settlement.netAmountCents < 0) {
    throw new Error("Invalid Stripe settlement amounts");
  }

  try {
    return await db.transaction(async (tx) => {
      const [existingEvent] = await tx
        .select({ id: communityPoolFinancialEventsTable.id })
        .from(communityPoolFinancialEventsTable)
        .where(eq(communityPoolFinancialEventsTable.stripe_payment_intent_id, settlement.stripePaymentIntentId))
        .limit(1);
      if (existingEvent) return { recorded: false, alreadyRecorded: true, ledgerId: null };

      const [existingLedger] = await tx
        .select({
          id: communityPoolLedgerTable.id,
          amount: communityPoolLedgerTable.amount,
        })
        .from(communityPoolLedgerTable)
        .where(eq(communityPoolLedgerTable.stripe_payment_intent_id, settlement.stripePaymentIntentId))
        .limit(1);

      let ledgerId = existingLedger?.id ?? null;
      if (!existingLedger) {
        const [ledgerEntry] = await tx.insert(communityPoolLedgerTable).values({
          entry_type: "sponsor_contribution",
          amount: roundMoney(settlement.netAmountCents / 100),
          user_id: userId,
          community_id: communityId ?? null,
          stripe_payment_intent_id: settlement.stripePaymentIntentId,
          notes: notes ?? "Sponsor contribution via Stripe",
        }).returning({ id: communityPoolLedgerTable.id });
        ledgerId = ledgerEntry?.id ?? null;
      } else {
        const adjustment = roundMoney(settlement.netAmountCents / 100 - Number(existingLedger.amount));
        if (adjustment !== 0) {
          await tx.insert(communityPoolLedgerTable).values({
            entry_type: "adjustment",
            amount: adjustment,
            user_id: userId,
            community_id: communityId ?? null,
            notes: `Settlement adjustment for Stripe PaymentIntent ${settlement.stripePaymentIntentId}`,
          });
        }
      }

      if (!ledgerId) throw new Error("Pool settlement could not create or find a ledger entry");
      await tx.insert(communityPoolFinancialEventsTable).values({
        community_pool_ledger_id: ledgerId,
        user_id: userId,
        community_id: communityId ?? null,
        stripe_payment_intent_id: settlement.stripePaymentIntentId,
        stripe_charge_id: settlement.stripeChargeId,
        stripe_balance_transaction_id: settlement.stripeBalanceTransactionId,
        stripe_climate_transaction_id: settlement.stripeClimateTransactionId ?? null,
        gross_amount_cents: settlement.grossAmountCents,
        stripe_fee_cents: settlement.stripeFeeCents,
        climate_contribution_cents: settlement.climateContributionCents,
        net_amount_cents: settlement.netAmountCents,
        currency: settlement.currency,
        settlement_status: settlement.settlementStatus,
        available_on: settlement.availableOn,
        stripe_livemode: settlement.stripeLivemode,
      });
      return { recorded: true, alreadyRecorded: false, ledgerId };
    });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      return { recorded: false, alreadyRecorded: true, ledgerId: null };
    }
    throw err;
  }
}
