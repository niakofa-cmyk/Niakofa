#!/usr/bin/env node

/**
 * Release-candidate smoke gate for the Niakofa platform.
 *
 * This intentionally uses the running artifact workflows instead of importing
 * app internals. It catches broken SPA serving, missing core routes, dead API
 * mounts, and accidentally unprotected user journeys without mutating data.
 *
 * Usage:
 *   node scripts/src/release-smoke.mjs
 *   NIAKOFA_WEB_URL=https://... NIAKOFA_API_URL=https://... node scripts/src/release-smoke.mjs
 */

const webUrl = (process.env.NIAKOFA_WEB_URL ?? "http://127.0.0.1:5000").replace(/\/+$/, "");
const apiUrl = (process.env.NIAKOFA_API_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
const timeoutMs = Number(process.env.NIAKOFA_SMOKE_TIMEOUT_MS ?? 5000);

const coreWebJourneys = [
  ["/", "map and request discovery"],
  ["/request/new", "request help"],
  ["/requests", "browse help requests"],
  ["/helper-dashboard", "helper dashboard"],
  ["/community", "community"],
  ["/audio-circles", "Circles"],
  ["/audio-circle/1", "Circle room"],
  ["/family/1", "Family Vault"],
  ["/diaspora/tree", "Family Tree"],
  ["/diaspora/family", "family spaces"],
  ["/nia", "Nia"],
  ["/wallet", "wallet"],
  ["/settings", "settings and notifications"],
];

const protectedApiJourneys = [
  ["/api/requests", "Mutual Aid requests"],
  ["/api/family/mine", "Family"],
  ["/api/audio-circles/followed", "Circles"],
  ["/api/audio-circle-sessions/1", "Circle session resync"],
  ["/api/webrtc-ice-servers", "WebRTC ICE credentials"],
  ["/api/nia/context", "Nia"],
  ["/api/wallet/cashout/history", "wallet"],
];

let failures = 0;

function pass(message) {
  console.log(`  ✓ ${message}`);
}

function fail(message) {
  console.error(`  ✗ ${message}`);
  failures += 1;
}

async function request(base, path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base}${path}`, {
      redirect: "follow",
      headers: { Accept: "text/html,application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkWeb() {
  console.log(`Web smoke: ${webUrl}`);
  for (const [path, label] of coreWebJourneys) {
    try {
      const response = await request(webUrl, path);
      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      if (!response.ok || !/text\/html/i.test(contentType) || !body.includes('<div id="root">')) {
        fail(`${label} (${path}) did not return the Niakofa SPA shell: HTTP ${response.status}`);
      } else {
        pass(`${label} (${path})`);
      }
    } catch (error) {
      fail(`${label} (${path}) request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function checkApi() {
  console.log(`API smoke: ${apiUrl}`);
  for (const [path, label] of [
    ["/api/version", "API version probe"],
    ["/api/push/vapid-public-key", "notifications public-key probe"],
  ]) {
    try {
      const response = await request(apiUrl, path);
      if (!response.ok) fail(`${label} (${path}) returned HTTP ${response.status}`);
      else pass(`${label} (${path})`);
    } catch (error) {
      fail(`${label} (${path}) request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [path, label] of protectedApiJourneys) {
    try {
      const response = await request(apiUrl, path);
      if (response.status !== 401) {
        fail(`${label} (${path}) expected unauthenticated HTTP 401, received ${response.status}`);
      } else {
        pass(`${label} (${path}) requires authentication`);
      }
    } catch (error) {
      fail(`${label} (${path}) request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

console.log("\n=== Niakofa Release Smoke ===\n");
await checkWeb();
await checkApi();

if (failures > 0) {
  console.error(`\nRelease smoke failed with ${failures} issue${failures === 1 ? "" : "s"}.`);
  process.exit(1);
}

console.log("\nRelease smoke passed: core SPA journeys and API boundaries are reachable.\n");