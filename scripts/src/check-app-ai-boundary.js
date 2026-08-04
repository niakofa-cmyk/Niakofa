#!/usr/bin/env node
/**
 * Architectural Enforcement: App/AI Service Boundary Checker
 *
 * Ensures the Niakofa App (api-server) and Nia AI service (nia-service)
 * remain strictly separated:
 *
 * 1. api-server must NOT import from nia-service source files directly.
 *    Communication is HTTP-only via nia-proxy.
 * 2. nia-service must NOT import from api-server source files directly.
 * 3. nia-service must NOT import Drizzle ORM or @workspace/db — it uses raw pg.
 * 4. api-server must NOT import nia-service's raw pg pool or db.ts.
 * 5. Shared types must live in lib/, not be cross-imported between services.
 *
 * Run: node scripts/src/check-app-ai-boundary.js
 * Exit 0 = pass, exit 1 = violations found.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(import.meta.dirname, "..", "..");
const violations = [];

function listTsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTsFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

const apiServerFiles = listTsFiles(join(ROOT, "artifacts", "api-server", "src"));
const niaServiceFiles = listTsFiles(join(ROOT, "artifacts", "nia-service", "src"));

for (const file of apiServerFiles) {
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const lines = content.split("\n");
  // api-server must not import nia-service internals — only check import/from statements
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if ((trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.includes("require(")) && trimmed.includes("nia-service/src/")) {
      violations.push(`${rel}: imports from nia-service/src — use HTTP proxy instead`);
    }
  }
}

for (const file of niaServiceFiles) {
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
    if ((trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.includes("require(")) &&
        (trimmed.includes("api-server/src/") || trimmed.includes("@workspace/api-server"))) {
      violations.push(`${rel}: imports from api-server — nia-service is standalone`);
    }
    if ((trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.includes("require(")) &&
        (trimmed.includes("drizzle-orm") || trimmed.includes("@workspace/db"))) {
      violations.push(`${rel}: imports Drizzle/@workspace/db — nia-service uses raw pg only`);
    }
    if ((trimmed.startsWith("import ") || trimmed.startsWith("export ") || trimmed.includes("require(")) &&
        trimmed.includes("@workspace/trust-tiers")) {
      violations.push(`${rel}: imports @workspace/trust-tiers — trust tiers are an api-server concern`);
    }
  }
}

if (violations.length > 0) {
  console.error("ARCHITECTURAL BOUNDARY VIOLATIONS (App/AI separation):");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error(`\n${violations.length} violation(s) found.`);
  process.exit(1);
}

console.log("✓ App/AI boundary check passed — no cross-service imports detected.");
process.exit(0);
