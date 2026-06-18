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
  specialties: text("specialties").array(),
  phone_masked: text("phone_masked"),
  quick_replies: text("quick_replies").array(),
  identity_verified: boolean("identity_verified").notNull().default(false),
  identity_verification_status: text("identity_verification_status").default("unverified"),
  background_check_status: text("background_check_status").default("not_started"),
  background_check_completed_at: timestamp("background_check_completed_at"),
  stripe_identity_session_id: text("stripe_identity_session_id"),
  panic_contacts: text("panic_contacts").array(),
  passive_check_interval_min: integer("passive_check_interval_min").default(30),
  is_admin: boolean("is_admin").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
