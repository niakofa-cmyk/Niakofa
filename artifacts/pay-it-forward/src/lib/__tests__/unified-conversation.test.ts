import test from "node:test";
import assert from "node:assert/strict";
import { directToUnified, hubToUnified, requestToUnified, sortUnified } from "../unifiedConversation";

test("direct rows preserve the peer and derive one unread conversation", () => {
  const item = directToUnified({
    id: 12,
    updated_at: "2026-09-18T10:00:00.000Z",
    other_user: { id: 9, name: "Amina Diallo", avatar_url: null },
    last_message: {
      body: "See you soon",
      sender_id: 9,
      created_at: "2026-09-18T10:05:00.000Z",
      read_at: null,
    },
  }, 7);

  assert.deepEqual(item, {
    key: "direct:12",
    kind: "direct",
    sourceId: 12,
    title: "Amina Diallo",
    avatarUrl: null,
    lastMessage: "See you soon",
    timestamp: "2026-09-18T10:05:00.000Z",
    unreadCount: 1,
    peerUserId: 9,
  });
});

test("request and Hub rows remain separate kinds in the frontend projection", () => {
  assert.equal(requestToUnified({ id: 4, title: "Grocery pickup", status: "open", requester_name: "Kwame" }).kind, "request");
  assert.equal(hubToUnified({
    id: 3,
    hub_a_name: "fort-worth",
    hub_a_display_name: "Fort Worth Hub",
    hub_b_name: "accra",
    hub_b_display_name: null,
    last_message: "Welcome",
    last_message_at: "2026-09-18T09:00:00.000Z",
  }).title, "Fort Worth Hub ↔ accra");
});

test("All projections sort newest first without changing source records", () => {
  const oldest = requestToUnified({ id: 1, title: "Old", status: "open", created_at: "2026-09-17T09:00:00.000Z" });
  const newest = hubToUnified({
    id: 2,
    hub_a_name: "a",
    hub_a_display_name: null,
    hub_b_name: "b",
    hub_b_display_name: null,
    last_message: "New",
    last_message_at: "2026-09-18T09:00:00.000Z",
  });
  const input = [oldest, newest];
  assert.deepEqual(sortUnified(input).map((item) => item.key), ["hub:2", "request:1"]);
  assert.deepEqual(input.map((item) => item.key), ["request:1", "hub:2"]);
});