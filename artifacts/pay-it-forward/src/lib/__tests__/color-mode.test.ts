import assert from "node:assert/strict";
import test from "node:test";
import { applyColorMode, COLOR_MODE_KEY, readColorMode } from "../color-mode.js";

function withBrowserMocks(
  run: (state: {
    dark: { value: boolean };
    styles: Record<string, string>;
    stored: Map<string, string>;
    meta: { content: string; setAttribute: (name: string, value: string) => void };
  }) => void,
) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const stored = new Map<string, string>();
  const darkState = { value: false };
  const styles: Record<string, string> = {};
  const meta = {
    content: "",
    setAttribute(name: string, value: string) {
      if (name === "content") this.content = value;
    },
  };
  const mockDocument = {
    documentElement: {
      classList: {
        toggle(name: string, force?: boolean) {
          if (name === "dark") darkState.value = Boolean(force);
        },
      },
      style: styles,
    },
    querySelector: () => meta,
  } as unknown as Document;
  const mockStorage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  } as Storage;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: mockDocument,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: mockStorage,
  });

  try {
    run({ dark: darkState, styles, stored, meta });
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("mode changes update the root backdrop, inherited color, theme bar, and saved choice", () => {
  withBrowserMocks(({ dark, styles, stored, meta }) => {
    applyColorMode("light");
    assert.equal(dark.value, false);
    assert.equal(styles.colorScheme, "light");
    assert.equal(styles.background, "#f8fafc");
    assert.equal(styles.color, "#08182b");
    assert.equal(meta.content, "#f8fafc");
    assert.equal(stored.get(COLOR_MODE_KEY), "light");
    assert.equal(readColorMode(), "light");

    applyColorMode("dark");
    assert.equal(dark.value, true);
    assert.equal(styles.colorScheme, "dark");
    assert.equal(styles.background, "#08182b");
    assert.equal(styles.color, "#ffffff");
    assert.equal(meta.content, "#08182b");
    assert.equal(stored.get(COLOR_MODE_KEY), "dark");
    assert.equal(readColorMode(), "dark");
  });
});

test("a missing stored preference defaults to dark mode", () => {
  withBrowserMocks(() => {
    assert.equal(readColorMode(), "dark");
  });
});