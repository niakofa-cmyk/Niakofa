import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromDb = createRequire(path.join(root, "lib/db/package.json"));
const { Pool } = requireFromDb("pg");
const adminUrl = process.env.FAMILY_STORY_TEST_ADMIN_DATABASE_URL;

function assertSafeAdminUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("FAMILY_STORY_TEST_ADMIN_DATABASE_URL must point to a local disposable PostgreSQL instance");
  }
  const url = new URL(rawUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const adminDatabases = new Set(["postgres", "test"]);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Family Story regression harness requires PostgreSQL");
  }
  if (!localHosts.has(url.hostname) || !adminDatabases.has(url.pathname.slice(1))) {
    throw new Error("Refusing database harness target: only localhost databases named postgres or test are allowed");
  }
  return url;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

const adminUrlObject = assertSafeAdminUrl(adminUrl);
const databaseName = `family_story_ci_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminPool = new Pool({ connectionString: adminUrl, ssl: false });
let created = false;

try {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const isolatedUrl = new URL(adminUrlObject);
  isolatedUrl.pathname = `/${databaseName}`;
  const testEnv = {
    ...process.env,
    DATABASE_URL: isolatedUrl.toString(),
    DATABASE_SSL: "false",
    FAMILY_STORY_RUNTIME_TEST_DATABASE_URL: isolatedUrl.toString(),
    FAMILY_STORY_RUNTIME_TEST: "1",
    SESSION_SECRET: "family-story-runtime-test-secret-only",
  };

  run(process.execPath, ["lib/db/scripts/run-migrations.mjs"], testEnv);
  run(process.execPath, [
    "artifacts/api-server/node_modules/jest/bin/jest.js",
    "--config",
    "artifacts/api-server/jest.config.mjs",
    "--runInBand",
    "artifacts/api-server/src/__tests__/family-story-runtime.integration.test.ts",
  ], testEnv);
} finally {
  if (created) {
    try {
      await adminPool.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
    } finally {
      await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    }
  }
  await adminPool.end();
}