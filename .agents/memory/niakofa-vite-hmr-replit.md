---
name: Niakofa Vite HMR Replit fix
description: Vite HMR behaviour in Replit preview proxy — what works and what breaks
---

## Rule
Do NOT set `hmr: false` in `vite.config.ts` for the Replit environment.

**Why:** `hmr: false` breaks `@vitejs/plugin-react`'s Fast Refresh preamble injection, causing a runtime crash: `@vitejs/plugin-react can't detect preamble. Something is wrong.` This stops React from rendering entirely — much worse than the WebSocket warning.

The HMR WebSocket "failed to connect" / "WebSocket closed without opened" console warning is cosmetic only. Replit's preview proxy does not forward Vite's HMR WebSocket but this does not affect app functionality. Leave `hmr` unconfigured (default).

**Confirmed safe (July 2026):** No `hmr` setting → app loads, `[vite] connected.` in browser logs, no React crash. Manual refresh picks up code changes in Replit.

**How to apply:** In `artifacts/pay-it-forward/vite.config.ts` — leave the `server:` block without any `hmr` key. A comment in the file already explains the tradeoff so future engineers don't try to "fix" the cosmetic WebSocket warning and break React.
