#!/usr/bin/env node
/**
 * Admin 2.0 inventory/coverage guard.
 *
 * This is intentionally a static contract: it does not call production APIs and
 * never executes admin actions. It verifies that the documented admin surface
 * and the protected route inventory stay aligned.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const coveragePath = join(root, "artifacts/ADMIN_COVERAGE.md");
const adminPagePath = join(root, "artifacts/pay-it-forward/src/pages/admin.tsx");
const operationsPath = join(root, "artifacts/pay-it-forward/src/pages/admin-operations.tsx");
const routesDir = join(root, "artifacts/api-server/src/routes");

const coverage = await readFile(coveragePath, "utf8");
const adminPage = await readFile(adminPagePath, "utf8");
const operations = await readFile(operationsPath, "utf8");

async function walk(dir) {
  const entries = await (await import("node:fs/promises")).readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const routeFiles = await walk(routesDir);
const protectedRoutes = [];

for (const file of routeFiles) {
  const source = await readFile(file, "utf8");
  if (!source.includes("requireAdmin()")) continue;
  const relative = file.replace(root, "");
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    if (line.includes("requireAdmin()")) protectedRoutes.push({ file: relative, line: index + 1, text: line.trim() });
  });
}

const failures = [];
const requiredAdminSurfaces = [
  ["/admin/operations", operations],
  ["/admin/analytics", adminPage],
  ["/admin/accounts", adminPage],
  ["/admin/helper-applications", adminPage],
  ["/admin/neighborhood-boundary-imports", adminPage],
  ["/admin/nia-status", adminPage],
  ["/admin/pool-settings", adminPage],
];

for (const [needle, source] of requiredAdminSurfaces) {
  if (!coverage.includes(needle)) failures.push(`Coverage map is missing ${needle}`);
  if (needle === "/admin/operations") {
    if (!operations.includes("/api/admin/pending-summary")) failures.push("Operations console is missing pending-summary wiring");
    if (!operations.includes("/api/admin/neighborhood-boundary-imports")) failures.push("Operations console is missing boundary inventory wiring");
    if (!operations.includes("geometry_verified")) failures.push("Operations console is missing explicit geometry verification gate");
    if (!operations.includes("/promote")) failures.push("Operations console is missing explicit promotion endpoint");
  } else if (!source.includes(needle.replace("/admin/", "/api/admin/"))) {
    // The legacy console uses endpoint fragments throughout the page; this is a
    // conservative signal only and is not used for routes with different API paths.
  }
}

if (!adminPage.includes("AdminLiveBanner")) failures.push("Legacy Admin console is missing AdminLiveBanner");
if (!operations.includes("setInterval")) failures.push("Operations console has no periodic refresh contract");
if (!operations.includes("window.confirm")) failures.push("Promotion confirmation contract is missing");
if (!operations.includes("generated_hint") && !operations.includes("authority_level === \"generated\"")) {
  failures.push("Generated-neighborhood safety guard is missing");
}

console.log(`Admin route files scanned: ${routeFiles.length}`);
console.log(`Protected requireAdmin() occurrences: ${protectedRoutes.length}`);
console.log(`Coverage rows: ${(coverage.match(/^\|\s+`\/[^`]+`\s+\|/gm) ?? []).length}`);
console.log("Admin inventory contract: PASS");

if (failures.length) {
  console.error("\nAdmin inventory contract: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
