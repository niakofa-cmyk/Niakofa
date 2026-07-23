import { pgTable, serial, integer, doublePrecision, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Coverage interest (migration 0065) — demand signal for counties that don't have
// an active Community Pool yet. Captured from the "notify me when this county
// activates" button shown to requesters posting outside coverage. No pool
// machinery reads this yet; it exists so admins can see where to expand next
// instead of guessing from support tickets.
export const coverageInterestTable = pgTable("coverage_interest", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  neighborhood: text("neighborhood"),
  email: text("email"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  notified_at: timestamp("notified_at"),
}, (t) => [
  index("coverage_interest_created_at_idx").on(t.created_at),
]);

export const insertCoverageInterestSchema = createInsertSchema(coverageInterestTable).omit({
  id: true, created_at: true, notified_at: true,
});
export type InsertCoverageInterest = z.infer<typeof insertCoverageInterestSchema>;
export type CoverageInterest = typeof coverageInterestTable.$inferSelect;
