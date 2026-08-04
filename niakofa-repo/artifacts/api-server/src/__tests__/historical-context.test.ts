/**
 * Tests for lib/historical-context.ts — the real-world historical grounding
 * layer for Legacy Mode chapters (verified / historical_context /
 * narrative_interpretation trust model).
 *
 * Runs under Jest's native ESM support (--experimental-vm-modules), so
 * jest.unstable_mockModule + dynamic import is used throughout, matching
 * the pattern established in lifecycle.test.ts / app-ai-boundary.test.ts.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();

jest.unstable_mockModule("../lib/cache.js", () => ({
  cacheGet: mockCacheGet,
  cacheSet: mockCacheSet,
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCreate = jest.fn();
jest.unstable_mockModule("@anthropic-ai/sdk", () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

let getHistoricalContext: typeof import("../lib/historical-context.js")["getHistoricalContext"];

beforeEach(async () => {
  jest.clearAllMocks();
  ({ getHistoricalContext } = await import("../lib/historical-context.js"));
});

describe("getHistoricalContext", () => {
  it("returns null when location is unknown, without calling the AI or cache", async () => {
    const result = await getHistoricalContext({ location: "Unknown", era: "1958" });
    expect(result).toBeNull();
    expect(mockCacheGet).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns null when era is unknown", async () => {
    const result = await getHistoricalContext({ location: "Nashville", era: "Unknown" });
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns null when ANTHROPIC_API_KEY is not configured", async () => {
    const original = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    mockCacheGet.mockResolvedValueOnce(null);

    const result = await getHistoricalContext({ location: "Nashville", era: "1958" });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    if (original) process.env["ANTHROPIC_API_KEY"] = original;
  });

  it("returns a cached result without calling the AI again", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    const cached = { summary: "cached summary", topics: ["a", "b"] };
    mockCacheGet.mockResolvedValueOnce(cached);

    const result = await getHistoricalContext({ location: "Nashville", era: "1958" });

    expect(result).toEqual(cached);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("calls the AI, parses the JSON response, and caches the result on a cache miss", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockCacheGet.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "Nashville in 1958 was shaped by segregation and a growing music industry.",
          topics: ["Civil Rights era", "Music City growth", "Segregated schools"],
        }),
      }],
    });

    const result = await getHistoricalContext({ location: "Nashville", era: "1958", country: "USA" });

    expect(result).toEqual({
      summary: "Nashville in 1958 was shaped by segregation and a growing music industry.",
      topics: ["Civil Rights era", "Music City growth", "Segregated schools"],
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // Never claims anything about a specific family — verify the prompt
    // instructs general/place-level context, not "your ancestor" narration.
    const callArgs = mockCreate.mock.calls[0]![0] as { system: string; messages: { content: string }[] };
    expect(callArgs.system).toMatch(/never invent or imply a\s+specific person/i);
    expect(callArgs.messages[0]!.content).toContain("Nashville, USA");
    expect(callArgs.messages[0]!.content).toContain("1958");
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining("legacy:historical-context:v1:nashville:1958"),
      result,
      30 * 24 * 60 * 60,
    );
  });

  it("returns null and does not cache when the AI response isn't valid JSON", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockCacheGet.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not json at all" }],
    });

    const result = await getHistoricalContext({ location: "Nashville", era: "1958" });

    expect(result).toBeNull();
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("returns null when the AI call throws, without propagating the error", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockCacheGet.mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce(new Error("network error"));

    const result = await getHistoricalContext({ location: "Nashville", era: "1958" });

    expect(result).toBeNull();
  });

  it("truncates an over-long summary and caps topics at 5", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    mockCacheGet.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "x".repeat(600),
          topics: ["1", "2", "3", "4", "5", "6", "7"],
        }),
      }],
    });

    const result = await getHistoricalContext({ location: "Nashville", era: "1958" });

    expect(result!.summary.length).toBe(500);
    expect(result!.topics).toHaveLength(5);
  });
});
