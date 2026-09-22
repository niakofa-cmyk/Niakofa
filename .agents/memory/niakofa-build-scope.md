---
name: Niakofa build script scope
description: Why the root `pnpm run build` must exclude the mockup-sandbox artifact.
---

`mockup-sandbox` is a Replit canvas dev tool (component preview iframe host), not part of the
deployed application. Its `vite.config.ts` throws at build time if `BASE_PATH` isn't set, which is
never set in a normal production build environment — so a naive `pnpm -r --if-present run build`
at the workspace root fails the whole build even though the actual deployable artifacts
(`pay-it-forward`, `api-server`) build fine.

**Why:** discovered when validating deployment readiness — the repo-wide build script had no
filter and mockup-sandbox's missing `BASE_PATH` aborted the entire `pnpm run build`.

**How to apply:** the root `build` script filters it out: `pnpm -r --filter "!@workspace/mockup-sandbox" --if-present run build`. If mockup-sandbox needs to be built standalone (e.g. for canvas
preview publishing), it must be invoked directly with `BASE_PATH` set, not via the root build script.
