import { buildWsOriginAllowlist, isWsOriginAllowed } from "../ws-origin";

describe("WebSocket origin policy", () => {
  test("keeps an unset development policy open", () => {
    expect(buildWsOriginAllowlist({ allowedOrigin: "", nodeEnv: "development" })).toBeNull();
  });

  test("adds the active Replit preview to a configured development policy", () => {
    const allowlist = buildWsOriginAllowlist({
      allowedOrigin: "https://niakofa.example",
      nodeEnv: "development",
      replitDevDomain: "preview.example.replit.dev/",
    });

    expect(isWsOriginAllowed("https://preview.example.replit.dev", allowlist)).toBe(true);
    expect(isWsOriginAllowed("https://niakofa.example/", allowlist)).toBe(true);
    expect(isWsOriginAllowed("https://untrusted.example", allowlist)).toBe(false);
  });

  test("does not widen production beyond configured origins", () => {
    const allowlist = buildWsOriginAllowlist({
      allowedOrigin: "https://niakofa.example",
      nodeEnv: "production",
      replitDevDomain: "preview.example.replit.dev",
    });

    expect(isWsOriginAllowed("https://niakofa.example", allowlist)).toBe(true);
    expect(isWsOriginAllowed("https://preview.example.replit.dev", allowlist)).toBe(false);
    expect(isWsOriginAllowed(undefined, allowlist)).toBe(false);
  });
});