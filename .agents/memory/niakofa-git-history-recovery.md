---
name: Niakofa local git history disconnected from origin
description: What to do when local .git has an empty/orphan "Initial commit" unrelated to origin's real history (a fatal git error symptom).
---

Local `.git` was found reset to a single empty "Initial commit" with zero tracked
files, completely unrelated to `origin/main`'s real ~875-commit history
(`git merge-base --is-ancestor` returned NO in both directions). The actual project
files were all still present and correct in the working tree, just untracked. This is
the underlying cause behind a generic "unrecognized fatal error with Git" surfaced by
the platform.

**Why:** something reinitialized the local repo's history without touching the working
directory, leaving git's index/HEAD out of sync with both the real file content and
GitHub's history. A raw `git push` in this state would either fail outright or (with
`--force`) destroy `origin/main`'s history — very dangerous.

**How to apply (recovery, not force-push):**
1. Back up the full working tree to a tarball outside `.git` first (safety net).
2. `git reset --mixed origin/main` — moves HEAD/index to match origin's real history
   *without touching working-tree files*. `git status` afterward shows exactly the
   genuine diff between origin and the current files (session's real edits), not fake
   noise.
3. Review the diff for junk that accumulated in the workspace root (e.g. a stray
   multi-hundred-MB full-repo zip snapshot, empty `FETCH_HEAD`-style git-internal
   files) before staging — clean those out, don't commit them.
4. Commit the real changes normally, then push with the `gitPush` callback (not raw
   `git push` — raw CLI has no credentials configured in this environment and always
   fails with "Invalid username or token").
5. Verify the push landed with `gitPull` (should report success/no-op) and
   `git log --oneline` / `git status` showing local `HEAD` matches `origin/main` — raw
   `git fetch`/`git ls-remote` from the shell will fail auth and are not a valid
   verification path here.
