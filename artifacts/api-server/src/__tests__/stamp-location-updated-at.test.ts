import { jest, describe, it, expect, beforeAll } from "@jest/globals";

const dbUpdate = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db: { update: dbUpdate },
  usersTable: { id: "id", location_updated_at: "location_updated_at" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn((left: unknown, right: unknown) => ({ left, right })),
}));

type FakeResponse = {
  statusCode: number;
  json: jest.Mock;
  originalJson: jest.Mock;
};

let stampLocationUpdatedAt: (req: never, res: never, next: never) => void;

beforeAll(async () => {
  ({ stampLocationUpdatedAt } = await import("../middlewares/stamp-location-updated-at.js"));
});

function makeResponse(statusCode = 200): FakeResponse {
  const originalJson = jest.fn();
  return {
    statusCode,
    json: originalJson,
    originalJson,
  };
}

describe("stampLocationUpdatedAt", () => {
  it("passes through an atomically stamped location response without another database write", () => {
    const req = { method: "PATCH", url: "/users/7/location" };
    const res = makeResponse();
    const next = jest.fn();
    const body = { id: 7, lat: 32.75, lng: -97.33, location_updated_at: new Date().toISOString() };

    stampLocationUpdatedAt(req as never, res as never, next);
    res.json(body);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.originalJson).toHaveBeenCalledWith(body);
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("does not backfill failed responses", () => {
    const req = { method: "PATCH", url: "/users/7/location" };
    const res = makeResponse(404);
    const next = jest.fn();
    const body = { error: "User not found" };

    stampLocationUpdatedAt(req as never, res as never, next);
    res.json(body);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.originalJson).toHaveBeenCalledWith(body);
    expect(dbUpdate).not.toHaveBeenCalled();
  });
});