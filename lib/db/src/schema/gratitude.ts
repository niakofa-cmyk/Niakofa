import { pgTable, serial, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Post type ────────────────────────────────────────────────────────────────
// Originally this table only held post-completion thank-you messages
// ("thanks"). It's now the backing store for the whole Community feed:
// general offers of help, shared local resources, and short status updates,
// in addition to gratitude. request_id/helper_id/helper_name/request_title
// remain nullable and are only populated for "thanks" posts tied to a
// completed request.
export const communityPostTypeEnum = pgEnum("community_post_type", [
  "thanks",
  "offer",
  "resource",
  "update",
]);

// ── Moderation ───────────────────────────────────────────────────────────────
// Every post is screened by a cheap heuristic filter at write-time
// (see lib/post-moderation.ts) before it's visible in the public feed.
// "pending" posts are held back from GET /gratitude until an admin approves
// them via the moderation queue; "rejected" posts never reappear.
export const postModerationStatusEnum = pgEnum("post_moderation_status", [
  "approved",
  "pending",
  "rejected",
]);

export const gratitudePostsTable = pgTable("gratitude_posts", {
  id: serial("id").primaryKey(),

  // The completed request this gratitude is for (nullable for general posts)
  request_id: integer("request_id"),

  // Who wrote the post (requester)
  author_id: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  author_name: text("author_name").notNull(),
  author_avatar: text("author_avatar"),

  // The helper being thanked
  helper_id: integer("helper_id").references(() => usersTable.id, { onDelete: "set null" }),
  helper_name: text("helper_name"),

  // The actual thank-you message
  message: text("message").notNull(),

  // Denormalized title of the request for display without a join
  request_title: text("request_title"),

  // Simple heart-count (no per-user tracking needed for MVP)
  likes: integer("likes").notNull().default(0),

  // ── Community feed extension ────────────────────────────────────────────
  post_type: communityPostTypeEnum("post_type").notNull().default("thanks"),
  photo_url: text("photo_url"), // base64 data URL, same convention/cap as users.avatar_url
  moderation_status: postModerationStatusEnum("moderation_status").notNull().default("approved"),
  flagged_reason: text("flagged_reason"),

  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("gratitude_posts_moderation_status_idx").on(t.moderation_status),
]);

export type GratitudePost = typeof gratitudePostsTable.$inferSelect;
export type InsertGratitudePost = typeof gratitudePostsTable.$inferInsert;
