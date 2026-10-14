import { usersTable, exchangeListingsTable, exchangePickupRequestsTable, type db } from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Account deletion and new Exchange resources serialize before taking any
// listing/request locks. Sorting prevents two-participant lock inversions.
export async function lockExchangeAccounts(tx: Transaction, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1313423685, ${id}::integer)`);
  }
}

export async function exchangeAccountsAreActive(tx: Transaction, ids: number[]) {
  const distinct = [...new Set(ids)];
  const rows = await tx.select({ id: usersTable.id }).from(usersTable).where(and(
    inArray(usersTable.id, distinct),
    eq(usersTable.deletion_status, "active"),
    eq(usersTable.approval_status, "approved"),
  ));
  return rows.length === distinct.length;
}

export async function prepareExchangeAccountDeletion(tx: Transaction, userId: number, now: Date) {
  await lockExchangeAccounts(tx, [userId]);
  const blocking = await tx.select({ id: exchangePickupRequestsTable.id })
    .from(exchangePickupRequestsTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
    .where(and(
      or(eq(exchangePickupRequestsTable.buyer_id, userId), eq(exchangeListingsTable.seller_id, userId)),
      inArray(exchangePickupRequestsTable.status, ["requested", "accepted"]),
    )).limit(5);
  if (blocking.length) return blocking.map((row) => row.id);

  // Keep terminal state/timestamps for moderation and aggregate accounting,
  // but remove author text, precise coordinates and coordination content.
  await tx.update(exchangeListingsTable).set({
    title: "Listing from deleted account",
    description: "This account is no longer active. Exchange history is retained anonymously.",
    pickup_notes: null,
    neighborhood: "Removed area",
    latitude: null,
    longitude: null,
    geog: null,
    status: sql`CASE WHEN ${exchangeListingsTable.status} IN ('active', 'reserved', 'held') THEN 'withdrawn' ELSE ${exchangeListingsTable.status} END`,
    updated_at: now,
  }).where(eq(exchangeListingsTable.seller_id, userId));
  await tx.update(exchangePickupRequestsTable).set({
    note: "Coordination content removed with account deletion.",
    pickup_area: "Removed area",
    proposed_window: "Removed window",
    pickup_note: null,
    updated_at: now,
  }).where(or(
    eq(exchangePickupRequestsTable.buyer_id, userId),
    inArray(exchangePickupRequestsTable.listing_id,
      tx.select({ id: exchangeListingsTable.id }).from(exchangeListingsTable).where(eq(exchangeListingsTable.seller_id, userId))),
  ));
  return [];
}
