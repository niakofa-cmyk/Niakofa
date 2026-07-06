---
name: Niakofa esbuild on Replit Linux
description: pnpm overrides block @esbuild/linux-x64 as a sub-dep; fix via postinstall in root package.json
---

# esbuild Platform Binary Must Be Installed via postinstall

## The rule
Root `package.json` must include a `postinstall` script that runs esbuild's own install.js so the Linux binary is registered even though pnpm overrides block it as a sub-dep:

```json
"postinstall": "node node_modules/esbuild/install.js 2>/dev/null || true"
```

## Why
The root `package.json` has `pnpm.overrides` that sets `"esbuild>@esbuild/linux-x64": "-"` to block the Linux binary as a transitive dep (so Mac dev builds don't download it). But this also blocks it from being installed when esbuild is used directly on the Replit Linux x64 runner. Without running esbuild's install.js, esbuild throws "The package @esbuild/linux-x64 could not be found" even though the package directory exists at node_modules/@esbuild/linux-x64.

## How to apply
The `postinstall` entry in root `package.json` scripts runs after every `pnpm install` and calls esbuild's install.js to properly register the binary. The `|| true` makes it non-fatal on Mac dev environments where darwin binaries are installed differently.
