---
name: Niakofa Community Media fixture reference
description: Durable pointer for the generated Community Media acceptance fixture and the evidence needed to reuse it safely.
---

The generated Community Media acceptance fixture is documented in
`docs/reference/niakofa-community-media-fixture.md` with its repository image
asset. It is a test/reference artifact, not customer content or a donor
archive.

**Why:** Private saves and authenticated media delivery need an approved Hub
context and two-account evidence. Keeping the fixture metadata and image in a
reviewable reference document prevents future sessions from recreating
production data blindly or confusing test media with user content.

**How to apply:** Reuse the documented Hub and media identifiers only with
approved disposable accounts and an explicit mutating-acceptance gate. Preserve
the owner-scoped unsave behavior: a user must be able to remove their own
private save even after the underlying media is no longer visible to them.