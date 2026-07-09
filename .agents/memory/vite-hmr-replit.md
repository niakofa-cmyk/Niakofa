---
name: Vite HMR on Replit
description: How to fix Vite HMR WebSocket failing behind Replit's HTTPS proxy
---

## Rule
In `vite.config.ts`, add `hmr: { clientPort: 443 }` inside `server`, gated on `process.env.REPL_ID !== undefined`.

```typescript
server: {
  ...(process.env.REPL_ID !== undefined && {
    hmr: { clientPort: 443 },
  }),
  ...
}
```

**Why:** Replit proxies all browser traffic (including WebSocket upgrades) through its HTTPS gateway on port 443. Without this, Vite's HMR client tries to open a raw WebSocket to the dev server port (e.g. `:5000`) directly, which the browser blocks because the Replit proxy is the only reachable address. The browser console shows: `WebSocket connection to 'ws://...dev-port/?token=...' failed`.

**How to apply:** Any Vite project served on Replit needs this. The REPL_ID gate ensures it only takes effect in the Replit environment; local builds are unaffected. The screenshot tool accesses via `127.0.0.1` so it will show a WS error to port 443 — this is a false negative, not a regression.
