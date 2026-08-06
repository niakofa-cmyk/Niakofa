#!/usr/bin/env node

/**
 * Verify that a built SPA can actually load the public Legacy demo.
 *
 * A successful HTML response is not enough: the SPA route can return
 * index.html while a hashed lazy chunk is missing or is accidentally
 * rewritten to HTML. Follow the manifest and assert that the demo module is
 * JavaScript and contains the public House of Mensah entry point.
 */

const baseUrl = (process.env.PRODUCTION_URL ?? "").replace(/\/+$/, "");

if (!baseUrl) {
  console.error("PRODUCTION_URL is required");
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    headers: { Accept: "*/*" },
  });
  return {
    response,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

try {
  const route = await get("/legacy/demo");
  assert(route.response.ok, `/legacy/demo returned HTTP ${route.response.status}`);
  assert(
    route.body.includes("/assets/") && route.body.includes("<script"),
    "/legacy/demo did not return the SPA entry document",
  );

  const trailingRoute = await get("/legacy/demo/");
  assert(
    trailingRoute.response.ok,
    `/legacy/demo/ returned HTTP ${trailingRoute.response.status}`,
  );

  const entryMatch = route.body.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/);
  assert(entryMatch, "Could not find the Vite entry script in the demo HTML");

  const entryPath = new URL(entryMatch[1], baseUrl).pathname;
  const entry = await get(entryPath);
  assert(
    entry.response.ok && /javascript|ecmascript/i.test(entry.contentType),
    `Entry script is not JavaScript: HTTP ${entry.response.status}, ${entry.contentType}`,
  );

  const demoMatch = entry.body.match(/assets\/(legacy-demo-[A-Za-z0-9_-]+\.js)/);
  assert(demoMatch, "Entry script does not reference a Legacy demo chunk");

  const demo = await get(`/assets/${demoMatch[1]}`);
  assert(
    demo.response.ok && /javascript|ecmascript/i.test(demo.contentType),
    `Legacy demo chunk is not JavaScript: HTTP ${demo.response.status}, ${demo.contentType}`,
  );
  assert(
    demo.body.includes("niakofa:demo:v2"),
    "Legacy demo chunk is missing its persistence contract",
  );
  assert(
    demo.body.includes("House of Mensah"),
    "Legacy demo chunk is missing the House of Mensah experience",
  );

  process.stdout.write(
    `Legacy demo deployment verified: ${baseUrl}/legacy/demo (${demoMatch[1]})\n`,
  );
} catch (error) {
  console.error(`Legacy demo deployment verification failed: ${error.message}`);
  process.exit(1);
}
