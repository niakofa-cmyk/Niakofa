import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, route] = await Promise.all([
  readFile(
    new URL("../lib/db/migrations/0150_diaspora_hub_geography_reconcile.sql", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../artifacts/api-server/src/routes/griot.ts", import.meta.url), "utf8"),
]);

assert.match(migration, /DROP CONSTRAINT IF EXISTS diaspora_hubs_globe_geography_check/);
assert.match(migration, /status\s*<>\s*'approved'\s+OR\s+primary_hub_id IS NOT NULL/is);
assert.match(migration, /hub_scope\s*=\s*'country'[\s\S]*upper\(country_code\)\s*<>\s*'US'/i);
assert.match(migration, /hub_scope\s*=\s*'us_state'[\s\S]*upper\(country_code\)\s*=\s*'US'[\s\S]*subdivision_code IS NOT NULL/i);
assert.match(migration, /VALIDATE CONSTRAINT diaspora_hubs_globe_geography_check/);
assert.match(route, /import \{ ProposeHubSchema \} from "\.\.\/lib\/diasporaHubProposalSchema"/);
assert.match(route, /tag:\s*parsed\.data\.hub_scope === "us_state"/);
assert.match(route, /const geographyIsComplete\s*=/);
assert.match(route, /code === "23514"/);

console.log("Diaspora Hub geography reconciliation contract passed.");