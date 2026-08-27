import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithBackoff } from "../fetchWithBackoff";

function mockFetchSequence(responses: Array<{ status: number; retryAfter?: string }>) {
  let call = 0;
  (globalThis as { fetch?: typeof fetch }).fetch = async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    return {
      status: response.status,
      headers: {
        get: (name: string) => name === "Retry-After" ? response.retryAfter ?? null : null,
      },
    } as unknown as Response;
  };
  return () => call;
}

test("returns successful responses without retrying", async () => {
  const calls = mockFetchSequence([{ status: 200 }]);
  const response = await fetchWithBackoff("https://example.test");
  assert.equal(response.status, 200);
  assert.equal(calls(), 1);
});

test("retries idempotent 429 responses and respects Retry-After", async () => {
  const calls = mockFetchSequence([
    { status: 429, retryAfter: "0" },
    { status: 429, retryAfter: "0.01" },
    { status: 200 },
  ]);
  const response = await fetchWithBackoff("https://example.test", {
    maxAttempts: 5,
    baseDelayMs: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(calls(), 3);
});

test("does not retry non-idempotent methods by default, including network errors", async () => {
  let calls = 0;
  (globalThis as { fetch?: typeof fetch }).fetch = async () => {
    calls += 1;
    throw new Error("offline");
  };
  await assert.rejects(
    fetchWithBackoff("https://example.test", { method: "POST", baseDelayMs: 1 }),
    /offline/,
  );
  assert.equal(calls, 1);
});

test("supports explicit opt-in for non-idempotent retries", async () => {
  const calls = mockFetchSequence([{ status: 429, retryAfter: "0" }, { status: 200 }]);
  const response = await fetchWithBackoff("https://example.test", {
    method: "POST",
    retryNonIdempotent: true,
    baseDelayMs: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(calls(), 2);
});