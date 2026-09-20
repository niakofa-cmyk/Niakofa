import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { diasporaHubsTable } from "./diaspora-hubs";
import { mediaAssetsTable } from "./media-assets";

export const hubCommunityPostsTable = pgTable("hub_community_posts", {
  id: serial("id").primaryKey(),
  hub_id: integer("hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  author_id: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  moderation_status: text("moderation_status").notNull().default("approved"),
  moderation_reason: text("moderation_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_community_posts_hub_created_idx").on(t.hub_id, t.created_at),
  index("hub_community_posts_moderation_idx").on(t.moderation_status, t.created_at),
]);

export const hubCommunityPostMediaTable = pgTable("hub_community_post_media", {
  id: serial("id").primaryKey(),
  post_id: integer("post_id").notNull().references(() => hubCommunityPostsTable.id, { onDelete: "cascade" }),
  media_asset_id: integer("media_asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  storage_key: text("storage_key").notNull(),
  mime_type: text("mime_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  alt_text: text("alt_text"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_community_post_media_post_idx").on(t.post_id),
  index("hub_community_post_media_asset_idx").on(t.media_asset_id),
]);

export const hubCommunityPostCommentsTable = pgTable("hub_community_post_comments", {
  id: serial("id").primaryKey(),
  post_id: integer("post_id").notNull().references(() => hubCommunityPostsTable.id, { onDelete: "cascade" }),
  author_id: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  moderation_status: text("moderation_status").notNull().default("approved"),
  moderation_reason: text("moderation_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_community_post_comments_post_created_idx").on(t.post_id, t.created_at),
]);

export const hubCommunityPostReactionsTable = pgTable("hub_community_post_reactions", {
  id: serial("id").primaryKey(),
  post_id: integer("post_id").notNull().references(() => hubCommunityPostsTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull().default("heart"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_community_post_reactions_user_unique").on(t.post_id, t.user_id, t.reaction),
  index("hub_community_post_reactions_post_idx").on(t.post_id),
]);

export const HUB_COMMUNITY_REACTIONS = ["heart", "support", "celebrate"] as const;

export type HubCommunityPost = typeof hubCommunityPostsTable.$inferSelect;
export type HubCommunityPostMedia = typeof hubCommunityPostMediaTable.$inferSelect;
export type HubCommunityPostComment = typeof hubCommunityPostCommentsTable.$inferSelect;
export type HubCommunityPostReaction = typeof hubCommunityPostReactionsTable.$inferSelect;