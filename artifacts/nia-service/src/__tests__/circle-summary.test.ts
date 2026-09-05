import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { type Express } from "express";
import request from "supertest";

const create = jest.fn();
const isNiaEnabled = jest.fn<() => Promise<boolean>>();

jest.unstable_mockModule("../lib/db.js", () => ({ isNiaEnabled }));
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

let app: Express;
beforeAll(async () => {
  process.env.INTERNAL_SECRET = "circle-summary-test-secret";
  process.env.ANTHROPIC_API_KEY = "test-key";
  const { default: router } = await import("../routes/circle-summary.js");
  app = express();
  app.use(express.json());
  app.use(router);
});

beforeEach(() => {
  process.env.INTERNAL_SECRET = "circle-summary-test-secret";
  process.env.ANTHROPIC_API_KEY = "test-key";
  isNiaEnabled.mockReset().mockResolvedValue(true);
  create.mockReset();
});

function post(body: Record<string, unknown> = {}) {
  return request(app).post("/internal/circle-summary")
    .set("x-internal-secret", "circle-summary-test-secret").send(body);
}

describe("internal circle summary", () => {
  it("fails closed for missing and wrong internal secrets", async () => {
    const missing = await request(app).post("/internal/circle-summary").send({});
    const wrong = await request(app).post("/internal/circle-summary").set("x-internal-secret", "wrong").send({});
    expect(missing.status).toBe(403);
    expect(wrong.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 503 when no internal secret is configured", async () => {
    delete process.env.INTERNAL_SECRET;
    const response = await request(app).post("/internal/circle-summary").send({});
    expect(response.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed when Nia is disabled or its switch cannot be read", async () => {
    isNiaEnabled.mockResolvedValueOnce(false);
    expect((await post()).status).toBe(503);
    isNiaEnabled.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await post()).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 503 without a provider key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await post()).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns a validated provider result", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({
      summary: "Neighbors discussed a cleanup and shared next steps.",
      chapters: [{ start: 0, title: "Welcome" }, { start: 60, title: "Cleanup" }, { start: 120, title: "Next steps" }],
    }) }] });
    const response = await post({ title: "Block meeting", topic: "Cleanup", duration_minutes: 3 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, summary: expect.any(String) });
    expect(response.body.chapters).toHaveLength(3);
  });

  it("nulls malformed model output and invalid chapter bounds", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({
      summary: "A nominal summary.",
      chapters: [{ start: 0, title: "Start" }, { start: 180, title: "Past duration" }, { start: 200, title: "End" }],
    }) }] });
    const response = await post({ duration_minutes: 2 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, summary: "A nominal summary.", chapters: null });
  });

  it("rejects fractional chapter starts rather than normalizing duplicates", async () => {
    create.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify({
      summary: "A nominal summary.",
      chapters: [{ start: 0.1, title: "Start" }, { start: 0.9, title: "Duplicate after floor" }, { start: 2, title: "End" }],
    }) }] });
    const response = await post({ duration_minutes: 2 });
    expect(response.status).toBe(200);
    expect(response.body.chapters).toBeNull();
  });

  it("returns 502 for provider failures", async () => {
    create.mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await post()).status).toBe(502);
  });
});