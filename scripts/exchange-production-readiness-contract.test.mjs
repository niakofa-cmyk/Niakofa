import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("notification delivery remains server-enforced and preserves essential paths", async () => {
  const push = await read("artifacts/api-server/src/routes/push.ts");
  assert.match(push, /if \(!\(await userAllowsNotif\(userId, payload\)\)\)/);
  assert.match(push, /notif_optional_paused/);
  assert.match(push, /notifType === "emergency" \|\| notifType === "task_accepted" \|\| notifType === "nia_checkin"/);
  assert.match(push, /case "exchange_digest":/);
  assert.match(push, /notif_exchange_needs/);
  assert.match(push, /notif_exchange_offers/);
  assert.match(push, /notif_exchange_goods/);
  assert.match(push, /notif_exchange_services/);
  assert.match(push, /notif_exchange_urgent_aid/);
  assert.match(push, /"no_subscriptions"/);
  assert.match(push, /"failed"/);
});

test("weekly Exchange delivery has durable deduplication and coarse fallback", async () => {
  const scheduler = await read("artifacts/api-server/src/lib/scheduler.ts");
  const schema = await read("lib/db/src/schema/exchange.ts");
  assert.match(scheduler, /exchangeDigestDeliveriesTable/);
  assert.match(scheduler, /onConflictDoNothing/);
  assert.match(scheduler, /const weekKey = exchangeWeekKey/);
  assert.match(scheduler, /exchange_digest_area/);
  assert.match(scheduler, /haversineMiles/);
  assert.match(scheduler, /neighborhood = \$\{recipient\.area\.trim\(\)\}/);
  assert.match(schema, /uniqueIndex\("exchange_digest_deliveries_user_week_idx"\)/);
  assert.match(schema, /claim_expires_at/);
  assert.match(schema, /attempt_count/);
  assert.match(schema, /terminal_failure/);
});

test("stale Exchange archival is guarded against active coordination", async () => {
  const scheduler = await read("artifacts/api-server/src/lib/scheduler.ts");
  assert.match(scheduler, /EXCHANGE_STALE_DAYS = 30/);
  assert.match(scheduler, /eq\(exchangeListingsTable\.status, "active"\)/);
  assert.match(scheduler, /status IN \('requested', 'accepted'\)/);
  assert.match(scheduler, /archived_at: now/);
  assert.match(scheduler, /archive_reason: "stale_after_30_days_without_active_coordination"/);
  assert.match(scheduler, /createMessageNotification/);
  assert.match(scheduler, /exchange_listing_id: listing\.id/);
});

test("accepted Exchange coordination expires and releases the listing", async () => {
  const scheduler = await read("artifacts/api-server/src/lib/scheduler.ts");
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  const schema = await read("lib/db/src/schema/exchange.ts");
  const migration = await read("lib/db/migrations/0169_exchange_pickup_coordination_expiry.sql");
  const retryMigration = await read("lib/db/migrations/0170_exchange_expiry_notification_retry.sql");
  const notifications = await read("artifacts/api-server/src/lib/message-notifications.ts");
  assert.match(exchange, /EXCHANGE_PICKUP_COORDINATION_HOURS = 48/);
  assert.match(exchange, /coordination_expires_at/);
  assert.match(scheduler, /expireAbandonedExchangePickups/);
  assert.match(scheduler, /return db\.transaction\(async \(tx\) =>/);
  assert.match(scheduler, /\.for\("update", \{ skipLocked: true \}\)/);
  assert.match(scheduler, /status: "expired"/);
  assert.match(scheduler, /eq\(exchangeListingsTable\.status, "reserved"\)/);
  assert.match(scheduler, /status: "active"/);
  assert.match(scheduler, /notifyExpiredExchangePickups/);
  assert.match(scheduler, /isNull\(exchangePickupRequestsTable\.expiry_notified_at\)/);
  assert.match(schema, /coordination_expires_at/);
  assert.match(schema, /expired_at/);
  assert.match(schema, /expiry_notified_at/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS exchange_pickup_requests_expiry_idx/);
  assert.match(migration, /COALESCE\(accepted_at, updated_at, created_at\) \+ INTERVAL '48 hours'/);
  assert.match(retryMigration, /message_notifications_exchange_expiry_once_idx/);
  assert.match(notifications, /\.onConflictDoNothing\(\)/);
});

test("Exchange matching uses a coarse location abstraction", async () => {
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  const location = await read("artifacts/api-server/src/lib/exchange-location.ts");
  assert.match(exchange, /getExchangeMatchingLocation/);
  assert.match(location, /privacy-rounded coordinates/);
  assert.match(location, /Math\.round\(value \* 100\) \/ 100/);
});

test("archived Exchange posts can be renewed without rewriting their history", async () => {
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  const client = await read("artifacts/pay-it-forward/src/lib/community-exchange-client.ts");
  const view = await read("artifacts/pay-it-forward/src/components/community/CommunityExchangeView.tsx");
  assert.match(exchange, /\/listings\/:id\/renew/);
  assert.match(exchange, /eq\(exchangeListingsTable\.status, "archived"\)/);
  assert.match(exchange, /archived_at: null/);
  assert.match(exchange, /archive_reason: null/);
  assert.match(client, /renewExchangeListing/);
  assert.match(view, /Renew this post/);
});

test("Exchange completion and impact metrics use verified, privacy-safe semantics", async () => {
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  assert.match(exchange, /buyer_confirmed_at/);
  assert.match(exchange, /seller_confirmed_at/);
  assert.match(exchange, /Your Exchange request was declined/);
  assert.match(exchange, /Exchange coordination was cancelled/);
  assert.match(exchange, /Exchange handoff confirmation recorded/);
  assert.match(exchange, /Exchange handoff completed/);
  assert.match(exchange, /Promise\.allSettled\(result\.notifyUserIds\.map/);
  assert.match(exchange, /EXCHANGE_IMPACT_PRIVACY_THRESHOLD = 5/);
  assert.match(exchange, /const suppressed = completed < EXCHANGE_IMPACT_PRIVACY_THRESHOLD/);
  assert.match(exchange, /completed: suppressed \? null : completed/);
  assert.doesNotMatch(exchange, /const userId = req\.authenticatedUserId!;\s+const \[row\] = await db\.select\(\{\s*completed:/);
});

test("Exchange client surfaces the two-party completion state", async () => {
  const client = await read("artifacts/pay-it-forward/src/lib/community-exchange-client.ts");
  const view = await read("artifacts/pay-it-forward/src/components/community/CommunityExchangeView.tsx");
  assert.match(client, /awaiting_other_confirmation\?: boolean/);
  assert.match(view, /awaiting_other_confirmation/);
  assert.match(view, /Waiting for the other participant to confirm/);
});

test("digest location persistence is coarse and timezone-aware", async () => {
  const settings = await read("artifacts/api-server/src/routes/users.ts");
  const client = await read("artifacts/pay-it-forward/src/components/community/CommunityExchangeView.tsx");
  assert.match(settings, /"exchange_digest_area", "exchange_digest_timezone"/);
  assert.match(settings, /must be an IANA timezone/);
  assert.match(client, /exchange_digest_area: location\.label/);
  assert.match(client, /exchange_digest_timezone:/);
});

test("Exchange safety uses moderator-confirmed holds and durable review history", async () => {
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  const reports = await read("artifacts/api-server/src/routes/reports.ts");
  const schema = await read("lib/db/src/schema/exchange.ts");
  const migration = await read("lib/db/migrations/0166_exchange_category_moderation.sql");
  assert.match(exchange, /EXCHANGE_HOLD_REPORT_THRESHOLD = 3/);
  assert.match(exchange, /safeListingLabel/);
  assert.match(exchange, /data\.title, data\.description/);
  assert.match(exchange, /safePublicListingArea\(data\.neighborhood\)/);
  assert.match(exchange, /safePublicListingArea\(data\.pickup_notes\)/);
  assert.match(exchange, /partial unique index is the concurrency guard/);
  assert.match(exchange, /code === "23505"/);
  assert.match(exchange, /moderation_status: "held"/);
  assert.match(exchange, /temporary_hold_after_three_unique_reports/);
  assert.match(reports, /\/reports\/exchange/);
  assert.match(reports, /temporary_hold/);
  assert.match(reports, /confirmed_violation/);
  assert.match(reports, /Three moderator-confirmed Exchange violations/);
  assert.match(schema, /exchangeModerationReviewHistoryTable/);
  assert.match(schema, /previous_moderation_status/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS exchange_moderation_review_history/);
  assert.match(migration, /ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'commercial_pricing'/);
});