import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Preserve pending scans have a migration-backed uniqueness invariant", () => {
  const schema = read("lib/db/src/schema/diaspora-preserve-links.ts");
  const migration = read("lib/db/migrations/0124_diaspora_preserve_scan_idempotency.sql");
  assert.match(schema, /diaspora_preserve_pending_user_qr_unique/);
  assert.match(schema, /t\.user_id, t\.qr_digest/);
  assert.match(schema, /t\.memory_id} IS NULL/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS diaspora_preserve_pending_user_qr_unique/);
});
