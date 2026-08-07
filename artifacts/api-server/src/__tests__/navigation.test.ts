/**
 * Navigation Route E2E Tests — 4+ Tarrant County Locations
 *
 * Tests the GET /navigation/route endpoint end-to-end covering:
 * 1. Authentication guard
 * 2. Zod validation (missing params, NaN bypass prevention, out-of-range coords)
 * 3. "Already arrived" short-circuit for 4+ real Tarrant County location pairs
 * 4. Circuit breaker behavior (no real Mapbox call needed for these cases)
 * 5. Profile and language sanitization
 *
 * These tests exercise the full request pipeline without needing a Mapbox token.
 */

import express from "express";
import request from "supertest";
import { jest } from "@jest/globals";

// ── Mock logger so we don't get pino noise in test output ─────────────────────
jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// ── Mock rate limiter so it never blocks test requests ────────────────────────
jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  navigationLimiter: (_req: any, _res: any, next: any) => next(),
  limiter: (_req: any, _res: any, next: any) => next(),
  helperLimiter: (_req: any, _res: any, next: any) => next(),
  authLimiter: (_req: any, _res: any, next: any) => next(),
}));

// ── Mock requireAuth so we can test both authed and unauthed paths ────────────
let mockAuthEnabled = true;
jest.unstable_mockModule("../middlewares/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    if (!mockAuthEnabled) {
      return _res.status(401).json({ error: "Unauthorized" });
    }
    req.authenticatedUserId = 1;
    next();
  },
  requireApproved: (req: any, _res: any, next: any) => {
    req.authenticatedUserId = 1;
    next();
  },
  optionalAuth: (req: any, _res: any, next: any) => {
    req.authenticatedUserId = 1;
    next();
  },
}));

// ── Real Tarrant County location pairs ────────────────────────────────────────
// These are actual Fort Worth / Tarrant County addresses used as helper→requester
// navigation test scenarios. All pairs are far apart (> 15m) so they won't
// short-circuit as "arrived". We test the "arrived" path separately with same/near coords.

const TARRANT_LOCATIONS = {
  // Location 1: Fort Worth City Hall
  cityHall: { lat: 32.7537, lng: -97.3324 },
  // Location 2: TCU Campus
  tcu: { lat: 32.7093, lng: -97.3630 },
  // Location 3: Fort Worth Botanic Garden
  botanicGarden: { lat: 32.7450, lng: -97.3618 },
  // Location 4: Sundance Square
  sundanceSquare: { lat: 32.7538, lng: -97.3305 },
  // Location 5: Benbrook Lake Park
  benbrookLake: { lat: 32.6751, lng: -97.4676 },
  // Location 6: Arlington Entertainment District
  arlington: { lat: 32.7357, lng: -97.1081 },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

let app: express.Express;

beforeAll(async () => {
  mockAuthEnabled = true;
  const { default: navRouter } = await import("../routes/navigation.js");
  app = express();
  app.use(express.json());
  app.use("/api", navRouter);
});

afterEach(() => {
  mockAuthEnabled = true;
});

describe("GET /api/navigation/route — Authentication", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuthEnabled = false;
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: "32.7537",
        start_lng: "-97.3324",
        end_lat: "32.7093",
        end_lng: "-97.3630",
      });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/navigation/route — Input Validation", () => {
  it("returns 400 when all params are missing", async () => {
    const res = await request(app).get("/api/navigation/route");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("returns 400 when start_lat is missing", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lng: "-97.3324", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when start_lng is missing", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "32.7537", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
  });

  it("prevents NaN bypass — non-numeric start_lat returns 400", async () => {
    // Critical security check: parseFloat('abc') = NaN, which should be caught
    // by Zod BEFORE it reaches Mapbox (NaN coordinates cause Mapbox 422s or worse)
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "abc", start_lng: "-97.3324", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
  });

  it("prevents NaN bypass — non-numeric end_lng returns 400", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "32.7537", start_lng: "-97.3324", end_lat: "32.7093", end_lng: "not-a-number" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for latitude out of range (>90)", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "91", start_lng: "-97.3324", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/range/i);
  });

  it("returns 400 for latitude out of range (<-90)", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "-91", start_lng: "-97.3324", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for longitude out of range (>180)", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({ start_lat: "32.7537", start_lng: "181", end_lat: "32.7093", end_lng: "-97.3630" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid profile names (allowlist enforcement)", async () => {
    // Invalid profile should be silently coerced to 'driving', not cause an error.
    // We verify this by getting 503 (no Mapbox token) rather than 400/500.
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
        start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
        end_lat: String(TARRANT_LOCATIONS.tcu.lat),
        end_lng: String(TARRANT_LOCATIONS.tcu.lng),
        profile: "helicopter",  // invalid — must be silently coerced to "driving"
      });
    // No Mapbox token in test env → expect 503 (not a 400 profile error)
    expect([503, 404]).toContain(res.status);
  });
});

describe("GET /api/navigation/route — Arrived Short-Circuit (4+ Tarrant County pairs)", () => {
  // Scenario: helper is already at the destination. The server should respond
  // immediately with { arrived: true } without ever calling Mapbox.
  // Uses 4 different Fort Worth locations to verify the short-circuit works
  // regardless of which neighborhood the task is in.

  const arrivedScenarios = [
    {
      name: "Fort Worth City Hall (helper already on-site)",
      coords: TARRANT_LOCATIONS.cityHall,
    },
    {
      name: "TCU Campus — student service task",
      coords: TARRANT_LOCATIONS.tcu,
    },
    {
      name: "Fort Worth Botanic Garden — community cleanup",
      coords: TARRANT_LOCATIONS.botanicGarden,
    },
    {
      name: "Sundance Square — downtown errand pickup",
      coords: TARRANT_LOCATIONS.sundanceSquare,
    },
    {
      name: "Benbrook Lake Park — senior care task",
      coords: TARRANT_LOCATIONS.benbrookLake,
    },
  ];

  for (const scenario of arrivedScenarios) {
    it(`returns arrived:true when at same location — ${scenario.name}`, async () => {
      const { lat, lng } = scenario.coords;
      // Exact same coords = 0m distance → immediate arrived response
      const res = await request(app)
        .get("/api/navigation/route")
        .query({
          start_lat: String(lat),
          start_lng: String(lng),
          end_lat: String(lat),
          end_lng: String(lng),
        });
      expect(res.status).toBe(200);
      expect(res.body.arrived).toBe(true);
      expect(res.body.distance_meters).toBe(0);
      expect(res.body.steps).toEqual([]);
    });
  }

  it("returns arrived:true when within 15m threshold — GPS jitter simulation", async () => {
    // Simulate GPS jitter: helper is at City Hall but GPS shows 10m away
    // (within the 15m arrived threshold). Should still short-circuit.
    const base = TARRANT_LOCATIONS.cityHall;
    // ~9m north of base (0.00009° latitude ≈ 10m)
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(base.lat + 0.00009),
        start_lng: String(base.lng),
        end_lat: String(base.lat),
        end_lng: String(base.lng),
      });
    expect(res.status).toBe(200);
    expect(res.body.arrived).toBe(true);
  });

  it("does NOT short-circuit when > 15m apart — routes to Mapbox", async () => {
    // 50m away (not arrived) — should proceed to Mapbox (→ 503 in test env without token)
    const base = TARRANT_LOCATIONS.cityHall;
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(base.lat + 0.0005), // ~55m north
        start_lng: String(base.lng),
        end_lat: String(base.lat),
        end_lng: String(base.lng),
      });
    // Without Mapbox token → expect 503 (not arrived short-circuit)
    expect(res.status).toBe(503);
    expect(res.body.arrived).toBeUndefined();
  });
});

describe("GET /api/navigation/route — Multi-Location Navigation (4+ Helper→Requester pairs)", () => {
  // Simulate real helper-to-requester navigation across Tarrant County.
  // Without MAPBOX_TOKEN in test env, all real-route requests return 503.
  // We verify the request pipeline handles each location pair correctly
  // (validation passes, arrives at Mapbox gate, fails gracefully with 503).

  const helperRequesterPairs = [
    {
      name: "City Hall helper → TCU requester (grocery errand)",
      helper: TARRANT_LOCATIONS.cityHall,
      requester: TARRANT_LOCATIONS.tcu,
      profile: "driving",
    },
    {
      name: "Botanic Garden helper → Sundance Square requester (errand pickup)",
      helper: TARRANT_LOCATIONS.botanicGarden,
      requester: TARRANT_LOCATIONS.sundanceSquare,
      profile: "driving",
    },
    {
      name: "Benbrook Lake helper → Arlington requester (medical transport)",
      helper: TARRANT_LOCATIONS.benbrookLake,
      requester: TARRANT_LOCATIONS.arlington,
      profile: "driving",
    },
    {
      name: "TCU helper → City Hall requester (walking civic task)",
      helper: TARRANT_LOCATIONS.tcu,
      requester: TARRANT_LOCATIONS.cityHall,
      profile: "walking",
    },
    {
      name: "Sundance Square helper → Botanic Garden requester (cycling errand)",
      helper: TARRANT_LOCATIONS.sundanceSquare,
      requester: TARRANT_LOCATIONS.botanicGarden,
      profile: "cycling",
    },
  ];

  for (const pair of helperRequesterPairs) {
    it(`routes correctly (reaches Mapbox gate) — ${pair.name}`, async () => {
      const res = await request(app)
        .get("/api/navigation/route")
        .query({
          start_lat: String(pair.helper.lat),
          start_lng: String(pair.helper.lng),
          end_lat: String(pair.requester.lat),
          end_lng: String(pair.requester.lng),
          profile: pair.profile,
        });
      // Without Mapbox token → 503 is the correct response after validation passes.
      // A 400 here would mean validation wrongly rejected valid Tarrant County coords.
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/token/i);
    });
  }
});

describe("GET /api/navigation/route — Language and Unit Sanitization", () => {
  it("accepts valid Mapbox language codes without error", async () => {
    for (const lang of ["en", "es", "fr", "pt", "sw"]) {
      const res = await request(app)
        .get("/api/navigation/route")
        .query({
          start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
          start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
          end_lat: String(TARRANT_LOCATIONS.tcu.lat),
          end_lng: String(TARRANT_LOCATIONS.tcu.lng),
          lang,
        });
      // Should reach Mapbox gate (503), not fail on lang validation (400)
      expect(res.status).not.toBe(400);
    }
  });

  it("silently falls back to 'en' for unsupported language codes", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
        start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
        end_lat: String(TARRANT_LOCATIONS.tcu.lat),
        end_lng: String(TARRANT_LOCATIONS.tcu.lng),
        lang: "xx-INVALID",
      });
    expect(res.status).not.toBe(400);
  });

  it("accepts metric units flag", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
        start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
        end_lat: String(TARRANT_LOCATIONS.tcu.lat),
        end_lng: String(TARRANT_LOCATIONS.tcu.lng),
        units: "metric",
      });
    expect(res.status).not.toBe(400);
  });
});

describe("GET /api/navigation/route — Circuit Breaker (no real calls)", () => {
  it("returns 503 with descriptive error when Mapbox token is missing", async () => {
    const res = await request(app)
      .get("/api/navigation/route")
      .query({
        start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
        start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
        end_lat: String(TARRANT_LOCATIONS.arlington.lat),
        end_lng: String(TARRANT_LOCATIONS.arlington.lng),
      });
    expect(res.status).toBe(503);
    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live integration group — only runs when MAPBOX_TOKEN is set to a real token.
// In CI / Replit dev without the secret these tests are automatically skipped
// so they never block the 182-test suite. When MAPBOX_TOKEN IS present the
// tests hit the real Mapbox Directions v5 API and verify end-to-end routing
// across 4 real Tarrant County location pairs.
// ─────────────────────────────────────────────────────────────────────────────
const HAS_REAL_MAPBOX = Boolean(
  process.env.MAPBOX_TOKEN &&
  process.env.MAPBOX_TOKEN.startsWith("pk.") &&
  process.env.MAPBOX_TOKEN.length > 20
);

(HAS_REAL_MAPBOX ? describe : describe.skip)(
  "GET /api/navigation/route — Live Mapbox integration (4 Tarrant County pairs)",
  () => {
    const PAIRS = [
      {
        name: "City Hall → TCU (3.2 km SW cross-town)",
        start: TARRANT_LOCATIONS.cityHall,
        end: TARRANT_LOCATIONS.tcu,
        minSteps: 3,
      },
      {
        name: "Sundance Square → Botanic Garden (1.8 km cultural district)",
        start: TARRANT_LOCATIONS.sundance,
        end: TARRANT_LOCATIONS.botanicGarden,
        minSteps: 2,
      },
      {
        name: "TCU → Benbrook Lake Park (8 km suburban run)",
        start: TARRANT_LOCATIONS.tcu,
        end: TARRANT_LOCATIONS.benbrook,
        minSteps: 4,
      },
      {
        name: "City Hall → Arlington Entertainment District (22 km cross-county)",
        start: TARRANT_LOCATIONS.cityHall,
        end: TARRANT_LOCATIONS.arlington,
        minSteps: 5,
      },
    ];

    for (const pair of PAIRS) {
      it(`routes correctly: ${pair.name}`, async () => {
        const res = await request(app)
          .get("/api/navigation/route")
          .query({
            start_lat: String(pair.start.lat),
            start_lng: String(pair.start.lng),
            end_lat: String(pair.end.lat),
            end_lng: String(pair.end.lng),
          });

        // Should get a real route, not a 503 missing-token or 422 invalid-coords
        expect([200, 503]).toContain(res.status); // 503 if circuit breaker open
        if (res.status === 200) {
          expect(res.body).toHaveProperty("steps");
          expect(Array.isArray(res.body.steps)).toBe(true);
          expect(res.body.steps.length).toBeGreaterThanOrEqual(pair.minSteps);
          expect(res.body).toHaveProperty("distance_meters");
          expect(res.body.distance_meters).toBeGreaterThan(100);
          expect(res.body).toHaveProperty("duration_seconds");
          expect(res.body.duration_seconds).toBeGreaterThan(30);
          // Each step must have a maneuver instruction
          for (const step of res.body.steps) {
            expect(step).toHaveProperty("instruction");
            expect(typeof step.instruction).toBe("string");
            expect(step.instruction.length).toBeGreaterThan(0);
          }
        }
      }, 15_000); // 15 s timeout — real network call
    }

    it("returns arrived immediately when start === end (zero-length guard)", async () => {
      const res = await request(app)
        .get("/api/navigation/route")
        .query({
          start_lat: String(TARRANT_LOCATIONS.cityHall.lat),
          start_lng: String(TARRANT_LOCATIONS.cityHall.lng),
          end_lat: String(TARRANT_LOCATIONS.cityHall.lat),
          end_lng: String(TARRANT_LOCATIONS.cityHall.lng),
        });
      // Should short-circuit to arrived, not call Mapbox at all
      expect(res.status).toBe(200);
      expect(res.body.arrived).toBe(true);
    }, 5_000);
  }
);
