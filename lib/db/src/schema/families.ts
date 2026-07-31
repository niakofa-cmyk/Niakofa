import { pgTable, serial, integer, text, timestamp, boolean, pgEnum, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ─── Diaspora Platform: Family Spaces ───────────────────────────────────────
// Phase A of the Diaspora Platform build (see docs/diaspora-platform-design.md).
// A Family Space is a private kinship community — the container everything
// else in the Diaspora ecosystem (Family Vault memories, interviews,
// eventually the Family Tree) hangs off of. Table names are prefixed
// `family_` so the whole ecosystem greps as one unit, same convention as
// `diaspora_hubs` / `hub_leaders` / `hub_pledges`.
//
// Deliberately NOT named `families.memory` etc. to collide with `nia_memories`
// — that table is Nia's own conversational memory of a user and is unrelated.
// The Family Vault's unified "Memory" object lives in `family_memories`
// (migration 0080, not this one).

export const familyMemberRoleEnum = pgEnum("family_member_role", [
  "owner",       // full admin, can delete the family space
  "curator",     // can edit/organize any memory, invite members
  "contributor", // can add memories, comment
  "viewer",      // read-only (e.g. younger relatives, guests)
]);

export const familyMemberStatusEnum = pgEnum("family_member_status", [
  "invited",
  "active",
  "removed",
]);

export const familiesTable = pgTable("families", {
  id:              serial("id").primaryKey(),
  name:            text("name").notNull(), // "The Johnson Family"
  description:     text("description"),
  cover_image_url: text("cover_image_url"),
  // Family Spaces are private by construction in Phase A — there is no
  // public/discoverable flag here. Publishing a story publicly happens via
  // an explicit action that copies fields into griot_stories; it never
  // flips a visibility bit on the family itself.
  created_by:      integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const familyMembersTable = pgTable("family_members", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  // Nullable: invited-but-not-yet-a-user members (e.g. an elder without the
  // app) get a placeholder row with invite_email/display_name set and
  // user_id null until they sign up and an existing member links the invite.
  user_id:       integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  display_name:  text("display_name").notNull(),
  invite_email:  text("invite_email"),
  relation_note: text("relation_note"), // free text: "Grandmother", "Uncle on Dad's side"
  role:          familyMemberRoleEnum("role").notNull().default("contributor"),
  status:        familyMemberStatusEnum("status").notNull().default("invited"),
  invited_by:    integer("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
  joined_at:     timestamp("joined_at", { withTimezone: true }),
  // Distinguishes living members (who need self-granted storytelling consent)
  // from deceased ancestors (eligible by default unless a curator declines).
  // Default true is privacy-safe: existing rows require an explicit grant.
  is_living:     boolean("is_living").notNull().default(true),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // A registered user can only have one membership row per family. Invited
  // (unclaimed) members have user_id NULL, so this constraint doesn't limit
  // how many un-claimed placeholder invites a family can hold.
  uniqueIndex("family_members_family_user_unique").on(t.family_id, t.user_id),
  index("idx_family_members_family").on(t.family_id),
  index("idx_family_members_user").on(t.user_id),
]);

export type Family = typeof familiesTable.$inferSelect;
export type InsertFamily = typeof familiesTable.$inferInsert;
export type FamilyMember = typeof familyMembersTable.$inferSelect;
export type InsertFamilyMember = typeof familyMembersTable.$inferInsert;
