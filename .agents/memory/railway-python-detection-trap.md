---
name: Railway Python Detection Trap
description: Root cause and fix for 25 consecutive Railway build failures caused by Python files in repo root confusing railpack's language detection.
---

# Railway Python Detection Trap

## The Rule
Never commit `main.py`, `pyproject.toml`, `uv.lock`, or any Python project files to the repo root. Railway's railpack builder auto-detects language from root-level files. A Python file alongside `railpack.json` causes railpack to attempt a dual Node.js+Python build, which fails.

**Why:** `76eefa61` (Aug 14 2026) added `main.py`, `pyproject.toml`, `uv.lock` to repo root for a one-off PDF audit script. Railway's railpack saw these and failed every subsequent deployment (25 commits, ~2 days of failures). The files were added to `.gitignore` in `59435d2c` but never removed from git tracking with `git rm --cached`.

**How to apply:** Before committing any Python tooling files, either (a) put them under `.agents/` (which is already `.gitignore`'d) or (b) run `git rm --cached <file>` before pushing if accidentally committed. Always verify with `git ls-files --ignored --exclude-standard` to catch tracked-but-ignored files.

## The Fix Applied (Aug 16 2026, commit `25119395`)
1. `git rm --cached main.py pyproject.toml uv.lock .agents/outputs/ .agents/scripts/`
2. `railpack.json`: added `"provider": "node"` to explicitly lock the builder to Node.js
3. `railpack.json`: added `"exclude"` list for Python/output dirs as defence-in-depth

## Defence-in-Depth
`railpack.json` now has:
```json
"provider": "node",
"exclude": ["main.py", "pyproject.toml", "uv.lock", ".agents/outputs", ".agents/scripts", ...]
```
This prevents railpack from auto-detecting Python even if Python files are accidentally committed again.

## Diagnostic Path (for future failures)
1. Check GitHub commit statuses (not check runs) via API: `GET /repos/.../commits/{sha}/status`
2. Railway posts `context: "precious-abundance - zesty-ambition"` commit statuses
3. Find the FIRST failing commit by comparing against the last successful deploy
4. Compare `git diff <last-success> <first-failure> --name-only` for files in repo root
5. Run `git ls-files --ignored --exclude-standard` to find tracked-but-gitignored files
