import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const contextSource = readFileSync(
  fileURLToPath(new URL("../../lib/AppContext.tsx", import.meta.url)),
  "utf8",
);

describe("Legacy public route contract", () => {
  it("normalizes trailing slashes before matching the public demo", () => {
    expect(appSource).toContain(
      'pathname.length > 1 ? pathname.replace(/\\/+$/, "") : pathname',
    );
    expect(appSource).toContain('if (normalizedPathname === "/legacy/demo")');
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
    expect(contextSource).toContain(
      "const NO_REDIRECT_PATHS = [",
    );
  });
});