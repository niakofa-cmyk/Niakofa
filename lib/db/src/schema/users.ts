import { pgTable, serial, text, boolean, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatar_url: text("avatar_url"),
  is_helper: boolean("is_helper").notNull().default(false),
  helper_mode_active: boolean("helper_mode_active").notNull().default(false),
  lat: real("lat"),
  lng: real("lng"),
  heading: real("heading"),
  speed: real("speed"),
  trust_score: real("trust_score").default(5.0),
  help_count: integer("help_count").notNull().default(0),
  neighborhood: text("neighborhood"),
  city: text("city"),
  benevolence_wallet: real("benevolence_wallet").notNull().default(0),
  goodwill_score: integer("goodwill_score").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
