import test from "node:test";
import assert from "node:assert/strict";
import {
  OfflineMutationError,
  retryableMutation,
  type RetryableMutationDependencies,
} from "../retryableMutation";

type FaultOutcome = number | Error | { status: number; microtaskYields: number };

interface FaultProfile {
  online?: boolean;
  outcomes: FaultOutcome[];
}

/** Test-only fault transport: no runtime simulator or global fetch replacement. */
function faultTransport(profile: FaultProfile) {
  let calls = 0;
  const keys: Array<string | null> = [];
  const fetcher: typeof fetch = async (_input, init) => {
    const outcome = profile.outcomes[Math.min(calls, profile.outcomes.length - 1)];
    calls += 1;
    keys.push(new Headers(init?.headers).get("Idempotency-Key"));
    if (outcome instanceof Error) throw outcome;
    if (typeof outcome === "number") return new Response(null, { status: outcome });
    for (let i = 0; i < outcome.microtaskYields; i += 1) await Promise.resolve();
    return new Response(null, { status: outcome.status });
  };
  const dependencies: RetryableMutationDependencies = {
    fetcher,
    isOnline: () => profile.online ?? true,
    wait: async () => {},
  };
  return { dependencies, calls: () => calls, keys };
}

const mutation = {
  method: "POST",
  body: JSON.stringify({ value: "test" }),
};
const operationKey = "request-create-stable-key";

test("offline mutation is not sent or retained for later replay", async () => {
  const transport = faultTransport({ online: false, outcomes: [201] });

  await assert.rejects(
    retryableMutation("/api/requests", mutation, operationKey, 3, transport.dependencies),
    OfflineMutationError,
  );
  assert.equal(transport.calls(), 0);
});

test("retries one transient transport failure with the same idempotency key", async () => {
  const transport = faultTransport({
    outcomes: [new TypeError("connection reset"), 201],
  });

  const response = await retryableMutation(
    "/api/requests",
    mutation,
    operationKey,
    3,
    transport.dependencies,
  );

  assert.equal(response.status, 201);
  assert.equal(transport.calls(), 2);
  assert.deepEqual(transport.keys, [operationKey, operationKey]);
});

test("a slow successful response completes without a replay", async () => {
  const transport = faultTransport({
    outcomes: [{ status: 200, microtaskYields: 8 }],
  });

  const response = await retryableMutation(
    "/api/requests",
    mutation,
    operationKey,
    3,
    transport.dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(transport.calls(), 1);
});

test("retries server failures and preserves the operation key on each attempt", async () => {
  const transport = faultTransport({ outcomes: [503, 502, 200] });

  const response = await retryableMutation(
    "/api/requests",
    mutation,
    operationKey,
    3,
    transport.dependencies,
  );

  assert.equal(response.status, 200);
  assert.equal(transport.calls(), 3);
  assert.deepEqual(transport.keys, [operationKey, operationKey, operationKey]);
});

test("returns client errors without retrying", async () => {
  const transport = faultTransport({ outcomes: [422, 200] });

  const response = await retryableMutation(
    "/api/requests",
    mutation,
    operationKey,
    3,
    transport.dependencies,
  );

  assert.equal(response.status, 422);
  assert.equal(transport.calls(), 1);
});

test("does not replay unauthorized mutations", async () => {
  for (const status of [401, 403]) {
    const transport = faultTransport({ outcomes: [status, 200] });
    const response = await retryableMutation(
      "/api/requests",
      mutation,
      operationKey,
      3,
      transport.dependencies,
    );

    assert.equal(response.status, status);
    assert.equal(transport.calls(), 1);
  }
});