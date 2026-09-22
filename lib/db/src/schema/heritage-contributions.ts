import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { familiesTable } from "./families";

/**
 * User-submitted items for the curated Heritage Collections.
 *
 * Collection metadata remains a curated catalog in the API. Contributions
 * are deliberately separate so publishing always requires moderation.
 */
export const heritageContributionKindEnum = pgEnum("heritage_contribution_kind", [
  "photo",
  "story",
  "note",
  "link",
]);

export const heritageContributionStatusEnum = pgEnum("heritage_contribution_status", [
  "pending",
  "published",
  "rejected",
  "archived",
]);

export const heritageContributionsTable = pgTable(
  "heritage_contributions",
  {
    id: serial("id").primaryKey(),
    collection_slug: text("collection_slug").notNull(),
    family_id: integer("family_id").references(() => familiesTable.id, { onDelete: "set null" }),
    user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    kind: heritageContributionKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    media_url: text("media_url"),
    status: heritageContributionStatusEnum("status").notNull().default("pending"),
    moderated_by: integer("moderated_by").references(() => usersTable.id, { onDelete: "set null" }),
    moderated_at: timestamp("moderated_at", { withTimezone: true }),
    rejection_reason: text("rejection_reason"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_heritage_contributions_collection").on(
      table.collection_slug,
      table.status,
      table.created_at,
    ),
    index("idx_heritage_contributions_family").on(table.family_id, table.created_at),
    index("idx_heritage_contributions_user").on(table.user_id, table.created_at),
  ],
);

export type HeritageContribution = typeof heritageContributionsTable.$inferSelect;
export type InsertHeritageContribution = typeof heritageContributionsTable.$inferInsert;