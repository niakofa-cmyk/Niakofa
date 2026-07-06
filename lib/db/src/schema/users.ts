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
  // Suspension (migration 0015)
  is_suspended: boolean("is_suspended").notNull().default(false),
  suspended_at: timestamp("suspended_at"),
  suspended_reason: text("suspended_reason"),
  // Helper profile fields (migration 0010)
  helper_status: text("helper_status").default("offline"),
  helper_languages: text("helper_languages").array(),
  helper_qualifications: text("helper_qualifications").array(),
  helper_bio: text("helper_bio"),
  helper_vehicle: text("helper_vehicle"),
  helper_social_links: text("helper_social_links").array(),
  // Token versioning for forced logout (migration 0011)
  token_version: integer("token_version").notNull().default(0),
  // Helper approval workflow (migration 0012)
  approval_status: text("approval_status").default("pending"),
  approval_reviewed_by: integer("approval_reviewed_by"),
  approval_reviewed_at: timestamp("approval_reviewed_at"),
  // Helper skills — free-text array used by matching engine
  helper_skills: text("helper_skills").array(),
  // Account type + org fields (migration 0016)
  account_type: text("account_type").notNull().default("individual"),
  organization_name: text("organization_name"),
  organization_description: text("organization_description"),
  // Password reset / legacy-account password setup (migration 0021)
  password_reset_code: text("password_reset_code"),
  password_reset_expires_at: timestamp("password_reset_expires_at", { withTimezone: true }),
  // Background check provider ID (migration 0033)
  // Stores the Checkr candidate ID so webhook events can be matched back to this user row.
  background_check_id: text("background_check_id"),
  // Liability / ToS waiver (migration 0033)
  // When non-null the user has accepted the community agreement for high-risk task categories.
  // tos_waiver_version tracks which version they accepted so future legal updates can
  // require re-acceptance.
  tos_waiver_accepted_at: timestamp("tos_waiver_accepted_at", { withTimezone: true }),
  tos_waiver_version: text("tos_waiver_version"),
  // Google OAuth (migration 0041)
  // google_id: the stable "sub" from Google's ID token — used for fast repeated-login lookups.
  // oauth_provider: 'google' when the account was created or linked via Google OAuth.
  //   NULL means email+password only. Both can coexist (linked account).
  google_id: text("google_id"),
  oauth_provider: text("oauth_provider"),
  // Community membership (migration 0047)
  // NULL = not yet assigned; falls back to global pool for legacy rows.
  community_id: integer("community_id"),
  // Tier stickiness (migration 0047)
  // Effective tier = max(getTrustTier(…), highest_tier_reached).
  // Can only advance (never reassessed downward). Removed only on account deletion.
  highest_tier_reached: text("highest_tier_reached").notNull().default("member"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("users_is_helper_idx").on(t.is_helper),
  index("users_helper_mode_active_idx").on(t.helper_mode_active),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
