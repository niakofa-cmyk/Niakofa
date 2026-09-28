---
name: Production state secret validation
description: Why securely submitted browser states still need a local structural gate before production media acceptance.
---

Treat a secure-form “added or confirmed” response as proof only that a secret
exists. It does not prove that an existing value was replaced, nor that a newly
entered value is a Playwright storage-state object. A validator failure must
stop before any production browser request; repeated confirmations are not a
substitute for checking the actual state file.

**Why:** An operator confirmed an existing invalid value instead of replacing
it, and later fresh secret entries also failed object-shape validation. The
guard prevented all uploads, but the form status alone was misleading.

**How to apply:** Ask for paths to accessible private state files, or have the
operator validate the original files and re-enter their raw JSON through a
secure channel. Never print the states or ask for them in chat. Do not retry a
mutating production journey until the structural check passes.