import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const serviceWorkerSource = readFileSync(
  new URL("../artifacts/pay-it-forward/public/sw.js", import.meta.url),
  "utf8",
);

function createHarness({ online = true, fetchImpl, putImpl } = {}) {
  const listeners = new Map();
  const warnings = [];
  const waitUntilPromises = [];
  const cachedResponse = { source: "cached" };
  const request = {
    url: "https://niakofa.test/assets/app.js",
    mode: "no-cors",
    headers: { get: () => null },
  };
  const caches = {
    match: async () => cachedResponse,
    open: async () => ({
      put: (...args) => (putImpl ? putImpl(...args) : Promise.resolve()),
    }),
  };
  const self = {
    location: { origin: "https://niakofa.test" },
    navigator: { onLine: online },
    addEventListener: (type, handler) => listeners.set(type, handler),
    clients: { claim: async () => undefined },
    registration: {},
    skipWaiting: async () => undefined,
  };
  const sandbox = {
    self,
    caches,
    fetch: fetchImpl ?? (() => Promise.resolve({ ok: true, status: 200 })),
    URL,
    Request,
    Error,
    console: {
      warn: (...args) => warnings.push(args),
    },
  };

  vm.runInNewContext(serviceWorkerSource, sandbox, { filename: "sw.js" });

  return {
    cachedResponse,
    warnings,
    dispatchFetch() {
      let responsePromise;
      listeners.get("fetch")({
        request,
        respondWith(response) {
          responsePromise = Promise.resolve(response);
        },
        waitUntil(promise) {
          waitUntilPromises.push(Promise.resolve(promise));
        },
      });
      return responsePromise;
    },
    waitUntilPromises,
  };
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("online refresh failures are reported without delaying the cached response or logging error text", async () => {
  let rejectRefresh;
  const refresh = new Promise((_, reject) => { rejectRefresh = reject; });
  const harness = createHarness({ fetchImpl: () => refresh });

  const response = await harness.dispatchFetch();
  assert.equal(response, harness.cachedResponse);
  assert.equal(harness.waitUntilPromises.length, 1, "the background refresh must extend the fetch event lifetime");

  rejectRefresh(new TypeError("private response body"));
  await harness.waitUntilPromises[0];
  await nextTurn();

  assert.deepEqual(harness.warnings, [
    ["[service-worker] Background asset refresh failed:", "TypeError"],
  ]);
  assert.doesNotMatch(JSON.stringify(harness.warnings), /private response body/);
});

test("online HTTP error responses are reported while the cached response remains available", async () => {
  const harness = createHarness({
    fetchImpl: () => Promise.resolve({ ok: false, status: 503, body: "private error body" }),
  });

  const response = await harness.dispatchFetch();
  await harness.waitUntilPromises[0];
  await nextTurn();

  assert.equal(response, harness.cachedResponse);
  assert.deepEqual(harness.warnings, [
    ["[service-worker] Background asset refresh returned a non-success response:", "HTTP 503"],
  ]);
  assert.doesNotMatch(JSON.stringify(harness.warnings), /private error body/);
});

test("offline refresh failures do not produce online-refresh warnings", async () => {
  const harness = createHarness({
    online: false,
    fetchImpl: () => Promise.reject(new TypeError("offline")),
  });

  const response = await harness.dispatchFetch();
  await harness.waitUntilPromises[0];
  await nextTurn();

  assert.equal(response, harness.cachedResponse);
  assert.deepEqual(harness.warnings, []);
});

test("cache write failures are reported without exposing provider error messages", async () => {
  const harness = createHarness({
    fetchImpl: () => Promise.resolve({ ok: true, status: 200 }),
    putImpl: () => Promise.reject(new Error("private cache failure text")),
  });

  const response = await harness.dispatchFetch();
  await harness.waitUntilPromises[0];
  await nextTurn();

  assert.equal(response, harness.cachedResponse);
  assert.deepEqual(harness.warnings, [
    ["[service-worker] Background asset refresh failed:", "Error"],
  ]);
  assert.doesNotMatch(JSON.stringify(harness.warnings), /private cache failure text/);
});
