/**
 * Niakofa — Database Helper Utilities
 *
 * Provides typed, reusable query functions that consolidate the repeated
 * Drizzle ORM boilerplate scattered across route files. Every function here
 * is a thin, well-named wrapper around a common db.select / db.insert pattern.
 *
 * Design principles:
 *   - Return null on "not found" — never throw for missing rows (let routes decide HTTP status)
 *   - Never expose password_hash or geog columns — use safe select sets throughout
 *   - Safe fallbacks on system_settings reads — missing key ≠ error
 *   - withTransaction wraps db.transaction() so callers get the typed tx handle
 *
 * Usage example:
 *   import { getUserById, getRequestById, getSystemSetting } from "../lib/db-helpers";
 *
 *   const user = await getUserById(id);
 *   if (!user) return res.status(404).json({ error: "User not found" });
 *
 *   const enabled = await getSystemSetting("nia_enabled") === "true";
 */

import { eq, inArray, sql } from "drizzle-orm";
import { db, usersTable, requestsTable, systemSettingsTable } from "@workspace/db";
import { userSelect } from "./user-select";
import { requestSelect } from "./request-select";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@workspace/db";

// ── Inferred Row Types ────────────────────────────────────────────────────────
// Use Drizzle's own type inference to guarantee these stay in sync with the
// schema — no manual type declarations that can silently go stale.

const _userQuery    = () => db.select(userSelect).from(usersTable).limit(1);
const _requestQuery = () => db.select(requestSelect).from(requestsTable).limit(1);

/** A user row with all safe public columns (no password_hash, no geog). */
export type SafeUser = Awaited<ReturnType<typeof _userQuery>>[number];

/** A request row with all safe columns (no geog). */
export type SafeRequest = Awaited<ReturnType<typeof _requestQuery>>[number];

// ── User Queries ──────────────────────────────────────────────────────────────

/**
 * Fetch a single user by primary key, excluding password_hash and geog.
 * Returns null when no row matches — callers should respond with 404.
 *
 * @example
 *   const user = await getUserById(req.authenticatedUserId!);
 *   if (!user) return res.status(404).json({ error: "User not found" });
 */
export async function getUserById(id: number): Promise<SafeUser | null> {
  const [row] = await db
    .select(userSelect)
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Fetch multiple users by an array of IDs in a single query.
 * Returned order is not guaranteed — index by .id if order matters.
 * Returns an empty array when none match.
 */
export async function getUsersByIds(ids: number[]): Promise<SafeUser[]> {
  if (ids.length === 0) return [];
  return db.select(userSelect).from(usersTable).where(inArray(usersTable.id, ids));
}

// ── Request Queries ───────────────────────────────────────────────────────────

/**
 * Fetch a single help request by primary key, excluding the geog column.
 * Returns null when no row matches.
 *
 * @example
 *   const request = await getRequestById(requestId);
 *   if (!request) return res.status(404).json({ error: "Request not found" });
 */
export async function getRequestById(id: number): Promise<SafeRequest | null> {
  const [row] = await db
    .select(requestSelect)
    .from(requestsTable)
    .where(eq(requestsTable.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Fetch multiple requests by an array of IDs in a single query.
 * Returns an empty array when none match.
 */
export async function getRequestsByIds(ids: number[]): Promise<SafeRequest[]> {
  if (ids.length === 0) return [];
  return db.select(requestSelect).from(requestsTable).where(inArray(requestsTable.id, ids));
}

// ── System Settings ───────────────────────────────────────────────────────────

/**
 * Read a single key from the system_settings table.
 * Returns `defaultValue` (default: null) when the key does not exist.
 * Never throws — DB errors fall back to defaultValue so the server stays up.
 *
 * @example
 *   const enabled = await getSystemSetting("nia_enabled") !== "false";
 *   const rate = parseFloat(await getSystemSetting("pool_minimum_hourly_rate", "15") ?? "15");
 */
export async function getSystemSetting(
  key: string,
  defaultValue: string | null = null
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key))
      .limit(1);
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Read multiple system_settings keys in a single query.
 * Returns a Record keyed by setting name. Missing keys are absent from the record.
 *
 * @example
 *   const settings = await getSystemSettings(["pool_enabled", "pool_minimum_hourly_rate"]);
 *   const poolEnabled = settings["pool_enabled"] !== "false";
 */
export async function getSystemSettings(keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const rows = await db
      .select({ key: systemSettingsTable.key, value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, keys));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
}

/**
 * Upsert a single key in the system_settings table.
 * Creates the row if it doesn't exist; updates value + updated_at otherwise.
 *
 * @example
 *   await setSystemSetting("nia_enabled", "false");
 *   await setSystemSetting("nia_last_toggled_at", new Date().toISOString());
 */
export async function setSystemSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value, updated_at: new Date() },
    });
}

/**
 * Upsert multiple system_settings keys atomically inside a transaction.
 * All writes succeed or none do.
 *
 * @example
 *   await setSystemSettings({
 *     nia_enabled: "false",
 *     nia_last_toggled_at: new Date().toISOString(),
 *   });
 */
export async function setSystemSettings(entries: Record<string, string>): Promise<void> {
  const pairs = Object.entries(entries);
  if (pairs.length === 0) return;
  await db.transaction(async (tx) => {
    for (const [key, value] of pairs) {
      await tx
        .insert(systemSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({
          target: systemSettingsTable.key,
          set: { value, updated_at: new Date() },
        });
    }
  });
}

// ── Transaction Wrapper ───────────────────────────────────────────────────────

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run a function inside a Drizzle transaction.
 * The transaction is automatically committed on success and rolled back on
 * any thrown error. The typed `tx` handle supports the same fluent API as `db`.
 *
 * Prefer this over calling db.transaction() directly to keep route code clean
 * and ensure the correct type is inferred for the transaction handle.
 *
 * @example
 *   const result = await withTransaction(async (tx) => {
 *     const [user] = await tx.update(usersTable)
 *       .set({ benevolence_wallet: sql`benevolence_wallet + ${amount}` })
 *       .where(eq(usersTable.id, userId))
 *       .returning({ id: usersTable.id, wallet: usersTable.benevolence_wallet });
 *     await tx.insert(transactionsTable).values({ ... });
 *     return user;
 *   });
 */
export async function withTransaction<T>(
  fn: (tx: DrizzleTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(fn);
}

// ── Convenience: Existence Checks ─────────────────────────────────────────────

/**
 * Returns true if a user with the given ID exists in the DB.
 * Uses a lightweight COUNT query — does not fetch any columns.
 */
export async function userExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`1` })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);
  return row != null;
}

/**
 * Returns true if a request with the given ID exists in the DB.
 */
export async function requestExists(id: number): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`1` })
    .from(requestsTable)
    .where(eq(requestsTable.id, id))
    .limit(1);
  return row != null;
}

// Re-export the db instance for callers who need raw access within the same
// import boundary (avoids a separate import from @workspace/db in simple files).
export { db };

// Type-only export for callers that need the raw transaction handle type
// without importing drizzle-orm directly.
export type { DrizzleTransaction, NodePgDatabase };
export type { schema };

// ── Nia Kill-switch (shared, TTL-cached) ─────────────────────────────────────
// Single source of truth for the Nia AI enabled/disabled state in api-server.
// All routes and workers MUST import from here — never duplicate this query.
//
// Design: fail-closed with 10-second TTL cache (mirrors nia-service/src/lib/db.ts).
// A missing row, DB error, or any value other than "true" returns false — Nia
// must be explicitly enabled; it is never accidentally turned on by failures.
//
// Race-condition fix (generation counter):
// resetNiaEnabledCache() increments _niaGeneration before clearing the cache.
// isNiaEnabled() captures the generation before the DB query. The result is only
// written to the cache if the generation hasn't changed while the query was
// in-flight. This prevents a pre-toggle DB read from silently overwriting the
// cache with a stale value after resetNiaEnabledCache() has already been called.
//
// In-flight deduplication: concurrent isNiaEnabled() calls share one pending
// DB query via _niaInflight, preventing a query storm when the cache is cold
// (e.g., immediately after a reset). resetNiaEnabledCache() clears _niaInflight
// so new requests after a toggle always start a fresh query.

let _niaCachedEnabled: boolean | null = null;
let _niaCacheTs = 0;
let _niaGeneration = 0; // incremented on every reset to detect stale writes
let _niaInflight: Promise<boolean> | null = null;
const NIA_CACHE_TTL_MS = 10_000; // 10 seconds — same TTL as nia-service

/**
 * Expire the Nia enabled cache immediately.
 * Call this after an admin toggle so the next isNiaEnabled() call reads fresh
 * data without waiting for TTL expiry.
 *
 * Bumps the internal generation counter so any DB query that was already
 * in-flight before the toggle cannot overwrite the (now-invalidated) cache with
 * a stale value.
 */
export function resetNiaEnabledCache(): void {
  _niaGeneration++;        // invalidate any in-flight refresh
  _niaCachedEnabled = null;
  _niaCacheTs = 0;
  _niaInflight = null;     // force next caller to start a fresh query
}

/**
 * Check whether Nia AI is enabled in system_settings.
 *
 * Fail-closed: returns false on any error (DB down, row missing, wrong value).
 * Results are cached for 10 seconds to avoid a DB round-trip on every request.
 * Call resetNiaEnabledCache() immediately after an admin toggle — it invalidates
 * the cache and ensures the next call reads the updated value from the DB.
 *
 * All api-server routes and workers MUST use this function. Never duplicate the
 * raw DB query — the shared cache and in-flight deduplication are essential to
 * shield the DB under high request rates.
 */
export async function isNiaEnabled(): Promise<boolean> {
  const now = Date.now();
  // Fast path: valid cached value within TTL
  if (_niaCachedEnabled !== null && now - _niaCacheTs < NIA_CACHE_TTL_MS) {
    return _niaCachedEnabled;
  }
  // Coalesce concurrent cold-cache requests into one DB query
  if (_niaInflight) return _niaInflight;

  const genAtStart = _niaGeneration;
  _niaInflight = (async (): Promise<boolean> => {
    let result: boolean;
    try {
      const [row] = await db
        .select({ value: systemSettingsTable.value })
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "nia_enabled"))
        .limit(1);
      // Only "true" enables Nia. Missing row, "false", or empty string → disabled.
      result = row?.value === "true";
    } catch {
      result = false; // fail-closed: DB error → Nia disabled
    }
    // Only commit to cache if no reset() happened while we were querying.
    // A generation mismatch means an admin toggled Nia during our DB round-trip;
    // writing the stale result would silently hide the toggle for up to TTL seconds.
    if (_niaGeneration === genAtStart) {
      _niaCachedEnabled = result;
      _niaCacheTs = Date.now();
      _niaInflight = null;
    }
    return result;
  })();

  return _niaInflight;
}
