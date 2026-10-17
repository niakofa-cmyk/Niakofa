---
name: Production state secret validation
description: Why securely submitted browser states still need a local structural gate before production media acceptance.
---

Treat a secure-form “added or confirmed” response as proof only that a secret
exists. It does not prove that an existing value was replaced, nor that a newly
entered value is a Playwright storage-state object. A validator failure must
stop before any production browser request; repeated confirmations are not a
substitute for checking the actual state file.

Do not generate production sessions from candidate account credentials until
their disposable-account approval and intended test roles are independently
confirmed.

**Why:** The user explicitly prohibited using unverified candidate credentials
to generate sessions.

**How to apply:** Credential-variable presence is not account verification.
Check account approval and role/community mapping before any production login
or state-generation request.

**Why:** An operator confirmed an existing invalid value instead of replacing
it, and later fresh secret entries also failed object-shape validation. The
guard prevented all uploads, but the form status alone was misleading.

**How to apply:** Ask for paths to accessible private state files, or have the
operator validate the original files and re-enter their raw JSON through a
secure channel. Never print the states or ask for them in chat. Do not retry a
mutating production journey until the structural check passes.

Fresh login-backed states may legitimately exceed the default 16 KiB serializer
limit because the returned user includes community geometry. For a private local
state file, an explicit bounded size allowance is appropriate; retain all origin,
permission, token-shape, and approved-account validation.

**Why:** A genuine approved session was rejected for size rather than invalid
authentication. Re-entering credentials would not fix that failure.

**How to apply:** Distinguish serialization-size failures from malformed states.
Use a bounded per-command allowance for private files, never print their contents,
and remove the files after acceptance.

Keep the cross-community state builder's distinct-community gate intact. A
single-owner Exchange photo check can use separately validated approved sessions
without requiring cross-community separation, but cannot certify that boundary.

**Why:** Distinct approved users are not necessarily members of different
communities; the stronger builder checks a different acceptance prerequisite.

**How to apply:** Scope authentication checks to the actual journey. Do not weaken
a cross-community guard just to run a same-community upload/display check.