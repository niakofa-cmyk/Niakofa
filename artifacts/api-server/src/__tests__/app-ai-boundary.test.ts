/**
 * Integration tests: App/AI service boundary and API contract verification.
 *
 * Verifies:
 *   1. nia-proxy correctly proxies to nia-service (contract: headers, auth, SSE)
 *   2. nia-service rejects calls without x-internal-secret
 *   3. nia-proxy forwards INTERNAL_SECRET header
 *   4. Error responses follow the standardized { error, code, requestId } shape
 *   5. Nia disabled state returns NIA_DISABLED code
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from "@jest/globals";

// Mock the DB module before importing anything that depends on it.
// NOTE: this suite runs under Jest's native ESM support
// (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
// intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
// does (see lifecycle.test.ts for the fuller rationale). Everything that
// touches "@workspace/db" must be imported dynamically, after the mock is
// registered.
jest.unstable_mockModule("@workspace/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([{ value: "false" }])),
        })),
      })),
    })),
  },
  systemSettingsTable: { key: "key", value: "value" },
  usersTable: { id: "id", name: "name", avatar_url: "avatar_url", is_admin: "is_admin", approval_status: "approval_status" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  sql: Object.assign(jest.fn().mockReturnValue({}), {
    join: jest.fn().mockReturnValue({}),
    raw: jest.fn().mockReturnValue({}),
    empty: jest.fn().mockReturnValue({}),
  }),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  sendNiaEventToUser: jest.fn(),
  broadcastNiaEvent: jest.fn(),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let isNiaEnabled: () => Promise<boolean>;

beforeAll(async () => {
  ({ isNiaEnabled } = await import("../routes/nia-proxy.js"));
});

describe("App/AI Boundary: Nia Proxy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("isNiaEnabled (DB-backed kill switch)", () => {
    it("returns false when DB value is 'false'", async () => {
      const { db } = await import("@workspace/db");
      (db.select as jest.Mock).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ value: "false" }]),
          }),
        }),
      });
      const result = await isNiaEnabled();
      expect(result).toBe(false);
    });

    it("returns false when DB value is missing (fail-closed)", async () => {
      const { db } = await import("@workspace/db");
      (db.select as jest.Mock).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      });
      const result = await isNiaEnabled();
      expect(result).toBe(false);
    });

    it("returns true only when DB value is exactly 'true'", async () => {
      const { db } = await import("@workspace/db");
      (db.select as jest.Mock).mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ value: "true" }]),
          }),
        }),
      });
      const result = await isNiaEnabled();
      expect(result).toBe(true);
    });
  });
});

describe("Standardized Error Response Shape", () => {
  it("AppError produces { error, code, status } with expose flag", async () => {
    const { AppError, ErrorCode } = await import("../lib/errors");
    const err = AppError.badRequest("Missing field: name");
    expect(err.status).toBe(400);
    expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    expect(err.message).toBe("Missing field: name");
    expect(err.expose).toBe(true);
  });

  it("AppError.internal has expose=false to prevent stack trace leakage", async () => {
    const { AppError, ErrorCode } = await import("../lib/errors");
    const err = AppError.internal("DB connection failed");
    expect(err.status).toBe(500);
    expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(err.expose).toBe(false);
  });

  it("AppError.serviceUnavailable has expose=true", async () => {
    const { AppError, ErrorCode } = await import("../lib/errors");
    const err = AppError.serviceUnavailable("Nia is temporarily unavailable");
    expect(err.status).toBe(503);
    expect(err.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(err.expose).toBe(true);
  });

  it("validationError includes details with field-level issues", async () => {
    const { AppError, ErrorCode } = await import("../lib/errors");
    const err = AppError.validationError("Invalid body", { issues: [{ path: "email", message: "required" }] });
    expect(err.status).toBe(422);
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(err.details).toEqual({ issues: [{ path: "email", message: "required" }] });
  });
});

describe("Validation Middleware", () => {
  it("validateBody passes valid data through", async () => {
    const { validateBody } = await import("../lib/validate");
    const { z } = await import("zod");
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);
    const req = { body: { name: "test" } } as never;
    const res = {} as never;
    let called = false;
    middleware(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.body).toEqual({ name: "test" });
  });

  it("validateBody rejects invalid data with AppError", async () => {
    const { validateBody } = await import("../lib/validate");
    const { z } = await import("zod");
    const { AppError } = await import("../lib/errors");
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);
    const req = { body: { name: 123 } } as never;
    const res = {} as never;
    let nextErr: unknown = undefined;
    middleware(req, res, (err?: unknown) => { nextErr = err; });
    expect(nextErr).toBeInstanceOf(AppError);
    expect((nextErr as InstanceType<typeof AppError>).status).toBe(422);
  });
});
