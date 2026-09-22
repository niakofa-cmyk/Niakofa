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
const expectedCommit = process.env.NIAKOFA_EXPECT_COMMIT?.trim();
// Spirals are a production release surface, so LiveKit is required by default.
// An explicit false is retained for platform-only/local diagnostics; it must
// never be implicit.
const requireLiveKit = !/^(0|false|no)$/i.test(process.env.NIAKOFA_REQUIRE_LIVEKIT ?? "true");
// Community Pool payments are a launch-critical money-moving surface. An
// explicit false is retained for platform-only diagnostics, never implicitly.
const requirePayments = !/^(0|false|no)$/i.test(process.env.NIAKOFA_REQUIRE_PAYMENTS ?? "true");

const coreWebJourneys = [
  ["/", "map and request discovery"],
  ["/request/new", "request help"],
  ["/requests", "browse help requests"],
  ["/helper-dashboard", "helper dashboard"],
  ["/community", "community"],
  ["/audio-spirals", "Spirals"],
  ["/audio-spiral/1", "Spiral room"],
  ["/audio-circles", "legacy Circles route"],
  ["/audio-circle/1", "legacy Circle room route"],
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
  ["/api/audio-circles/followed", "Spirals"],
  ["/api/audio-circle-sessions/1", "Spiral session resync"],
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

async function requestJson(base, path) {
  const response = await request(base, path);
  const body = await response.json().catch(() => null);
  return { response, body };
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

  try {
    const { response, body } = await requestJson(apiUrl, "/api/healthz");
    if (!response.ok || body?.status !== "ok" || body?.db !== "connected") {
      fail(
        `deploy health probe (/api/healthz) is not healthy: HTTP ${response.status}, ` +
        `status=${String(body?.status ?? "unknown")}, db=${String(body?.db ?? "unknown")}`,
      );
    } else if (expectedCommit && body.commit !== expectedCommit) {
      fail(
        `deploy health probe served commit ${String(body.commit ?? "unknown")}; ` +
        `expected ${expectedCommit}`,
      );
    } else {
      pass(
        expectedCommit
          ? `deploy health probe is healthy and serves ${expectedCommit}`
          : "deploy health probe is healthy",
      );
    }
  } catch (error) {
    fail(`deploy health probe (/api/healthz) request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const { response, body } = await requestJson(apiUrl, "/api/civic/resources");
    if (
      !response.ok ||
      !Array.isArray(body?.resources) ||
      body?.place_name !== "location required" ||
      body?.match_level !== "fallback"
    ) {
      fail(
        `civic location guard (/api/civic/resources) returned an unsafe or invalid response: ` +
        `HTTP ${response.status}`,
      );
    } else {
      pass("civic location guard returns an explicit location-required response");
    }
  } catch (error) {
    fail(`civic location guard request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const response = await request(apiUrl, "/api/civic/resources?lat=91&lng=0");
    if (response.status !== 400) {
      fail(`civic coordinate validation expected HTTP 400, received ${response.status}`);
    } else {
      pass("civic coordinate validation rejects out-of-world coordinates");
    }
  } catch (error) {
    fail(`civic coordinate validation request failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const scopes = [
    requireLiveKit ? "circles" : null,
    requirePayments ? "payments" : null,
  ].filter(Boolean);
  const readinessPath = scopes.length > 0
    ? `/api/readiness?scope=${scopes.join(",")}`
    : "/api/readiness";
  try {
    const { response, body } = await requestJson(apiUrl, readinessPath);
    if (!response.ok || body?.ready !== true) {
      fail(
        `dependency readiness (${readinessPath}) is not ready: HTTP ${response.status}, ` +
        `status=${String(body?.status ?? "unknown")}`,
      );
    } else {
      pass(
        requireLiveKit
          ? `required database, schema, Spiral LiveKit${requirePayments ? ", and Stripe payment" : ""} configuration is ready`
          : requirePayments
            ? "required database, schema, and Stripe payment configuration are ready"
            : "required database and schema dependencies are ready",
      );
    }

    const livekit = body?.dependencies?.livekit;
    if (requireLiveKit && body?.dependencies?.livekit?.required !== true) {
      fail("Spiral readiness did not mark LiveKit as a required dependency");
    }
    if (livekit?.status === "ready") {
      pass("LiveKit media configuration is ready");
    } else if (requireLiveKit) {
      fail(`LiveKit media configuration is required but ${String(livekit?.detail ?? "unavailable")}`);
    } else {
      console.warn(
        `  ! LiveKit media configuration is not ready (${String(livekit?.detail ?? "not reported")}); ` +
        "this was an explicit platform-only smoke run.",
      );
    }

    if (requireLiveKit) {
      try {
        const { response: livekitResponse, body: livekitBody } =
          await requestJson(apiUrl, "/api/livekit-readiness");
        if (!livekitResponse.ok || livekitBody?.status !== "ready" ||
            livekitBody?.reachability !== "authenticated") {
          fail(
            `LiveKit server readiness is not authenticated: HTTP ${livekitResponse.status}, ` +
            `status=${String(livekitBody?.status ?? "unknown")}, ` +
            `reachability=${String(livekitBody?.reachability ?? "unknown")}`,
          );
        } else {
          pass("LiveKit server API is reachable with authenticated credentials");
        }
      } catch (error) {
        fail(`LiveKit server readiness request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const stripe = body?.dependencies?.stripe;
    if (requirePayments && body?.dependencies?.stripe?.required !== true) {
      fail("Payment readiness did not mark Stripe as a required dependency");
    }
    if (requirePayments && stripe?.status !== "ready") {
      fail(`Stripe payment configuration is required but ${String(stripe?.detail ?? "unavailable")}`);
    } else if (stripe?.status === "ready") {
      pass("Stripe payment configuration is ready");
    } else if (!requirePayments) {
      console.warn(
        `  ! Stripe payment configuration is not ready (${String(stripe?.detail ?? "not reported")}); ` +
        "this was an explicit platform-only smoke run.",
      );
    }
  } catch (error) {
    fail(`dependency readiness (${readinessPath}) request failed: ${error instanceof Error ? error.message : String(error)}`);
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