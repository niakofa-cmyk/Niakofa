/**
 * WebRTC ICE servers endpoint tests.
 *
 * Verifies:
 *   - No token → 401
 *   - No TURN env vars configured → STUN-only response (never throws)
 *   - TURN env vars configured → returns a TURN entry whose credential is a
 *     valid HMAC-SHA1(secret, username) per coturn's static-auth-secret
 *     scheme, and whose embedded expiry is in the future
 *   - Multiple comma-separated TURN_URL values are all returned as an array
 */
import { createHmac } from "crypto";
import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";

jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  generalApiLimiter: (_req: unknown, _res: unknown, next: unknown) => next(),
}));

let mockAuthEnabled = true;
jest.unstable_mockModule("../middlewares/auth.js", () => ({
  requireAuth: (req: unknown, res: unknown, next: unknown) => {
    if (!mockAuthEnabled) return res.status(401).json({ error: "Unauthorized" });
    req.authenticatedUserId = 42;
    next();
  },
}));

let app: express.Express;

async function buildApp() {
  const { default: webrtcIceRouter } = await import("../routes/webrtc-ice.js");
  const a = express();
  a.use(express.json());
  a.use("/api", webrtcIceRouter);
  return a;
}

beforeEach(() => {
  mockAuthEnabled = true;
  delete process.env.TURN_URL;
  delete process.env.TURN_STATIC_AUTH_SECRET;
});

describe("GET /api/webrtc-ice-servers — Authentication", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuthEnabled = false;
    app = await buildApp();
    const res = await request(app).get("/api/webrtc-ice-servers");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/webrtc-ice-servers — no TURN configured", () => {
  it("returns STUN servers only, never throws", async () => {
    app = await buildApp();
    const res = await request(app).get("/api/webrtc-ice-servers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
    expect(res.body.iceServers.length).toBeGreaterThan(0);
    // None of the STUN-only entries should carry credentials.
    for (const server of res.body.iceServers) {
      expect(server.username).toBeUndefined();
      expect(server.credential).toBeUndefined();
      expect(String(server.urls)).toMatch(/^stun:/);
    }
  });
});

describe("GET /api/webrtc-ice-servers — TURN configured", () => {
  const secret = "test-shared-secret-do-not-use-in-prod";

  it("mints a TURN credential that matches coturn's static-auth-secret HMAC scheme", async () => {
    process.env.TURN_URL = "turn:turn.example.com:3478";
    process.env.TURN_STATIC_AUTH_SECRET = secret;
    app = await buildApp();

    const res = await request(app).get("/api/webrtc-ice-servers");
    expect(res.status).toBe(200);

    const turnEntry = res.body.iceServers.find((s: unknown) => String(s.urls).startsWith("turn:"));
    expect(turnEntry).toBeDefined();
    expect(turnEntry.username).toBeDefined();
    expect(turnEntry.credential).toBeDefined();

    // Recompute the HMAC the same way the server does and confirm it matches
    // — this is the actual cryptographic contract coturn will verify.
    const expected = createHmac("sha1", secret).update(turnEntry.username).digest("base64");
    expect(turnEntry.credential).toBe(expected);

    // Username must embed a future unix-epoch expiry as its first segment.
    const [expiryStr] = turnEntry.username.split(":");
    const expiry = Number(expiryStr);
    expect(Number.isInteger(expiry)).toBe(true);
    expect(expiry).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("returns an array of urls when TURN_URL has multiple comma-separated entries", async () => {
    process.env.TURN_URL = "turn:turn.example.com:3478,turns:turn.example.com:5349";
    process.env.TURN_STATIC_AUTH_SECRET = secret;
    app = await buildApp();

    const res = await request(app).get("/api/webrtc-ice-servers");
    const turnEntry = res.body.iceServers.find((s: unknown) => Array.isArray(s.urls));
    expect(turnEntry).toBeDefined();
    expect(turnEntry.urls).toEqual([
      "turn:turn.example.com:3478",
      "turns:turn.example.com:5349",
    ]);
  });

  it("mints a distinct credential per request (no reuse across users/sessions)", async () => {
    process.env.TURN_URL = "turn:turn.example.com:3478";
    process.env.TURN_STATIC_AUTH_SECRET = secret;
    app = await buildApp();

    const res1 = await request(app).get("/api/webrtc-ice-servers");
    const res2 = await request(app).get("/api/webrtc-ice-servers");
    const turn1 = res1.body.iceServers.find((s: unknown) => String(s.urls).startsWith("turn:"));
    const turn2 = res2.body.iceServers.find((s: unknown) => String(s.urls).startsWith("turn:"));
    expect(turn1.username).not.toBe(turn2.username);
    expect(turn1.credential).not.toBe(turn2.credential);
  });
});
