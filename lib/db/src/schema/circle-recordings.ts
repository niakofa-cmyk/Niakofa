import { bigint, index, integer, pgEnum, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { audioCirclesTable, audioCircleSessionsTable } from "./audio-circles";
import { usersTable } from "./users";

export const circleRecordingStatusEnum = pgEnum("circle_recording_status", [
  "RECORDING_REQUESTED",
  "RECORDING_AUTHORIZED",
  "RECORDING_ACTIVE",
  "RECORDING_FINALIZING",
  "RECORDING_ARCHIVED",
  "RECORDING_FAILED",
  "RECORDING_DELETED",
]);

export const circleRecordingsTable = pgTable("circle_recordings", {
  id: serial("id").primaryKey(),
  session_id: integer("session_id").notNull().references(() => audioCircleSessionsTable.id, { onDelete: "cascade" }),
  circle_id: integer("circle_id").notNull().references(() => audioCirclesTable.id, { onDelete: "cascade" }),
  host_id: integer("host_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: circleRecordingStatusEnum("status").notNull().default("RECORDING_REQUESTED"),
  started_at: timestamp("started_at", { withTimezone: true }),
  ended_at: timestamp("ended_at", { withTimezone: true }),
  duration_seconds: integer("duration_seconds"),
  mime_type: varchar("mime_type", { length: 100 }),
  byte_size: bigint("byte_size", { mode: "number" }),
  storage_key: text("storage_key"),
  checksum_sha256: varchar("checksum_sha256", { length: 64 }),
  retention_until: timestamp("retention_until", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("circle_recordings_session_idx").on(table.session_id),
  index("circle_recordings_retention_idx").on(table.retention_until),
  index("circle_recordings_status_idx").on(table.status),
]);

export const circleRecordingConsentTable = pgTable("circle_recording_consent", {
  id: serial("id").primaryKey(),
  recording_id: integer("recording_id").notNull().references(() => circleRecordingsTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  acknowledged_at: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("circle_recording_consent_recording_user_uidx").on(table.recording_id, table.user_id),
  index("circle_recording_consent_recording_idx").on(table.recording_id),
]);

export type CircleRecording = typeof circleRecordingsTable.$inferSelect;