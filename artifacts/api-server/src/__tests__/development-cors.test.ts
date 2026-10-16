import { describe, expect, it } from "@jest/globals";
import { isDevelopmentCorsOrigin } from "../lib/development-cors";

const environment = {
  NODE_ENV: "development",
  REPLIT_DEV_DOMAIN: "this-workspace.replit.dev",
  REPLIT_DOMAINS: "this-workspace.replit.dev, second-preview.replit.dev",
};

describe("development preview CORS", () => {
  it("allows only exact runtime-assigned HTTPS preview origins", () => {
    expect(isDevelopmentCorsOrigin("https://this-workspace.replit.dev", environment)).toBe(true);
    expect(isDevelopmentCorsOrigin("https://second-preview.replit.dev", environment)).toBe(true);
    for (const origin of [
      "https://other-workspace.replit.dev",
      "https://this-workspace.replit.dev.evil.test",
      "https://this-workspace.replit.dev:444",
      "https://this-workspace.replit.dev/path",
      "http://this-workspace.replit.dev",
      "null",
    ]) expect(isDevelopmentCorsOrigin(origin, environment)).toBe(false);
  });

  it("retains local development tools without granting any production bypass", () => {
    for (const origin of ["http://localhost:18848", "http://127.0.0.1:8080", "http://[::1]:3000"]) {
      expect(isDevelopmentCorsOrigin(origin, environment)).toBe(true);
      expect(isDevelopmentCorsOrigin(origin, { ...environment, NODE_ENV: "production" })).toBe(false);
    }
    expect(isDevelopmentCorsOrigin("https://this-workspace.replit.dev", {
      ...environment, NODE_ENV: "production",
    })).toBe(false);
    expect(isDevelopmentCorsOrigin("https://other-workspace.replit.dev", {
      NODE_ENV: "development",
    })).toBe(false);
  });
});
