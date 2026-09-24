import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDurableRealtimeState,
  normalizeRealtimeEvent,
  rememberDurableEvent,
  unwrapUnifiedRealtimeEvent,
} from "../unifiedRealtime";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

test("normalizes nested Direct messages into the canonical message shape", () => {
  const event = normalizeRealtimeEvent({
    type: "direct_message",
    event_id: "00000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-19T10:00:00.000Z",
    payload: {
      conversation_id: 8,
      message: {
        id: 44,
        sender_id: 12,
        sender_name: "Amina",
        body: "Hello",
        created_at: "2026-09-19T10:00:00.000Z",
      },
    },
  });

  assert.equal(event?.event_type, "message.created");
  assert.equal(event?.conversation_kind, "direct");
  assert.equal(event?.conversation_id, 8);
  assert.equal(event?.actor_id, 12);
  assert.equal(event?.payload.body, "Hello");
  assert.equal(event?.payload.id, 44);
});

test("normalizes typing stop events without inventing a second event identity", () => {
  const event = normalizeRealtimeEvent({
    type: "typing",
    event_id: "00000000-0000-4000-8000-000000000002",
    payload: { request_id: 9, sender_id: 12, is_typing: false },
  });

  assert.equal(event?.event_type, "typing.stopped");
  assert.equal(event?.conversation_id, 9);
  assert.equal(event?.actor_id, 12);
});

test("normalizes helper lifecycle frames as durable request status changes", () => {
  const event = normalizeRealtimeEvent({
    type: "HELPER_ARRIVED",
    event_id: "00000000-0000-4000-8000-000000000003",
    payload: { id: 44, request_id: 9, status: "arrived", helper_id: 12 },
  });

  assert.equal(event?.event_type, "request.status_changed");
  assert.equal(event?.conversation_id, 9);
  assert.equal(event?.payload.status, "arrived");
});

test("unwraps replayed unified request events for legacy screen consumers", () => {
  const event = unwrapUnifiedRealtimeEvent({
    type: "unified_event",
    payload: {
      event_type: "request.status_changed",
      payload: { id: 9, status: "completed" },
    },
  });

  assert.equal(event?.eventType, "request.status_changed");
  assert.equal(event?.payload.id, 9);
  assert.equal(event?.payload.status, "completed");
});

test("durable cursor advances even when the event is already in the seen set", () => {
  const storage = createStorage();
  let state = loadDurableRealtimeState(7, storage);
  state = rememberDurableEvent(state, "first", 7, storage);
  state = rememberDurableEvent(state, "second", 7, storage);
  state = rememberDurableEvent(state, "first", 7, storage);

  assert.equal(state.cursor, "first");
  assert.deepEqual(state.seen, ["first", "second"]);
  assert.deepEqual(loadDurableRealtimeState(7, storage), state);
});