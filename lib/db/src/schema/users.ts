import { pgTable, serial, text, boolean, real, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { geographyPoint } from "./geography";
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
  trust_score: real("trust_score").default(50), // neutral midpoint on the real 0-100 scale — was 5.0, making every new helper appear near-banned before their first rating
  help_count: integer("help_count").notNull().default(0),
  neighborhood: text("neighborhood"),
  city: text("city"),
  // IMPORTANT — this is the GOODWILL/DONATION pot only (pledges, tips,
  // sponsorships) — it is NOT total earnings. Immediate-pay job earnings
  // bypass this field entirely; they're paid via direct Stripe Connect
  // transfer and only ever appear in `transactions` (type: "earned"),
  // never credited here. Any UI/logic treating this as "total earnings"
  // is wrong — see transactions table for that.
  benevolence_wallet: numeric("benevolence_wallet", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
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

  // Account-level approval gate — applies to ALL account types (individuals,
  // businesses, sponsors). Default at the DB level is "approved" so existing
  // rows are grandfathered in when this column is added; new registrations
  // explicitly set "pending" in the register endpoint, overriding this default.
  // Bumping this immediately invalidates every previously issued token for
  // this user, regardless of its expiry — used for logout-everywhere and
  // forced re-auth on password change. Stateless tokens otherwise have no
  // server-side revocation mechanism.
  token_version: integer("token_version").notNull().default(0),
  // BUG-032: Default changed from "approved" to "pending" — any direct INSERT
  // that omits approval_status (e.g. a future migration script) now correctly
  // creates a pending-review account instead of silently bypassing admin approval.
  // The registration route explicitly sets "pending"; the only way to get "approved"
  // is through the admin review endpoint.
  approval_status: text("approval_status").notNull().default("pending"), // pending | approved | denied
  // Audit trail for account-application reviews — previously unrecorded,
  // unlike the helper-application review flow which already logs this.
  approval_reviewed_by: integer("approval_reviewed_by"),
  approval_reviewed_at: timestamp("approval_reviewed_at"),
  // What kind of account this is. Individuals request/offer help directly.
  // Businesses/sponsors fund the pledge pool, offer helper perks, and sponsor
  // community resources/events.
  account_type: text("account_type").notNull().default("individual"), // individual | business | sponsor
  organization_name: text("organization_name"),
  organization_description: text("organization_description"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("users_is_helper_idx").on(t.is_helper),
  index("users_helper_mode_active_idx").on(t.helper_mode_active),
  index("users_helper_status_idx").on(t.helper_status),
  index("users_approval_status_idx").on(t.approval_status),
  index("users_account_type_idx").on(t.account_type),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;