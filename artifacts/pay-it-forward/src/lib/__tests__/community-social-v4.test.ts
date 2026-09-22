import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, "../../pages/community.tsx"), "utf8");

describe("Community Social V4 view boundaries", () => {
  test("Community routes delegate primary destinations to dedicated views", () => {
    assert.match(page, /<CommunityHomeView/);
    assert.match(page, /<CommunityPeopleView/);
    assert.match(page, /<CommunityHubsView/);
    assert.match(page, /<CommunityStoriesView/);
    assert.match(page, /<CommunityRequestsView/);
  });

  test("Community keeps feed and Requests implementations behind their boundaries", () => {
    assert.doesNotMatch(page, /<HubCommunityFeedPanel/);
    assert.doesNotMatch(page, /<RequestsCenter embedded/);
    assert.match(page, /CommunityMoreDirectory/);
    assert.match(page, /CommunitySpiralsTab/);
  });
});