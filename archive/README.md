# Archive

Code kept for reference/history but not part of the deployed Niakofa app.

## legacy-mode-supabase-prototype-src/ and legacy-mode-supabase-prototype-supabase/

A standalone Legacy Mode prototype (originally at repo root as `src/` and
`supabase/`): a Vite app + its own Legacy Engine (`legacyEngine.ts`) + a
parallel Postgres schema, all talking directly to a separate Supabase
project via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

**This was never wired into the deployed app.** Railway's `scripts/start.sh`
runs migrations via `@workspace/db` (`lib/db/`) and starts `api-server`,
which serves `artifacts/pay-it-forward/dist/public` as the frontend
(`artifacts/api-server/src/app.ts`). Neither of those touches `src/` or
`supabase/` at all — this prototype requires its own Supabase project that
isn't part of the Railway deployment.

**The real, deployed Legacy Mode implementation is:**
- Frontend: `artifacts/pay-it-forward/src/pages/legacy-*.tsx`
- Backend: `artifacts/api-server/src/routes/legacy*.ts`
- Schema: `lib/db/src/schema/legacy-engine.ts` + `lib/db/migrations/0092_*`, `0093_*`

Archived on 2026-07-31 to stop future work from being duplicated or lost on
the disconnected branch. If this prototype's approach (a dedicated
`legacy_worlds`/`legacy_chapters`/`legacy_scenes` schema with knowledge-hash
versioning) turns out to be wanted, port the relevant pieces into `lib/db`
+ `api-server` deliberately rather than reviving this folder as-is.
