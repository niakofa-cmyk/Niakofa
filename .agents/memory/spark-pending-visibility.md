---
name: Spark pending visibility
description: Author-only visibility for moderation-pending Sparks and camera-stitch recovery metadata.
---

Keep moderation-pending Sparks visible only in their author's Moments feed, and return ordered source asset IDs and private composition playback only to that author. The internal composition queue may process published or pending Sparks; public published Sparks retain existing audience and community visibility rules.

**Why:** A Studio submission can be accepted but awaiting review; hiding it or blocking its stitch retry makes a successful save look lost. Recovery IDs and unapproved media must not be exposed to other viewers.

**How to apply:** Include pending Stories only when `author_user_id` matches the authenticated viewer. Process composition work only while the Story is pending or published; permit pending status/playback only for its author, then also apply normal audience checks for published Stories.

Apply that same author-only status policy to ordinary photo/video attachments, grant issuance, and grant redemption, not only camera compositions. Do not record public view/watch activity for a private pending preview.

**Why:** A pending card can survive reload in the owner's feed while every attachment still fails with a 404 if its media routes accept only published status. Successful upload and ready processing therefore do not prove a usable saved Moment.

**How to apply:** Verify actual owner image decoding and video advancement after navigation/reload, plus a second approved viewer's denial. Keep moderation, ready-asset checks, retained-story access, and session-bound playback checks intact.
