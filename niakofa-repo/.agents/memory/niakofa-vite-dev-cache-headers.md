---
name: Niakofa vite dev server needs no-store headers
description: Repeated dev-server restarts during a debugging session caused persistent "Outdated Optimize Dep" 504s in the preview tool even after clean restarts; fix is server-side no-cache headers, not more restarts.
---

`vite.config.ts` `server.headers` now sets `Cache-Control: no-store` in non-production
(`process.env.NODE_ENV !== "production"`). Added after repeated manual dev-server restarts
(while iterating on a fix) left the preview browser stuck replaying a stale `index.html` /
module graph against a server that had since re-optimized deps under a new hash — every
reload kept 504ing on `/node_modules/.vite/deps/...` chunks and throwing "Invalid hook call"
from duplicate/partial React chunks, even though `curl` against the same server always
returned 200 with the current, correct content.

**Why:** the preview surface (proxied iframe / headless screenshot browser) can hold an HTTP
cache across dev-server restarts in a way a plain `curl` check won't reveal — so "the app is
fine per curl" and "the preview is broken" can both be true at once mid-restart-storm.

**How to apply:** if a preview screenshot shows stale/broken JS (hook errors, 504 "Outdated
Optimize Dep", "Failed to fetch dynamically imported module") right after you've been
restarting the dev workflow repeatedly, don't keep restarting — clear `node_modules/.vite`
once, restart once, then wait a few seconds before the next check. If it recurs across
sessions (not just mid-debugging), no-store headers on the dev server are the fix, already
applied here.
