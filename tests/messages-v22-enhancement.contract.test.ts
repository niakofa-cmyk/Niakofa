import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

function read(path: string): string {
  return fs.readFileSync(root + path, "utf8");
}

test("Messages v22 durable unread state is wired", () => {
  const migration = read("lib/db/migrations/0147_message_read_states.sql");
  const summary = read("artifacts/api-server/src/routes/messages-unread-summary.ts");
  const context = read("artifacts/api-server/src/routes/messages-context.ts");
  assert.match(migration, /message_read_states/);
  assert.match(summary, /conversation_kind = 'request'/);
  assert.match(summary, /conversation_kind = 'hub'/);
  assert.match(context, /\/messages\/requests\/:requestId\/read/);
  assert.match(context, /\/messages\/hubs\/:conversationId\/read/);
});

test("Messages v22 has live Request map and Hub realtime", () => {
  const map = read("artifacts/pay-it-forward/src/components/messages/RequestLiveMapCard.tsx");
  const hub = read("artifacts/pay-it-forward/src/components/messages/HubMessagesPanel.tsx");
  const ws = read("artifacts/api-server/src/lib/ws-hub.ts");
  assert.match(map, /helper_location/);
  assert.match(map, /\/api\/navigation\/route/);
  assert.match(hub, /hub_message/);
  assert.match(ws, /"hub_message"/);
});

test("Messages v22 exposes a real shared media gallery", () => {
  const route = read("artifacts/api-server/src/routes/message-media.ts");
  const panel = read("artifacts/pay-it-forward/src/components/messages/SharedMediaPanel.tsx");
  assert.match(route, /\/messages\/direct\/:conversationId\/media/);
  assert.match(panel, /Photos/);
  assert.match(panel, /Files/);
  assert.match(panel, /fetch\(item.media_url/);
});

test("Messages v22 exposes authenticated Direct RTC", () => {
  const route = read("artifacts/api-server/src/routes/direct-call.ts");
  const panel = read("artifacts/pay-it-forward/src/components/messages/DirectCallPanel.tsx");
  const ws = read("artifacts/api-server/src/lib/ws-hub.ts");
  const membersSchema = read("lib/db/src/schema/direct-messages.ts");
  assert.match(route, /AccessToken/);
  assert.match(route, /directConversationMembersTable/);
  assert.match(membersSchema, /direct_conversation_members/);
  assert.match(panel, /createLocalTracks/);
  assert.match(panel, /room.connect/);
  assert.match(ws, /direct_call_invite/);
  assert.match(ws, /direct_call_accept/);
  assert.match(ws, /direct_call_end/);
});


test("Messages v23 has Messenger-style People + message search and global call listener", () => {
  const route = read("artifacts/api-server/src/routes/direct-messages.ts");
  const list = read("artifacts/pay-it-forward/src/components/messages/ConversationList.tsx");
  const page = read("artifacts/pay-it-forward/src/pages/messages.tsx");
  const panel = read("artifacts/pay-it-forward/src/components/messages/DirectCallPanel.tsx");
  assert.match(route, /\/messages\/direct\/search/);
  assert.match(route, /ilike\(directMessagesTable\.body/);
  assert.match(list, /People/);
  assert.match(list, /Messages/);
  assert.match(list, /MessageAvatar/);
  assert.match(page, /messageSearchResults/);
  assert.match(page, /listenGlobally/);
  assert.match(panel, /listenGlobally/);
  assert.match(panel, /resolvePeer/);
});
