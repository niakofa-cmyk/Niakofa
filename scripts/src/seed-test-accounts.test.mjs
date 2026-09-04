import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script = resolve("src/seed-test-accounts.ts");

test("non-local seeding refuses missing explicit passwords", () => {
  const env = { ...process.env };
  delete env.SEED_ADMIN_PASSWORD;
  delete env.SEED_HELPER_PASSWORD;
  delete env.SEED_USER_PASSWORD;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script, "--i-know-this-is-production"],
    {
      encoding: "utf8",
      env: {
        ...env,
        DATABASE_URL: "postgres://production.example.invalid/niakofa",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /non-local account seeding requires explicit passwords/,
  );
  assert.match(
    result.stderr,
    /SEED_ADMIN_PASSWORD, SEED_HELPER_PASSWORD, SEED_USER_PASSWORD/,
  );
});
