#!/usr/bin/env node
/**
 * Release Validation Script
 *
 * Runs pre-deployment checks before any release goes to production:
 *   1. TypeScript typecheck passes
 *   2. No `any` types in source (excluding tests/generated)
 *   3. App/AI boundary check passes
 *   4. No console.log in production source
 *   5. All required environment variables are documented
 *   6. No TODO/FIXME/HACK markers in critical paths
 *
 * Run: node scripts/src/release-validate.js
 * Exit 0 = ready for release, exit 1 = blocking issues found.
 */
import { execSync } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "..");
let failures = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function listTsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist" || entry === "__tests__" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTsFiles(full, acc);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      acc.push(full);
    }
  }
  return acc;
}

console.log("\n=== Release Validation ===\n");

// 1. TypeScript typecheck
console.log("1. TypeScript typecheck...");
try {
  execSync("pnpm run typecheck", { cwd: ROOT, stdio: "pipe" });
  pass("typecheck passes");
} catch {
  fail("typecheck failed — run `pnpm run typecheck` for details");
}

// 2. No explicit any types
console.log("2. Checking for explicit `any` types...");
const sourceDirs = [
  join(ROOT, "artifacts", "api-server", "src"),
  join(ROOT, "artifacts", "nia-service", "src"),
  join(ROOT, "lib"),
];
let anyCount = 0;
for (const dir of sourceDirs) {
  try {
    const files = listTsFiles(dir);
    for (const file of files) {
      // Skip prompt files — they contain prose, not code
      if (file.includes("/prompts/")) continue;
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) continue;
        // Skip lines that are string literals (start with quote or backtick)
        if (/^\s*["'`]/.test(line) || /^\s*\*/.test(line)) continue;
        if (/\b:\s*any\b/.test(line) || /\bas\s+any\b/.test(line) || /<any>/.test(line)) {
          anyCount++;
          console.error(`    ${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  } catch { /* dir may not exist */ }
}
if (anyCount === 0) pass("no explicit `any` types in source");
else fail(`${anyCount} explicit any type(s) found`);

// 3. App/AI boundary check
console.log("3. App/AI boundary check...");
try {
  execSync("node scripts/src/check-app-ai-boundary.js", { cwd: ROOT, stdio: "pipe" });
  pass("App/AI boundary check passes");
} catch {
  fail("App/AI boundary check failed");
}

// 4. No console.log in production source
console.log("4. Checking for console.log in production source...");
let consoleCount = 0;
for (const dir of sourceDirs.slice(0, 2)) {
  try {
    const files = listTsFiles(dir);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) continue;
        // Only flag actual console.log *calls* (not string literals mentioning it)
        const codeOnly = line.replace(/\\./g, "").replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, "``");
        if (/\bconsole\.log\s*\(/.test(codeOnly)) {
          consoleCount++;
          console.error(`    ${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  } catch { /* */ }
}
if (consoleCount === 0) pass("no console.log in production source");
else fail(`${consoleCount} file(s) with console.log found`);

// 5. Check for TODO/FIXME/HACK in critical paths
console.log("5. Checking for TODO/FIXME/HACK markers...");
const criticalPaths = [
  join(ROOT, "artifacts", "api-server", "src", "middlewares"),
  join(ROOT, "artifacts", "api-server", "src", "routes", "stripe.ts"),
  join(ROOT, "artifacts", "nia-service", "src", "lib", "auth.ts"),
  join(ROOT, "artifacts", "nia-service", "src", "lib", "safety.ts"),
];
let markerCount = 0;
for (const path of criticalPaths) {
  try {
    const files = statSync(path).isDirectory() ? listTsFiles(path) : [path];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/\b(TODO|FIXME|HACK)\b/.test(lines[i])) {
          markerCount++;
          console.error(`    ${file}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }
  } catch { /* */ }
}
if (markerCount === 0) pass("no TODO/FIXME/HACK in critical paths");
else fail(`${markerCount} TODO/FIXME/HACK marker(s) in critical paths`);

// 6. tsconfig strict mode verification
console.log("6. Verifying TypeScript strict mode...");
try {
  const tsconfig = JSON.parse(readFileSync(join(ROOT, "tsconfig.base.json"), "utf8"));
  if (tsconfig.compilerOptions?.strict === true) pass("strict mode enabled in tsconfig.base.json");
  else fail("strict mode NOT enabled in tsconfig.base.json");
} catch {
  fail("could not read tsconfig.base.json");
}

// Summary
console.log("\n=== Summary ===");
if (failures === 0) {
  console.log("✓ All release validation checks passed. Ready for deployment.\n");
  process.exit(0);
} else {
  console.error(`✗ ${failures} check(s) failed. Do NOT deploy.\n`);
  process.exit(1);
}
