---
name: Spark camera draft gating
description: Preserve safe draft recovery when new Spark creation opens directly in the camera.
---

**Rule:** Auto-open the Spark camera only after the active account/context draft lookup succeeds. Track whether a draft was actually restored separately from the general “draft saved” state, and keep the resume/source path for recovered drafts.

**Why:** Empty-draft autosaves can update the saved indicator even when no draft was restored. Treating that indicator as proof of recovery can both skip the fresh camera and mishandle camera cancellation. A failed read must never be mistaken for an empty scope.

**How to apply:** When changing Create a Spark entry, gate on the recovered scope key and explicit recovery error state. Preserve existing files, text, accessibility, music, and Exchange drafts; close the composer on camera cancel only when there is no restored or newly authored work.