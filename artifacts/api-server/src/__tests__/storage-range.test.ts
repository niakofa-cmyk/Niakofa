import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import express from "express";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import { getAssetBuffer, streamAssetRange, UPLOADS_BASE } from "../lib/storage";

const testKey = `media-assets/range-test-${process.pid}.mp4`;
const testPath = path.resolve(UPLOADS_BASE, testKey);
const originalBucket = process.env["STORAGE_BUCKET"];
const app = express();

app.get("/private-video", (req, res) => streamAssetRange(testKey, req, res, "video/mp4"));

beforeAll(async () => {
  delete process.env["STORAGE_BUCKET"];
  await mkdir(path.dirname(testPath), { recursive: true });
  await writeFile(testPath, Buffer.from("0123456789"));
});

afterAll(async () => {
  await rm(testPath, { force: true });
  if (originalBucket === undefined) delete process.env["STORAGE_BUCKET"];
  else process.env["STORAGE_BUCKET"] = originalBucket;
});

describe("authenticated media range streaming", () => {
  it("enforces a hard byte limit while reading local objects", async () => {
    await expect(getAssetBuffer(testKey, 9)).rejects.toThrow("STORAGE_OBJECT_TOO_LARGE");
    await expect(getAssetBuffer(testKey, 10)).resolves.toEqual(Buffer.from("0123456789"));
  });

  it("answers HEAD with metadata and no body", async () => {
    const response = await request(app).head("/private-video");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^video\/mp4/);
    expect(response.headers["content-length"]).toBe("10");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["accept-ranges"]).toBe("bytes");
    expect(response.text ?? "").toBe("");
  });

  it("streams a requested range as 206", async () => {
    const response = await request(app).get("/private-video").set("Range", "bytes=2-5");
    expect(response.status).toBe(206);
    expect(response.headers["content-range"]).toBe("bytes 2-5/10");
    expect(response.headers["content-length"]).toBe("4");
    expect(response.body.toString()).toBe("2345");
  });

  it("returns 416 with the total size for an unsatisfiable range", async () => {
    const response = await request(app).get("/private-video").set("Range", "bytes=12-15");
    expect(response.status).toBe(416);
    expect(response.headers["content-range"]).toBe("bytes */10");
    expect(response.text ?? "").toBe("");
  });
});