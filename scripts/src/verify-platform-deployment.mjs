#!/usr/bin/env node

/**
 * Verify that production serves the Niakofa platform SPA rather than only
 * returning a successful HTML shell. Follow the built entry script and check
 * the public PWA metadata that the landing experience requires.
 *
 * The Legacy RPG is a separate repository and must not be a deployment gate
 * for the family/community platform.
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
  const route = await get("/");
  assert(route.response.ok, `/ returned HTTP ${route.response.status}`);
  assert(
    /text\/html/i.test(route.contentType) &&
      route.body.includes('<div id="root">') &&
      route.body.includes("<script"),
    "Production root did not return the Niakofa SPA entry document",
  );
  assert(
    route.body.includes("Niakofa") &&
      !route.body.includes("play Niakofa Legacy") &&
      !route.body.includes("Opening the living family archive"),
    "Production root still exposes stale Legacy RPG-only landing copy",
  );

  const entryMatch = route.body.match(/src="([^"]*\/assets\/index-[^"]+\.js)"/);
  assert(entryMatch, "Could not find the Vite entry script in production HTML");

  const entryPath = new URL(entryMatch[1], baseUrl).pathname;
  const entry = await get(entryPath);
  assert(
    entry.response.ok && /javascript|ecmascript/i.test(entry.contentType),
    `Entry script is not JavaScript: HTTP ${entry.response.status}, ${entry.contentType}`,
  );
  assert(entry.body.includes("Niakofa"), "Entry script is missing Niakofa app content");

  for (const path of ["/manifest.json", "/favicon.svg"]) {
    const asset = await get(path);
    assert(
      asset.response.ok,
      `${path} returned HTTP ${asset.response.status}`,
    );
  }

  const manifest = await get("/manifest.json");
  assert(
    /application\/json/i.test(manifest.contentType),
    `Manifest is not JSON: ${manifest.contentType}`,
  );
  let manifestData;
  try {
    manifestData = JSON.parse(manifest.body);
  } catch {
    throw new Error("Production manifest is not valid JSON");
  }
  assert(
    manifestData.name?.includes("Niakofa") &&
      manifestData.start_url &&
      manifestData.display === "standalone",
    "Manifest is missing the Niakofa installable-app contract",
  );

  process.stdout.write(
    `Niakofa platform deployment verified: ${baseUrl} (${entryPath})\n`,
  );
} catch (error) {
  console.error(`Niakofa platform deployment verification failed: ${error.message}`);
  process.exit(1);
}