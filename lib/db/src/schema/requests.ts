import { pgTable, serial, text, boolean, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const requestsTable = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  urgency: text("urgency").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  payment_type: text("payment_type").notNull().default("pay_it_forward"),
  // onDelete: "restrict" (migration 0070) — was "cascade" (migration 0020), which
  // meant deleting a requester's account silently destroyed every request they
  // ever made, including completed history. RESTRICT blocks the delete outright
  // instead, so a request can never vanish as a side effect of account deletion.
  requester_id: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  // onDelete: "set null" — unclaimed/no-longer-claimed is already a normal state.
  helper_id: integer("helper_id").references(() => usersTable.id, { onDelete: "set null" }),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  neighborhood: text("neighborhood"),
  pay_it_forward_amount: real("pay_it_forward_amount"),
  pledge_amount: real("pledge_amount"),
  pledge_paid: real("pledge_paid").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
  claimed_at: timestamp("claimed_at"),
  en_route_at: timestamp("en_route_at"),
  arrived_at: timestamp("arrived_at"),
  completed_at: timestamp("completed_at"),
  cancelled_at: timestamp("cancelled_at"),
  // Voice analytics (migration 0014)
  voice_activated: boolean("voice_activated").notNull().default(false),
  voice_language: text("voice_language"),
  // Nia check-in (migration 0013)
  nia_checkin_sent_at: timestamp("nia_checkin_sent_at"),
  // Photo upload (migration 0023) — base64 data URL, max ~800px
  photo_url: text("photo_url"),
  // Pledge write-off path (migration 0026)
  // active = pledge outstanding; forgiven = waived; written_off = uncollectable after ~12-18 months
  pledge_status: text("pledge_status").notNull().default("active"),
  // Business account FK (migration 0027) — null = personal request
  business_id: integer("business_id"),
  // Government/County sponsor FK (migration 0042) — set when an approved
  // gov-sponsor posts a community need via the Civic Portal. Null = personal/business request.
  government_sponsor_id: integer("government_sponsor_id"),
  // Content moderation (migration 0032) — mirrors gratitude posts pattern.
  // 'approved' = cleared heuristic, 'pending' = held for admin review.
  // Emergency requests bypass screening entirely (life safety > content guard).
  moderation_status: text("moderation_status").notNull().default("approved"),
  moderation_reason: text("moderation_reason"),
  // Optional requester-supplied effort estimate. Used for livable-wage scaling
  // when the guaranteed minimum is tied to task duration rather than a flat floor.
  estimated_hours: real("estimated_hours"),
  // Hardship / forgiveness self-service (migration 0040)
  // Requesters who cannot pay back their PIF pledge can submit a hardship request
  // explaining their situation. Admins review via GET /api/admin/hardship-requests
  // and decide whether to set pledge_status = 'forgiven' or 'written_off'.
  // This replaces the "contact an admin" mental model with a proper self-serve flow.
  hardship_requested_at: timestamp("hardship_requested_at"),
  hardship_note: text("hardship_note"),
  // Diaspora hub tag (migration 0057) — links a request to a specific
  // diaspora hub so hub-ring-fenced pledge funds can be spent on it.
  // Null = not hub-scoped (draws from the unrestricted global pool only).
  hub_id: integer("hub_id"),
  // Last-modified timestamp (migration 0061) — updated by safety-ping and any
  // status-changing lifecycle endpoint (claimed, en_route, arrived, completed, cancelled).
  // Lets the admin dashboard query "last seen live" and lets the frontend detect stale data.
  updated_at: timestamp("updated_at"),
  // Expiry nudge dedupe marker (migration 0065) — set once cleanup-worker sends the
  // "no one's claimed this yet" push at ~50% of the urgency's expiry threshold, so the
  // nudge never fires twice for the same request.
  expiry_nudge_sent_at: timestamp("expiry_nudge_sent_at"),
  // Helper cancel audit trail (migration 0065). A reason of 'request_changed' means the
  // requester altered the task/address out from under the helper — see requests.ts
  // POST /:id/cancel, which skips the no_show_count increment for that reason only.
  last_helper_cancel_reason: text("last_helper_cancel_reason"),
  last_cancelled_by_helper_id: integer("last_cancelled_by_helper_id"),
}, (t) => [
  index("help_requests_status_idx").on(t.status),
  index("help_requests_requester_id_idx").on(t.requester_id),
  index("help_requests_helper_id_idx").on(t.helper_id),
  index("help_requests_created_at_idx").on(t.created_at),
  index("help_requests_lat_lng_idx").on(t.lat, t.lng),
  index("help_requests_pledge_status_idx").on(t.pledge_status, t.created_at),
  index("help_requests_business_id_idx").on(t.business_id),
  // Partial index for business owner-approval queue (migration 0028)
  index("help_requests_business_pending_idx").on(t.business_id, t.requester_id),
  // Partial index for moderation queue — only non-approved rows (migration 0032)
  index("help_requests_moderation_idx").on(t.moderation_status, t.created_at),
  // Hub-scoped requests (migration 0057)
  index("help_requests_hub_id_idx").on(t.hub_id),
]);

export const insertRequestSchema = createInsertSchema(requestsTable).omit({
  id: true, created_at: true, claimed_at: true, en_route_at: true, arrived_at: true, completed_at: true,
});
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type HelpRequest = typeof requestsTable.$inferSelect;
