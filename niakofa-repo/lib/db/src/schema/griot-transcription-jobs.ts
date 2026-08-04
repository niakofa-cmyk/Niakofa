import { pgTable, serial, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { griotStoriesTable } from "./griot-stories";

// Makes the "transcribing" status in griot_stories real. Previously nothing
// ever moved a story out of that state — see griot-transcription-worker.ts.
export const griotTranscriptionStatusEnum = pgEnum("griot_transcription_status", [
  "queued",
  "processing",
  "done",
  "failed",
]);

export const griotTranscriptionJobsTable = pgTable("griot_transcription_jobs", {
  id:           serial("id").primaryKey(),
  story_id:     integer("story_id").notNull().references(() => griotStoriesTable.id, { onDelete: "cascade" }),
  status:       griotTranscriptionStatusEnum("status").notNull().default("queued"),
  attempts:     integer("attempts").notNull().default(0),
  error:        text("error"),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  started_at:   timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("idx_griot_transcription_jobs_story").on(t.story_id),
]);

export type GriotTranscriptionJob = typeof griotTranscriptionJobsTable.$inferSelect;
export type InsertGriotTranscriptionJob = typeof griotTranscriptionJobsTable.$inferInsert;
