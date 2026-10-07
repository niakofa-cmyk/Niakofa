---
name: Spark camera draft gating
description: Preserve safe draft recovery when new Spark creation opens directly in the camera.
---

**Rule:** Auto-open the Spark camera only after the active account/context draft lookup succeeds. Track whether a draft was actually restored separately from the general “draft saved” state, and keep the resume/source path for recovered drafts.

For a Spark already posted while camera-reel stitching is pending, persist its exact ordered media IDs separately from editable publication IDs. Keep that retry record through edits and reloads, and retain pending-only drafts until the retry is accepted. If saving the retry record fails, keep Studio open instead of navigating away.

**Why:** Empty-draft autosaves can update the saved indicator even when no draft was restored. Treating that indicator as proof of recovery can both skip the fresh camera and mishandle camera cancellation. A failed read must never be mistaken for an empty scope. Generic upload IDs may be cleared when editable content changes, but a posted Spark’s stitch sources must remain stable.

**How to apply:** When changing Create a Spark entry, gate on the recovered scope key and explicit recovery error state. Preserve existing files, text, accessibility, music, and Exchange drafts; close the composer on camera cancel only when there is no restored or newly authored work. For stitch retries, validate and reuse the dedicated ordered source list, not the current selection or generic publish IDs.