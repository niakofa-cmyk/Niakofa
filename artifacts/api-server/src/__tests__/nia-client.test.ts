import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { NiaServiceError, requestNia } from "../lib/nia-client";

const originalSecret = process.env["INTERNAL_SECRET"];
const originalUrl = process.env["NIA_SERVICE_URL"];
const mockFetch = jest.fn();

beforeEach(() => {
  process.env["INTERNAL_SECRET"] = "test-internal-secret";
  process.env["NIA_SERVICE_URL"] = "http://nia.test/";
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as typeof fetch;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env["INTERNAL_SECRET"];
  else process.env["INTERNAL_SECRET"] = originalSecret;
  if (originalUrl === undefined) delete process.env["NIA_SERVICE_URL"];
  else process.env["NIA_SERVICE_URL"] = originalUrl;
});

describe("requestNia", () => {
  it("adds the internal secret and JSON content type without changing the path", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    mockFetch.mockResolvedValueOnce(response);

    const result = await requestNia("/internal/translate", {
      method: "POST",
      body: JSON.stringify({ text: "hello" }),
    });

    expect(result).toBe(response);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://nia.test/internal/translate");
    expect(new Headers(init.headers).get("x-internal-secret")).toBe("test-internal-secret");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });

  it("fails closed when the internal secret is missing", async () => {
    delete process.env["INTERNAL_SECRET"];

    await expect(requestNia("/checkin")).rejects.toMatchObject({
      name: "NiaServiceError",
      status: 503,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("rejects absolute or protocol-relative paths", async () => {
    await expect(requestNia("https://attacker.test")).rejects.toBeInstanceOf(NiaServiceError);
    await expect(requestNia("//attacker.test")).rejects.toBeInstanceOf(NiaServiceError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("normalizes network failures to a service-unavailable error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connection refused"));

    await expect(requestNia("/health")).rejects.toMatchObject({
      name: "NiaServiceError",
      status: 503,
    });
  });
});