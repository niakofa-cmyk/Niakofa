import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyColorMode, COLOR_MODE_KEY, readColorMode } from "../color-mode.js";

const themeStyles = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
const profileStyles = readFileSync(new URL("../../pages/profile.css", import.meta.url), "utf8");
const profilePage = readFileSync(new URL("../../pages/profile.tsx", import.meta.url), "utf8");

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
    .sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

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

test("Profile text and filled accent controls meet readable contrast in both app themes", () => {
  assert.ok(contrastRatio("#006b7f", "#f8fafc") >= 4.5, "light Profile links need readable contrast");
  assert.ok(contrastRatio("#00cfff", "#08182b") >= 4.5, "dark Profile links need readable contrast");
  assert.ok(contrastRatio("#b4232f", "#ffffff") >= 4.5, "light destructive text needs readable contrast");
  assert.ok(contrastRatio("#ff7b80", "#0f243b") >= 4.5, "dark destructive text needs readable contrast");
  assert.ok(contrastRatio("#08182b", "#00cfff") >= 4.5, "navy text must remain readable on cyan actions");
  assert.ok(contrastRatio("#08182b", "#ff5a5f") >= 4.5, "navy text must remain readable on coral actions");

  assert.match(profileStyles, /--profile-link:\s*#006b7f/);
  assert.match(profileStyles, /\.dark \.nia-profile\s*\{[^}]*--profile-link:\s*#00cfff/s);
  assert.match(profileStyles, /html:not\(\.dark\) \.nia-profile \.text-destructive \{\s*color:\s*#b4232f;/);
  assert.match(profileStyles, /\.dark \.nia-profile \.text-destructive \{\s*color:\s*#ff7b80;/);
  assert.equal((themeStyles.match(/--accent-foreground:\s*213 69% 10%;/g) ?? []).length, 2);
  assert.equal((themeStyles.match(/--destructive-foreground:\s*213 69% 10%;/g) ?? []).length, 2);
  assert.match(profilePage, /data-testid="profile-appearance"/);
  assert.match(profilePage, /<ColorModeSwitch ariaLabel="Profile color mode" \/>/);
  assert.match(profilePage, /className="nia-profile__account-details space-y-3 p-4"/);
});