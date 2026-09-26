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
});

test("weekly Exchange delivery has durable deduplication and coarse fallback", async () => {
  const scheduler = await read("artifacts/api-server/src/lib/scheduler.ts");
  const schema = await read("lib/db/src/schema/exchange.ts");
  assert.match(scheduler, /exchangeDigestDeliveriesTable/);
  assert.match(scheduler, /onConflictDoNothing/);
  assert.match(scheduler, /exchangeDigestDelivery.*weekKey|weekKey.*exchangeDigestDelivery/s);
  assert.match(scheduler, /exchange_digest_area/);
  assert.match(scheduler, /haversineMiles/);
  assert.match(scheduler, /neighborhood = \$\{recipient\.area\.trim\(\)\}/);
  assert.match(schema, /uniqueIndex\("exchange_digest_deliveries_user_week_idx"\)/);
});

test("stale Exchange archival is guarded against active coordination", async () => {
  const scheduler = await read("artifacts/api-server/src/lib/scheduler.ts");
  assert.match(scheduler, /EXCHANGE_STALE_DAYS = 30/);
  assert.match(scheduler, /eq\(exchangeListingsTable\.status, "active"\)/);
  assert.match(scheduler, /status IN \('requested', 'accepted'\)/);
  assert.match(scheduler, /archived_at: new Date\(\)/);
  assert.match(scheduler, /archive_reason: "stale_after_30_days_without_active_coordination"/);
});

test("Exchange completion and impact metrics use verified, privacy-safe semantics", async () => {
  const exchange = await read("artifacts/api-server/src/routes/community-exchange.ts");
  assert.match(exchange, /buyer_confirmed_at/);
  assert.match(exchange, /seller_confirmed_at/);
  assert.match(exchange, /EXCHANGE_IMPACT_PRIVACY_THRESHOLD = 5/);
  assert.match(exchange, /const suppressed = completed < EXCHANGE_IMPACT_PRIVACY_THRESHOLD/);
  assert.match(exchange, /completed: suppressed \? null : completed/);
  assert.doesNotMatch(exchange, /const userId = req\.authenticatedUserId!;\s+const \[row\] = await db\.select\(\{\s*completed:/);
});

test("digest location persistence is coarse and timezone-aware", async () => {
  const settings = await read("artifacts/api-server/src/routes/users.ts");
  const client = await read("artifacts/pay-it-forward/src/components/community/CommunityExchangeView.tsx");
  assert.match(settings, /"exchange_digest_area", "exchange_digest_timezone"/);
  assert.match(settings, /must be an IANA timezone/);
  assert.match(client, /exchange_digest_area: location\.label/);
  assert.match(client, /exchange_digest_timezone:/);
});