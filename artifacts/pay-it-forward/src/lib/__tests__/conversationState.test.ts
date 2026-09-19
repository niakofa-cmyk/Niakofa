import test from "node:test";
import assert from "node:assert/strict";
import {
  applyConversationEvent,
  createConversationState,
  markConversationRead,
  shouldNotifyConversation,
} from "../conversationState";

test("conversation state suppresses duplicate realtime events", () => {
  const initial = createConversationState();
  const event = {
    type: "direct_message" as const,
    eventId: 44,
    conversationId: 8,
    kind: "direct" as const,
    senderId: 12,
    currentUserId: 7,
    body: "Hello",
    createdAt: "2026-09-19T10:00:00.000Z",
  };
  const first = applyConversationEvent(initial, event);
  const second = applyConversationEvent(first.state, event);

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, false);
  assert.equal(first.state.conversations["direct:8"]?.unreadCount, 1);
  assert.equal(second.state, first.state);
});

test("read transitions clear only the selected conversation", () => {
  let state = createConversationState();
  state = applyConversationEvent(state, {
    type: "direct_message",
    eventId: "a",
    conversationId: 1,
    kind: "direct",
    senderId: 2,
    currentUserId: 7,
  }).state;
  state = applyConversationEvent(state, {
    type: "direct_message",
    eventId: "b",
    conversationId: 2,
    kind: "direct",
    senderId: 3,
    currentUserId: 7,
  }).state;
  state = markConversationRead(state, "direct", 1);

  assert.equal(state.conversations["direct:1"]?.unreadCount, 0);
  assert.equal(state.conversations["direct:2"]?.unreadCount, 1);
});

test("notification policy only alerts for background messages from another user", () => {
  const base = {
    conversationKey: "direct:9",
    documentVisible: false,
    permission: "granted" as NotificationPermission,
    senderId: 12,
    currentUserId: 7,
  };
  assert.equal(shouldNotifyConversation(base), true);
  assert.equal(shouldNotifyConversation({ ...base, documentVisible: true }), false);
  assert.equal(shouldNotifyConversation({ ...base, activeKey: "direct:9" }), false);
  assert.equal(shouldNotifyConversation({ ...base, senderId: 7 }), false);
});