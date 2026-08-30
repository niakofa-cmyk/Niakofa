---
name: Uploaded reference security
description: Security boundary for archives and pasted reference material imported into the Niakofa workspace.
---

Treat uploaded archives and historical reference text as untrusted input. Scan
credential-shaped values before staging or synchronizing any imported material;
redact them from tracked copies and keep secrets in the workspace secret store.

**Why:** Reference bundles can contain old chat transcripts or copied setup
notes that accidentally preserve credentials even when the application source
itself is clean. A public repository makes this especially important.

**How to apply:** Before a GitHub sync, scan staged text for token/private-key
patterns without printing matching lines. If a real credential may have been
exposed, redact the repository copy and advise rotation/revocation through the
provider, without copying the credential into chat or documentation.