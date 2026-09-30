---
name: GitHub connector exact sync
description: How to publish and reconcile exact local and remote commits when raw GitHub authentication is unavailable.
---

Use the bound GitHub connector's Git Database API to create blobs, a tree, a commit, and advance `main` with `force: false` when raw Git transport authentication fails. The API-created commit may serialize the message without a final newline; if local and remote commit SHAs must match exactly, recreate the commit object locally from the remote tree, parent, metadata, and exact message bytes before updating the local branch.

**Why:** The connector can publish successfully even when `git fetch` cannot authenticate, but GitHub's commit-object serialization may differ from a normal local `git commit`.

**How to apply:** Verify the remote base ref before writing, compare blob/tree SHAs, read the created commit metadata, reproduce its raw object locally, then compare `HEAD`, tree, parent, and a clean working tree.

CodeExecution's `shellExec` callback may render tab-separated Git plumbing with a dot in place of the tab and CRLF line endings. Do not parse its raw `diff-tree --raw` output by splitting on a tab; serialize the metadata as JSON inside the shell command or use the ordinary shell tool when exact delimiters matter.

**Why:** Multiple parsers failed on apparently valid Git output because the callback's rendered text differed from the ordinary shell's raw bytes.

**How to apply:** For connector-backed Git Data operations, pass structured JSON rather than raw tab-delimited plumbing output across the shell callback boundary.