import { pgTable, serial, integer, text, timestamp, numeric, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { diasporaHubsTable } from "./diaspora-hubs";

// Direct crisis help pledged from one diaspora hub to another. Lets a hub
// leader or resident send help across the globe when a hub is flagged
// is_crisis — the "crisis-lit hub with pledge" flow.
//
// Payment lifecycle (migration 0055):
//   pending_payment → a Stripe PaymentIntent has been created but not yet
//     confirmed. Rows in this state have NOT moved any money.
//   pledged → the PaymentIntent succeeded (or, in dev mode without Stripe
//     configured, the pledge was recorded directly). The webhook has
//     credited the destination hub's community pool via
//     recordPoolContribution() — this status means the money is real.
//   cancelled → the PaymentIntent failed or was abandoned.
//   fulfilled → reserved for a future step where a hub leader confirms the
//     relief funds were actually put to use locally (not yet wired to any
//     route as of migration 0055).
export const diasporaHubPledgesTable = pgTable("diaspora_hub_pledges", {
  id:           serial("id").primaryKey(),
  from_hub_id:  integer("from_hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  to_hub_id:    integer("to_hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  // FIX (data-loss audit, hub-pledges follow-up): was ON DELETE CASCADE.
  // A "pledged" row records real money already captured via Stripe and
  // credited to the receiving hub's community pool — it belongs to that
  // hub's crisis-relief history as much as to the pledging user. Deleting
  // the pledger's account must not destroy it. routes/users.ts already
  // blocks account deletion while pledge history exists, but that check
  // and the delete aren't in one transaction, and any future/manual
  // deletion path wouldn't inherit that guard — so this is fixed at the
  // schema level too, matching civic_needs/audio_circle_sessions/
  // griot_stories (migration 0068).
  // Nullable since migration 0069 (was notNull under the old CASCADE rule) --
  // "set null" only works because the column can actually hold null.
  pledged_by:   integer("pledged_by").references(() => usersTable.id, { onDelete: "set null" }),
  amount:       numeric("amount", { precision: 10, scale: 2 }).notNull(),
  message:      text("message"),
  status:       text("status").notNull().default("pending_payment"), // pending_payment | pledged | fulfilled | cancelled
  /** Stripe PaymentIntent id — null for legacy/dev-mode rows recorded without Stripe. */
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  fulfilled_at: timestamp("fulfilled_at", { withTimezone: true }),
}, (t) => [
  check("diaspora_hub_pledges_amount_positive", sql`${t.amount} > 0`),
  check("diaspora_hub_pledges_not_self", sql`${t.from_hub_id} <> ${t.to_hub_id}`),
  // NOTE: the actual DB constraint is a *partial* unique index (NULLs allowed
  // for legacy/dev-mode rows) — see migration 0055, which is the source of
  // truth applied to the database. This plain index declaration just keeps
  // drizzle-kit's introspection aware of the column; it does not re-declare
  // the partial WHERE clause to avoid depending on a schema-builder API not
  // otherwise used in this codebase.
  index("idx_hub_pledges_stripe_pi").on(t.stripe_payment_intent_id),
  index("idx_hub_pledges_status").on(t.status),
]);

export type DiasporaHubPledge = typeof diasporaHubPledgesTable.$inferSelect;
export type InsertDiasporaHubPledge = typeof diasporaHubPledgesTable.$inferInsert;
