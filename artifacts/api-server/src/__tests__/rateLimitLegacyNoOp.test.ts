import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import { generalApiLimiter } from "../middlewares/rate-limit.js";

describe("generalApiLimiter compatibility export", () => {
  it("does not double-count when stacked on a route", async () => {
    const app = express();
    let handlerCalls = 0;
    app.get("/x", generalApiLimiter, generalApiLimiter, generalApiLimiter, (_req, res) => {
      handlerCalls += 1;
      res.status(200).json({ ok: true });
    });

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).get("/x");
      expect(response.status).toBe(200);
    }
    expect(handlerCalls).toBe(5);
  });
});