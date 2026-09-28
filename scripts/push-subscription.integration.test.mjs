#!/usr/bin/env node
/**
 * Migration-backed push subscription API tests using disposable local users.
 * This script intentionally refuses non-local DATABASE_URL values.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve4 } from "node:dns/promises";
import { createRequire } from "node:module";
import { tsImport } from "tsx/esm/api";

const requireFromApiServer = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const requireFromDatabase = createRequire(new URL("../lib/db/package.json", import.meta.url));
const express = requireFromApiServer("express");
const request = requireFromApiServer("supertest");
const { Pool } = requireFromDatabase("pg");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for push subscription integration.");
const databaseHost = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
const privateV4 = (ip) => {
  const octets = ip.split(".").map(Number);
  return octets.length === 4 && (
    octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
};
let privateLocalService = false;
if (["helium", "postgres", "db"].includes(databaseHost)) {
  try {
    privateLocalService = (await resolve4(databaseHost)).some(privateV4);
  } catch {
    // Fail closed below if a disposable local service name does not resolve.
  }
}
if (!["localhost", "127.0.0.1", "::1"].includes(databaseHost) && !privateLocalService) {
  throw new Error(`Refusing push subscription fixtures on non-local database host "${databaseHost}".`);
}

process.env.SESSION_SECRET ??= `push-test-${randomUUID()}`;
const pool = new Pool({ connectionString: databaseUrl, max: 4 });
const fixtureKey = randomUUID();
const fixtureUsers = [];
let appPool;

const expectStatus = (response, status, label) => {
  assert.equal(response.status, status, `${label}: ${response.status} ${JSON.stringify(response.body)}`);
};

try {
  await pool.query("SELECT 1 FROM push_subscriptions LIMIT 0");
  const { default: pushRouter } = await tsImport("../artifacts/api-server/src/routes/push.ts", import.meta.url);
  const { parseAuth, signTokenById } = await tsImport("../artifacts/api-server/src/middlewares/auth.ts", import.meta.url);
  ({ pool: appPool } = await tsImport("@workspace/db", import.meta.url));

  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use("/api", pushRouter);

  const addUser = async (label) => {
    const result = await pool.query(`
      INSERT INTO users(name,email,approval_status)
      VALUES($1,$2,'approved')
      RETURNING id, token_version
    `, [`Push fixture ${label}`, `push-${fixtureKey}-${label}@example.invalid`]);
    const user = result.rows[0];
    fixtureUsers.push(user.id);
    return { ...user, token: signTokenById(user.id, user.token_version) };
  };
  const owner = await addUser("owner");
  const foreignUser = await addUser("foreign");
  const api = (user) => ({
    post: (path) => request(app).post(`/api${path}`).set("Authorization", `Bearer ${user.token}`),
  });
  const snapshotProfile = async (userId) => {
    const result = await pool.query(
      "SELECT id, name, email, approval_status, token_version FROM users WHERE id = $1",
      [userId],
    );
    return result.rows[0];
  };
  const ownerProfileBefore = await snapshotProfile(owner.id);
  const foreignProfileBefore = await snapshotProfile(foreignUser.id);

  const endpointA = `https://push.invalid/${fixtureKey}/device-a`;
  const endpointB = `https://push.invalid/${fixtureKey}/device-b`;
  const foreignEndpoint = `https://push.invalid/${fixtureKey}/foreign-device`;
  const firstSubscription = {
    endpoint: endpointA,
    keys: { p256dh: "disposable-key-a", auth: "disposable-auth-a" },
  };
  const repeatedSubscription = {
    endpoint: endpointA,
    keys: { p256dh: "updated-disposable-key-a", auth: "updated-disposable-auth-a" },
  };
  const secondSubscription = {
    endpoint: endpointB,
    keys: { p256dh: "disposable-key-b", auth: "disposable-auth-b" },
  };
  const foreignSubscription = {
    endpoint: foreignEndpoint,
    keys: { p256dh: "foreign-disposable-key", auth: "foreign-disposable-auth" },
  };

  await pool.query(
    "INSERT INTO push_subscriptions(user_id,endpoint,subscription) VALUES($1,$2,$3::jsonb)",
    [foreignUser.id, foreignEndpoint, JSON.stringify(foreignSubscription)],
  );

  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: owner.id,
    subscription: firstSubscription,
  }), 200, "subscribe first device");
  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: owner.id,
    subscription: repeatedSubscription,
  }), 200, "repeat subscribe");
  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: owner.id,
    subscription: secondSubscription,
  }), 200, "subscribe second device");

  let ownerRows = await pool.query(
    "SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1 ORDER BY endpoint",
    [owner.id],
  );
  assert.equal(ownerRows.rowCount, 2, "repeat subscribe must update rather than duplicate the endpoint");
  assert.deepEqual(ownerRows.rows.find((row) => row.endpoint === endpointA)?.subscription, repeatedSubscription);
  assert.deepEqual(ownerRows.rows.find((row) => row.endpoint === endpointB)?.subscription, secondSubscription);

  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: owner.id,
    subscription: { keys: { p256dh: "missing-endpoint" } },
  }), 400, "subscribe without endpoint");
  expectStatus(await request(app).post("/api/push/subscribe").send({
    userId: owner.id,
    subscription: firstSubscription,
  }), 401, "no-auth subscribe");
  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: foreignUser.id,
    subscription: { ...firstSubscription, endpoint: foreignEndpoint },
  }), 403, "foreign user subscribe is forbidden");
  expectStatus(await api(owner).post("/push/unsubscribe").send({
    userId: foreignUser.id,
    endpoint: foreignEndpoint,
  }), 403, "foreign user unsubscribe is forbidden");

  const missingEndpointResponse = await api(owner).post("/push/unsubscribe").send({ userId: owner.id });
  expectStatus(missingEndpointResponse, 400, "unsubscribe without endpoint");
  ownerRows = await pool.query(
    "SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1 ORDER BY endpoint",
    [owner.id],
  );
  assert.equal(ownerRows.rowCount, 2, "missing endpoint must not remove all devices");
  const foreignRowsBeforeRemoval = await pool.query(
    "SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1",
    [foreignUser.id],
  );
  assert.deepEqual(foreignRowsBeforeRemoval.rows, [{
    endpoint: foreignEndpoint,
    subscription: foreignSubscription,
  }], "forbidden requests must leave the foreign user's device unchanged");

  expectStatus(await api(owner).post("/push/unsubscribe").send({
    userId: owner.id,
    endpoint: endpointA,
  }), 200, "unsubscribe one device");
  expectStatus(await api(owner).post("/push/unsubscribe").send({
    userId: owner.id,
    endpoint: endpointA,
  }), 200, "repeat unsubscribe is idempotent");
  ownerRows = await pool.query(
    "SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = $1",
    [owner.id],
  );
  assert.deepEqual(ownerRows.rows, [{ endpoint: endpointB, subscription: secondSubscription }],
    "per-device unsubscribe must preserve the other device");

  // One browser can switch accounts while an earlier notification is in
  // flight. A stale unsubscribe from the previous owner must not remove the
  // new owner's subscription at the same unique endpoint.
  expectStatus(await api(owner).post("/push/subscribe").send({
    userId: owner.id,
    subscription: firstSubscription,
  }), 200, "restore first device for account-switch check");
  expectStatus(await api(foreignUser).post("/push/subscribe").send({
    userId: foreignUser.id,
    subscription: firstSubscription,
  }), 200, "transfer endpoint to new authenticated owner");
  expectStatus(await api(owner).post("/push/unsubscribe").send({
    userId: owner.id,
    endpoint: endpointA,
  }), 200, "stale old-owner unsubscribe");
  const transferred = await pool.query(
    "SELECT user_id, subscription FROM push_subscriptions WHERE endpoint = $1",
    [endpointA],
  );
  assert.deepEqual(transferred.rows, [{
    user_id: foreignUser.id,
    subscription: firstSubscription,
  }], "stale old-owner unsubscribe must preserve the new owner's device");

  assert.deepEqual(await snapshotProfile(owner.id), ownerProfileBefore, "push operations must not mutate the owner's profile");
  assert.deepEqual(await snapshotProfile(foreignUser.id), foreignProfileBefore,
    "push operations must not mutate the foreign user's profile");
  console.log("Push subscription integration passed against the migrated database and actual API router.");
} finally {
  try {
    if (fixtureUsers.length) {
      await pool.query("DELETE FROM push_subscriptions WHERE user_id = ANY($1::int[])", [fixtureUsers]);
      await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [fixtureUsers]);
    }
  } finally {
    await pool.end();
    if (appPool && appPool !== pool) await appPool.end();
  }
}