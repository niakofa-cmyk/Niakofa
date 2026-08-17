import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  isLegacyPathname,
  normalizeLegacyPathname,
} from "../legacy-public-route";

const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const contextSource = readFileSync(
  fileURLToPath(new URL("../../lib/AppContext.tsx", import.meta.url)),
  "utf8",
);

describe("Legacy public route contract", () => {
  it("normalizes the entire Legacy tree case-insensitively", () => {
    expect(normalizeLegacyPathname("/legacy/Demo")).toBe("/legacy/demo");
    expect(normalizeLegacyPathname("/Legacy/START/")).toBe("/legacy/start");
    expect(normalizeLegacyPathname("/LEGACY/Map/Cape-Coast/")).toBe(
      "/legacy/map/cape-coast",
    );
    expect(isLegacyPathname("/LeGaCy/demo")).toBe(true);
    expect(isLegacyPathname("/community")).toBe(false);
  });

  it("leaves unrelated routes unchanged apart from trailing slash cleanup", () => {
    expect(normalizeLegacyPathname("/Community/")).toBe("/Community");
    expect(normalizeLegacyPathname("/")).toBe("/");
  });

  it("normalizes trailing slashes before matching the public demo", () => {
    expect(appSource).toContain(
      "const normalizedPathname = normalizeLegacyPathname(pathname);",
    );
    expect(appSource).toContain('if (normalizedPathname === "/legacy/demo")');
  });

  it("canonicalizes the visible URL without dropping query or hash state", () => {
    expect(appSource).toContain("window.history.replaceState");
    expect(appSource).toContain("window.location.search");
    expect(appSource).toContain("window.location.hash");
    expect(appSource).toContain(
      'window.dispatchEvent(new PopStateEvent("popstate"))',
    );
  });

  it("keeps the public demo branch ahead of the authenticated shell", () => {
    const publicDemoIndex = appSource.indexOf(
      'if (normalizedPathname === "/legacy/demo")',
    );
    const shellIndex = appSource.indexOf("<AppShell />");

    expect(publicDemoIndex).toBeGreaterThan(-1);
    expect(shellIndex).toBeGreaterThan(publicDemoIndex);
    expect(appSource.slice(publicDemoIndex, shellIndex)).toContain(
      "<LegacyDemoPage />",
    );
  });

  it("keeps AppContext from redirecting the public demo to login", () => {
    expect(contextSource).toContain('"/legacy/demo"');
    expect(contextSource).toContain("const NO_REDIRECT_PATHS = [");
  });
});