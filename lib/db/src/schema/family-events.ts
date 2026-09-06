import {
  pgTable, serial, integer, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";
import { familyPlacesTable } from "./family-places";

// ─── Family Vault: Events ─────────────────────────────────────────────────────
// Dated events in family history — births, deaths, migrations, marriages,
// graduations, and relocations. These feed the family-history timeline.

export const familyEventCategoryEnum = text("family_event_category"); // birth|death|migration|marriage|education|work|religious|migration|other

export const familyEventsTable = pgTable("family_events", {
  id:             serial("id").primaryKey(),
  family_id:      integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  member_id:      integer("member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  title:          text("title").notNull(),            // "Moved to Detroit"
  description:    text("description"),
  event_date:     timestamp("event_date", { withTimezone: true }),
  event_date_precision: text("event_date_precision").default("year"), // day|month|year|circa
  category:       familyEventCategoryEnum,             // birth|death|migration|marriage|education|work|religious|other
  place_id:       integer("place_id").references(() => familyPlacesTable.id, { onDelete: "set null" }),
  metadata:       jsonb("metadata").$type<Record<string, unknown>>().default({}),
  created_at:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_events_family").on(t.family_id),
  index("idx_family_events_member").on(t.member_id),
  index("idx_family_events_date").on(t.event_date),
]);

export type FamilyEvent = typeof familyEventsTable.$inferSelect;
export type InsertFamilyEvent = typeof familyEventsTable.$inferInsert;
