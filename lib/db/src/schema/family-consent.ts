import {
  pgTable, serial, integer, text, timestamp, boolean, pgEnum, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";

// ─── Family Vault: Consent ────────────────────────────────────────────────────
// Per-member consent flags controlling how their data is used in Legacy Mode.
// A member must have consent_storytelling = true before the AI can use their
// stories/memories in generated chapters. consent_reconnection gates the
// "reconnect with a relative" achievement action.

export const familyConsentScopeEnum = pgEnum("family_consent_scope", [
  "storytelling",   // allow AI to use this member's stories in generated content
  "reconnection",   // allow suggesting reconnection actions with this member
  "publication",    // allow publishing this member's stories to griot_stories
]);

export const familyMemberConsentTable = pgTable("family_member_consent", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  member_id:     integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  scope:         familyConsentScopeEnum("scope").notNull(),
  granted:       boolean("granted").notNull().default(false),
  granted_by:    integer("granted_by").references(() => familyMembersTable.id, { onDelete: "set null" }),
  granted_at:    timestamp("granted_at", { withTimezone: true }),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_member_consent_member").on(t.member_id, t.scope),
  index("idx_family_member_consent_family").on(t.family_id),
]);

export type FamilyMemberConsent = typeof familyMemberConsentTable.$inferSelect;
export type InsertFamilyMemberConsent = typeof familyMemberConsentTable.$inferInsert;
