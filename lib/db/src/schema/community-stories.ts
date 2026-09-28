import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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
  caption: text("caption"),
  audience: text("audience").notNull().default("community"),
  status: text("status").notNull().default("published"),
  reply_enabled: boolean("reply_enabled").notNull().default(true),
  composition_manifest: jsonb("composition_manifest").$type<StoryCompositionManifest | null>(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("community_stories_author_expires_idx").on(table.author_user_id, table.expires_at),
  index("community_stories_hub_expires_idx").on(table.hub_id, table.expires_at),
  index("community_stories_status_expires_idx").on(table.status, table.expires_at),
  index("community_stories_community_expires_idx").on(table.community_id, table.expires_at),
  index("community_stories_exchange_listing_idx").on(table.exchange_listing_id, table.created_at),
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
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("community_story_media_story_idx").on(table.story_id),
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

export type CommunityStory = typeof communityStoriesTable.$inferSelect;
export type CommunityStoryMedia = typeof communityStoryMediaTable.$inferSelect;
export type CommunityStoryElement = typeof communityStoryElementsTable.$inferSelect;
export type CommunityStoryView = typeof communityStoryViewsTable.$inferSelect;
export type CommunityStoryReaction = typeof communityStoryReactionsTable.$inferSelect;
export type CommunityStoryShare = typeof communityStorySharesTable.$inferSelect;