import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  migration: "lib/db/migrations/0143_diaspora_hub_auto_membership.sql",
  userSchema: "lib/db/src/schema/users.ts",
  messagesRoute: "artifacts/api-server/src/routes/diaspora-hub-messages.ts",
  adminRoute: "artifacts/api-server/src/routes/admin-analytics.ts",
  globe: "artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx",
  messagesPage: "artifacts/pay-it-forward/src/pages/diaspora-hub-messages.tsx",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, "utf8")]))
);

assert.match(source.migration, /ADD COLUMN IF NOT EXISTS diaspora_hub_id INTEGER/);
assert.match(source.migration, /AFTER INSERT OR UPDATE OF approval_status, diaspora_hub_id ON users/);
assert.match(source.migration, /status IN \('requested', 'left'\)/);
assert.match(source.migration, /hub_memberships\.status/);
assert.match(source.migration, /suspended\/revoked membership is an explicit governance decision/);
assert.doesNotMatch(source.migration, /\b(lat|lng|location_updated_at)\b\s*(=|,|FROM)/i);

assert.match(source.userSchema, /diaspora_hub_id: integer\("diaspora_hub_id"\)/);
assert.match(source.messagesRoute, /approved_account_plus_canonical_home_hub_creates_member: true/);
assert.match(source.messagesRoute, /target_membership_not_required: true/);
assert.match(source.messagesRoute, /eq\(usersTable\.approval_status, "approved"\)/);
assert.match(source.adminRoute, /\/admin\/diaspora-home-hubs/);
assert.match(source.adminRoute, /\/admin\/accounts\/:id\/diaspora-home-hub/);
assert.match(source.globe, /approved canonical home Hub is automatic/);
assert.match(source.messagesPage, /Additional Hubs remain explicit memberships/);

console.log("Diaspora Hub V10 contract passed.");