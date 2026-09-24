import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, "../../pages/map.tsx"), "utf8");
const panel = fs.readFileSync(path.join(__dirname, "../../components/CommunityTopPanel.tsx"), "utf8");
const list = fs.readFileSync(path.join(__dirname, "../../components/CommunityListView.tsx"), "utf8");
const marker = fs.readFileSync(path.join(__dirname, "../../components/CommunityRequestMarker.tsx"), "utf8");
const sheet = fs.readFileSync(path.join(__dirname, "../../components/CommunityRequestDetailSheet.tsx"), "utf8");

describe("Community map request flow", () => {
  test("community map surfaces nearby requests without helper-only gating", () => {
    assert.match(page, /const communityRequests = openRequestsAll/);
    assert.match(page, /!helperModeActive && communityRequests\.filter/);
    assert.match(page, /<CommunityRequestMarker request=\{r\}/);
  });

  test("panel and accessible list include neighbor request rows", () => {
    assert.match(panel, /requests: HelpRequest\[\]/);
    assert.match(panel, /Neighbor requests/);
    assert.match(panel, /setLocation\(`\/request\/\$\{request\.id\}\/view`\)/);
    assert.match(list, /kind: "request"/);
    assert.match(list, /Neighbor request/);
    assert.match(list, /setLocation\(`\/request\/\$\{request\.id\}\/view`\)/);
  });

  test("map selection stays privacy-safe and hands off to the canonical detail route", () => {
    assert.match(marker, /onSelect: \(request: HelpRequest\)/);
    assert.match(sheet, /setLocation\(`\/request\/\$\{request\.id\}\/view`\)/);
    assert.doesNotMatch(marker, /claimMutation|requester_address/i);
  });
});