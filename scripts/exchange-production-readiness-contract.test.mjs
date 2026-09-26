import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("notification delivery remains server-enforced and preserves essential paths", async () => {
  const push = await read("artifacts/api-server/src/routes/push.ts");
  assert.match(push, /if \(!\(await userAllowsNotif\(userId, payload\.notifType\)\)\)/);
  assert.match(push, /notif_optional_paused/);
  assert.match(push, /notifType === "emergency" \|\| notifType === "task_accepted" \|\| notifType === "nia_checkin"/);
  assert.match(push, /case "exchange_digest": return s\.notif_exchange_digest/);
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