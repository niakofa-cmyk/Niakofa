import {
  pgTable,
  serial,
  integer,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { communitiesTable } from "./communities";
import { diasporaHubsTable } from "./diaspora-hubs";
import { mediaAssetsTable, type StoryCompositionManifest } from "./media-assets";
import { exchangeListingsTable } from "./exchange";

/**
 * Ephemeral social Stories/Moments belong to Community, not Messages.
 * Griot and family stories remain durable cultural-history records.
 */
export const communityStoriesTable = pgTable("community_stories", {
  id: serial("id").primaryKey(),
  author_user_id: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  hub_id: integer("hub_id").references(() => diasporaHubsTable.id, { onDelete: "set null" }),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  exchange_listing_id: integer("exchange_listing_id").references(() => exchangeListingsTable.id, { onDelete: "restrict" }),
  client_publish_id: varchar("client_publish_id", { length: 36 }),
  publish_payload_hash: varchar("publish_payload_hash", { length: 64 }),
  caption: text("caption"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  audience: text("audience").notNull().default("community"),
  status: text("status").notNull().default("published"),
  reply_enabled: boolean("reply_enabled").notNull().default(true),
  archive_enabled: boolean("archive_enabled").notNull().default(false),
  remix_enabled: boolean("remix_enabled").notNull().default(false),
  featured_at: timestamp("featured_at", { withTimezone: true }),
  response_to_story_id: integer("response_to_story_id").references((): AnyPgColumn => communityStoriesTable.id, { onDelete: "set null" }),
  response_to_author_user_id: integer("response_to_author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  response_to_author_name: varchar("response_to_author_name", { length: 120 }),
  challenge_key: varchar("challenge_key", { length: 80 }),
  composition_manifest: jsonb("composition_manifest").$type<StoryCompositionManifest | null>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("community_stories_author_expires_idx").on(table.author_user_id, table.expires_at),
  index("community_stories_hub_expires_idx").on(table.hub_id, table.expires_at),
  index("community_stories_status_expires_idx").on(table.status, table.expires_at),
  index("community_stories_community_expires_idx").on(table.community_id, table.expires_at),
  index("community_stories_author_feed_idx").on(table.author_user_id, table.status, table.expires_at, table.created_at),
  index("community_stories_tags_gin_idx").using("gin", table.tags),
  index("community_stories_caption_trgm_idx").using("gin", sql`coalesce(${table.caption}, '') gin_trgm_ops`),
  index("community_stories_exchange_listing_idx").on(table.exchange_listing_id, table.created_at),
  index("community_stories_archive_idx").on(table.author_user_id, table.archive_enabled, table.created_at),
  index("community_stories_featured_idx").on(table.community_id, table.featured_at),
  index("community_stories_response_idx").on(table.response_to_story_id),
  uniqueIndex("community_stories_author_client_publish_uidx")
    .on(table.author_user_id, table.client_publish_id)
    .where(sql`${table.client_publish_id} IS NOT NULL`),
]);

export const communityStoryMediaTable = pgTable("community_story_media", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  media_asset_id: integer("media_asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  storage_key: text("storage_key").notNull(),
  thumbnail_storage_key: text("thumbnail_storage_key"),
  media_type: text("media_type").notNull(),
  mime_type: text("mime_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  duration_ms: integer("duration_ms"),
  width: integer("width"),
  height: integer("height"),
  alt_text: varchar("alt_text", { length: 250 }),
  captions_vtt: text("captions_vtt"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("community_story_media_story_idx").on(table.story_id),
]);

/**
 * A deliberately opt-in, server-rendered camera-clip reel. Source media rows
 * remain attached to the Story; this row only tracks the derived playback asset.
 */
export const communityStoryMomentCompositionsTable = pgTable("community_story_moment_compositions", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  derived_media_asset_id: integer("derived_media_asset_id").notNull().references(() => mediaAssetsTable.id, { onDelete: "cascade" }),
  source_media_asset_ids: jsonb("source_media_asset_ids").$type<number[]>().notNull(),
  source_fingerprint: varchar("source_fingerprint", { length: 64 }).notNull(),
  status: text("status").notNull().default("queued"),
  failure_code: text("failure_code"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_story_moment_compositions_story_uidx").on(table.story_id),
  uniqueIndex("community_story_moment_compositions_asset_uidx").on(table.derived_media_asset_id),
  index("community_story_moment_compositions_status_idx").on(table.status, table.updated_at),
]);

export const communityStoryElementsTable = pgTable("community_story_elements", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  position_x: real("position_x").notNull().default(50),
  position_y: real("position_y").notNull().default(50),
  scale: real("scale").notNull().default(1),
  rotation: real("rotation").notNull().default(0),
  z_index: integer("z_index").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("community_story_elements_story_idx").on(table.story_id),
]);

export const communityStoryViewsTable = pgTable("community_story_views", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  viewer_user_id: integer("viewer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  viewed_at: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_story_views_story_viewer_uidx").on(table.story_id, table.viewer_user_id),
  index("community_story_views_story_idx").on(table.story_id, table.viewed_at),
]);

export const communityStoryReactionsTable = pgTable("community_story_reactions", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull().default("💙"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_story_reactions_story_user_uidx").on(table.story_id, table.user_id),
  index("community_story_reactions_story_idx").on(table.story_id),
]);

export const communityStorySharesTable = pgTable("community_story_shares", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("community_story_shares_story_idx").on(table.story_id, table.created_at),
]);

export const communityStoryAuthorMutesTable = pgTable("community_story_author_mutes", {
  viewer_user_id: integer("viewer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  muted_user_id: integer("muted_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.viewer_user_id, table.muted_user_id] }),
  check("community_story_author_mutes_distinct_users", sql`${table.viewer_user_id} <> ${table.muted_user_id}`),
  index("community_story_author_mutes_muted_idx").on(table.muted_user_id),
]);

export const communityStoryCommentsTable = pgTable("community_story_comments", {
  id: serial("id").primaryKey(),
  story_id: integer("story_id").notNull().references(() => communityStoriesTable.id, { onDelete: "cascade" }),
  author_user_id: integer("author_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  moderation_status: text("moderation_status").notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("community_story_comments_story_created_idx").on(table.story_id, table.created_at),
  index("community_story_comments_moderation_idx").on(table.moderation_status),
]);

export type CommunityStory = typeof communityStoriesTable.$inferSelect;
export type CommunityStoryMedia = typeof communityStoryMediaTable.$inferSelect;
export type CommunityStoryElement = typeof communityStoryElementsTable.$inferSelect;
export type CommunityStoryView = typeof communityStoryViewsTable.$inferSelect;
export type CommunityStoryReaction = typeof communityStoryReactionsTable.$inferSelect;
export type CommunityStoryShare = typeof communityStorySharesTable.$inferSelect;
export type CommunityStoryAuthorMute = typeof communityStoryAuthorMutesTable.$inferSelect;
export type CommunityStoryComment = typeof communityStoryCommentsTable.$inferSelect;