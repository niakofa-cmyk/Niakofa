import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";

const root = new URL("../", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

const nav = await source("artifacts/pay-it-forward/src/lib/appNavItems.ts");
const app = await source("artifacts/pay-it-forward/src/App.tsx");
const gratitude = await source("artifacts/api-server/src/routes/gratitude.ts");
const community = await source("artifacts/pay-it-forward/src/pages/community.tsx");
const messageTabs = await source("artifacts/pay-it-forward/src/components/messages/MessageTypeTabs.tsx");
const hubPanel = await source("artifacts/pay-it-forward/src/components/messages/HubMessagesPanel.tsx");
const hubRoute = await source("artifacts/api-server/src/routes/diaspora-hub-messages.ts");

assert.match(nav, /href: "\/messages"/);
assert.match(nav, /l\.startsWith\("\/messages"\)/);
assert.match(app, /<Route path="\/diaspora\/messages" component=\{MessagesPage\} \/>/);
assert.match(gratitude, /req\.query\.hub_id/);
assert.match(gratitude, /diasporaHubsTable\.primary_hub_id/);
assert.match(gratitude, /usersTable\.diaspora_hub_id/);
assert.match(gratitude, /usersTable\.approval_status/);
assert.match(gratitude, /usersTable\.is_suspended/);
assert.match(community, /\/api\/gratitude/);
assert.match(community, /hub_id=/);
assert.match(community, /post\.diaspora_hub_id !== hubContextId/);
assert.match(community, /\.finally\(\(\) => \{\s+if \(!cancelled\) setDefaultHubResolved\(true\);/);
assert.match(community, /const effectiveHubId = hubContextId \?\? defaultHubId;/);
assert.match(community, /effectiveHubId === null/);
assert.match(community, /hub_id=\$\{encodeURIComponent\(String\(effectiveHubId\)\)\}/);
assert.match(messageTabs, /label: "Direct"/);
assert.match(messageTabs, /label: "Hubs"/);
assert.doesNotMatch(hubPanel, /Home Hub/);
assert.match(hubRoute, /Approved Hub membership is required to send a message as this Hub/);
assert.match(hubRoute, /target_membership_not_required: true/);

// eslint-disable-next-line no-console -- contract runners report a concise pass marker.
console.log("V14 contract checks passed.");