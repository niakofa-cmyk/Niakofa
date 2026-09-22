import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("V12 direct-message schema and migration cover durable conversation safeguards", async () => {
  const schema = await source("lib/db/src/schema/direct-messages.ts");
  const migration = await source("lib/db/migrations/0144_direct_messages.sql");
  assert.match(schema, /directConversationsTable/);
  assert.match(schema, /directMessageBlocksTable/);
  assert.match(schema, /directMessageReportsTable/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS direct_conversations/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS direct_message_blocks/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS direct_message_reports/);
});

test("V12 direct routes require approved accounts and membership-scoped reads", async () => {
  const route = await source("artifacts/api-server/src/routes/direct-messages.ts");
  const wsHub = await source("artifacts/api-server/src/lib/ws-hub.ts");
  const wsClient = await source("artifacts/pay-it-forward/src/lib/wsClient.ts");
  const page = await source("artifacts/pay-it-forward/src/pages/messages.tsx");
  assert.match(route, /requireAuth, requireApproved/);
  assert.match(route, /isConversationMember/);
  assert.match(route, /DIRECT_MESSAGING_BLOCKED/);
  assert.match(route, /router\.post\("\/messages\/direct\/users\/:id\/block"/);
  assert.match(route, /router\.post\("\/messages\/direct\/conversations\/:conversationId\/report"/);
  assert.match(route, /sendToUsers\(\[senderId, recipientId\]/);
  assert.match(wsHub, /\| "direct_message"/);
  assert.match(wsClient, /\| "direct_message"/);
  assert.match(page, /event\.type !== "direct_message"/);
  assert.match(page, /event\.type === "ws_reconnected"/);
});

test("V12 canonical Messages surface preserves request and Hub entry points", async () => {
  const app = await source("artifacts/pay-it-forward/src/App.tsx");
  const page = await source("artifacts/pay-it-forward/src/pages/messages.tsx");
  const community = await source("artifacts/pay-it-forward/src/pages/community.tsx");
  const context = await source("artifacts/pay-it-forward/src/lib/diaspora/DiasporaHubContext.ts");
  assert.match(app, /Route path="\/messages" component=\{MessagesPage\}/);
  assert.match(app, /const DiasporaHubMessagesPage = MessagesPage/);
  assert.match(page, /\/api\/messages\/direct\/conversations/);
  assert.match(page, /\/api\/requests\?requester_id=/);
  assert.doesNotMatch(page, /navigate\(`\/diaspora\/messages/);
  assert.match(page, /messagesPath\("direct", \{ conversation: conversation\.id \}\)/);
  assert.match(page, /HubMessagesPanel/);
  assert.match(community, /CommunityMessageEntry/);
  assert.match(community, /Hub context/);
  assert.match(context, /`\/messages\?mode=hub&\$\{query\}`/);
});

test("V12 messaging reference preserves uploaded source hashes", async () => {
  const reference = await source("docs/reference/Niakofa_Diaspora_Community_V12_Unified_Messaging.md");
  assert.match(reference, /3517a8fa020c600b055216fd5488528b3bf331f2574512eea2d9727655fe3d56/);
  assert.match(reference, /d330c59bfa9d247f376bf220b8316bc86927a4e83cbb4d5c0717f09561627119/);
});