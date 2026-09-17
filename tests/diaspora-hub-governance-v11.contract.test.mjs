import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("V11 Hub governance prevents leader role escalation and self-management", async () => {
  const route = await source("artifacts/api-server/src/routes/diaspora-hub-memberships.ts");
  assert.match(route, /const \[actor\] = await db/);
  assert.match(route, /const isAdmin = Boolean\(actor\?\.is_admin\)/);
  assert.match(route, /existing\.role === "leader"/);
  assert.match(route, /Only a platform admin can manage another Hub leader/);
  assert.match(route, /existing\.user_id === userId/);
  assert.match(route, /Only a platform admin can change Hub membership roles/);
});

test("Hub-to-Hub message sending remains membership-gated at send time", async () => {
  const route = await source("artifacts/api-server/src/routes/diaspora-hub-messages.ts");
  assert.match(route, /router\.post\("\/diaspora\/hub-messages\/conversations\/:id\/messages", requireAuth/);
  assert.match(route, /canRepresentHub\(userId, senderHubId\)/);
  assert.match(route, /HUB_MEMBERSHIP_REQUIRED/);
});

test("Messages page accepts Globe Hub context through sourceHub or hub", async () => {
  const page = await source("artifacts/pay-it-forward/src/pages/diaspora-hub-messages.tsx");
  assert.match(page, /params\.get\("sourceHub"\) \?\? params\.get\("hub"\)/);
});