---
name: Niakofa audio-circles test mocking gotcha
description: Non-obvious call-order quirk when mocking audio-circles.ts route tests under the shared jest.unstable_mockModule db mock.
---
- `getActiveParticipants(sessionId)` in `audio-circles.ts` ends its chain on `.where(...)` with no `.limit()` — it does NOT go through `db.limit`'s mock queue. It resolves through the shared `mockDb.then()` instead, so tests that need it to return specific participant rows must queue `(db.then as jest.Mock).mockImplementationOnce((resolve, reject) => Promise.resolve([...]).then(resolve, reject))`, not `db.limit`.
- (See `niakofa-jest-mock-bugs.md` for the separate, more general `requireApproved()` own-lookup gotcha — it also applies to the `/audio-circles/:id/start` and `/audio-circle-sessions/:id/join` routes.)
- **Why:** looks like the route is broken when the test itself is miscounting DB calls.
- **How to apply:** when adding new audio-circles tests, check whether the query in question ends in `.limit()` vs a bare `.where()` before writing the mock sequence.
