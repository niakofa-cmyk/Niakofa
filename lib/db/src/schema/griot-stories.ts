import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { requestsTable } from "./requests";
import { gratitudePostsTable } from "./gratitude";
import { communitiesTable } from "./communities";
import { diasporaHubsTable } from "./diaspora-hubs";

export const griotStoryStatusEnum = pgEnum("griot_story_status", [
  "recorded",
  "transcribing",
  "pending_review",
  "ready",
  "published",
]);

export const griotStoryVisibilityEnum = pgEnum("griot_story_visibility", [
  "public",
  "diaspora_tag",
  "private",
]);

// (A) heritage_archive — oral history, not tied to a request
// (B) gratitude        — grew out of a completed help request (see request_id/gratitude_post_id)
// (C) diaspora_social   — hub/community connection story
export const griotStoryTypeEnum = pgEnum("griot_story_type", [
  "heritage_archive",
  "gratitude",
  "diaspora_social",
]);

export const griotStoriesTable = pgTable("griot_stories", {
  id:               serial("id").primaryKey(),
  // FIX (data-loss audit): was onDelete "cascade" — the one cascading FK in
  // this table while request_id, gratitude_post_id, community_id, and hub_id
  // below all deliberately use "set null". A heritage_archive oral history
  // (the whole point of this table) was silently destroyed the moment its
  // author's account was deleted — the opposite of what "archive" implies.
  // "set null" keeps the recording/transcript; author_id just becomes
  // orphaned instead of taking the story down with it.
  author_id:        integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  title:            text("title"),
  prompt:           text("prompt"),
  audio_url:        text("audio_url"),
  text_content:     text("text_content"),
  original_language: text("original_language").notNull().default("en"),
  diaspora_tag:     text("diaspora_tag"),
  hub_location:     text("hub_location"),
  lat:              doublePrecision("lat"),
  lng:              doublePrecision("lng"),
  status:           griotStoryStatusEnum("status").notNull().default("recorded"),
  visibility:       griotStoryVisibilityEnum("visibility").notNull().default("public"),
  release_at:       timestamp("release_at", { withTimezone: true }),
  published_at:     timestamp("published_at", { withTimezone: true }),
  duration_seconds: integer("duration_seconds"),
  story_type:       griotStoryTypeEnum("story_type").notNull().default("heritage_archive"),
  // (B) — set when a gratitude post is "promoted" into a full story, or when
  // the author records a story directly off a completed request.
  request_id:        integer("request_id").references(() => requestsTable.id, { onDelete: "set null" }),
  gratitude_post_id: integer("gratitude_post_id").unique().references(() => gratitudePostsTable.id, { onDelete: "set null" }),
  // (B)/(C) — real relations instead of the freeform hub_location/diaspora_tag text.
  community_id:     integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  hub_id:           integer("hub_id").references(() => diasporaHubsTable.id, { onDelete: "set null" }),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_griot_stories_type").on(t.story_type),
  index("idx_griot_stories_request").on(t.request_id),
  index("idx_griot_stories_community").on(t.community_id),
  index("idx_griot_stories_hub").on(t.hub_id),
]);

export const storyTranslationsTable = pgTable("story_translations", {
  id:                 serial("id").primaryKey(),
  story_id:           integer("story_id").notNull().references(() => griotStoriesTable.id, { onDelete: "cascade" }),
  language:           text("language").notNull(),
  // unique(story_id, language) enforced via migration and schema index below
  nia_draft_text:     text("nia_draft_text"),
  edited_text:        text("edited_text"),
  recorder_approved:  boolean("recorder_approved").notNull().default(false),
  approved_at:        timestamp("approved_at", { withTimezone: true }),
  was_edited:         boolean("was_edited").notNull().default(false),
  created_at:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
