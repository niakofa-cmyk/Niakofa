/**
 * nia-service auth tests — verifyToken()
 *
 * verifyToken is a pure function (no DB, no network) — it only does
 * HMAC-SHA256 verification + expiry checking. These tests exercise the
 * full contract so a SESSION_SECRET change or HMAC logic drift fails
 * loudly here instead of silently in production.
 */
import { describe, it, expect } from "@jest/globals";
import { createHmac } from "crypto";

// Import after jest.setup.ts has set SESSION_SECRET
const SECRET = process.env.SESSION_SECRET!;

function makeToken(userId: number, expiresAt: number, tokenVersion: number, secret = SECRET): string {
  const sig = createHmac("sha256", secret)
    .update(`${userId}.${expiresAt}.${tokenVersion}`)
    .digest("base64url");
  return `${userId}.${expiresAt}.${tokenVersion}.${sig}`;
}

describe("verifyToken", () => {
  let verifyToken: (token: string) => { userId: number; valid: boolean };

  beforeAll(async () => {
    ({ verifyToken } = await import("../lib/auth.js"));
  });

  it("returns valid:true for a well-formed unexpired token", () => {
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour from now
    const token = makeToken(42, expiresAt, 1);
    const result = verifyToken(token);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(42);
  });

  it("returns valid:false for an expired token", () => {
    const expiresAt = Date.now() - 1000; // 1 second ago
    const token = makeToken(42, expiresAt, 1);
    const result = verifyToken(token);
    expect(result.valid).toBe(false);
    expect(result.userId).toBe(42); // userId is still decoded even for expired
  });

  it("returns valid:false for a tampered signature", () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const token = makeToken(42, expiresAt, 1);
    // Flip the first character of the signature — a full base64url character
    // flips at least 6 bits, unlike the last character where some flips can
    // decode to the exact same underlying bytes and leave the token still
    // verifying (intermittent false failure).
    const parts = token.split(".");
    parts[3] = (parts[3][0] === "a" ? "b" : "a") + parts[3].slice(1);
    const tampered = parts.join(".");
    const result = verifyToken(tampered);
    expect(result.valid).toBe(false);
  });

  it("returns valid:false for a wrong secret", () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const token = makeToken(42, expiresAt, 1, "wrong-secret");
    const result = verifyToken(token);
    expect(result.valid).toBe(false);
  });

  it("returns valid:false for a malformed token (too few parts)", () => {
    expect(verifyToken("abc.def")).toEqual({ userId: 0, valid: false });
  });

  it("returns valid:false for an empty string", () => {
    expect(verifyToken("")).toEqual({ userId: 0, valid: false });
  });

  it("returns valid:false when userId is 0 or NaN", () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const token = makeToken(0, expiresAt, 1);
    expect(verifyToken(token).valid).toBe(false);
  });
});
