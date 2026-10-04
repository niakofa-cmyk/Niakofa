---
name: Railway log attribute decoding
description: Safely extract structured Railway runtime diagnostics without displaying raw logs.
---

Railway `getLogs` may return `attributes[].value` as a JSON-encoded scalar string, including an extra layer of quotes. Decode the scalar in memory, then validate it against an explicit allowlist before surfacing diagnostic fields. Never print raw messages or unvalidated attribute values.

Railway log results larger than 1,000,000 bytes are discarded rather than truncated. Scope requests by service or deployment, a narrow time range, and a server-side filter before retrieval.

**Why:** Runtime records used JSON-quoted values, so direct extraction returned empty diagnostic fields. Oversized queries lose the structured response, preventing safe filtering after retrieval. Printing raw records instead would bypass the sanitizer and expose details excluded from the diagnostic contract.

**How to apply:** Keep the requested result under 1 MB; filter to the fixed event message, decode only the needed attributes, validate stage/code/type/status against explicit sets, and omit exception text, paths, endpoints, bucket names, and credentials.