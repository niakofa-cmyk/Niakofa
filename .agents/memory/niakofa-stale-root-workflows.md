---
name: Niakofa stale root workflows
description: The pre-artifact "Start application"/"Start API server" workflows fail and should be ignored; the artifact-managed workflows are the real ones.
---

After this repl was set up as an artifact project, two leftover root workflows remain configured
in `.replit` from before the artifact system took over:

- `Start application` — runs `pnpm --filter @workspace/pay-it-forward run dev` directly, fails
  with `vite: not found` because it doesn't go through the artifact's own dev setup.
- `Start API server` — runs the api-server build/start directly, fails with
  `Cannot find package 'esbuild'` for the same reason.

**Why:** artifact creation added new workflows (`artifacts/pay-it-forward: web`,
`artifacts/api-server: API Server`, `artifacts/mockup-sandbox: Component Preview Server`) that
are the ones actually serving the app; the old pair was never removed from `.replit`.

**How to apply:** don't spend time debugging `Start application`/`Start API server` failures —
check and restart the `artifacts/...` workflows instead. Removing the stale pair from `.replit`
is reasonable cleanup but out of scope unless asked.
