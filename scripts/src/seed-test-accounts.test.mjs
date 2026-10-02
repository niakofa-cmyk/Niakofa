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
    /account seeding requires explicit passwords for every test account/,
  );
  assert.match(
    result.stderr,
    /SEED_ADMIN_PASSWORD, SEED_HELPER_PASSWORD, SEED_USER_PASSWORD/,
  );
});

test("local seeding also refuses missing explicit passwords", () => {
  const env = { ...process.env };
  delete env.SEED_ADMIN_PASSWORD;
  delete env.SEED_HELPER_PASSWORD;
  delete env.SEED_USER_PASSWORD;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script],
    {
      encoding: "utf8",
      env: {
        ...env,
        DATABASE_URL: "postgres://localhost:5432/niakofa",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /account seeding requires explicit passwords for every test account/,
  );
});

test("single-account selection requires only its password and leaves other fixtures untouched", () => {
  const env = { ...process.env };
  delete env.SEED_ADMIN_PASSWORD;
  delete env.SEED_HELPER_PASSWORD;
  delete env.SEED_USER_PASSWORD;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script, "--only", "admin"],
    {
      encoding: "utf8",
      env: {
        ...env,
        DATABASE_URL: "postgres://127.0.0.1:1/niakofa",
        SEED_ADMIN_PASSWORD: "test-only-password",
      },
    },
  );

  // The invalid local port makes the script stop at its DB smoke test. Getting
  // that far proves that only the selected role's password was required.
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Selection: admin only; other fixtures will not be touched/);
  assert.match(result.stderr, /ERROR connecting to database:/);
  assert.doesNotMatch(result.stderr, /account seeding requires explicit passwords/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /test-only-password/);
});

test("single-account selection rejects unknown roles before connecting", () => {
  const env = { ...process.env };
  delete env.SEED_ADMIN_PASSWORD;
  delete env.SEED_HELPER_PASSWORD;
  delete env.SEED_USER_PASSWORD;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script, "--only", "all"],
    {
      encoding: "utf8",
      env: {
        ...env,
        DATABASE_URL: "postgres://127.0.0.1:1/niakofa",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--only expects one role: admin, helper, or user/);
  assert.doesNotMatch(result.stderr, /ERROR connecting to database:/);
});

test("production single-account selection requires only the selected role password", () => {
  const env = { ...process.env };
  delete env.SEED_ADMIN_PASSWORD;
  delete env.SEED_HELPER_PASSWORD;
  delete env.SEED_USER_PASSWORD;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script, "--only=helper", "--i-know-this-is-production"],
    {
      encoding: "utf8",
      env: {
        ...env,
        DATABASE_URL: "postgres://production.example.invalid:1/niakofa?connect_timeout=1",
        SEED_HELPER_PASSWORD: "test-only-password",
      },
    },
  );

  // Reaching the database smoke test proves the production guard and scoped
  // password check both passed with only the selected role's password set.
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Selection: helper only; other fixtures will not be touched/);
  assert.match(result.stderr, /ERROR connecting to database:/);
  assert.doesNotMatch(result.stderr, /account seeding requires explicit passwords/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /test-only-password/);
});

test("production guard explains the scoped password requirement", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx/esm", script, "--only", "admin"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgres://production.example.invalid/niakofa",
        SEED_ADMIN_PASSWORD: "test-only-password",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /set a unique SEED_\*_PASSWORD for each selected/);
  assert.match(result.stderr, /With --only, only that role's password is required/);
  assert.doesNotMatch(result.stderr, /all three SEED_\*_PASSWORD values/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /test-only-password/);
});
