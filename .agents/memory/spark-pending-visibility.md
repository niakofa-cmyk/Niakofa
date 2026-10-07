---
name: Spark pending visibility
description: Author-only visibility for moderation-pending Sparks and camera-stitch recovery metadata.
---

Keep moderation-pending Sparks visible only in their author's Moments feed, and return ordered source asset IDs and private composition playback only to that author. The internal composition queue may process published or pending Sparks; public published Sparks retain existing audience and community visibility rules.

**Why:** A Studio submission can be accepted but awaiting review; hiding it or blocking its stitch retry makes a successful save look lost. Recovery IDs and unapproved media must not be exposed to other viewers.

**How to apply:** Include pending Stories only when `author_user_id` matches the authenticated viewer. Process composition work only while the Story is pending or published; permit pending status/playback only for its author, then also apply normal audience checks for published Stories.
