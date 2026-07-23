---
name: Niakofa lib build pipeline
description: lib/api-client-react and lib/api-zod need tsc --build before the frontend tsc --noEmit; post-merge.sh includes this; API health path is /api/healthz.
---

## Rule
`lib/api-client-react` exports from `./src/index.ts` directly (no dist needed for Vite dev server), but the frontend `tsconfig.json` has a project reference to it which requires `dist/*.d.ts` for `tsc --noEmit`. The `dist/` directory is gitignored so it must be built before any typecheck.

**Why:** TypeScript composite project references require built declaration files to exist before they can be referenced. Without them, every `tsc --noEmit` run on a fresh clone produces ~30 `TS6305` errors. Vite doesn't care (it resolves TypeScript source directly), but CI-style typechecks and the API server's `tsc --build` chain both do.

**How to apply:**
- `post-merge.sh` runs `pnpm --filter @workspace/api-client-react run build` AND `pnpm --filter @workspace/api-zod run build` before `pnpm install` so declarations exist before any downstream typecheck.
- `lib/api-client-react/package.json` has `"build": "tsc --build"` script.
- If you get `TS6305` errors on the frontend after a fresh clone, run the builds first — not a code bug.

## API health route path
The health route is `/api/healthz` (with a trailing z), NOT `/api/health`. The audit summary route is at `/api/status` (public, no auth). Worker health is `/api/admin/worker-health` (requires auth + is_admin).

## Flash-empty protection pattern
Pages where fetch errors could erase previously-shown data should use `.catch(() => { /* keep existing */ })` not `.catch(() => setState([]))`. The rule: on a network error, keep whatever was already rendered. An empty initial state is fine (nothing to lose); a non-empty state must never be cleared by a transient blip.

Files fixed:
- `artifacts/pay-it-forward/src/pages/profile.tsx` — HelpersWhoHelpedYou component
- `artifacts/pay-it-forward/src/pages/settings.tsx` — VoiceProfileSelector component
