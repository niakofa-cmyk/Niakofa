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

  const demoMatch = entry.body.match(
    /assets\/(legacy-demo-(?!state(?:-|\.))[A-Za-z0-9_-]+\.js)/,
  );
  assert(demoMatch, "Entry script does not reference a Legacy demo chunk");

  const demo = await get(`/assets/${demoMatch[1]}`);
  assert(
    demo.response.ok && /javascript|ecmascript/i.test(demo.contentType),
    `Legacy demo chunk is not JavaScript: HTTP ${demo.response.status}, ${demo.contentType}`,
  );
  assert(
    demo.body.includes("House of Mensah"),
    "Legacy demo chunk is missing the House of Mensah experience",
  );

  const stateMatch = entry.body.match(/assets\/(legacy-demo-state-[A-Za-z0-9_-]+\.js)/);
  assert(stateMatch, "Entry script does not reference the Legacy demo state chunk");
  const state = await get(`/assets/${stateMatch[1]}`);
  assert(
    state.response.ok && /javascript|ecmascript/i.test(state.contentType),
    `Legacy demo state chunk is not JavaScript: HTTP ${state.response.status}, ${state.contentType}`,
  );
  assert(
    state.body.includes("niakofa:demo:v2"),
    "Legacy demo state chunk is missing its persistence contract",
  );

  const catalog = await get("/legacy-world-assets/catalog-original.json");
  assert(
    catalog.response.ok && /application\/json/i.test(catalog.contentType),
    `Original-art catalog is not JSON: HTTP ${catalog.response.status}, ${catalog.contentType}`,
  );

  let catalogData;
  try {
    catalogData = JSON.parse(catalog.body);
  } catch {
    throw new Error("Original-art catalog is not valid JSON");
  }

  const runtimeAssetPaths = [
    ...(Array.isArray(catalogData.runtimeAssets)
      ? catalogData.runtimeAssets.map((asset) => asset?.file)
      : []),
    ...(
      catalogData.worldTiles
      && typeof catalogData.worldTiles.path === "string"
      && Array.isArray(catalogData.worldTiles.tiles)
        ? catalogData.worldTiles.tiles.map(
            (tile) => `${catalogData.worldTiles.path}${tile}.png`,
          )
        : []
    ),
  ].filter((path) => typeof path === "string" && path.startsWith("/"));

  assert(
    runtimeAssetPaths.length > 0,
    "Original-art catalog did not document any runtime assets",
  );

  for (const assetPath of runtimeAssetPaths) {
    const asset = await get(assetPath);
    assert(
      asset.response.ok && /^image\/png\b/i.test(asset.contentType),
      `Original-art asset is not a served PNG: ${assetPath} (HTTP ${asset.response.status}, ${asset.contentType})`,
    );
  }

  const rpgCatalog = await get("/legacy-rpg-assets/catalog.json");
  assert(
    rpgCatalog.response.ok && /application\/json/i.test(rpgCatalog.contentType),
    `Curated RPG asset catalog is not JSON: HTTP ${rpgCatalog.response.status}, ${rpgCatalog.contentType}`,
  );

  let rpgCatalogData;
  try {
    rpgCatalogData = JSON.parse(rpgCatalog.body);
  } catch {
    throw new Error("Curated RPG asset catalog is not valid JSON");
  }

  assert(
    rpgCatalogData?.runtime === "catalog-only"
      && rpgCatalogData?.historicalEvidence === false
      && rpgCatalogData?.familyLikeness === "prohibited"
      && rpgCatalogData?.licenseStatus === "blocked-pending-provenance",
    "RPG asset catalog is missing its blocked reference-only safety boundary",
  );

  const curatedRpgAssets = Array.isArray(rpgCatalogData?.assets)
    ? rpgCatalogData.assets
    : [];
  assert(
    curatedRpgAssets.length === 0,
    `Blocked RPG asset catalog must not publish runtime files, found ${curatedRpgAssets.length}`,
  );

  const villageCatalog = await get("/legacy-village-assets/catalog.json");
  assert(
    villageCatalog.response.ok && /application\/json/i.test(villageCatalog.contentType),
    `Curated village asset catalog is not JSON: HTTP ${villageCatalog.response.status}, ${villageCatalog.contentType}`,
  );

  let villageCatalogData;
  try {
    villageCatalogData = JSON.parse(villageCatalog.body);
  } catch {
    throw new Error("Curated village asset catalog is not valid JSON");
  }

  assert(
    villageCatalogData?.runtime === "react-presentation-only"
      && villageCatalogData?.historicalEvidence === false
      && villageCatalogData?.familyLikeness === "prohibited"
      && villageCatalogData?.licenseStatus === "review-required",
    "Curated village asset catalog is missing its presentation-only safety boundary",
  );

  const curatedVillageAssets = Array.isArray(villageCatalogData?.assets)
    ? villageCatalogData.assets
    : [];
  assert(
    curatedVillageAssets.length === 11,
    `Curated village asset catalog must contain exactly eleven approved files, found ${curatedVillageAssets.length}`,
  );

  for (const asset of curatedVillageAssets) {
    assert(
      typeof asset?.file === "string"
        && asset.file.startsWith("/legacy-village-assets/")
        && asset.runtime === "approved"
        && asset.role !== "family-portrait",
      `Curated village asset has an unsafe runtime or identity declaration: ${asset?.file ?? "unknown"}`,
    );
    const servedAsset = await get(asset.file);
    assert(
      servedAsset.response.ok && /^image\/png\b/i.test(servedAsset.contentType),
      `Curated village asset is not a served PNG: ${asset.file} (HTTP ${servedAsset.response.status}, ${servedAsset.contentType})`,
    );
  }

  process.stdout.write(
    `Legacy demo deployment verified: ${baseUrl}/legacy/demo (${demoMatch[1]}); ${runtimeAssetPaths.length} original-art assets and ${curatedVillageAssets.length} village assets served\n`,
  );
} catch (error) {
  console.error(`Legacy demo deployment verification failed: ${error.message}`);
  process.exit(1);
}
