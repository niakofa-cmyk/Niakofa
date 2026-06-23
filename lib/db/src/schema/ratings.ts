import { pgTable, serial, integer, text, timestamp, unique, check } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { sql } from "drizzle-orm";

export const ratingsTable = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    request_id: integer("request_id").notNull(),
    rater_id: integer("rater_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    ratee_id: integer("ratee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    review: text("review"),
    role: text("role").notNull(),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("ratings_rater_request_unique").on(t.request_id, t.rater_id),
    check("ratings_stars_range", sql`${t.stars} BETWEEN 1 AND 5`),
  ],
);

export type Rating = typeof ratingsTable.$inferSelect;
export type InsertRating = typeof ratingsTable.$inferInsert;
