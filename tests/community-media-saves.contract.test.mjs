import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("private Community Media saves", () => {
  it("keeps saves private, unique, and attached to the existing media context", () => {
    const schema = read("lib/db/src/schema/community-media-saves.ts");
    const migration = read("lib/db/migrations/0158_community_media_saves.sql");

    assert.match(schema, /communityMediaSavesTable/);
    assert.match(schema, /references\(\(\) => usersTable\.id, \{ onDelete: "cascade" \}\)/);
    assert.match(schema, /references\(\(\) => hubCommunityPostMediaTable\.id, \{ onDelete: "cascade" \}\)/);
    assert.match(schema, /uniqueIndex\("community_media_saves_user_media_uidx"\)\.on\(table\.user_id, table\.media_id\)/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS community_media_saves/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS community_media_saves_user_media_uidx/);
    assert.match(migration, /ON DELETE CASCADE/);
  });

  it("rechecks approved Hub visibility for reads and mutations", () => {
    const route = read("artifacts/api-server/src/routes/community-hub-feed.ts");

    assert.match(route, /\/community\/hubs\/:hubId\/saved-media/);
    assert.match(route, /\/community\/media\/:mediaId\/save/);
    assert.match(route, /requireAuth, requireApproved, generalApiLimiter/);
    assert.match(route, /visibleCommunityMediaForViewer/);
    assert.match(route, /isApprovedHubMember\(userId, media\.hub_id\)/);
    assert.match(route, /communityMediaSavesTable\.user_id/);
    assert.match(route, /onConflictDoNothing\(\)/);
    assert.match(route, /private: true/);
  });

  it("exposes only the viewer's saved state and uses authenticated save calls", () => {
    const client = read("artifacts/pay-it-forward/src/lib/communityVisualDiscovery.ts");
    const view = read("artifacts/pay-it-forward/src/components/community/CommunityDiscoveryViews.tsx");
    const analytics = read("artifacts/pay-it-forward/src/lib/communityMediaAnalytics.ts");

    assert.match(client, /viewer_saved: boolean/);
    assert.match(client, /\/saved-media\?/);
    assert.match(client, /setCommunityMediaSaved/);
    assert.match(client, /headers: authHeaders\(\)/);
    assert.match(view, /savedOnly/);
    assert.match(view, /Save media for later/);
    assert.match(view, /item\.viewer_saved/);
    assert.match(analytics, /community_media_save_changed/);
    assert.doesNotMatch(analytics, /author_name|profile/);
  });
});