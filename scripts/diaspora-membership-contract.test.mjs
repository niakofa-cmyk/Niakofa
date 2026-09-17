import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Hub membership lifecycle is authenticated and explicitly authorized", async () => {
  const route = await source("artifacts/api-server/src/routes/diaspora-hub-memberships.ts");
  assert.match(route, /router\.get\("\/diaspora\/hub-memberships", requireAuth/);
  assert.match(route, /router\.post\("\/diaspora\/hub-memberships", requireAuth/);
  assert.match(route, /router\.patch\("\/diaspora\/hub-memberships\/:id", requireAuth/);
  assert.match(route, /router\.delete\("\/diaspora\/hub-memberships\/:id", requireAuth/);
  assert.match(route, /eq\(hubMembershipsTable\.role, "leader"\)/);
  assert.match(route, /user\?\.is_admin/);
  assert.match(route, /Only an approved Hub leader or admin can manage membership/);
});

test("Membership states preserve explicit request and moderation transitions", async () => {
  const route = await source("artifacts/api-server/src/routes/diaspora-hub-memberships.ts");
  const migration = await source("lib/db/migrations/0142_hub_membership_lifecycle.sql");
  assert.match(route, /membershipStatuses = \["requested", "approved", "suspended", "revoked", "left"\]/);
  assert.match(route, /status === "approved"/);
  assert.match(route, /status: "left"/);
  assert.match(migration, /'requested', 'approved', 'suspended', 'revoked', 'left'/);
});

test("Globe exposes membership requests, Hub-scoped Stories, and legacy URL preservation", async () => {
  const globe = await source("artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx");
  const leader = await source("artifacts/pay-it-forward/src/pages/hub-leader.tsx");
  const routes = await source("artifacts/pay-it-forward/src/lib/diaspora/diasporaRoutes.ts");
  assert.match(globe, /Request membership/);
  assert.match(leader, /Membership requests/);
  assert.match(leader, /updateMembership/);
  assert.match(routes, /params\.get\("hub"\)/);
  assert.match(routes, /params\.get\("hubName"\)/);
});

test("Village pulse member and helper metrics use approved memberships", async () => {
  const pulse = await source("artifacts/api-server/src/routes/global-village-pulse.ts");
  assert.match(pulse, /FROM hub_memberships hm/);
  assert.match(pulse, /hm\.status = 'approved'/);
  assert.match(pulse, /FROM hub_memberships WHERE hub_id = \$\{hub\.id\} AND status = 'approved'/);
  assert.match(pulse, /membersByHub\.get\(hub\.id\)/);
});