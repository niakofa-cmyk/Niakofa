/**
 * Explicit column select for help_requests — omits geog by default so queries
 * work even if PostGIS isn't available, and avoids surprise breakage when new
 * columns are added to the schema before migrations run on production.
 * Import this wherever you do db.select().from(requestsTable).
 */
import { requestsTable } from "@workspace/db";

export const requestSelect = {
  id: requestsTable.id,
  title: requestsTable.title,
  description: requestsTable.description,
  category: requestsTable.category,
  urgency: requestsTable.urgency,
  status: requestsTable.status,
  payment_type: requestsTable.payment_type,
  requester_id: requestsTable.requester_id,
  helper_id: requestsTable.helper_id,
  lat: requestsTable.lat,
  lng: requestsTable.lng,
  neighborhood: requestsTable.neighborhood,
  pay_it_forward_amount: requestsTable.pay_it_forward_amount,
  pledge_amount: requestsTable.pledge_amount,
  pledge_paid: requestsTable.pledge_paid,
  created_at: requestsTable.created_at,
  claimed_at: requestsTable.claimed_at,
  en_route_at: requestsTable.en_route_at,
  arrived_at: requestsTable.arrived_at,
  completed_at: requestsTable.completed_at,
  cancelled_at: requestsTable.cancelled_at,
  nia_checkin_sent_at: requestsTable.nia_checkin_sent_at,
  voice_activated: requestsTable.voice_activated,
  voice_language: requestsTable.voice_language,
} as const;
