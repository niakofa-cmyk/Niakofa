import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// Public thank-you messages created by requesters after their request is completed.
// Appears in the Community feed in real time via WebSocket.
export const gratitudePostsTable = pgTable("gratitude_posts", {
  id: serial("id").primaryKey(),

  // The completed request this gratitude is for (nullable for general posts)
  request_id: integer("request_id"),

  // Who wrote the post (requester)
  author_id: integer("author_id").notNull(),
  author_name: text("author_name").notNull(),
  author_avatar: text("author_avatar"),

  // The helper being thanked
  helper_id: integer("helper_id"),
  helper_name: text("helper_name"),

  // The actual thank-you message
  message: text("message").notNull(),

  // Denormalized title of the request for display without a join
  request_title: text("request_title"),

  // Simple heart-count (no per-user tracking needed for MVP)
  likes: integer("likes").notNull().default(0),

  // Set at write time by lib/post-moderation.ts's deterministic heuristic
  // (spam/link/phone-number/all-caps patterns → "pending", otherwise
  // "approved"). "pending" posts are excluded from the public GET /gratitude
  // feed and from the new-post broadcast until an admin approves them via
  // GET/POST /admin/moderation-queue.
  moderation_status: text("moderation_status").notNull().default("approved"),
  moderation_reason: text("moderation_reason"),

  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type GratitudePost = typeof gratitudePostsTable.$inferSelect;
export type InsertGratitudePost = typeof gratitudePostsTable.$inferInsert;
