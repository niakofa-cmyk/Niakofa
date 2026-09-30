import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/community-stories.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/community-stories.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0185_moment_accessibility_discovery.sql", import.meta.url);

describe("Moment discovery and accessibility contracts", () => {
  it("keeps discovery filters inside existing visibility and moderation checks", async () => {
    const [route, schema, migration] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(schemaPath, "utf8"),
      fs.readFile(migrationPath, "utf8"),
    ]);
    expect(route).toMatch(/search must be at most 100 printable characters/);
    expect(route).toMatch(/escapeMomentSearchTerm\(search\)/);
    expect(route).toMatch(/ILIKE \$\{searchPattern\} ESCAPE E'\\\\\\\\'/);
    expect(route).toMatch(/communityStoriesTable\.tags\} @> ARRAY\[\$\{rawTag\}\]::text\[\]/);
    expect(route).toMatch(/requestedAuthorId === null \? undefined : eq\(communityStoriesTable\.author_user_id, requestedAuthorId\)/);
    expect(route).toMatch(/hasDiscoveryFilter \? isNull\(communityStoriesTable\.exchange_listing_id\)/);
    expect(route).toMatch(/direct_message_blocks story_block/);
    expect(route).toMatch(/community_story_author_mutes story_mute/);
    expect(schema).toMatch(/tags: text\("tags"\)\.array\(\)/);
    expect(schema).toMatch(/community_stories_tags_gin_idx/);
    expect(migration).toMatch(/community_stories_caption_trgm_idx/);
  });

  it("persists bounded per-attachment alternative text and validated video captions", async () => {
    const [route, schema] = await Promise.all([
      fs.readFile(routePath, "utf8"),
      fs.readFile(schemaPath, "utf8"),
    ]);
    expect(route).toMatch(/media_accessibility: z\.array/);
    expect(route).toMatch(/alt_text: z\.string\(\)\.trim\(\)\.max\(250\)/);
    expect(route).toMatch(/validateMomentCaptionsVtt/);
    expect(route).toMatch(/captions_vtt: accessibilityByAssetId\.get\(asset\.id\)/);
    expect(route).toMatch(/captions_vtt: item\.captions_vtt/);
    expect(schema).toMatch(/alt_text: varchar\("alt_text", \{ length: 250 \}\)/);
    expect(schema).toMatch(/captions_vtt: text\("captions_vtt"\)/);
  });
});