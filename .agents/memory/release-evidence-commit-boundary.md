---
name: Release evidence commit boundary
description: How release notes should represent deployed application versions and later documentation-only commits.
---

Release evidence must identify the deployed application commit separately from
the repository's later documentation-only commits. Do not record the hash of
the commit that updates the evidence file itself; that creates a circular
reference that becomes stale every time the evidence is corrected.

**Why:** A live deployment can remain on a verified application commit while
GitHub `main` receives a documentation-only correction. Treating those as one
commit makes otherwise accurate release evidence claim false source/deployment
parity.

**How to apply:** Record the immutable served application SHA, state that
repository parity was independently checked with the GitHub API and
`git pull --ff-only`, and describe later documentation commits without making
their own hash part of the evidence contract.