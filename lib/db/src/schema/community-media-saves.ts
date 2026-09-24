import { index, integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { hubCommunityPostMediaTable } from "./hub-community";

export const communityMediaSavesTable = pgTable("community_media_saves", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  media_id: integer("media_id").notNull().references(() => hubCommunityPostMediaTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("community_media_saves_user_media_uidx").on(table.user_id, table.media_id),
  index("community_media_saves_user_created_idx").on(table.user_id, table.created_at, table.id),
  index("community_media_saves_media_idx").on(table.media_id),
]);

export type CommunityMediaSave = typeof communityMediaSavesTable.$inferSelect;
export type NewCommunityMediaSave = typeof communityMediaSavesTable.$inferInsert;