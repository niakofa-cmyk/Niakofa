import { integer, pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { familiesTable } from "./families";
import { familyMemoriesTable } from "./family-memories";

/**
 * Durable bridge between a Preserve-the-Culture QR scan and the Family Vault.
 * The raw QR payload is deliberately not retained; only a stable digest and
 * resolved card identifier are stored. A scan may remain pending until the
 * user creates/selects the memory it belongs to.
 */
export const diasporaPreserveLinksTable = pgTable("diaspora_preserve_links", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  family_id: integer("family_id").references(() => familiesTable.id, { onDelete: "cascade" }),
  memory_id: integer("memory_id").references(() => familyMemoriesTable.id, { onDelete: "cascade" }),
  qr_digest: text("qr_digest").notNull(),
  card_id: text("card_id"),
  resolved_type: text("resolved_type").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  linked_at: timestamp("linked_at", { withTimezone: true }),
}, (t) => [
  index("idx_diaspora_preserve_links_user").on(t.user_id),
  index("idx_diaspora_preserve_links_family").on(t.family_id),
  index("idx_diaspora_preserve_links_memory").on(t.memory_id),
  uniqueIndex("diaspora_preserve_links_user_memory_unique").on(t.user_id, t.memory_id),
]);

export type DiasporaPreserveLink = typeof diasporaPreserveLinksTable.$inferSelect;
export type InsertDiasporaPreserveLink = typeof diasporaPreserveLinksTable.$inferInsert;
