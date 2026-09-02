import { jest, describe, it, expect, beforeEach, beforeAll } from "@jest/globals";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";

const db: Record<string, jest.Mock> = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  familyMembersTable: {
    id: "id",
    family_id: "family_id",
    user_id: "user_id",
    status: "status",
  },
}));

jest.unstable_mockModule("../middlewares/rate-limit", () => ({
  generalApiLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.unstable_mockModule("../lib/queue", () => ({
  getQueueConnection: () => null,
}));

let app: express.Express;
let resetTickets: () => void;
let signTokenById: (userId: number) => string;

beforeAll(async () => {
  const auth = await import("../middlewares/auth.js");
  signTokenById = auth.signTokenById;
  const { default: router, __resetLegacyLaunchTicketsForTests } = await import("../routes/legacy-launch.js");
  resetTickets = __resetLegacyLaunchTicketsForTests;
  app = express();
  app.use(express.json());
  app.use(auth.parseAuth);
  app.use("/api", router);
});

function authHeader(): string {
  return `Bearer ${signTokenById(42)}`;
}

beforeEach(() => {
  db.limit.mockReset();
  resetTickets();
});

describe("Legacy authenticated launch bridge", () => {
  it("issues a one-use ticket and returns only narrow live context", async () => {
    db.limit
      .mockResolvedValueOnce([{ id: 9001 }])
      .mockResolvedValueOnce([{ id: 17 }]);

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 9, characterId: "17", gameHour: 16 });

    console.error("launch issue debug", issue.status, issue.body, db.limit.mock.calls.length);
    expect(issue.status).toBe(201);
    expect(issue.body).toEqual({
      ticket: expect.any(String),
      expiresInSeconds: 60,
    });
    expect(issue.body.ticket).not.toContain("17");

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
    db.limit
      .mockResolvedValueOnce([{ id: 9001 }])
      .mockResolvedValueOnce([{ id: 17 }]);

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 9, characterId: "17" });

    const path = `/api/legacy/launch-context?ticket=${encodeURIComponent(issue.body.ticket)}`;
    expect((await request(app).get(path)).status).toBe(200);
    expect((await request(app).get(path)).status).toBe(410);
  });

  it("fails closed for a caller outside the requested family", async () => {
    db.limit.mockResolvedValueOnce([]);

    const issue = await request(app)
      .post("/api/legacy/launch-ticket")
      .set("Authorization", authHeader())
      .send({ familyId: 99, characterId: "17" });

    expect(issue.status).toBe(403);
    expect(issue.body).toEqual({ error: "You are not a member of this family" });
  });
});