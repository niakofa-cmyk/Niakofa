import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("V17.2.1 package contract", () => {
  it("preserves reactive Hub context through Community Spirals", () => {
    const component = read("artifacts/pay-it-forward/src/components/CommunitySpiralsTab.tsx");
    assert.match(component, /const \[location, setLocation\] = useLocation\(\)/);
    assert.match(component, /parseSpiralHubId/);
    assert.match(component, /spiralsDiscoveryPath\(\{ neighborhood: neighborhoodName, hubId/);
    assert.match(component, /spiralsDiscoveryPath\(\{ hubId/);
    assert.match(component, /Hub context/);
  });

  it("retries one transient civic completion failure and surfaces server errors", () => {
    const page = read("artifacts/pay-it-forward/src/pages/civic-needs.tsx");
    assert.match(page, /status >= 500/);
    assert.match(page, /Failed to complete \(HTTP \$\{res\.status\}\)/);
    assert.match(page, /data\.replayed/);
  });

  it("retains the unified product boundaries", () => {
    const messages = read("artifacts/pay-it-forward/src/pages/messages.tsx");
    const helpers = read("artifacts/pay-it-forward/src/lib/spirals.ts");
    const feed = read("artifacts/api-server/src/routes/community-hub-feed.ts");
    assert.match(messages, /MetaStyleDirectPane/);
    assert.match(messages, /Requests/);
    assert.match(messages, /Hubs/);
    assert.match(helpers, /communitySpiralsPath/);
    assert.match(feed, /community\/hubs\/:hubId\/feed/);
  });
});