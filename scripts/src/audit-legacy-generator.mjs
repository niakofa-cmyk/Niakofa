#!/usr/bin/env node

/**
 * Audit the uploaded RPG Maker generator without importing it into the app.
 * This deliberately reports inventory and dimensions only; runtime assets
 * must be promoted into the catalog explicitly after license review.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const archive = process.argv[2] ?? "docs/legacy-reference/uploaded-source/generator_1786371386883.zip";
if (!existsSync(archive)) {
  console.error(`Archive not found: ${archive}`);
  process.exit(1);
}

const listing = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
  .split("\n")
  .filter((entry) => entry.startsWith("generator/") && entry.endsWith(".png"));

const categories = new Map();
for (const entry of listing) {
  const parts = entry.split("/");
  const category = parts.length === 2 ? "gradients" : parts[1];
  categories.set(category, (categories.get(category) ?? 0) + 1);
}

const integrity = execFileSync("unzip", ["-t", archive], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
const counts = Object.fromEntries([...categories.entries()].sort(([a], [b]) => a.localeCompare(b)));

console.log(JSON.stringify({
  archive,
  sha256,
  pngCount: listing.length,
  categories: counts,
  integrity: /No errors detected/.test(integrity),
}, null, 2));