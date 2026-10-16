import { describe, expect, it } from "@jest/globals";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { makeLimiter } from "../lib/rateLimitStore.js";

describe("API rate-limit / SPA asset boundary", () => {
  it("mounts the application's single traffic limiter only at /api, after auth", () => {
    const source = readFileSync("src/app.ts", "utf8");
    const mounts = source.match(/app\.use\([^;]*apiTrafficLimiter\);/g);
    expect(mounts).toEqual(['app.use("/api", apiTrafficLimiter);']);
    expect(source.indexOf("app.use(parseAuth)")).toBeLessThan(
      source.indexOf('app.use("/api", apiTrafficLimiter)'),
    );
  });

  it("still rejects excess API traffic without blocking documents, CSS or JS", async () => {
    const app = express();
    app.use("/api", makeLimiter({
      windowMs: 60_000,
      limit: 2,
      prefix: "api-boundary-regression",
      skip: () => false,
      keyGenerator: () => "one-test-client",
      message: { error: "Too many API requests." },
    }));
    app.get("/api/example", (_req, res) => res.json({ ok: true }));
    app.get("/community/moments", (_req, res) => res.type("html").send("<main>Moments</main>"));
    app.get("/assets/moments.css", (_req, res) => res.type("css").send("main{display:block}"));
    app.get("/assets/moments.js", (_req, res) => res.type("js").send("export default {}"));

    // Static navigation does not consume the two-request API allowance.
    for (let index = 0; index < 3; index += 1) {
      expect((await request(app).get("/assets/moments.css")).status).toBe(200);
    }
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(429);
    await request(app).get("/community/moments").expect(200).expect("Content-Type", /html/);
    await request(app).get("/assets/moments.css").expect(200).expect("Content-Type", /css/);
    await request(app).get("/assets/moments.js").expect(200).expect("Content-Type", /javascript/);
  });
});
