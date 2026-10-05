---
name: Workspace scanner long lines
description: Diagnose checkpoint environment-scan failures caused by overlong input lines without exposing secrets.
---

When a Replit checkpoint or task-reconciliation step fails with Go's `bufio.Scanner: token too long`, inspect repository files for unusually long single lines as well as considering oversized workspace secrets. A tracked generated bundle can remain in Git despite a matching `.gitignore` rule.

**Why:** The scanner error is consistent with either an overlong environment value or a repository line exceeding the scanner limit. A generated frontend bundle in this workspace was tracked despite the root `dist` ignore rule, and its minified JavaScript had a line far beyond 64 KB; this is a plausible repository-side cause, not proof that secrets are clear.

**How to apply:** Never read or print secret values. Check tracked files and maximum line lengths, especially generated outputs. If a generated directory is rebuilt from source, untrack it with `git rm --cached` and confirm the existing ignore rule covers it. If reconciliation still fails, the workspace owner must inspect Secrets through the secure UI.