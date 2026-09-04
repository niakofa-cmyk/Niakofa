import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";

const getFamilyMembership = jest.fn();
const getFamilyCharacter = jest.fn();

jest.unstable_mockModule("../middlewares/rate-limit", () => ({
  generalApiLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

let app: express.Express;
let resetTickets: () => void;
let signTokenById: (userId: number) => string;

beforeAll(async () => {
  const auth = await import("../middlewares/auth.js");
  signTokenById = auth.signTokenById;
  const {
    createLegacyLaunchRouter,
    __resetLegacyLaunchTicketsForTests,
  } = await import("../routes/legacy-launch.js");
  resetTickets = __resetLegacyLaunchTicketsForTests;
  app = express();
  app.use(express.json());
  app.use(auth.parseAuth);
  app.use("/api", createLegacyLaunchRouter({
    getFamilyMembership,
    getFamilyCharacter,
  }));
});

function authHeader(): string {
  return `Bearer ${signTokenById(42)}`;
}

beforeEach(() => {
  getFamilyMembership.mockReset();
  getFamilyCharacter.mockReset();
  resetTickets();
});

describe("Legacy authenticated launch bridge", () => {
  it("issues a one-use ticket and returns only narrow live context", async () => {
    getFamilyMembership.mockResolvedValueOnce({ id: 9001 });
    getFamilyCharacter.mockResolvedValueOnce({ id: 17 });

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 9, characterId: "17", gameHour: 16 });

    expect(issue.status).toBe(201);
    expect(issue.body).toEqual({
      ticket: expect.any(String),
      expiresInSeconds: 60,
    });
    // The ticket is an opaque bearer credential. Validate its shape rather
    // than asserting that a random token never happens to contain "17".
    expect(issue.body.ticket).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(issue.body.ticket).not.toBe("17");

    const exchange = await request(app)
      .get(`/api/legacy/launch-context?ticket=${encodeURIComponent(issue.body.ticket)}`);

    expect(exchange.status).toBe(200);
    expect(exchange.body).toEqual({
      context: {
        mode: "live",
        familyId: "9",
        characterId: "17",
        gameHour: 16,
      },
    });
    expect(JSON.stringify(exchange.body)).not.toContain("sessionToken");
  });

  it("rejects replay of an exchanged ticket", async () => {
    getFamilyMembership.mockResolvedValueOnce({ id: 9001 });
    getFamilyCharacter.mockResolvedValueOnce({ id: 17 });

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 9, characterId: "17" });

    const path = `/api/legacy/launch-context?ticket=${encodeURIComponent(issue.body.ticket)}`;
    expect((await request(app).get(path)).status).toBe(200);
    expect((await request(app).get(path)).status).toBe(410);
  });

  it("fails closed for a caller outside the requested family", async () => {
    getFamilyMembership.mockResolvedValueOnce(undefined);

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 99, characterId: "17" });

    expect(issue.status).toBe(403);
    expect(issue.body).toEqual({ error: "You are not a member of this family" });
  });
});
