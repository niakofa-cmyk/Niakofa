import { sql } from "drizzle-orm";
import { date, index, integer, pgTable, serial, timestamp, uniqueIndex, uuid, boolean, check } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Daily per-viewer aggregates intentionally survive story cleanup/expiry.
 * Story IDs are retained only as opaque grouping keys; no story/media content,
 * IP address, or device identifier is stored here.
 */
export const communityStoryWatchDailyTable = pgTable("community_story_watch_daily", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull(),
  creator_user_id: integer("creator_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  viewer_user_id: integer("viewer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  play_day: date("play_day", { mode: "string" }).notNull(),
  duration_ms: integer("duration_ms").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_story_watch_daily_story_viewer_day_uidx").on(table.story_id, table.viewer_user_id, table.play_day),
  index("community_story_watch_daily_creator_day_idx").on(table.creator_user_id, table.play_day),
  index("community_story_watch_daily_play_day_idx").on(table.play_day),
  check("community_story_watch_daily_duration_check", sql`${table.duration_ms} >= 0 AND ${table.duration_ms} <= 300000`),
]);

/**
 * Minimal idempotency ledger for incremental pause/resume contributions.
 * Keys are viewer-scoped and contain no request or playback metadata.
 */
export const communityStoryWatchEventKeysTable = pgTable("community_story_watch_event_keys", {
  id: serial("id").primaryKey(),
  viewer_user_id: integer("viewer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  client_event_id: uuid("client_event_id").notNull(),
  play_day: date("play_day", { mode: "string" }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_story_watch_event_key_uidx").on(table.viewer_user_id, table.client_event_id),
  index("community_story_watch_event_key_play_day_idx").on(table.play_day),
]);

export type CommunityStoryWatchDaily = typeof communityStoryWatchDailyTable.$inferSelect;