import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const storiesRoutePath = new URL("../routes/community-stories.ts", import.meta.url);
const storiesSchemaPath = new URL("../../../../lib/db/src/schema/community-stories.ts", import.meta.url);
const idempotencyMigrationPath = new URL(
  "../../../../lib/db/migrations/0179_community_story_publish_idempotency.sql",
  import.meta.url,
);

describe("media-less Community Story publication idempotency contract", () => {
  it("uses an optional UUID, owner-scoped unique key, bounded hash, and additive migration", async () => {
    const [route, schema, migration] = await Promise.all([
      fs.readFile(storiesRoutePath, "utf8"),
      fs.readFile(storiesSchemaPath, "utf8"),
      fs.readFile(idempotencyMigrationPath, "utf8"),
    ]);

    expect(route).toMatch(/client_publish_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
    expect(route).toMatch(/client_publish_id is not supported with inline Base64 Story media/);
    expect(route).toMatch(/eq\(communityStoriesTable\.author_user_id, userId\)[\s\S]*eq\(communityStoriesTable\.client_publish_id, parsed\.data\.client_publish_id\)/);
    expect(route).toMatch(/createHash\("sha256"\)/);
    expect(route).toMatch(/Object\.entries\(value\)\.sort\(\(\[left\], \[right\]\) => left\.localeCompare\(right\)\)/);
    expect(route).toMatch(/publish_payload_hash:\s*publishPayloadHash/);
    expect(schema).toMatch(/client_publish_id: varchar\("client_publish_id", \{ length: 36 \}\)/);
    expect(schema).toMatch(/publish_payload_hash: varchar\("publish_payload_hash", \{ length: 64 \}\)/);
    expect(schema).toMatch(/uniqueIndex\("community_stories_author_client_publish_uidx"\)[\s\S]*?\.on\(table\.author_user_id, table\.client_publish_id\)[\s\S]*?\.where\(sql`.*IS NOT NULL`\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS client_publish_id varchar\(36\)/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS publish_payload_hash varchar\(64\)/i);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS[\s\S]*ON community_stories \(author_user_id, client_publish_id\)[\s\S]*WHERE client_publish_id IS NOT NULL/i);
  });

  it("returns the prior result for an identical retry, conflicts on changed input, and resolves concurrent inserts", async () => {
    const route = await fs.readFile(storiesRoutePath, "utf8");

    expect(route).toMatch(/existing\.publish_payload_hash !== publishPayloadHash/);
    expect(route).toMatch(/res\.status\(409\)\.json\(\{ error: "client_publish_id was already used with different Story content or context\."/);
    expect(route).toMatch(/return res\.status\(200\)\.json\(\{\s*story: \{ id: existing\.id, status: existing\.status, expires_at: existing\.expires_at\.toISOString\(\) \}/);
    expect(route).toMatch(/databaseError\.code === "23505"/);
    expect(route).toMatch(/communityId: viewer\?\.community_id \?\? null/);
    expect(route).toMatch(/reply_enabled: payload\.replyEnabled/);
    expect(route).toMatch(/composition_manifest: payload\.compositionManifest/);
  });

  it("supports durable staged-media retries with ordered asset ids, while rejecting legacy inline media", async () => {
    const route = await fs.readFile(storiesRoutePath, "utf8");

    expect(route).toMatch(/media_asset_ids: payload\.mediaAssetIds/);
    expect(route).toMatch(/mediaAssetIds,\s*mediaEdits,\s*\}\)\s*\n\s*: null/);
    expect(route).toMatch(/parsed\.data\.client_publish_id && parsed\.data\.media\.length/);
    expect(route).not.toMatch(/client_publish_id && \(parsed\.data\.media\.length \|\| mediaAssetIds\.length\)/);
    expect(route).toMatch(/if \(parsed\.data\.media\.length \|\| existing\.publish_payload_hash !== publishPayloadHash\)/);
    expect(route).toMatch(/if \(result\.kind === "media_not_found"\) \{[\s\S]*?eq\(communityStoriesTable\.client_publish_id, parsed\.data\.client_publish_id\)[\s\S]*?return res\.status\(200\)/);
    expect(route).toMatch(/parsed\.data\.client_publish_id && databaseError\.code === "23505"/);
  });

  it("bounds persisted drawing strokes and validates normalized coordinates and style", async () => {
    const route = await fs.readFile(storiesRoutePath, "utf8");

    expect(route).toMatch(/if \(element\.type !== "drawing"\) return/);
    expect(route).toMatch(/points\.length < 2 \|\| points\.length > 1000/);
    expect(route).toMatch(/coordinate >= 0 && coordinate <= 100/);
    expect(route).toMatch(/Drawing color must be a six-digit hex color/);
    expect(route).toMatch(/Drawing width must be between 1 and 12/);
  });
});