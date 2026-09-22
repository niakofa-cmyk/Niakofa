import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("V13 keeps Hub conversations inside the canonical Messages surface", async () => {
  const page = await source("artifacts/pay-it-forward/src/pages/messages.tsx");
  const panel = await source("artifacts/pay-it-forward/src/components/messages/HubMessagesPanel.tsx");
  const app = await source("artifacts/pay-it-forward/src/App.tsx");

  assert.match(page, /HubMessagesPanel/);
  assert.match(page, /messagesPath\("hub", \{ conversation: conversation\.id \}\)/);
  assert.match(page, /initialSourceHub=\{hubContext\.sourceHub\}/);
  assert.match(panel, /\/api\/diaspora\/hub-messages\/options/);
  assert.match(panel, /\/api\/diaspora\/hub-messages\/conversations\/\$\{selectedId\}\/messages/);
  assert.match(panel, /messagesPath\("hub", \{ sourceHub: sourceId, targetHub: targetId, conversation: id \}\)/);
  assert.match(app, /const DiasporaHubMessagesPage = MessagesPage/);
});

test("V13 Globe-to-Community context remains explicit as V14 adds feed filtering", async () => {
  const community = await source("artifacts/pay-it-forward/src/pages/community.tsx");
  const globe = await source("artifacts/pay-it-forward/src/components/diaspora/DiasporaGlobeFirst.tsx");
  const reference = await source("docs/reference/Niakofa_Diaspora_Community_V13_Unified_Context_Hardening.md");

  assert.match(globe, /navigate\(`\/community\?hubId=\$\{selectedHub\.id\}`\)/);
  assert.match(community, /Selected Diaspora Hub #\{hubContextId\}/);
  assert.match(community, /Showing approved gratitude from people assigned to this Hub/);
  assert.match(community, /hub_id=/);
  assert.match(reference, /efc2159e24ce8db1f5a08f3adf6718fb6a3f2a0ea64acaa749cdd7c5fbf07e4b/);
});