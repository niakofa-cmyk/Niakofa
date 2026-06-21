import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user like tracking for gratitude posts — prevents a single caller
// from spamming the like count without limit (the gratitudePostsTable
// comment originally said "no per-user tracking needed for MVP", which
// turned out to be exploitable).
export const gratitudeLikesTable = pgTable("gratitude_likes", {
  id: serial("id").primaryKey(),
  post_id: integer("post_id").notNull(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("gratitude_likes_post_user_unique").on(t.post_id, t.user_id),
]);

export type GratitudeLike = typeof gratitudeLikesTable.$inferSelect;
export type InsertGratitudeLike = typeof gratitudeLikesTable.$inferInsert;
