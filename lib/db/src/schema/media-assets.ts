import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type StoryCompositionManifest = {
  version: 1;
  canvas: { width: number; height: number; aspect: "9:16" | "1:1" | "16:9" };
  elements: Array<{
    id: string;
    type: string;
    position_x: number;
    position_y: number;
    scale: number;
    rotation: number;
    z_index: number;
    payload: Record<string, unknown>;
  }>;
  music?: {
    track_asset_id?: number;
    title?: string;
    start_ms?: number;
    end_ms?: number;
    volume?: number;
  } | null;
  effects?: string[];
  /** Per-asset video thumbnail frame selection, in milliseconds. */
  cover_time_ms?: number;
};

export const mediaAssetsTable = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  owner_user_id: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  context_kind: text("context_kind").notNull(),
  context_id: integer("context_id").notNull(),
  media_type: text("media_type").notNull(),
  mime_type: text("mime_type").notNull(),
  original_name: text("original_name"),
  original_key: text("original_key").notNull(),
  thumbnail_key: text("thumbnail_key"),
  variant_key: text("variant_key"),
  cleanup_keys: jsonb("cleanup_keys").$type<string[]>().notNull().default([]),
  byte_size: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  duration_ms: integer("duration_ms"),
  status: text("status").notNull().default("pending"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  composition_manifest: jsonb("composition_manifest").$type<StoryCompositionManifest | null>(),
  failure_reason: text("failure_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("media_assets_original_key_uidx").on(table.original_key),
  index("media_assets_context_idx").on(table.context_kind, table.context_id, table.created_at),
  index("media_assets_owner_idx").on(table.owner_user_id, table.created_at),
  index("media_assets_status_idx").on(table.status, table.updated_at),
]);

export const mediaProcessingJobsTable = pgTable("media_processing_jobs", {
  id: serial("id").primaryKey(),
  media_asset_id: integer("media_asset_id").notNull().references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
  job_type: text("job_type").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("media_processing_jobs_asset_type_uidx").on(table.media_asset_id, table.job_type),
  index("media_processing_jobs_queue_idx").on(table.status, table.created_at),
]);

/** Durable resumable-upload state. Chunk bytes remain in provider-neutral object storage. */
export const mediaUploadSessionsTable = pgTable("media_upload_sessions", {
  media_asset_id: integer("media_asset_id").primaryKey().references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
  chunk_size: integer("chunk_size").notNull(),
  next_offset: integer("next_offset").notNull().default(0),
  finalized: boolean("finalized").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mediaUploadChunksTable = pgTable("media_upload_chunks", {
  id: serial("id").primaryKey(),
  media_asset_id: integer("media_asset_id").notNull().references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
  byte_offset: integer("byte_offset").notNull(),
  byte_length: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  object_key: text("object_key").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("media_upload_chunks_asset_offset_uidx").on(table.media_asset_id, table.byte_offset),
  uniqueIndex("media_upload_chunks_object_key_uidx").on(table.object_key),
]);

export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type NewMediaAsset = typeof mediaAssetsTable.$inferInsert;
export type MediaProcessingJob = typeof mediaProcessingJobsTable.$inferSelect;
export type MediaJobType = "probe" | "thumbnail" | "transcode" | "audio_mix" | "moment_compose";