---
name: Niakofa Circles lifecycle fixes
description: Key bugs fixed in the Circles WebRTC feature (video rendering, recording, camera stop, WS events)
---

# Circles Lifecycle — Key Bugs & Fixes

## Recording: stopRecording() is async
`MediaRecorder.stop()` fires `ondataavailable` (final chunk) then `onstop` asynchronously.
Reading `recordedChunks` immediately after `stop()` always misses the last chunk.

**Fix:** `stopRecording()` returns `Promise<Blob | null>` — resolves inside `mr.onstop` after the final chunk is appended. Callers must `await` it.
`destroy()` calls `mr.stop()` directly (fire-and-ignore) since it only needs cleanup.

## Camera indicator: setVideoEnabled vs stopVideoTracks
`setVideoEnabled(false)` only does `track.enabled = false` — transmission stops but the camera hardware stays on (indicator light stays on, getUserMedia lock held).

**Fix:** Added `stopVideoTracks()` which calls `track.stop()` + `localStream.removeTrack()` + `sender.replaceTrack(null)` on each peer so remote participants see nothing. `toggleVideo(false)` now calls `stopVideoTracks()`, not `setVideoEnabled()`. Re-enabling camera always calls `publishLocalMedia({ video: true })` to get a fresh track (stopped tracks can't be re-enabled).

## Audio element lifecycle: stale <audio> when stream gains video
When a remote stream transitions audio-only → audio+video (host turns camera on mid-session), the pre-existing hidden `<audio>` element stays active alongside the `<video>` element → doubled/echoed audio.

**Fix:** In the `remoteStreams` effect, check `stream.getVideoTracks().length > 0`. If video present: pause+clear any stale `<audio>` element for that userId. Also clean up audio elements for peers who have left.

## WS event type parity: both files must stay in sync
`circle_recording_available` was added to `wsClient.ts` (frontend) but not `ws-hub.ts` (server) → TypeScript error TS2322 blocked the server build.

**Rule:** Any new WsEventType must be added to BOTH:
- `artifacts/pay-it-forward/src/lib/wsClient.ts`
- `artifacts/api-server/src/lib/ws-hub.ts`

## requireApproved on action routes breaks tests
The join/start routes already gate with `requireApproved`. Action routes (hand, promote, demote, react, recording, end) use `requireActiveParticipant` which verifies session membership — that's the correct gate. Adding `requireApproved` on top causes test users (not in the approved DB state) to get 401 instead of the expected 403/400/200.

**Rule:** Don't add `requireApproved` to action routes that call `requireActiveParticipant`. Approved check is implicit via the join gate.

## Non-blocking file write for recording upload
`writeFileSync` blocks the Node.js event loop for large audio blobs (could be hundreds of MB). Use `import { writeFile } from 'fs/promises'` and `await writeFile(path, body)`.

## circle_recording_available broadcast
After upload, broadcast `circle_recording_available` to ALL session participants (including those who have left — use the full participants table, not just active). This notifies listeners they can now access the recording without a page refresh.
