---
name: Niakofa OpenAPI codegen
description: Quirks with orval codegen — where the binary lives, YAML pitfalls that cause silent failures.
---

**Running codegen:**
- `pnpm --filter @workspace/api-spec run codegen` calls `orval --config ./orval.config.ts`
- The orval binary lives at the **workspace root** `node_modules/.bin/orval`, NOT in `lib/api-spec/node_modules`
- The codegen script works when pnpm runs it from the api-spec directory (CWD resolution in orval.config.ts uses `__dirname`)

**YAML pitfalls that produce cryptic errors:**
- Duplicate mapping key: `type: integer` then `type: string` under the same property → "duplicated mapping key" parse error
- Null-valued property (`distance_text:` with no value) → "Cannot read properties of null (reading 'enum')" in orval
- Both of these appear in orval as generic input errors, not YAML errors — check the YAML first when codegen fails

**Why:** orval reads the YAML via js-yaml under the hood; js-yaml in strict mode (and some versions without it) produce confusing downstream errors for structural YAML problems.

**How to apply:** Validate openapi.yaml with `node -e "require('js-yaml').load(require('fs').readFileSync('lib/api-spec/openapi.yaml','utf8'))"` before debugging orval itself.

## Anonymous inline requestBody schemas break orval + api-zod codegen
Any `requestBody`/response schema written as `type: object` inline (no `$ref`) causes orval to
generate the SAME name twice — once as a Zod const in `api.ts` and once as a TS `type` in
`generated/types/<name>.ts` — and `lib/api-zod/src/index.ts`'s `export * from "./generated/api"` +
`export type * from "./generated/types"` then collide with TS2308 "already exported a member".
**Fix:** always define request/response bodies as named `components/schemas/*Input` and reference
them via `$ref`, matching every other route in the spec — never inline a `type: object` body.
