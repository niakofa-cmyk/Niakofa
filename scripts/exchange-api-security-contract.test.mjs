import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// These contracts exercise the real route source and lock security properties
// until the API's shared database/auth test harness supports full HTTP fixtures.
const route = await readFile(new URL("../artifacts/api-server/src/routes/community-exchange.ts", import.meta.url), "utf8");
const reports = await readFile(new URL("../artifacts/api-server/src/routes/reports.ts", import.meta.url), "utf8");

test("public Exchange list requires authenticated approved members and filters moderation", () => {
  assert.match(route, /router\.get\("\/community\/exchange\/listings", requireAuth, requireApproved/);
  assert.match(route, /const conditions = mine[\s\S]*?eq\(exchangeListingsTable\.status, "active"\), eq\(exchangeListingsTable\.moderation_status, "approved"\)/);
  assert.match(route, /else if \(nearby\)[\s\S]*?locationCondition = sql`FALSE`;/);
});

test("Exchange listing serializers never select or return stored coordinates", () => {
  const selectStart = route.indexOf("const listingSelect = {");
  const selectEnd = route.indexOf("\n};", selectStart);
  const selected = route.slice(selectStart, selectEnd);
  assert.doesNotMatch(selected, /latitude|longitude/);
  assert.match(route, /latitude: roundedCoordinate\(seller\?\.lat\)/);
  assert.match(route, /longitude: roundedCoordinate\(seller\?\.lng\)/);
  assert.match(route, /Use a neighborhood or public pickup area only/);
});

test("Exchange moderator queue and decisions require admin middleware and bind actor to session", () => {
  assert.match(reports, /router\.get\("\/reports\/exchange", requireAuth, requireAdmin\(\), adminLimiter/);
  assert.match(reports, /router\.patch\("\/reports\/exchange\/\:id/);
  assert.match(reports, /requireAdmin\(\)/);
  assert.match(reports, /reviewed_by: req\.authenticatedUserId/);
  assert.match(reports, /exchangeModerationReviewHistoryTable/);\n  assert.match(reports, /moderation_reviewed_by: reviewed_by/);
});
