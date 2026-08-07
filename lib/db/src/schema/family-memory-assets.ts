import {
  pgTable, serial, integer, text, timestamp, pgEnum, index,
} from "drizzle-orm/pg-core";
import { familyMemoriesTable } from "./family-memories";

// ─── Diaspora Platform: Family Vault — Memory Assets ─────────────────────────
// One row per file attached to a family_memory. storage_key points into
// object storage (S3/R2) — raw media bytes are never stored in Postgres.
// See docs/diaspora-platform-design.md §5 for the presigned-upload flow.

export const familyAssetTypeEnum = pgEnum("family_asset_type", [
  "photo",
  "video",
  "audio",
  "document",
]);

export const familyAssetProcessingStatusEnum = pgEnum("family_asset_processing_status", [
  "uploaded",   // just confirmed, not yet processed
  "processing", // thumbnail/transcode/transcript in progress
  "ready",      // fully processed
  "failed",     // worker gave up
]);

export const familyMemoryAssetsTable = pgTable("family_memory_assets", {
  id:                serial("id").primaryKey(),
  memory_id:         integer("memory_id").notNull().references(() => familyMemoriesTable.id, { onDelete: "cascade" }),
  asset_type:        familyAssetTypeEnum("asset_type").notNull(),
  // e.g. "families/12/memories/88/original.jpg" — never a public URL
  storage_key:       text("storage_key").notNull(),
  thumbnail_key:     text("thumbnail_key"),
  mime_type:         text("mime_type").notNull(),
  byte_size:         integer("byte_size"),
  duration_seconds:  integer("duration_seconds"), // audio/video only
  width:             integer("width"),
  height:            integer("height"),
  // populated by Nia family transcription worker for audio/video
  transcript:        text("transcript"),
  processing_status: familyAssetProcessingStatusEnum("processing_status").notNull().default("uploaded"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_memory_assets_memory").on(t.memory_id),
  index("idx_family_memory_assets_status").on(t.processing_status),
]);

export type FamilyMemoryAsset = typeof familyMemoryAssetsTable.$inferSelect;
export type InsertFamilyMemoryAsset = typeof familyMemoryAssetsTable.$inferInsert;
