import assert from "node:assert/strict";
import test from "node:test";
import { serializeStorageState } from "./user-state-serialization.mjs";

const state = {
  cookies: [],
  origins: [{ origin: "https://example.test", localStorage: [{ name: "token", value: "x" }] }],
};

test("serializes storage state as compact JSON", () => {
  const serialized = serializeStorageState(state, 16 * 1024);

  assert.equal(serialized, JSON.stringify(state));
  assert.equal(Buffer.byteLength(serialized, "utf8"), Buffer.byteLength(JSON.stringify(state), "utf8"));
  assert.equal(serialized.includes("\n"), false);
});

test("enforces the configured byte limit before a state file can be written", () => {
  const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");

  assert.throws(
    () => serializeStorageState(state, String(bytes - 1)),
    new RegExp(`configured limit is ${bytes - 1} bytes`),
  );
  assert.equal(serializeStorageState(state, String(bytes)), JSON.stringify(state));
});

test("uses the 16 KiB default limit and rejects invalid limits", () => {
  const smallState = { value: "x".repeat(16 * 1024) };

  assert.throws(() => serializeStorageState(smallState, undefined), /configured limit is 16384 bytes/);
  assert.throws(() => serializeStorageState(state, "0"), /must be a positive whole number/);
  assert.throws(() => serializeStorageState(state, "not-a-number"), /must be a positive whole number/);
});
