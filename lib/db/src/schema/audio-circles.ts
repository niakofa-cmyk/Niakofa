import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { communitiesTable } from "./communities";
import { cityNeighborhoodsTable } from "./city-neighborhoods";
import { usersTable } from "./users";

/**
 * Niakofa Audio Circles — live voice (optionally video) rooms.
 *
 * Scoped by city_key, the same normalized key city_neighborhoods already
 * uses — so every city that already has (or will generate) a neighborhood
 * list automatically has a place for each neighborhood's circle, with no
 * separate "which counties exist" bookkeeping. neighborhood_id is null for
 * the one city-wide circle every city_key also gets.
 *
 * community_id is a best-effort link to the county/community pool (for
 * civic tie-ins later) — left null when no matching communities row exists
 * yet for this city, since most cities won't have one.
 *
 * A circle is the permanent "channel"; audio_circle_sessions are the
 * individual live episodes hosted inside it — like a recurring call-in show
 * having many individual broadcasts.
 */
export const audioCirclesTable = pgTable("audio_circles", {
  id:              serial("id").primaryKey(),
  city_key:        text("city_key").notNull(),
  city_display:    text("city_display").notNull(),
  // Null = the one city-wide circle for this city_key.
  neighborhood_id: integer("neighborhood_id").references(() => cityNeighborhoodsTable.id, { onDelete: "cascade" }),
  community_id:    integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  name:            text("name").notNull(),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audio_circles_city_key_idx").on(t.city_key),
  index("audio_circles_neighborhood_idx").on(t.neighborhood_id),
]);

/**
 * A single live (or ended) broadcast inside a circle. Only one session per
 * circle can be status="live" at a time — enforced in the route via a
 * compare-and-swap, same pattern as the request "claim" endpoint elsewhere
 * in this app.
 */
export const audioCircleSessionsTable = pgTable("audio_circle_sessions", {
  id:              serial("id").primaryKey(),
  circle_id:       integer("circle_id").notNull().references(() => audioCirclesTable.id, { onDelete: "cascade" }),
  // FIX (data-loss audit): was onDelete "cascade" — deleting the host's
  // account deleted this session row, which in turn cascade-deleted every
  // OTHER participant's row in audio_circle_participants (that table
  // cascades from session_id). One host account removal was silently
  // wiping an entire circle conversation and everyone else's participation
  // history along with it — collateral damage to users who did nothing.
  // "set null" preserves the session/recording/transcript; host_id just
  // becomes an orphaned reference instead of taking the room down with it.
  host_id:         integer("host_id").references(() => usersTable.id, { onDelete: "set null" }),
  title:           text("title").notNull(),
  status:          text("status").notNull().default("live"), // live | ended
  video_enabled:   boolean("video_enabled").notNull().default(false),
  is_recording:    boolean("is_recording").notNull().default(false),
  recording_url:   text("recording_url"), // set once the host stops recording and it's uploaded
  max_speakers:    integer("max_speakers").notNull().default(13), // host + up to 12 more, 13 total mic slots
  started_at:      timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ended_at:        timestamp("ended_at", { withTimezone: true }),
  // Set when the host disconnects (page refresh, tab close, network drop)
  // instead of ending the session immediately — see migration 0074. Null
  // means the host is actively connected. A host reconnecting within the
  // grace period (routes/audio-circles.ts GRACE_PERIOD_MS) clears this back
  // to null; if they don't return in time, the session is lazily ended the
  // next time anyone fetches it.
  host_disconnected_at: timestamp("host_disconnected_at", { withTimezone: true }),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audio_circle_sessions_circle_idx").on(t.circle_id),
  index("audio_circle_sessions_status_idx").on(t.status),
  index("audio_circle_sessions_host_idx").on(t.host_id),
]);

/**
 * Everyone currently (or previously) in a session, and their role. Role
 * transitions (listener -> speaker via hand-raise + host approval, speaker ->
 * listener via host demotion or self-demotion) are all just updates to this
 * row — see routes/audio-circles.ts. "Currently in the room" is computed as
 * "most recent row for this (session_id, user_id) has left_at IS NULL" —
 * same left_at-based pattern the rest of this codebase uses for milestones.
 */
export const audioCircleParticipantsTable = pgTable("audio_circle_participants", {
  id:           serial("id").primaryKey(),
  session_id:   integer("session_id").notNull().references(() => audioCircleSessionsTable.id, { onDelete: "cascade" }),
  user_id:      integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role:         text("role").notNull().default("listener"), // host | speaker | listener
  hand_raised:  boolean("hand_raised").notNull().default(false),
  muted:        boolean("muted").notNull().default(false),
  joined_at:    timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  left_at:      timestamp("left_at", { withTimezone: true }),
}, (t) => [
  index("audio_circle_participants_session_idx").on(t.session_id),
  index("audio_circle_participants_user_idx").on(t.user_id),
]);

export type AudioCircle = typeof audioCirclesTable.$inferSelect;
export type InsertAudioCircle = typeof audioCirclesTable.$inferInsert;
export type AudioCircleSession = typeof audioCircleSessionsTable.$inferSelect;
export type InsertAudioCircleSession = typeof audioCircleSessionsTable.$inferInsert;
export type AudioCircleParticipant = typeof audioCircleParticipantsTable.$inferSelect;
export type InsertAudioCircleParticipant = typeof audioCircleParticipantsTable.$inferInsert;
