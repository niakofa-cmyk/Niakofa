import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => {
  const full = join(root, p);
  assert.ok(existsSync(full), `missing ${p}`);
  return readFileSync(full, "utf8");
};

describe("V17.1 package contract", () => {
  it("contains the enhanced Direct pane", () => {
    const pane = read("artifacts/pay-it-forward/src/components/messages/MetaStyleDirectPane.tsx");
    assert.match(pane, /Back to conversations/);
    assert.match(pane, /Submit report/);
    assert.match(pane, /safe-area-inset-bottom/);
    assert.match(pane, /event\.key === "Enter"/);
  });

  it("contains a canonical authenticated Hub feed", () => {
    const route = read("artifacts/api-server/src/routes/community-hub-feed.ts");
    assert.match(route, /\/community\/hubs\/:hubId\/feed/);
    assert.match(route, /requireAuth/);
    assert.match(route, /hubMembershipsTable/);
    assert.match(route, /isNull\(diasporaHubsTable\.primary_hub_id\)/);
    assert.match(route, /gratitudeCountRows/);
    assert.match(route, /requestCountRows/);
    assert.match(route, /membership_is_not_inferred_from_location/);
    assert.doesNotMatch(route, /\.catch\(\(\) => \[\]/);
  });

  it("contains the Hub Community panel and client contract", () => {
    const panel = read("artifacts/pay-it-forward/src/components/community/HubCommunityFeedPanel.tsx");
    const client = read("artifacts/pay-it-forward/src/lib/hubCommunityFeed.ts");
    assert.match(panel, /fetchHubCommunityFeed/);
    assert.match(panel, /communitySpiralsPath/);
    assert.match(client, /\/api\/community\/hubs/);
  });

  it("ships shared Hub-aware Spiral helpers", () => {
    const helpers = read("artifacts/pay-it-forward/src/lib/spirals.ts");
    assert.match(helpers, /spiralsDiscoveryPath/);
    assert.match(helpers, /communitySpiralsPath/);
    assert.match(helpers, /parseSpiralHubId/);
    assert.match(helpers, /audio-spirals/);
  });

  it("ships the real-device release gate", () => {
    const qa = read("docs/reference/niakofa-v17.1/DEVICE_QA.md");
    assert.match(qa, /Globe.*Hub.*Community/i);
    assert.match(qa, /Messages mobile/i);
    assert.match(qa, /Requests/i);
    assert.match(qa, /safe-area/i);
    assert.match(qa, /no double/i);
  });
});
