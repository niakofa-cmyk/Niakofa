---
name: Railway log attribute decoding
description: Safely extract structured Railway runtime diagnostics without displaying raw logs.
---

Railway `getLogs` may return `attributes[].value` as a JSON-encoded scalar string, including an extra layer of quotes. Decode the scalar in memory, then validate it against an explicit allowlist before surfacing diagnostic fields. Never print raw messages or unvalidated attribute values.

**Why:** Runtime records used JSON-quoted values, so direct extraction returned empty diagnostic fields. Printing raw records instead would bypass the sanitizer and expose details excluded from the diagnostic contract.

**How to apply:** Filter to the fixed event message, decode only the needed attributes, validate stage/code/type/status against explicit sets, and omit exception text, paths, endpoints, bucket names, and credentials.