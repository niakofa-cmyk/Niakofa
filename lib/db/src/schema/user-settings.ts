import { pgTable, serial, integer, boolean, real, text, timestamp } from "drizzle-orm/pg-core";

export const userSettingsTable = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().unique(),

  // Notification preferences
  notif_nearby_requests: boolean("notif_nearby_requests").notNull().default(true),
  notif_emergency: boolean("notif_emergency").notNull().default(true),
  notif_task_accepted: boolean("notif_task_accepted").notNull().default(true),
  notif_wallet_updates: boolean("notif_wallet_updates").notNull().default(true),
  notif_community_activity: boolean("notif_community_activity").notNull().default(false),
  notif_pledge_reminders: boolean("notif_pledge_reminders").notNull().default(true),

  // Privacy preferences
  privacy_profile_visible: boolean("privacy_profile_visible").notNull().default(true),
  privacy_live_location: boolean("privacy_live_location").notNull().default(false),
  privacy_activity_sharing: boolean("privacy_activity_sharing").notNull().default(true),
  privacy_anonymous_giving: boolean("privacy_anonymous_giving").notNull().default(false),

  // Helper operational settings
  service_radius_miles: real("service_radius_miles").notNull().default(10),
  max_travel_miles: real("max_travel_miles").default(15),
  specialties: text("specialties"),
  // Language preference (migration 0017)
  preferred_language: text("preferred_language").notNull().default("en"),

  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type UserSettings = typeof userSettingsTable.$inferSelect;
export type InsertUserSettings = typeof userSettingsTable.$inferInsert;
