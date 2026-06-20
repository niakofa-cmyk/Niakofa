import { pgTable, serial, text, boolean, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatar_url: text("avatar_url"),
  is_helper: boolean("is_helper").notNull().default(false),
  helper_mode_active: boolean("helper_mode_active").notNull().default(false),
  // Helper approval lifecycle: null = not a helper applicant, pending = awaiting admin review,
  // approved = accepted helper, denied = rejected
  helper_status: text("helper_status"),
  // Rich helper profile fields
  helper_skills: text("helper_skills").array(),
  helper_languages: text("helper_languages").array(),
  helper_qualifications: text("helper_qualifications").array(),
  helper_bio: text("helper_bio"),
  helper_vehicle: text("helper_vehicle"),
  helper_social_links: text("helper_social_links"),
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
  password_hash: text("password_hash"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("users_is_helper_idx").on(t.is_helper),
  index("users_helper_mode_active_idx").on(t.helper_mode_active),
  index("users_helper_status_idx").on(t.helper_status),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
