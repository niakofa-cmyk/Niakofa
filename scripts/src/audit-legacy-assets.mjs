#!/usr/bin/env node

/**
 * Block unresolved third-party/reference art from the shipped Legacy runtime.
 *
 * Reference bundles are allowed under docs/legacy-reference. The public app
 * must only serve reviewed/original assets and must not regain a raw generator,
 * RTP, Unity, or combat-reference path through a future copy or import.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const PUBLIC_ROOT = join(ROOT, "artifacts", "pay-it-forward", "public");
const SOURCE_ROOT = join(ROOT, "artifacts", "pay-it-forward", "src");

const blockedPublicDirectories = [
  "legacy-character-assets/tv",
  "legacy-rpg-assets/encounter",
  "legacy-rpg-assets/animations",
  "legacy-reference-docs/animation-reference/darkninja",
];

const blockedRuntimeReferences = [
  "/legacy-character-assets/tv/",
  "/legacy-rpg-assets/encounter/",
  "/legacy-rpg-assets/animations/",
  "/legacy-reference-docs/animation-reference/darkninja/",
  "niakofa-rpg-generator-v1",
];

function listFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) listFiles(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

const failures = [];

for (const directory of blockedPublicDirectories) {
  const absolute = join(PUBLIC_ROOT, directory);
  if (existsSync(absolute)) {
    failures.push(`blocked public asset directory exists: ${relative(ROOT, absolute)}`);
  }
}

for (const file of listFiles(SOURCE_ROOT)) {
  if (!/\.(?:ts|tsx|js|mjs|json)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const blocked of blockedRuntimeReferences) {
    if (content.includes(blocked)) {
      failures.push(`blocked runtime reference "${blocked}" in ${relative(ROOT, file)}`);
    }
  }
}

const catalogPath = join(PUBLIC_ROOT, "legacy-rpg-assets", "catalog.json");
if (existsSync(catalogPath)) {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  if (catalog.runtime !== "catalog-only" || catalog.assets?.length !== 0) {
    failures.push("legacy-rpg-assets/catalog.json promotes unresolved files into runtime");
  }
}

if (failures.length > 0) {
  console.error("Legacy asset provenance audit failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Legacy asset provenance audit passed: only reviewed/original runtime paths are shipped.");