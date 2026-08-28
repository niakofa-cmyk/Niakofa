# Niakofa Circles — current public repo state (Aug 2026)

Repo: https://github.com/niakofa-cmyk/Niakofa

Recent commits include continuity hardening (`ec652fd`, `bcb41d3`, `ad1bdb4`), rate-limit Redis (`1fee517`, `93a9309`), LiveKit-first defaults, open publish, session manager tests.

## Architecture (matches vision)

```
Phone/Browser
  → HTTPS Niakofa API (auth, membership, media-token JWT)
  → WSS LiveKit SFU
  → Host / Speakers / Listeners (open policy: all may publish)
```

| Requirement | Status in code |
|-------------|----------------|
| Formal realtime media system | **Yes** — LiveKit media plane + REST/WS control plane |
| LiveKit for every Circle size | **Yes** |
| Listener video without host approval | **Yes** when policy `open` |
| Independent mic/camera | **Yes** |
| Continuity manager (no full page refresh) | **Yes** — `CircleRealtimeSessionManager` |
| Rate limit scale model | **Yes** — user-keyed + Redis-aware |
| LiveKit env documented in Railway example | **Gap** — add `LIVEKIT_*` (this package) |
| Production LiveKit secrets on deploy | **Ops** — must set or media returns 503 |
| Physical device certification | **Still required** on HTTPS + real phones |

## Do we need a new realtime system?

**No.** Configure LiveKit, keep hardening continuity and device UX. Do not rebuild mesh as production default.

## Automatic refresh / cache?

- **Page auto-refresh:** no  
- **Cache live media:** no  
- **Auto reconnect same LiveKit room:** yes (manager)  
- **Cache metadata only:** yes  

## Score (updated)

| Area | Score |
|------|-------|
| Product / UX direction | 8.5/10 |
| Control plane | 8.5/10 |
| LiveKit media plane code | 8.5–9/10 |
| Continuity orchestration | 8/10 (in repo) |
| Rate limiting | 8.5/10 |
| Deploy/config completeness | 6/10 until LIVEKIT_* set |
| Real-device proof | Not proven until secrets + matrix |

## Immediate priority order

1. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` on production API.  
2. Confirm `/media-token` returns 200 with JWT.  
3. Test host mic → listener; host camera; listener camera; camera deny keeps mic.  
4. Cellular + restrictive network (TURN).  
5. Watch 429s only on auth abuse paths, not SPA navigation.
