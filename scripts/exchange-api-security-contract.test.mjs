import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// These contracts exercise the real route source and lock security properties
// until the API's shared database/auth test harness supports full HTTP fixtures.
const route = await readFile(new URL("../artifacts/api-server/src/routes/community-exchange.ts", import.meta.url), "utf8");
const privacy = await readFile(new URL("../artifacts/api-server/src/lib/exchange-privacy.ts", import.meta.url), "utf8");
const reports = await readFile(new URL("../artifacts/api-server/src/routes/reports.ts", import.meta.url), "utf8");

test("public Exchange list requires authenticated approved members and filters moderation", () => {
  assert.match(route, /router\.get\("\/community\/exchange\/listings", requireAuth, requireApproved/);
  assert.match(route, /const conditions = mine[\s\S]*?eq\(exchangeListingsTable\.status, "active"\), eq\(exchangeListingsTable\.moderation_status, "approved"\)/);
  assert.match(route, /else if \(nearby\)[\s\S]*?locationCondition = sql`FALSE`;/);
});

test("public Exchange detail hides inactive history from non-owners", () => {
  assert.match(route, /const isOwner = listing\?\.seller_id === req\.authenticatedUserId/);
  assert.match(route, /!isOwner && \([\s\S]*?listing\.status !== "active"[\s\S]*?listing\.moderation_status !== "approved"/);
});

test("Exchange listing serializers never select or return stored coordinates", () => {
  const selectStart = route.indexOf("const listingSelect = {");
  const selectEnd = route.indexOf("\n};", selectStart);
  const selected = route.slice(selectStart, selectEnd);
  assert.doesNotMatch(selected, /latitude|longitude/);
  assert.match(route, /latitude: sellerLocation\?\.lat \?\? null/);
  assert.match(route, /longitude: sellerLocation\?\.lng \?\? null/);
  assert.match(route, /filter\(\(\[key\]\) => key !== "latitude" && key !== "longitude"\)/);
  assert.match(route, /Use a neighborhood or public pickup area only/);
  assert.match(route, /sanitizePublicPickupArea/);
  assert.match(route, /import \{ sanitizePublicPickupArea \} from "\.\.\/lib\/exchange-privacy"/);
  assert.match(privacy, /EXACT_STREET_ADDRESS/);
  assert.match(route, /\[data\.title, data\.description\]\.every\(safePublicListingArea\)/);
  assert.match(route, /\.some\(\(value\) => !safePublicListingArea\(value\)\)/);
  assert.match(route, /sanitizePublicPickupArea\(parsed\.data\.note\)/);
  assert.match(route, /sanitizePublicPickupArea\(parsed\.data\.proposed_window\)/);
});

test("acceptance and cancellation serialize on the request and honor moderation", () => {
  assert.match(route, /const \[pickup\] = await tx\.select\(\)\.from\(exchangePickupRequestsTable\)[\s\S]*?\.for\("update"\)/);
  assert.match(route, /eq\(exchangeListingsTable\.moderation_status, "approved"\)/);
  assert.match(route, /throw new Error\("EXCHANGE_LISTING_RESERVATION_CONFLICT"\)/);
  assert.match(route, /if \(updated && pickup\.status === "accepted"\)/);
});

test("pickup creation locks and refreshes eligible listings before inserting", () => {
  assert.match(route, /const inserted = await db\.transaction\(async \(tx\) =>/);
  assert.match(route, /const \[available\] = await tx\.select\(\)\.from\(exchangeListingsTable\)[\s\S]*?\.for\("update"\)/);
  assert.match(route, /available\.status !== "active" \|\| available\.moderation_status !== "approved"/);
  assert.match(route, /tx\.update\(exchangeListingsTable\)\.set\(\{ updated_at: new Date\(\) \}\)/);
});

test("owner edits cannot turn a safety-held listing public without moderator review", () => {
  assert.match(route, /if \(listing\.moderation_status === "held"\) \{[\s\S]*?under safety review/);
  assert.match(route, /eq\(exchangeListingsTable\.moderation_status, listing\.moderation_status\)/);
  assert.match(route, /listing\.status !== "active" \|\| listing\.moderation_status !== "approved"/);
});

test("Exchange moderator queue and decisions require admin middleware and bind actor to session", () => {
  assert.match(reports, /router\.get\("\/reports\/exchange", requireAuth, requireAdmin\(\), adminLimiter/);
  assert.match(reports, /router\.patch\("\/reports\/:id\/review", requireAuth, requireAdmin\(\), adminLimiter/);
  assert.match(reports, /requireAdmin\(\)/);
  assert.match(reports, /const reviewed_by = req\.authenticatedUserId!/);
  assert.match(reports, /exchangeModerationReviewHistoryTable/);
  assert.match(reports, /moderation_reviewed_by: reviewed_by/);
});
