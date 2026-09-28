import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";
import { createMediaUploadParser } from "../lib/media-upload-parser";

describe("bounded same-origin media upload parser", () => {
  function appWithLimit(limitBytes: number) {
    const app = express();
    app.put("/upload", createMediaUploadParser(limitBytes), (req, res) => {
      res.status(200).json({ isBuffer: Buffer.isBuffer(req.body), bytes: req.body.length });
    });
    app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const parserError = err as { status?: number };
      res.status(parserError.status ?? 500).json({ error: "parser rejected request" });
    });
    return app;
  }

  it("parses any content type as bounded raw bytes", async () => {
    const response = await request(appWithLimit(8))
      .put("/upload")
      .set("Content-Type", "text/plain")
      .send(Buffer.from("12345678"));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ isBuffer: true, bytes: 8 });
  });

  it("rejects a streamed body beyond the configured byte limit", async () => {
    const response = await request(appWithLimit(8))
      .put("/upload")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("123456789"));

    expect(response.status).toBe(413);
  });

  it("refuses invalid parser bounds", () => {
    expect(() => createMediaUploadParser(0)).toThrow(/positive safe integer/);
    expect(() => createMediaUploadParser(Number.MAX_SAFE_INTEGER + 1)).toThrow(/positive safe integer/);
  });
});