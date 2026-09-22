import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { type Express } from "express";
import request from "supertest";

const query = jest.fn<
  (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number;
    rows: unknown[];
  }>
>();
const create = jest.fn<
  (params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
  }>
>();

jest.unstable_mockModule("../lib/db.js", () => ({
  pool: { query },
}));
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

let app: Express;

beforeAll(async () => {
  process.env.INTERNAL_SECRET = "checkin-test-secret";
  process.env.ANTHROPIC_API_KEY = "test-key";
  const { default: router } = await import("../routes/checkin.js");
  app = express();
  app.use(express.json());
  app.use(router);
});

beforeEach(() => {
  process.env.INTERNAL_SECRET = "checkin-test-secret";
  query.mockReset();
  create.mockReset();
});

const payload = {
  userId: 7,
  requestId: 42,
  requestTitle: "Help with groceries",
  category: "food",
  sessionId: "nia_checkin_42",
};

function post() {
  return request(app)
    .post("/checkin")
    .set("x-internal-secret", "checkin-test-secret")
    .send(payload);
}

describe("Nia check-in persistence boundary", () => {
  it("rejects a stale user before calling the provider", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const response = await post();

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "User not found" });
    expect(create).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      "SELECT 1 FROM users WHERE id = $1 LIMIT 1",
      [payload.userId],
    );
  });

  it("saves a check-in only when the user still exists", async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ "?column?": 1 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 99 }] });
    create.mockResolvedValueOnce({
      content: [{ type: "text", text: "How did it go?" }],
    });

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      userId: payload.userId,
      requestId: payload.requestId,
      nia_response: "How did it go?",
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[0]).toEqual(expect.stringContaining("FROM users"));
    expect(query.mock.calls[1]?.[1]).toEqual([
      payload.userId,
      payload.sessionId,
      payload.requestTitle,
      "How did it go?",
      false,
    ]);
  });
});