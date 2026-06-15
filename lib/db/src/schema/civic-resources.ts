import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const civicResourcesTable = pgTable("civic_resources", {
  id: serial("id").primaryKey(),
  state: text("state").notNull(),
  county: text("county").notNull(),
  city: text("city"),
  org_name: text("org_name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  phone: text("phone"),
  category: text("category"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type CivicResource = typeof civicResourcesTable.$inferSelect;
export type InsertCivicResource = typeof civicResourcesTable.$inferInsert;
