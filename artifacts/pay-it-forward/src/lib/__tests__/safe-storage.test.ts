import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { safeStorage } from "../safeStorage";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

function installWindow(value: unknown) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("reads, writes, and removes local and session values independently", () => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const makeStorage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  installWindow({
    localStorage: makeStorage(local),
    sessionStorage: makeStorage(session),
  });

  assert.equal(safeStorage.local.setItem("token", "local-value"), true);
  assert.equal(safeStorage.session.setItem("token", "session-value"), true);
  assert.equal(safeStorage.local.getItem("token"), "local-value");
  assert.equal(safeStorage.session.getItem("token"), "session-value");
  assert.equal(safeStorage.local.removeItem("token"), true);
  assert.equal(safeStorage.local.getItem("token"), null);
  assert.equal(safeStorage.session.getItem("token"), "session-value");
});

test("returns safe fallbacks when browser storage is missing or inaccessible", () => {
  Reflect.deleteProperty(globalThis, "window");
  assert.equal(safeStorage.local.getItem("token"), null);
  assert.equal(safeStorage.local.setItem("token", "value"), false);
  assert.equal(safeStorage.session.removeItem("token"), false);

  installWindow({
    get localStorage(): never {
      throw new Error("storage denied");
    },
    sessionStorage: {
      getItem: () => {
        throw new Error("storage denied");
      },
      setItem: () => {
        throw new Error("storage denied");
      },
      removeItem: () => {
        throw new Error("storage denied");
      },
    },
  });
  assert.equal(safeStorage.local.getItem("token"), null);
  assert.equal(safeStorage.local.setItem("token", "value"), false);
  assert.equal(safeStorage.session.getItem("token"), null);
  assert.equal(safeStorage.session.setItem("token", "value"), false);
  assert.equal(safeStorage.session.removeItem("token"), false);
});
