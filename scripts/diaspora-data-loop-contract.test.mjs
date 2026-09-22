import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const routePath = path.join(root, "artifacts/api-server/src/routes/diaspora-completion.ts");
const migrationPath = path.join(root, "lib/db/migrations/0119_diaspora_preserve_links.sql");
const schemaPath = path.join(root, "lib/db/src/schema/diaspora-preserve-links.ts");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("dashboard contract uses aggregate queries and bounded recent activity", () => {
  const source = read(routePath);
  assert.match(source, /router\.get\("\/diaspora\/dashboard"/);
  assert.match(source, /count\(\*\)::int/);
  assert.match(source, /stats_source: "aggregate"/);
  assert.match(source, /\.limit\(5\)/);
  assert.match(source, /familyMemoriesTable/);
  assert.match(source, /familyInterviewsTable/);
  assert.match(source, /familyMembersTable/);
  assert.match(source, /familyDnaProfilesTable/);
});

test("Preserve scan persists a digest without retaining raw QR payload", () => {
  const route = read(routePath);
  const migration = read(migrationPath);
  const schema = read(schemaPath);

  assert.match(route, /POST \/diaspora\/preserve\/scan|router\.post\("\/diaspora\/preserve\/scan"/);
  assert.match(route, /createHash\("sha256"\)\.update\(qrCode\)/);
  assert.match(route, /diasporaPreserveLinksTable/);
  assert.match(route, /scan_id/);
  assert.match(route, /persisted/);
  assert.doesNotMatch(migration, /qr_code\s+TEXT/i);
  assert.match(migration, /qr_digest\s+TEXT\s+NOT NULL/i);
  assert.match(schema, /qr_digest: text\("qr_digest"\)\.notNull\(\)/);
});

test("Preserve link contract validates family membership and memory ownership", () => {
  const source = read(routePath);
  assert.match(source, /router\.post\("\/diaspora\/preserve\/links\/:id"/);
  assert.match(source, /assertFamilyMember\(userId, familyId\)/);
  assert.match(source, /Memory does not belong to the selected Family Space/);
  assert.match(source, /Preserve scan not found/);
  assert.match(source, /linked_at: new Date\(\)/);
});

test("Preserve link schema has user, family, and memory foreign-key ownership", () => {
  const schema = read(schemaPath);
  assert.match(schema, /references\(\(\) => usersTable\.id/);
  assert.match(schema, /references\(\(\) => familiesTable\.id/);
  assert.match(schema, /references\(\(\) => familyMemoriesTable\.id/);
  assert.match(schema, /diaspora_preserve_links_user_memory_unique/);
});
