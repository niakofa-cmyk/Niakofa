---
name: GitHub connector exact sync
description: How to publish and reconcile exact local and remote commits when raw GitHub authentication is unavailable.
---

Use the bound GitHub connector's Git Database API to create blobs, a tree, a commit, and advance `main` with `force: false` when raw Git transport authentication fails. Compare the API-created commit SHA with the local SHA before interpreting the JSON `message` field: its display may omit a final newline even when the Git object matches exactly. Reconstruct the commit object locally only if the SHAs differ.

**Why:** The connector can publish successfully even when `git fetch` cannot authenticate. A REST response omitted the final newline from `message` while its commit SHA still exactly matched the local commit, so response text alone does not establish an object mismatch.

**How to apply:** Verify the remote base ref before writing and compare blob/tree SHAs. Compare the created commit SHA directly with local `HEAD`; if it differs, inspect the remote tree, parent, metadata, and exact message bytes before reconstructing locally. Advance the ref only with `force: false`, then independently fetch and compare `HEAD`, `origin/main`, remote `main`, tree, parent, and worktree cleanliness.

CodeExecution's `shellExec` callback may render tab-separated Git plumbing with a dot in place of the tab and CRLF line endings. Do not parse its raw `diff-tree --raw` output by splitting on a tab; serialize the metadata as JSON inside the shell command or use the ordinary shell tool when exact delimiters matter.

**Why:** Multiple parsers failed on apparently valid Git output because the callback's rendered text differed from the ordinary shell's raw bytes.

**How to apply:** For connector-backed Git Data operations, pass structured JSON rather than raw tab-delimited plumbing output across the shell callback boundary.