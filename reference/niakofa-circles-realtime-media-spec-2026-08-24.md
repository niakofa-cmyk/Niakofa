# Niakofa Circles — Real-Time Media System Specification

**Status:** Consolidates two existing in-repo reference docs
(`reference/niakofa-circles-realtime-hardening-2026-08-24.md` and
`reference/niakofa-circles-production-certification-2026-08-24.md`) with the
verified data model, into one spec. No new architecture is introduced here —
this documents what is actually built (`audioCircleWebRTC.ts`, `ws-hub.ts`,
`audio-circles.ts`, `audio-circles.ts` schema) and adds the one open decision
that the two source docs don't resolve.

---

## 1. System boundary

Three layers, each owning a distinct concern. None may substitute for another:

| Layer | Owns | Files |
|---|---|---|
| **REST** | Membership, roles, moderation, recording consent, host lifecycle | `routes/audio-circles.ts`, `routes/circle-heartbeat.ts` |
| **WebSocket** | Presence, signaling reachability, live event fan-out | `lib/ws-hub.ts`, `lib/wsClient.ts` |
| **WebRTC** | Mic/camera tracks, peer connections, ICE, remote streams | `lib/audioCircleWebRTC.ts`, `routes/webrtc-ice.ts` |

**Rule, stated explicitly because it has caused real bugs (see §5):** a
successful REST join or a `LIVE` WebSocket badge is presence, not media. A
Circle is only "media connected" once WebRTC itself reports it.

---

## 2. Connection state machine

The client exposes exactly these four media states, sourced from WebRTC —
never inferred from REST/WS:

```
connecting → connected → reconnecting → lost
                ↑______________|
```

- **`connecting`** — peers are negotiating (offer/answer/ICE exchange).
- **`connected`** — at least one peer connection reports `connected`. Not
  "REST returned 200"; not "WS says the room is live."
- **`reconnecting`** — bounded ICE recovery in progress.
- **`lost`** — recovery exhausted, or a local track ended unexpectedly.

**ICE recovery:** 4 attempts, backoff `1s → 2s → 4s → 8s`. A transient
network blip should self-heal without a manual leave/rejoin. Permanent
failure surfaces as `lost` — visible and actionable, not silent.

---

## 3. Access & capability model (verified against schema + routes)

This section reflects what's actually enforced today, not intent.

### 3.1 Platform gate — `requireApproved`

Every join/start/host-transfer/invite route is gated by `requireApproved`
(`middlewares/auth.ts`), which checks, per request:

1. Token version matches (revoked on logout/password change)
2. `is_suspended` is false
3. `trust_score > -1` (not banned)
4. `approval_status === "approved"`

This is a **platform-wide** trust & safety gate, not Circles-specific — the
same check protects request creation, messaging, and payments elsewhere in
Niakofa. **Confirmed per your last answer: this stays in place.** Approved
accounts pass; unapproved/suspended/banned accounts are correctly blocked
from Circles along with everything else.

### 3.2 Circle-internal role gate — `listener` by default

This is the part your original ask ("full media capability, no extra gate")
didn't yet account for, because I hadn't found it until now:

- `audio_circle_participants.role` defaults to **`listener`** on join.
- Only `speaker`, `co_host`, and `host` roles can publish audio/video.
- `listener → speaker` requires **hand-raise + host/co-host approval**
  (`hand_raised`, `hand_raised_at` columns back a first-come queue).
- Room size for publishing is capped by `max_speakers` (host-configurable:
  4/8/12/13/18/24; default 13 = host + 12 speakers), enforced server-side
  in the `/promote` route.
- `co_host` can promote/demote/mute/kick/block; only `host` can end the
  session or control recording.

**This is a Clubhouse/Twitter-Spaces-style moderated room, by design** — not
a bug and not something the lifecycle memory notes flag as broken. It exists
so a host can run a call-in show or community meeting without every listener
being hot-mic'd by default.

### 3.3 Net effect — does this match "allow all approved users full media capability"?

**Partially, and this is the one open decision:**

- ✅ Every **approved** user *can* join a Circle and *can* become a speaker
  (no invite-only membership list, no separate Circle-level allowlist beyond
  platform approval).
- ⚠️ They are **not immediately publish-capable on join** — they land as a
  `listener` and need host approval to speak. If "full media capability"
  means *day-one, no host gate*, that's a product change to the default role
  and/or the promotion flow, not a bug fix.

**Recommendation:** keep the listener/speaker gate as-is. It's a moderation
feature that protects hosts and other participants, it's already fully
built and tested, and it doesn't contradict "allow all approved users" —
it means all approved users can participate and can become full
video/audio participants through the built-in flow, rather than every
account being unconditionally hot-mic'd the instant they join a room they
may not have been paying attention to. If you want this changed, tell me
which of these you actually want and I'll scope it as a real patch:
  - (a) new Circles default to speaker-on-join (skip hand-raise) while
        keeping host mute/demote power, or
  - (b) a per-Circle host toggle: "moderated" vs "open" rooms.

---

## 4. Recording & consent

- Recording is host-only, requires explicit host action, and must show a
  visible recording indicator to all participants (certification doc §1).
- `stopRecording()` is `async` — resolves inside `MediaRecorder.onstop`
  after the final chunk lands, to avoid dropping the tail of the recording.
- Upload uses non-blocking `fs/promises.writeFile`, not `writeFileSync`,
  since recordings can be hundreds of MB and blocking the event loop would
  stall the whole API process.
- On upload completion, `circle_recording_available` broadcasts to the
  **full participant table** (including users who already left), so people
  aren't stuck needing a manual refresh to know a recording exists.

## 5. Known-fixed lifecycle bugs (for regression awareness)

Documented in `.agents/memory/niakofa-circles-lifecycle.md` — listed here so
they aren't accidentally reintroduced:

- Camera "off" must call `track.stop()` + `sender.replaceTrack(null)`, not
  just `track.enabled = false` — otherwise the camera hardware light stays
  on and remote peers still see the last frame.
- When a remote stream gains video mid-session, any stale hidden `<audio>`
  element for that peer must be torn down or audio doubles/echoes.
- Any new WS event type must be added to **both**
  `lib/wsClient.ts` (frontend) and `lib/ws-hub.ts` (server), or the server
  build breaks with a type error.
- Action routes (mute/kick/promote/react/recording) use
  `requireActiveParticipant`, not `requireApproved` — approval is already
  implicit via the join gate; double-gating breaks tests expecting 403/400.
- Active-speaker heartbeat payloads from the browser are **untrusted** —
  server must verify the reported ID is an active participant in that
  session before broadcasting `circle_active_speaker`, or one participant
  could frame another as speaking.
- ICE candidates arriving before the remote description must be queued and
  flushed after offer/answer — mobile browsers commonly deliver them out of
  order.

## 6. Certification status — the actual current gap

Per the certification doc, this is where Circles genuinely is right now:

> Code and automated route coverage exist. **Not production-certified** —
> real browser/device and real network evidence is still required.

Outstanding matrix (all rows currently "Not run in this workspace"):

1. Two-way audio between two real browsers
2. Two-way video between host and participant
3. Host + 3 participants stay connected
4. Wi-Fi/cellular interruption recovers, or correctly shows `lost`
5. Refresh mid-call restores room + media
6. Camera on → off → on stays live
7. Mic on → mute → unmute stays live
8. Host disconnect triggers grace period + server-enforced failover
9. Permission denial shows an actionable message (automated path exists;
   real-device pass doesn't)

**This — not more code — is the actual readiness gap.** The system is
formally defined (this doc + the two source docs) and substantially built;
what's missing is recorded pass/fail evidence from two real browsers over a
real TURN/NAT path.
