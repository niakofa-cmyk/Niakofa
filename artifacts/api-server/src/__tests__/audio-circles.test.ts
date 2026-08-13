/**
 * Audio Circles authorization gate tests.
 *
 * Verifies the lifecycle/role endpoints enforce auth and role checks:
 *   - No token → 401
 *   - Non-host trying host-only actions (end/promote) → 403
 *   - Leave is idempotent when the caller isn't an active participant
 *
 * DB and WS-hub interactions are mocked; see lifecycle.test.ts for the
 * native-ESM jest.unstable_mockModule rationale this suite follows.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import request from "supertest";
import express, { Express } from "express";

jest.unstable_mockModule("@workspace/db", () => {
  const mockDb: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn(),
    returning: jest.fn(),
    execute: jest.fn().mockImplementation(() => Promise.resolve([])),
    then: jest.fn().mockImplementation((resolve: unknown, reject: any) =>
      Promise.resolve([]).then(resolve, reject)
    ),
  };
  (mockDb.limit as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    audioCirclesTable: { id: "id", city_key: "city_key", neighborhood_id: "neighborhood_id" },
    audioCircleSessionsTable: {
      id: "id", circle_id: "circle_id", host_id: "host_id", status: "status",
      max_speakers: "max_speakers", is_recording: "is_recording", recording_url: "recording_url", ended_at: "ended_at",
    },
    audioCircleParticipantsTable: {
      id: "id", session_id: "session_id", user_id: "user_id", role: "role",
      hand_raised: "hand_raised", muted: "muted", left_at: "left_at",
    },
    cityNeighborhoodsTable: { id: "id", name: "name", emoji: "emoji" },
    usersTable: { id: "id", name: "name", avatar_url: "avatar_url", is_admin: "is_admin", approval_status: "approval_status" },
    audioCircleFollowsTable: { id: "id", user_id: "user_id", circle_id: "circle_id" },
    audioCircleMessagesTable: {
      id: "id", session_id: "session_id", sender_id: "sender_id", body: "body", sent_at: "sent_at",
    },
    circleBlocksTable: { id: "id", host_id: "host_id", blocked_user_id: "blocked_user_id", session_id: "session_id" },
    circleReportsTable: { id: "id", session_id: "session_id", reporter_id: "reporter_id", reported_id: "reported_id", reason: "reason" },
  };
});

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(), and: jest.fn(), or: jest.fn(), not: jest.fn(), sql: jest.fn(),
  inArray: jest.fn(), notInArray: jest.fn(), asc: jest.fn(), desc: jest.fn(),
  gte: jest.fn(), gt: jest.fn(), lte: jest.fn(), lt: jest.fn(), ne: jest.fn(),
  isNull: jest.fn(), isNotNull: jest.fn(),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  sendToUser: jest.fn(),
  sendToUsers: jest.fn(),
  sendToCircleParticipants: jest.fn(),
  sendCircleSignal: jest.fn(),
  addCircleParticipant: jest.fn(),
  removeCircleParticipant: jest.fn(),
  clearCircleSession: jest.fn(),
  isCircleParticipant: jest.fn().mockReturnValue(true),
  broadcast: jest.fn(),
}));

let app: Express;
let db: unknown;
let signTokenById: (id: number) => string;

beforeAll(async () => {
  ({ db } = await import("@workspace/db"));
  ({ signTokenById } = await import("../middlewares/auth.js"));
  const { parseAuth } = await import("../middlewares/auth.js");
  const { default: audioCirclesRouter } = await import("../routes/audio-circles.js");

  app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use("/api", audioCirclesRouter);
});

function bearerToken(userId: number): string {
  return `Bearer ${signTokenById(userId)}`;
}

beforeEach(() => {
  (db.select as jest.Mock).mockReset().mockReturnThis();
  (db.update as jest.Mock).mockReset().mockReturnThis();
  (db.insert as jest.Mock).mockReset().mockReturnThis();
  (db.delete as jest.Mock).mockReset().mockReturnThis();
  (db.from as jest.Mock).mockReset().mockReturnThis();
  (db.innerJoin as jest.Mock).mockReset().mockReturnThis();
  (db.leftJoin as jest.Mock).mockReset().mockReturnThis();
  (db.where as jest.Mock).mockReset().mockReturnThis();
  (db.set as jest.Mock).mockReset().mockReturnThis();
  (db.values as jest.Mock).mockReset().mockReturnThis();
  (db.orderBy as jest.Mock).mockReset().mockReturnThis();
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.returning as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.execute as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
});

describe("Audio Circles — auth gates", () => {
  it("rejects join without a token", async () => {
    const res = await request(app).post("/api/audio-circle-sessions/1/join");
    expect(res.status).toBe(401);
  });

  it("rejects end without a token", async () => {
    const res = await request(app).post("/api/audio-circle-sessions/1/end");
    expect(res.status).toBe(401);
  });

  it("404s ending a session that isn't live", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // no live session
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/end")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(404);
  });

  it("blocks a non-host from ending a live session", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session lookup
      .mockImplementationOnce(() => Promise.resolve([])); // requireActiveParticipant("host") finds no matching participant
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/end")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(403);
  });

  it("blocks a non-host from promoting a listener", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", max_speakers: 13 }]))
      .mockImplementationOnce(() => Promise.resolve([])); // no host participant row for this user
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/promote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("treats leave as idempotent when the caller already left", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session lookup
      .mockImplementationOnce(() => Promise.resolve([])); // no active participant row
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/leave")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("rejects hand-raise, reaction, and recording toggles without a token", async () => {
    const [handRes, reactRes, recRes] = await Promise.all([
      request(app).post("/api/audio-circle-sessions/1/hand").send({ raised: true }),
      request(app).post("/api/audio-circle-sessions/1/react").send({ emoji: "👏" }),
      request(app).post("/api/audio-circle-sessions/1/recording").send({ is_recording: true }),
    ]);
    expect(handRes.status).toBe(401);
    expect(reactRes.status).toBe(401);
    expect(recRes.status).toBe(401);
  });

  // start/join both go through requireApproved, which does its own DB lookup
  // (approval_status + token_version) via db.limit() BEFORE the route
  // handler runs any of its own queries — this helper queues that lookup so
  // route-level mocks line up with the actual call order.
  function mockApprovedUser() {
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ is_suspended: false, trust_score: 10, approval_status: "approved", token_version: 0 }])
    );
  }

  it("404s starting a session for a circle that doesn't exist", async () => {
    mockApprovedUser();
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // circle lookup
    const res = await request(app)
      .post("/api/audio-circles/1/start")
      .set("Authorization", bearerToken(42))
      .send({ title: "Neighborhood check-in" });
    expect(res.status).toBe(404);
  });

  it("409s starting a session when the circle already has one live", async () => {
    mockApprovedUser();
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }])) // circle lookup
      .mockImplementationOnce(() => Promise.resolve([{ id: 77, circle_id: 1, status: "live" }])); // getLiveSession
    const res = await request(app)
      .post("/api/audio-circles/1/start")
      .set("Authorization", bearerToken(42))
      .send({ title: "Neighborhood check-in" });
    expect(res.status).toBe(409);
    expect(res.body.session_id).toBe(77);
  });

  it("rejects starting a session with an empty title", async () => {
    mockApprovedUser();
    const res = await request(app)
      .post("/api/audio-circles/1/start")
      .set("Authorization", bearerToken(42))
      .send({ title: "" });
    expect(res.status).toBe(400);
  });

  it("blocks a non-participant from raising a hand", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([])); // no participant row for caller
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/hand")
      .set("Authorization", bearerToken(42))
      .send({ raised: true });
    expect(res.status).toBe(403);
  });

  it("rejects a hand-raise body with a non-boolean value", async () => {
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/hand")
      .set("Authorization", bearerToken(42))
      .send({ raised: "yes" });
    expect(res.status).toBe(400);
  });

  it("blocks a non-participant from reacting", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([])); // no participant row for caller
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/react")
      .set("Authorization", bearerToken(42))
      .send({ emoji: "🎉" });
    expect(res.status).toBe(403);
  });

  it("rejects an empty-string reaction emoji", async () => {
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/react")
      .set("Authorization", bearerToken(42))
      .send({ emoji: "" });
    expect(res.status).toBe(400);
  });

  it("blocks a non-host from toggling recording", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([])); // requireActiveParticipant("host") finds nothing
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/recording")
      .set("Authorization", bearerToken(42))
      .send({ is_recording: true });
    expect(res.status).toBe(403);
  });

  it("blocks attaching a recording URL when the caller isn't the host", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ id: 1, host_id: 99 }])); // session
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/recording-url")
      .set("Authorization", bearerToken(42))
      .send({ recording_url: "https://example.com/recording.mp3" });
    expect(res.status).toBe(403);
  });

  it("404s attaching a recording URL to a session that doesn't exist", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // session lookup
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/recording-url")
      .set("Authorization", bearerToken(42))
      .send({ recording_url: "https://example.com/recording.mp3" });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed recording URL", async () => {
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/recording-url")
      .set("Authorization", bearerToken(42))
      .send({ recording_url: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("blocks the host from demoting themselves — must end the session instead", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // acting participant = host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/demote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 42 }); // self
    expect(res.status).toBe(400);
  });

  it("blocks one non-host speaker from demoting another", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "speaker" }])); // acting participant = speaker, not target
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/demote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("enforces the max_speakers cap when promoting a listener", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", max_speakers: 13 }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    // getActiveParticipants() has no .limit() call — it resolves through the
    // shared mockDb.then(); queue exactly 13 host/speaker rows to hit the cap.
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve(
        Array.from({ length: 13 }, (_, i) => ({ user_id: i + 1, role: i === 0 ? "host" : "speaker" }))
      ).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/promote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 999 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/maximum of 13 speakers/);
  });

  it("lets the host successfully promote a listener to speaker", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", max_speakers: 13 }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 42, role: "host" },
        { user_id: 7, role: "listener" },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/promote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("404s promoting a user who isn't an active participant", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", max_speakers: 13 }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "host" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/promote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 }); // never joined
    expect(res.status).toBe(404);
  });

  it("lets a participant successfully raise their hand", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }])); // caller's own participant row
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "listener" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/hand")
      .set("Authorization", bearerToken(42))
      .send({ raised: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("lets a participant successfully send a reaction", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }])); // caller's own participant row
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "listener" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/react")
      .set("Authorization", bearerToken(42))
      .send({ emoji: "🎉" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("lets the host successfully join their own newly-started session and joins it back as a listener when rejoining", async () => {
    mockApprovedUser();
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session lookup
      .mockImplementationOnce(() => Promise.resolve([])) // no existing active participant row
      .mockImplementationOnce(() => Promise.resolve([{ name: "Alice", avatar_url: null }])); // joining user's profile
    (db.returning as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ id: 9, session_id: 1, user_id: 42, role: "listener" }])
    );
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "listener", name: "Alice" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/join")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(200);
    expect(res.body.participant).toEqual({ id: 9, session_id: 1, user_id: 42, role: "listener" });
  });

  it("404s joining a session that isn't live", async () => {
    mockApprovedUser();
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // no live session found
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/join")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(404);
  });

  // Restored: verifies that a reconnecting host clears the host_disconnected_at
  // flag instead of leaving the session permanently flagged as host-absent.
  // This is the second half of the grace-period fix — the first half
  // (setting the flag on leave) is guarded by the grace-period test below.
  it("clears the host-disconnected flag when the host rejoins their own session", async () => {
    mockApprovedUser();
    (db.limit as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve([{
          id: 1, status: "live", host_id: 7,
          host_disconnected_at: new Date().toISOString(),
        }])
      ) // session lookup in /join — host_disconnected_at is set
      .mockImplementationOnce(() =>
        Promise.resolve([]) // block check — no block found
      )
      .mockImplementationOnce(() =>
        Promise.resolve([{ id: 99, role: "host", user_id: 7 }])
      ) // existing active participant row (host already has a row)
      .mockImplementationOnce(() =>
        Promise.resolve([{ id: 7, name: "Host" }])
      ); // user profile lookup for join broadcast
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/join")
      .set("Authorization", bearerToken(7));
    expect(res.status).toBe(200);
    // Verify the route issued a db.set({ host_disconnected_at: null }) call.
    const setCalls = (db.set as jest.Mock).mock.calls.map((c: unknown[]) => c[0]);
    expect(
      setCalls.some(
        (arg: Record<string, unknown>) =>
          arg && "host_disconnected_at" in arg && arg.host_disconnected_at === null
      )
    ).toBe(true);
  });

  // Grace-period test: when the host leaves and host_disconnected_at is set to
  // a timestamp older than the HOST_GRACE_PERIOD_MS (90 s), the session must be
  // treated as expired — any attempt to join should get a 404 (applyGracePeriod
  // filters the session out of the "live" read path rather than returning it).
  it("returns 404 when the host grace period has already elapsed", async () => {
    mockApprovedUser();
    const expiredAt = new Date(Date.now() - 120_000).toISOString(); // 2 min ago > 90 s grace
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{
        id: 1,
        status: "live",
        host_id: 7,
        host_disconnected_at: expiredAt,
      }])
    ); // applyGracePeriod should detect elapsed > HOST_GRACE_PERIOD_MS → treats as ended
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/join")
      .set("Authorization", bearerToken(42));
    // Session is effectively dead once the grace period elapsed — caller should
    // not be able to join it.
    expect(res.status).toBe(404);
  });
});

// ── Co-host role tests ────────────────────────────────────────────────────────
//
// PR #6 introduced the co_host role (host | co_host | speaker | listener).
// Co-hosts can promote/demote/mute/kick/block but cannot end the session or
// control recording. These tests verify the authorization gates and the
// assign/remove endpoints behave correctly.

describe("Audio Circles — co-host role", () => {
  it("blocks a non-host from assigning a co-host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "speaker" }])); // not host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/assign-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("blocks a co-host from assigning another co-host (host-only)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co_host, not host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/assign-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("lets the host successfully assign a co-host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 42, role: "host" },
        { user_id: 7, role: "speaker" },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/assign-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("refuses to assign the host as a co-host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "host" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/assign-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 42 });
    expect(res.status).toBe(400);
  });

  it("blocks a non-host from removing a co-host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co_host, not host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/remove-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("lets the host remove a co-host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 7, role: "co_host" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/remove-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("refuses to remove co-host from a user who isn't one", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }])); // host participant
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 7, role: "speaker" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/remove-cohost")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(400);
  });

  it("lets a co-host mute a speaker (host_or_cohost gate)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host acting
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 7, role: "speaker" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/mute")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7, muted: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("lets a co-host mute-all speakers (host_or_cohost gate)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host acting
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/mute-all")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("lets a co-host kick a speaker but not the host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host acting
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 7, role: "speaker" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/kick")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("blocks a co-host from kicking the host", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host acting
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 7, role: "host" }]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/kick")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 7 });
    expect(res.status).toBe(403);
  });

  it("blocks a co-host from ending the session (host-only)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host, not host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/end")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(403);
  });

  it("blocks a co-host from toggling recording (host-only)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host, not host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/recording")
      .set("Authorization", bearerToken(42))
      .send({ is_recording: true });
    expect(res.status).toBe(403);
  });

  it("blocks a co-host from demoting themselves", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }])); // co-host acting
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/demote")
      .set("Authorization", bearerToken(42))
      .send({ user_id: 42 }); // self
    expect(res.status).toBe(400);
  });
});

// ── Ephemeral chat (/chat) ────────────────────────────────────────────────────
describe("Audio Circles — ephemeral chat", () => {
  it("rejects a chat message without a token (401)", async () => {
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .send({ body: "Hello!" });
    expect(res.status).toBe(401);
  });

  it("rejects a chat message from a non-participant (403)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }])) // session
      .mockImplementationOnce(() => Promise.resolve([])); // no participant row for caller
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "Hello!" });
    expect(res.status).toBe(403);
  });

  it("rejects an empty chat body (400)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }]));
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "" });
    expect(res.status).toBe(400);
  });

  it("rejects a chat message over 500 chars (400)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }]));
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "x".repeat(501) });
    expect(res.status).toBe(400);
  });

  it("accepts exactly 500 chars and broadcasts circle_chat_message (200)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", chat_enabled: true }]))       // session
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }]))     // participant
      .mockImplementationOnce(() => Promise.resolve([{ name: "Alice", avatar_url: null }])); // user profile
    (db.returning as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ id: 99, sent_at: new Date("2026-01-01T00:00:00Z") }])
    ); // insert(...).returning(...)
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ user_id: 42, role: "listener" }]).then(resolve, reject)
    ); // getActiveParticipants
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "x".repeat(500) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: "db-99" });
  });

  it("accepts a normal message from a speaker and broadcasts (200)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live", chat_enabled: true }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "speaker" }]))
      .mockImplementationOnce(() => Promise.resolve([{ name: "Bob", avatar_url: "https://x/b.jpg" }]));
    (db.returning as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ id: 100, sent_at: new Date("2026-01-01T00:00:00Z") }])
    ); // insert(...).returning(...)
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 42, role: "speaker" },
        { user_id: 7,  role: "host" },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "Nice to meet everyone!" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: "db-100" });
  });

  it("404s when the session is not live", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // no live session
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/chat")
      .set("Authorization", bearerToken(42))
      .send({ body: "Hello?" });
    expect(res.status).toBe(404);
  });
});

// ── Lower all hands (/lower-all-hands) ───────────────────────────────────────
describe("Audio Circles — lower all hands", () => {
  it("rejects without a token (401)", async () => {
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands");
    expect(res.status).toBe(401);
  });

  it("blocks a listener from lowering all hands (403)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "listener" }])); // not host/co-host
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(403);
  });

  it("blocks a speaker from lowering all hands (403)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "speaker" }]));
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(403);
  });

  it("lets the host lower all hands and broadcasts circle_hands_lowered (200)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "host" }]));
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 7,  role: "host" },
        { user_id: 10, role: "listener", hand_raised: true },
        { user_id: 11, role: "listener", hand_raised: false },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands")
      .set("Authorization", bearerToken(7));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // Verify db.update was issued (sets hand_raised = false for all)
    expect((db.update as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it("lets a co-host lower all hands (200)", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1, status: "live" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 5, role: "co_host" }]));
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 7,  role: "host" },
        { user_id: 42, role: "co_host" },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("404s when the session is not live", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([]));
    const res = await request(app)
      .post("/api/audio-circle-sessions/1/lower-all-hands")
      .set("Authorization", bearerToken(7));
    expect(res.status).toBe(404);
  });
});

// ── Room state re-hydration (resync after reload) ────────────────────────────
describe("Audio Circles — room state resync (GET session)", () => {
  it("returns 401 without a token", async () => {
    const res = await request(app)
      .get("/api/audio-circle-sessions/1");
    expect(res.status).toBe(401);
  });

  it("returns session + participants for an active participant (200)", async () => {
    // requireApproved middleware fires a db.limit lookup before the route runs
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ is_suspended: false, trust_score: 10, approval_status: "approved", token_version: 0 }])
    );
    (db.limit as jest.Mock)
      .mockImplementationOnce(() =>
        Promise.resolve([{
          id: 1, circle_id: 10, host_id: 7, title: "Test Circle",
          status: "live", video_enabled: false, is_recording: false,
          max_speakers: 13, host_disconnected_at: null,
        }])
      ); // session lookup
    // getActiveParticipants uses .then not .limit
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([
        { user_id: 7,  role: "host",     hand_raised: false, muted: false, name: "Host",    avatar_url: null },
        { user_id: 42, role: "listener", hand_raised: true,  muted: false, name: "Watcher", avatar_url: null },
      ]).then(resolve, reject)
    );
    const res = await request(app)
      .get("/api/audio-circle-sessions/1")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(200);
    expect(res.body.session).toMatchObject({ id: 1, title: "Test Circle", status: "live" });
    expect(res.body.participants).toHaveLength(2);
    // hand_raised state is preserved on reload — listener's raised hand survives
    const watcher = res.body.participants.find((p: { user_id: number }) => p.user_id === 42);
    expect(watcher?.hand_raised).toBe(true);
  });

  it("404s for a session that doesn't exist", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ is_suspended: false, trust_score: 10, approval_status: "approved", token_version: 0 }])
    );
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([]));
    const res = await request(app)
      .get("/api/audio-circle-sessions/99")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(404);
  });

  it("treats an ended session as a 404 (not re-joinable)", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ is_suspended: false, trust_score: 10, approval_status: "approved", token_version: 0 }])
    );
    (db.limit as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve([{ id: 1, status: "ended" }])
    );
    const res = await request(app)
      .get("/api/audio-circle-sessions/1")
      .set("Authorization", bearerToken(42));
    expect(res.status).toBe(404);
  });
});
