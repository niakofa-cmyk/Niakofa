/**
 * Circle heartbeat trust-boundary tests.
 *
 * A heartbeat may report the loudest peer, but the browser is not trusted to
 * name an arbitrary user. The server must only broadcast an active-speaker
 * event for someone currently present in the same session.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const sendToCircleParticipants = jest.fn();
const clearCircleSession = jest.fn();
const updateReturning = jest.fn();
const selectThen = jest.fn();

const chain = {
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  returning: updateReturning,
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  then: selectThen,
};

const db: unknown = chain;

jest.unstable_mockModule("@workspace/db", () => ({
  db,
  audioCircleParticipantsTable: {
    id: "id",
    session_id: "session_id",
    user_id: "user_id",
    left_at: "left_at",
    last_seen_at: "last_seen_at",
    role: "role",
  },
  // Required by lifecycle enforcement (4h max / host-grace) in circle-heartbeat.
  audioCircleSessionsTable: {
    id: "id",
    status: "status",
    started_at: "started_at",
    ended_at: "ended_at",
    host_disconnected_at: "host_disconnected_at",
  },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  and: jest.fn(),
  eq: jest.fn(),
  isNull: jest.fn(),
  lt: jest.fn(),
  inArray: jest.fn(),
  sql: jest.fn(),
}));

jest.unstable_mockModule("../middlewares/auth", () => ({
  requireAuth: (req: unknown, _res: unknown, next: unknown) => {
    (req as { authenticatedUserId: number }).authenticatedUserId = 42;
    (next as () => void)();
  },
}));

jest.unstable_mockModule("../middlewares/rate-limit", () => ({
  generalApiLimiter: (_req: unknown, _res: unknown, next: unknown) => (next as () => void)(),
}));

jest.unstable_mockModule("../lib/ws-hub", () => ({
  sendToCircleParticipants,
  clearCircleSession,
}));

jest.unstable_mockModule("../lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

jest.unstable_mockModule("../lib/circleSessionLifecycle", () => ({
  HOST_GRACE_PERIOD_MS: 90_000,
  isSessionPastMaxDuration: () => false,
}));

let app: express.Express;

beforeAll(async () => {
  const { default: heartbeatRouter } = await import("../routes/circle-heartbeat.js");
  app = express();
  app.use(express.json());
  app.use("/api", heartbeatRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  chain.update.mockReturnThis();
  chain.set.mockReturnThis();
  chain.where.mockReturnThis();
  chain.select.mockReturnThis();
  chain.from.mockReturnThis();
  chain.limit.mockReturnThis();
  updateReturning
    .mockResolvedValueOnce([{ id: 1 }]) // heartbeat participant update
    .mockResolvedValueOnce([]); // ghost sweep
  // Session lifecycle selects resolve to a live session with a present host.
  selectThen.mockImplementation((resolve: (value: unknown) => void) => {
    resolve([{ user_id: 42 }, { user_id: 7 }]);
  });
  chain.limit.mockImplementation(() =>
    Promise.resolve([
      {
        id: 9,
        status: "live",
        started_at: new Date(),
        host_disconnected_at: null,
      },
    ]),
  );
});

describe("POST /api/audio-circle-sessions/:id/heartbeat", () => {
  it("broadcasts only an active participant as the speaker", async () => {
    const response = await request(app)
      .post("/api/audio-circle-sessions/9/heartbeat")
      .send({ active_speaker_id: 7 });

    expect(response.status).toBe(204);
    expect(sendToCircleParticipants).toHaveBeenCalledWith([7], {
      type: "circle_active_speaker",
      payload: { session_id: 9, user_id: 7, reporter_id: 42 },
    });
  });

  it("does not fan out when the reporter is the only active participant", async () => {
    selectThen.mockImplementationOnce((resolve: (value: unknown) => void) => {
      resolve([{ user_id: 42 }]);
    });

    const response = await request(app)
      .post("/api/audio-circle-sessions/9/heartbeat")
      .send({ active_speaker_id: 42 });

    expect(response.status).toBe(204);
    expect(sendToCircleParticipants).not.toHaveBeenCalled();
  });

  it("does not broadcast a speaker outside the current session", async () => {
    const response = await request(app)
      .post("/api/audio-circle-sessions/9/heartbeat")
      .send({ active_speaker_id: 999 });

    expect(response.status).toBe(204);
    expect(sendToCircleParticipants).not.toHaveBeenCalled();
  });
});
