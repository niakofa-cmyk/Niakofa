import { createHmac } from "node:crypto";
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";

const db = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn(),
};

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  usersTable: {
    id: "id",
    token_version: "token_version",
    is_suspended: "is_suspended",
    trust_score: "trust_score",
    approval_status: "approval_status",
  },
}));

type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;
type VerifyToken = (token: string) => { userId: number; valid: boolean; tokenVersion?: number };

let requireAuth: AuthMiddleware;
let requireApproved: AuthMiddleware;
let verifyToken: VerifyToken;

beforeAll(async () => {
  ({ requireAuth, requireApproved, verifyToken } = await import("../middlewares/auth.js"));
});

beforeEach(() => {
  db.select.mockReset().mockReturnThis();
  db.from.mockReset().mockReturnThis();
  db.where.mockReset().mockReturnThis();
  db.limit.mockReset().mockResolvedValue([]);
});

function responseMock() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

function expiredToken(userId: number): string {
  const expiresAt = Date.now() - 1;
  const tokenVersion = 0;
  const signature = createHmac("sha256", process.env.SESSION_SECRET!)
    .update(`${userId}.${expiresAt}.${tokenVersion}`)
    .digest("base64url");
  return `${userId}.${expiresAt}.${tokenVersion}.${signature}`;
}

describe("session authentication runtime contract", () => {
  it("rejects an expired token before it can authenticate a request", () => {
    const result = verifyToken(expiredToken(42));

    expect(result).toMatchObject({ userId: 42, valid: false, tokenVersion: 0 });
  });

  it("rejects a token whose version was revoked in the database", async () => {
    db.limit.mockResolvedValueOnce([{ token_version: 3 }]);
    const req = { authenticatedUserId: 42, authenticatedTokenVersion: 2 } as never;
    const res = responseMock();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: "TOKEN_REVOKED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed when the authentication database is unavailable", async () => {
    db.limit.mockRejectedValueOnce(new Error("database unavailable"));
    const req = { authenticatedUserId: 42, authenticatedTokenVersion: 0 } as never;
    const res = responseMock();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "Authentication service unavailable",
      error_code: "AUTH_BACKEND_UNAVAILABLE",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a token after its user row has been deleted", async () => {
    db.limit.mockResolvedValueOnce([]);
    const req = { authenticatedUserId: 42, authenticatedTokenVersion: 0 } as never;
    const res = responseMock();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error_code: "TOKEN_REVOKED" }));
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ["suspended", { is_suspended: true, trust_score: 50, approval_status: "approved" }, /suspended/i],
    ["unapproved", { is_suspended: false, trust_score: 50, approval_status: "pending" }, /pending approval/i],
  ])("blocks a %s account from protected actions", async (_label, account, expectedError) => {
    db.limit.mockResolvedValueOnce([{ ...account, token_version: 0 }]);
    const req = { authenticatedUserId: 42, authenticatedTokenVersion: 0 } as never;
    const res = responseMock();
    const next = jest.fn();

    await requireApproved(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(expectedError) }));
    expect(next).not.toHaveBeenCalled();
  });
});